<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useStorage } from '@vueuse/core';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import FloatLabel from 'primevue/floatlabel';
import { Editor, type EditorCustomPopupProps } from '../../editor';
import { EDITOR_TABS } from '../../editorTabs';
import { Global } from '../../../global/global';
import { showConfirm } from '../../../services/dialogService';
import type { EntityStatObject } from '../../../schemas/entityStatSchema';
import type { StatGroupObject } from '../../../schemas/statGroupSchema';

const props = defineProps<EditorCustomPopupProps>();

const emit = defineEmits<{
  'update:item': [item: any];
  'request-save-jump': [payload: { mainTab: string; subTab: string; entityId: string }];
}>();

const editor = Editor.getInstance();

const localItem = ref(props.item);
watch(() => props.item, (newItem) => { localItem.value = newItem; }, { deep: true });

// ── Entity kind ──
// The popup is shared by every tab whose schema carries BaseStatusSchema. Only a character
// template composes other sources (starting statuses, default gear); the rest show their own block.
type Kind = 'template' | 'status' | 'item' | 'skill' | 'other';
const kind = computed<Kind>(() => {
  switch (props.subtabId) {
    case 'character_templates': return 'template';
    case 'character_statuses': return 'status';
    case 'item_templates': return 'item';
    case 'skill_slots': return 'skill';
    default: return 'other';
  }
});
const kindLabel: Record<Kind, string> = {
  template: 'character template', status: 'status', item: 'item (equip status)', skill: 'skill slot (learn status)', other: 'entity',
};

// ── Status block location ──
// stats/traits/attributes live at the entity root (statuses, character templates) or
// nested inside a schema-type field (item/skill-slot `status`).
const nestedKey = computed<string | null>(() => {
  if (!props.schema) return null;
  if ((props.schema as any).stats) return '';
  for (const key in props.schema) {
    const field = (props.schema as any)[key];
    if (field?.type === 'schema' && field.objects?.stats) return key;
  }
  return null;
});

function blockOf(entity: any): any | null {
  if (nestedKey.value === null || !entity) return null;
  return nestedKey.value === '' ? entity : (entity[nestedKey.value] ?? null);
}

function ownBlock(create = false): any | null {
  if (nestedKey.value === null || !localItem.value) return null;
  if (nestedKey.value === '') return localItem.value;
  if (!localItem.value[nestedKey.value] && create) localItem.value[nestedKey.value] = {};
  return localItem.value[nestedKey.value] ?? null;
}

const ownStats = computed<Record<string, number>>(() => (blockOf(localItem.value)?.stats as Record<string, number> | undefined) ?? {});

// ── Data ──
const ready = ref(false);
const loadError = ref('');
const statDefs = ref<EntityStatObject[]>([]);
const statGroups = ref<StatGroupObject[]>([]);
const statsById = ref(new Map<string, EntityStatObject>());
const statusesById = ref(new Map<string, any>());
const itemsById = ref(new Map<string, any>());
const siblings = ref<any[]>([]);
const jumpableStatuses = ref(new Set<string>());
const jumpableItems = ref(new Set<string>());

const siblingFile = computed(() => {
  for (const tab of EDITOR_TABS) {
    const sub = tab.subtabs.find(s => s.id === props.subtabId);
    if (sub?.file) return sub.file;
  }
  return null;
});

function mainTabOf(subtabId: string): string | null {
  for (const tab of EDITOR_TABS) {
    if (tab.subtabs.some(s => s.id === subtabId)) return tab.id;
  }
  return null;
}

async function readModRows(file: string): Promise<Set<string>> {
  try {
    const rows = await Global.getInstance().readJson(
      `games_files/${editor.selectedGame}/${editor.selectedMod}/${file}.json`
    ) as any[];
    if (Array.isArray(rows)) return new Set(rows.map((r: any) => r.id));
  } catch { /* the mod has no such file — jump stays disabled */ }
  return new Set();
}

const toMap = (rows: any[]) => new Map<string, any>(rows.filter(r => r?.id !== undefined).map(r => [r.id, r]));

onMounted(async () => {
  try {
    const [stats, groups, statuses, items] = await Promise.all([
      editor.loadFullData('character_stats'),
      editor.loadFullData('stat_groups'),
      editor.loadFullData('character_statuses'),
      editor.loadFullData('item_templates'),
    ]);
    statDefs.value = [...stats].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.id).localeCompare(String(b.id)));
    statsById.value = toMap(stats);
    statGroups.value = [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    statusesById.value = toMap(statuses);
    itemsById.value = toMap(items);

    if (siblingFile.value) {
      const rows = siblingFile.value === 'character_statuses' ? statuses
        : siblingFile.value === 'item_templates' ? items
          : await editor.loadFullData(siblingFile.value);
      siblings.value = rows.filter((r: any) => r?.id && r.id !== localItem.value?.id);
    }

    [jumpableStatuses.value, jumpableItems.value] = await Promise.all([
      readModRows('character_statuses'),
      readModRows('item_templates'),
    ]);
    ready.value = true;
  } catch (e) {
    console.error('[StatsPopup] load failed:', e);
    loadError.value = String(e);
  }
});

// ── Sources (template only) ──
// Mirrors character creation: the template's own block is the core status, then each
// starting status (1 stack), then every default item's equip status. Stats sum.
type Source = { label: string; id: string; kind: 'own' | 'status' | 'gear'; block: any; missing?: boolean; slot?: string };

function sourcesOf(entity: any): Source[] {
  const list: Source[] = [{ label: 'Own', id: entity?.id ?? '', kind: 'own', block: blockOf(entity) ?? {} }];
  if (kind.value !== 'template') return list;
  for (const id of (entity?.starting_statuses as string[] | undefined) ?? []) {
    const status = statusesById.value.get(id);
    list.push({ label: status?.name || id, id, kind: 'status', block: status ?? {}, missing: !status });
  }
  for (const slot of (entity?.item_slots as any[] | undefined) ?? []) {
    if (!slot?.item_default) continue;
    const item = itemsById.value.get(slot.item_default);
    list.push({ label: item?.name || slot.item_default, id: slot.item_default, kind: 'gear', block: item?.status ?? {}, missing: !item, slot: slot.slot || slot.id });
  }
  return list;
}

const sources = computed(() => sourcesOf(localItem.value));
const statusSources = computed(() => sources.value.filter(s => s.kind === 'status'));
const gearSources = computed(() => sources.value.filter(s => s.kind === 'gear'));

const maxStacks = computed<number | null>(() => {
  if (kind.value !== 'status') return null;
  const n = Number(localItem.value?.max_stacks);
  return Number.isFinite(n) && n > 1 ? n : null;
});

// ── Rounding / formatting ──
function precisionOf(def: EntityStatObject | undefined): number {
  const p = Number(def?.precision);
  return Number.isFinite(p) && p >= 0 ? p : 0;
}

function roundTo(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round(value * factor) / factor;
}

function fmt(value: number | null, def: EntityStatObject | undefined): string {
  if (value === null) return '';
  if (def?.is_binary) return value > 0 ? '✓' : '—';
  return roundTo(value, precisionOf(def) + 1).toString();
}

function fmtDelta(row: StatRow): string {
  if (row.delta === null || row.delta === 0) return '';
  if (row.def?.is_binary) return '≠';
  return (row.delta > 0 ? '+' : '') + fmt(row.delta, row.def);
}

function toneOf(value: number | null, def: EntityStatObject | undefined): string {
  if (value === null || value === 0) return 'is-zero';
  const good = def?.reduction_is_good ? value < 0 : value > 0;
  return good ? 'is-good' : 'is-bad';
}

// ── Rows ──
type StatRow = {
  id: string;
  def: EntityStatObject | undefined;
  own: number | null;
  statuses: number;
  gear: number;
  total: number;
  atMax: number | null;
  other: number | null;
  delta: number | null;
};

function sumFrom(list: Source[], statId: string): number {
  let total = 0;
  for (const s of list) {
    const v = s.block?.stats?.[statId];
    if (typeof v === 'number') total += v;
  }
  return total;
}

function totalOf(entity: any, statId: string): number {
  const def = statsById.value.get(statId);
  const raw = sumFrom(sourcesOf(entity), statId);
  if (def?.is_binary) return raw > 0 ? 1 : 0;
  return roundTo(raw, precisionOf(def));
}

const compareId = ref<string | null>(null);
const compareEntity = computed(() => compareId.value ? siblings.value.find(s => s.id === compareId.value) ?? null : null);

const settings = useStorage('stats-popup-settings', { onlySet: false, showHidden: true });
const search = ref('');

const allRows = computed<StatRow[]>(() => {
  const own = ownStats.value;
  return statDefs.value.map(def => {
    const id = def.id as string;
    const ownValue = typeof own[id] === 'number' ? own[id] : null;
    const statuses = sumFrom(statusSources.value, id);
    const gear = sumFrom(gearSources.value, id);
    const total = totalOf(localItem.value, id);
    const other = compareEntity.value ? totalOf(compareEntity.value, id) : null;
    return {
      id, def,
      own: ownValue,
      statuses, gear, total,
      atMax: maxStacks.value !== null && ownValue !== null ? roundTo(ownValue * maxStacks.value, precisionOf(def)) : null,
      other,
      delta: other !== null ? roundTo(total - other, precisionOf(def)) : null,
    };
  });
});

const rows = computed<StatRow[]>(() => {
  const q = search.value.trim().toLowerCase();
  return allRows.value.filter(r => {
    if (!settings.value.showHidden && r.def?.is_hidden) return false;
    if (settings.value.onlySet && r.own === null && r.statuses === 0 && r.gear === 0 && !(r.other)) return false;
    if (q && !r.id.toLowerCase().includes(q) && !String(r.def?.name ?? '').toLowerCase().includes(q)) return false;
    return true;
  });
});

// Mirrors the in-game CharacterStats default: one section per stat_groups entry in its order
// (each stat names its group), then the stats no group claims split into the built-in
// Resources / Stats sections. A game's registerStatGroupResolver can override this at runtime.
type RowGroup = { key: string; label: string; rows: StatRow[] };

function groupRows(source: StatRow[]): RowGroup[] {
  const resources: StatRow[] = [];
  const normal: StatRow[] = [];
  const byGroup = new Map<string, StatRow[]>();
  for (const g of statGroups.value) byGroup.set(g.id as string, []);
  for (const row of source) {
    const bucket = row.def?.group ? byGroup.get(row.def.group as string) : undefined;
    if (bucket) bucket.push(row);
    else if (row.def?.is_resource) resources.push(row);
    else normal.push(row);
  }
  const out: RowGroup[] = [];
  for (const g of statGroups.value) {
    const bucket = byGroup.get(g.id as string)!;
    if (bucket.length > 0) out.push({ key: g.id as string, label: (g.name as string) || (g.id as string), rows: bucket });
  }
  const ungrouped = statGroups.value.length > 0 ? ' (ungrouped)' : '';
  if (resources.length > 0) out.push({ key: '_resources', label: `Resources${ungrouped}`, rows: resources });
  if (normal.length > 0) out.push({ key: '_stats', label: `Stats${ungrouped}`, rows: normal });
  return out;
}

// Chips: one per section, counted after the search / hidden / only-set filters. None selected
// shows every section; a click toggles a section in and out of view.
const selectedGroups = ref(new Set<string>());
const groupChips = computed(() => groupRows(rows.value).map(g => ({ key: g.key, label: g.label, count: g.rows.length })));
const rowGroups = computed<RowGroup[]>(() => {
  const all = groupRows(rows.value);
  if (selectedGroups.value.size === 0) return all;
  return all.filter(g => selectedGroups.value.has(g.key));
});

function toggleGroup(key: string) {
  const next = new Set(selectedGroups.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  selectedGroups.value = next;
}

// A group id on a stat that no stat_groups entry defines: the sheet drops such a stat into the
// built-in split, which is rarely what the author meant.
const unknownGroupRows = computed(() => {
  const ids = new Set(statGroups.value.map(g => g.id));
  return allRows.value.filter(r => r.def?.group && !ids.has(r.def.group as string));
});

const setCount = computed(() => Object.keys(ownStats.value).filter(k => typeof ownStats.value[k] === 'number').length);

// Keys authored on this entity that no character_stat defines: a typo, or a stat that was
// renamed or deleted after the entity was written. The runtime ignores them silently.
const unknownKeys = computed(() => Object.keys(ownStats.value).filter(k => !statsById.value.has(k)));

// ── Editing ──
function commit() {
  emit('update:item', localItem.value);
}

function setOwn(statId: string, value: number | null | undefined) {
  const block = ownBlock(true);
  if (!block) return;
  if (!block.stats) block.stats = {};
  if (value === null || value === undefined || Number.isNaN(value)) {
    delete block.stats[statId];
  } else {
    block.stats[statId] = value;
  }
  commit();
}

function removeUnknown(key: string) {
  setOwn(key, null);
}

const scaleFactor = ref(1.1);
async function applyScale() {
  const factor = Number(scaleFactor.value);
  if (!Number.isFinite(factor) || factor === 1) return;
  const block = ownBlock();
  if (!block?.stats) return;
  const keys = Object.keys(block.stats).filter(k => typeof block.stats[k] === 'number');
  if (keys.length === 0) return;
  for (const k of keys) {
    block.stats[k] = roundTo(block.stats[k] * factor, precisionOf(statsById.value.get(k)));
  }
  commit();
}

const copyFromId = ref<string | null>(null);
async function copyStatsFrom() {
  const source = siblings.value.find(s => s.id === copyFromId.value);
  const stats = blockOf(source)?.stats;
  if (!source || !stats) return;
  const ok = await showConfirm({
    header: 'Replace stats',
    message: `Replace this entity's own stats with the ${Object.keys(stats).length} stats of "${source.id}"?`,
    acceptLabel: 'Replace',
  });
  if (!ok) return;
  const block = ownBlock(true);
  block.stats = JSON.parse(JSON.stringify(stats));
  commit();
}

async function clearOwn() {
  const block = ownBlock();
  if (!block?.stats || setCount.value === 0) return;
  const ok = await showConfirm({ header: 'Clear stats', message: `Remove all ${setCount.value} own stats?`, acceptLabel: 'Clear' });
  if (!ok) return;
  block.stats = {};
  commit();
}

const siblingOptions = computed(() => siblings.value.map(s => ({ label: s.name ? `${s.name} (${s.id})` : s.id, value: s.id })));

// ── Computed stats ──
// Keys of stat computers registered by scripts (game.registerStatComputer). The editor cannot
// see the registry, so the suggestion list is every key already authored on a status, item
// template or sibling entity in this game.
const computedStatKeys = computed<string[]>(() => (blockOf(localItem.value)?.computed_stats as string[] | undefined) ?? []);
const newComputedKey = ref('');

const knownComputedKeys = computed<string[]>(() => {
  const keys = new Set<string>();
  const collect = (block: any) => { for (const k of (block?.computed_stats as string[] | undefined) ?? []) if (k) keys.add(k); };
  for (const status of statusesById.value.values()) collect(status);
  for (const item of itemsById.value.values()) collect(item.status);
  for (const sibling of siblings.value) collect(blockOf(sibling));
  for (const k of computedStatKeys.value) keys.delete(k);
  return [...keys].sort();
});

function addComputedKey(key = newComputedKey.value) {
  const trimmed = key.trim();
  if (!trimmed) return;
  const block = ownBlock(true);
  if (!block) return;
  if (!Array.isArray(block.computed_stats)) block.computed_stats = [];
  if (!block.computed_stats.includes(trimmed)) block.computed_stats.push(trimmed);
  newComputedKey.value = '';
  commit();
}

function removeComputedKey(key: string) {
  const block = ownBlock();
  if (!Array.isArray(block?.computed_stats)) return;
  block.computed_stats = block.computed_stats.filter((k: string) => k !== key);
  commit();
}

// ── Item extras ──
const itemSlots = computed<string[]>(() => (localItem.value?.slots as string[] | undefined) ?? []);
const itemHasEquipStats = computed(() => kind.value === 'item' && setCount.value > 0);
const consumeRows = computed(() => {
  if (kind.value !== 'item') return [];
  const out: { label: string; stat: string; value: string }[] = [];
  const pct = localItem.value?.consume_percentage ?? {};
  for (const k in pct) if (typeof pct[k] === 'number') out.push({ label: 'restore %', stat: k, value: `${pct[k]}%` });
  const abs = localItem.value?.consume_absolute ?? {};
  for (const k in abs) if (typeof abs[k] === 'number') out.push({ label: 'restore', stat: k, value: String(abs[k]) });
  for (const entry of (localItem.value?.apply_statuses_on_consume as any[] | undefined) ?? []) {
    if (entry?.status) out.push({ label: 'apply status', stat: entry.status, value: statusesById.value.get(entry.status)?.name ?? '' });
  }
  return out;
});

function statName(id: string): string {
  return (statsById.value.get(id)?.name as string | undefined) || id;
}

// ── Jumps ──
function jumpToStatus(id: string) {
  emit('request-save-jump', { mainTab: mainTabOf('character_statuses') ?? 'characters', subTab: 'character_statuses', entityId: id });
}
function jumpToItem(id: string) {
  emit('request-save-jump', { mainTab: mainTabOf('item_templates') ?? 'items', subTab: 'item_templates', entityId: id });
}
</script>

<template>
  <div class="stats-popup">
    <div class="picker-header">
      <h3>Stats – <code>{{ localItem?.id || 'new' }}</code></h3>
      <p class="hint">
        {{ kindLabel[kind] }} ·
        <template v-if="kind === 'template'">totals are the character at creation: own block + starting statuses + default gear.</template>
        <template v-else-if="kind === 'status'">per stack; the runtime multiplies by the stack count.</template>
        <template v-else-if="kind === 'item'">applied while equipped, on top of the wearer's own stats.</template>
        <template v-else>applied to the character that holds it.</template>
      </p>
    </div>

    <div v-if="loadError" class="pane-warning">Failed to load game data: {{ loadError }}</div>
    <div v-else-if="!ready" class="hint">Loading…</div>

    <div v-else-if="nestedKey === null" class="pane-warning">This tab's schema has no <code>stats</code> block.</div>

    <div v-else class="stats-content">
      <div class="stats-main">
        <div class="toolbar">
          <InputText v-model="search" placeholder="Filter stats…" class="search" />
          <label class="toggle"><ToggleSwitch v-model="settings.onlySet" /> Only set</label>
          <label class="toggle"><ToggleSwitch v-model="settings.showHidden" /> Show hidden</label>
          <span class="spacer" />
          <span class="count">{{ setCount }} own · {{ rows.length }}/{{ allRows.length }} shown</span>
        </div>

        <div v-if="groupChips.length > 1" class="group-chips"
          v-tooltip.top="'Sections from the Stat Groups tab. Click to show only some; a game script may still override the sheet with registerStatGroupResolver.'">
          <span class="chip clickable" :class="{ 'is-on': selectedGroups.size === 0 }" @click="selectedGroups = new Set()">All</span>
          <span v-for="g in groupChips" :key="g.key" class="chip clickable" :class="{ 'is-on': selectedGroups.has(g.key) }"
            @click="toggleGroup(g.key)">{{ g.label }} <span class="chip-count">{{ g.count }}</span></span>
        </div>

        <div v-if="unknownKeys.length > 0" class="pane-warning">
          <strong>Unknown stats</strong> – no character_stat defines these keys, so the runtime ignores them:
          <span v-for="key in unknownKeys" :key="key" class="unknown-chip">
            <code>{{ key }}</code> = {{ ownStats[key] }}
            <Button icon="pi pi-times" text rounded size="small" severity="danger" v-tooltip.top="'Remove this key'" @click="removeUnknown(key)" />
          </span>
        </div>

        <div v-if="unknownGroupRows.length > 0" class="pane-warning">
          <strong>Unknown stat groups</strong> – these stats name a group the Stat Groups tab does not define:
          <span v-for="r in unknownGroupRows" :key="r.id" class="unknown-chip"><code>{{ r.id }}</code> → {{ r.def?.group }}</span>
        </div>

        <div v-if="kind === 'item' && itemHasEquipStats && itemSlots.length === 0" class="pane-warning">
          This item has equip stats but no <code>slots</code>, so nothing can ever wear it – the stats never apply.
        </div>

        <div class="fields-wrap">
          <section v-for="group in rowGroups" :key="group.key" class="stat-section">
            <h4 class="section-title">{{ group.label }} <span class="muted">{{ group.rows.length }}</span></h4>
            <div class="stat-grid">
              <div v-for="row in group.rows" :key="row.id" class="stat-field" :class="{ 'is-set': row.own !== null, 'is-hidden-stat': row.def?.is_hidden }">
                <FloatLabel variant="on" class="p-float-label-variant-on input-wrapper">
                  <InputNumber :modelValue="row.own" @update:modelValue="(v) => setOwn(row.id, v)" showButtons class="w-full" mode="decimal"
                    :maxFractionDigits="Math.max(precisionOf(row.def), 2)" :useGrouping="false" :inputId="`stat-${row.id}`"
                    v-tooltip.left="row.def?.description || undefined" />
                  <label :for="`stat-${row.id}`">{{ row.def?.name || row.id }}</label>
                </FloatLabel>
                <div class="stat-meta">
                  <code class="stat-id">{{ row.id }}</code>
                  <span v-if="row.def?.is_resource" class="flag" v-tooltip.top="'Resource (current/max)'">R</span>
                  <span v-if="row.def?.is_binary" class="flag" v-tooltip.top="'Binary flag'">0/1</span>
                  <span v-if="row.def?.reduction_is_good" class="flag" v-tooltip.top="'Lower is better'">↓</span>
                  <span v-if="row.def?.is_hidden" class="flag" v-tooltip.top="'Hidden from the player'">H</span>
                  <span v-if="maxStacks !== null && row.atMax !== null" class="meta-item" :class="toneOf(row.atMax, row.def)"
                    v-tooltip.top="`At max_stacks = ${maxStacks}`">×{{ maxStacks }} = {{ fmt(row.atMax, row.def) }}</span>
                  <template v-if="kind === 'template' && (row.statuses || row.gear)">
                    <span v-if="row.statuses" class="meta-item" :class="toneOf(row.statuses, row.def)" v-tooltip.top="'From starting statuses'">statuses {{ row.statuses > 0 ? '+' : '' }}{{ fmt(row.statuses, row.def) }}</span>
                    <span v-if="row.gear" class="meta-item" :class="toneOf(row.gear, row.def)" v-tooltip.top="'From default gear'">gear {{ row.gear > 0 ? '+' : '' }}{{ fmt(row.gear, row.def) }}</span>
                    <span class="meta-item meta-total" v-tooltip.top="'At creation'">= {{ fmt(row.total, row.def) }}</span>
                  </template>
                  <span v-if="compareEntity && (row.other || row.own !== null)" class="meta-item meta-compare" v-tooltip.top="`${compareEntity.id}: ${fmt(row.other ?? 0, row.def)}`">
                    vs {{ fmt(row.other ?? 0, row.def) }}
                    <span v-if="fmtDelta(row)" :class="toneOf(row.delta, row.def)">{{ fmtDelta(row) }}</span>
                  </span>
                </div>
              </div>
            </div>
          </section>
          <p v-if="rows.length === 0" class="empty">No stats match.</p>
        </div>
      </div>

      <div class="stats-side">
        <section class="side-block">
          <h4>Tools</h4>
          <div class="tool-row">
            <span class="tool-label">Compare with</span>
            <Select v-model="compareId" :options="siblingOptions" optionLabel="label" optionValue="value" filter showClear
              placeholder="none" class="tool-select" />
          </div>
          <div class="tool-row">
            <span class="tool-label">Copy stats from</span>
            <Select v-model="copyFromId" :options="siblingOptions" optionLabel="label" optionValue="value" filter showClear
              placeholder="pick an entity" class="tool-select" />
            <Button label="Replace" size="small" severity="warn" :disabled="!copyFromId" @click="copyStatsFrom" />
          </div>
          <div class="tool-row">
            <span class="tool-label">Scale own by</span>
            <InputNumber v-model="scaleFactor" :minFractionDigits="0" :maxFractionDigits="3" :step="0.05" showButtons
              class="tool-number" inputClass="tool-number-input" />
            <Button label="Apply" size="small" :disabled="setCount === 0 || scaleFactor === 1" @click="applyScale"
              v-tooltip.top="'Multiplies every own stat and rounds to its precision'" />
          </div>
          <div class="tool-row">
            <Button label="Clear own stats" size="small" severity="danger" text :disabled="setCount === 0" @click="clearOwn" />
          </div>
        </section>

        <section v-if="kind === 'template'" class="side-block">
          <h4>Sources</h4>
          <p v-if="statusSources.length === 0 && gearSources.length === 0" class="hint small">No starting statuses or default items – totals equal the own block.</p>
          <ul class="source-list">
            <li v-for="s in statusSources" :key="`s-${s.id}`" :class="{ 'is-missing': s.missing }">
              <span class="source-kind">status</span>
              <span class="source-name">{{ s.label }}</span>
              <code v-if="s.label !== s.id">{{ s.id }}</code>
              <span v-if="s.missing" class="flag danger" v-tooltip.top="'No status with this id'">missing</span>
              <span v-else class="source-count">{{ Object.keys(s.block?.stats ?? {}).length }} stats</span>
              <Button v-if="jumpableStatuses.has(s.id)" icon="pi pi-pencil" text rounded size="small"
                v-tooltip.top="'Save and jump to this status'" @click="jumpToStatus(s.id)" />
            </li>
            <li v-for="s in gearSources" :key="`g-${s.id}`" :class="{ 'is-missing': s.missing }">
              <span class="source-kind">{{ s.slot || 'gear' }}</span>
              <span class="source-name">{{ s.label }}</span>
              <code v-if="s.label !== s.id">{{ s.id }}</code>
              <span v-if="s.missing" class="flag danger" v-tooltip.top="'No item template with this id'">missing</span>
              <span v-else class="source-count">{{ Object.keys(s.block?.stats ?? {}).length }} stats</span>
              <Button v-if="jumpableItems.has(s.id)" icon="pi pi-pencil" text rounded size="small"
                v-tooltip.top="'Save and jump to this item'" @click="jumpToItem(s.id)" />
            </li>
          </ul>
        </section>

        <section class="side-block">
          <h4>Computed stats <span class="muted">{{ computedStatKeys.length }}</span></h4>
          <p class="hint small">Keys of stat computers registered by scripts at runtime; their contribution cannot be previewed here.</p>
          <div v-if="computedStatKeys.length > 0" class="chip-list">
            <span v-for="key in computedStatKeys" :key="key" class="chip removable">
              <code>{{ key }}</code>
              <Button icon="pi pi-times" text rounded size="small" severity="danger" v-tooltip.top="'Remove'" @click="removeComputedKey(key)" />
            </span>
          </div>
          <div class="tool-row">
            <InputText v-model="newComputedKey" list="stats-popup-computed-keys" placeholder="computer key" class="tool-select"
              @keydown.enter.prevent="addComputedKey()" />
            <datalist id="stats-popup-computed-keys">
              <option v-for="key in knownComputedKeys" :key="key" :value="key" />
            </datalist>
            <Button label="Add" size="small" :disabled="!newComputedKey.trim()" @click="addComputedKey()" />
          </div>
          <div v-if="knownComputedKeys.length > 0" class="chip-list">
            <span v-for="key in knownComputedKeys" :key="`k-${key}`" class="chip clickable" v-tooltip.top="'Used elsewhere in this game – click to add'"
              @click="addComputedKey(key)"><code>{{ key }}</code></span>
          </div>
        </section>

        <section v-if="consumeRows.length > 0" class="side-block">
          <h4>On consume</h4>
          <ul class="source-list">
            <li v-for="(row, i) in consumeRows" :key="i">
              <span class="source-kind">{{ row.label }}</span>
              <span class="source-name">{{ row.label === 'apply status' ? (row.value || row.stat) : statName(row.stat) }}</span>
              <code>{{ row.stat }}</code>
              <span v-if="row.label !== 'apply status'" class="source-count">{{ row.value }}</span>
            </li>
          </ul>
        </section>

      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-popup {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  height: 100%;
}

.picker-header {
  padding: 0.5rem 0.75rem;
  background-color: var(--editor-surface-sunken);
  border-radius: 4px;
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.picker-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--editor-text);
  white-space: nowrap;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--editor-text-muted);
  font-style: italic;
}

.hint.small {
  font-size: 0.75rem;
}

code {
  font-style: normal;
  font-size: 0.8em;
  background: var(--editor-surface-hover);
  padding: 0 0.25em;
  border-radius: 3px;
}

.pane-warning {
  padding: 0.5rem 0.75rem;
  background-color: var(--editor-tint-warning);
  border-left: 4px solid var(--editor-ink-orange);
  border-radius: 4px;
  font-size: 0.85rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.unknown-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0 0.2rem 0 0.4rem;
  border: 1px solid var(--editor-border);
  border-radius: 4px;
  background: var(--editor-surface);
}

.stats-content {
  display: flex;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}

.stats-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.stats-side {
  flex: 0 0 360px;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  overflow-y: auto;
  min-height: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.toolbar .search {
  width: 14rem;
}


.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--editor-text);
  cursor: pointer;
}

.spacer {
  flex: 1;
}

.count {
  font-size: 0.8rem;
  color: var(--editor-text-muted);
}

.fields-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.25rem 0.25rem 0.25rem 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.group-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  align-items: center;
}

.chip-count {
  color: var(--editor-text-muted);
  font-size: 0.7rem;
}

.chip.clickable.is-on {
  border-style: solid;
  border-color: var(--editor-accent);
  color: var(--editor-accent);
  background: var(--editor-surface-selected);
}

.stat-section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.section-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--editor-text-muted);
  padding-bottom: 0.3rem;
  border-bottom: 1px solid var(--editor-border);
}

.section-title .muted {
  font-weight: normal;
  text-transform: none;
  letter-spacing: 0;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.75rem 1rem;
}

.stat-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.stat-field.is-hidden-stat :deep(label) {
  color: var(--editor-text-muted);
}

.stat-field :deep(.p-inputnumber-input) {
  width: 100%;
  min-width: 0;
}

.input-wrapper {
  min-width: 0;
}

.w-full {
  width: 100%;
}

.p-float-label-variant-on>label {
  background: var(--editor-surface);
  padding: 0 0.25rem;
}

.stat-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  color: var(--editor-text-muted);
  min-height: 1rem;
  padding-left: 0.15rem;
}

.meta-item {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.meta-total {
  font-weight: 600;
  color: var(--editor-text);
}

.meta-compare {
  border-left: 1px solid var(--editor-border-strong);
  padding-left: 0.35rem;
}



.stat-id {
  color: var(--editor-text-muted);
}

.flag {
  font-size: 0.65rem;
  padding: 0 0.3rem;
  border-radius: 3px;
  border: 1px solid var(--editor-border-strong);
  color: var(--editor-text-muted);
  line-height: 1.3;
}

.flag.danger {
  border-color: var(--editor-fg-danger);
  color: var(--editor-fg-danger);
}

.is-good {
  color: var(--editor-fg-success);
}

.is-bad {
  color: var(--editor-fg-danger);
}

.is-zero {
  color: var(--editor-text-faint);
}

.empty {
  text-align: center;
  color: var(--editor-text-muted);
  padding: 1rem;
}

.side-block {
  padding: 0.6rem 0.75rem;
  background-color: var(--editor-surface-raised);
  border: 1px solid var(--editor-border);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.side-block h4 {
  margin: 0;
  font-size: 0.9rem;
  color: var(--editor-text);
}

.side-block h4 .muted {
  font-weight: normal;
  color: var(--editor-text-muted);
  font-size: 0.8rem;
}

.tool-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.tool-label {
  font-size: 0.8rem;
  color: var(--editor-text-muted);
  flex: 0 0 7rem;
}

.tool-select {
  flex: 1 1 8rem;
  min-width: 0;
}

.tool-number {
  width: 7.5rem;
}

.tool-number :deep(.tool-number-input) {
  width: 4.5rem;
  padding: 0.2rem 0.4rem;
}

.source-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.8rem;
}

.source-list li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 1.6rem;
}

.source-list li.is-missing .source-name {
  color: var(--editor-fg-danger);
}

.source-kind {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--editor-text-muted);
  flex: 0 0 4.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-name {
  font-weight: 500;
}

.source-count {
  margin-left: auto;
  color: var(--editor-text-muted);
  white-space: nowrap;
}


.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  padding: 0.1rem 0.4rem;
  border: 1px solid var(--editor-border);
  border-radius: 4px;
  background: var(--editor-surface);
  font-size: 0.8rem;
}

.chip code {
  background: none;
  padding: 0;
}

.chip.removable {
  padding-right: 0;
}

.chip.clickable {
  cursor: pointer;
  color: var(--editor-text-muted);
  border-style: dashed;
}

.chip.clickable:hover {
  color: var(--editor-text);
  background: var(--editor-surface-hover);
}
</style>
