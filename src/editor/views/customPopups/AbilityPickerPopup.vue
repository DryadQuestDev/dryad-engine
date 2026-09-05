<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useStorage } from '@vueuse/core';
import Button from 'primevue/button';
import SelectButton from 'primevue/selectbutton';
import Select from 'primevue/select';
import { Editor, type EditorCustomPopupProps } from '../../editor';
import { Game } from '../../../game/game';
import { Global } from '../../../global/global';
import { hydrateAbilityPreview, type AbilityPreviewData } from '../../gamePreviewHydration';
import { showConfirm } from '../../../services/dialogService';
import type { Schema, Schemable } from '../../../utility/schema';
import { AbilityTemplateSchema } from '../../../schemas/abilityTemplateSchema';
import AbilityCard from '../../../game/views/progression/AbilityCard.vue';
import Dsearch from '../dsearch/Dsearch.vue';

const props = defineProps<EditorCustomPopupProps>();

const emit = defineEmits<{
  'update:item': [item: any];
  'request-save-jump': [payload: { mainTab: string; subTab: string; entityId: string }];
}>();

const editor = Editor.getInstance();
const game = Game.getInstance();

const localItem = ref(props.item);
watch(() => props.item, (newItem) => { localItem.value = newItem; }, { deep: true });

// ── Field location ──
// abilities/ability_modifiers live at the entity root (statuses, character
// templates) or nested inside a schema-type field (item/skill-slot equip status).
const nestedKey = computed<string | null>(() => {
  if (!props.schema) return null;
  if ((props.schema as any).abilities) return '';
  for (const key in props.schema) {
    const field = (props.schema as any)[key];
    if (field?.type === 'schema' && field.objects?.abilities) return key;
  }
  return null;
});

function fieldSchema(fieldKey: 'abilities' | 'ability_modifiers'): Schemable | null {
  if (nestedKey.value === null || !props.schema) return null;
  const holder: any = nestedKey.value === '' ? props.schema : (props.schema as any)[nestedKey.value].objects;
  return holder?.[fieldKey] ?? null;
}
const abilitiesSchema = computed(() => fieldSchema('abilities'));
const modifiersSchema = computed(() => fieldSchema('ability_modifiers'));

function targetObject(create = false): any | null {
  if (nestedKey.value === null || !localItem.value) return null;
  if (nestedKey.value === '') return localItem.value;
  if (!localItem.value[nestedKey.value] && create) localItem.value[nestedKey.value] = {};
  return localItem.value[nestedKey.value] ?? null;
}

// ── Data ──
const ready = ref(false);
const loadError = ref('');
const data = ref<AbilityPreviewData | null>(null);
const templatesById = ref(new Map<string, any>());
const usedBy = ref(new Map<string, string[]>());
const jumpTargets = ref(new Set<string>());
const abilitySchema = ref<Schema | null>(null);

onMounted(async () => {
  try {
    const preview = await hydrateAbilityPreview();
    data.value = preview;
    templatesById.value = new Map(preview.templates.map((t: any) => [t.id, t]));
    buildUsedBy(preview);

    // The Sifter derives its filters (search, ranges, selections, tag AND/OR) from the
    // processed ability schema — plugin-injected meta definitions included.
    abilitySchema.value = await editor.prepareSchema(AbilityTemplateSchema as unknown as Schema);

    // Jump can only land on rows the ability tab actually displays: the selected mod's file.
    try {
      const rows = await Global.getInstance().readJson(
        `games_files/${editor.selectedGame}/${editor.selectedMod}/ability_templates.json`
      ) as any[];
      if (Array.isArray(rows)) jumpTargets.value = new Set(rows.map((r: any) => r.id));
    } catch { /* mod has no ability_templates file — jump stays disabled */ }

    ready.value = true;
  } catch (e) {
    console.error('[AbilityPicker] load failed:', e);
    loadError.value = String(e);
  }
});

function buildUsedBy(preview: AbilityPreviewData) {
  const map = new Map<string, string[]>();
  const add = (abilityId: string, consumer: string) => {
    const list = map.get(abilityId) ?? [];
    list.push(consumer);
    map.set(abilityId, list);
  };
  const both = (holder: any, consumer: string) => {
    for (const a of holder?.abilities ?? []) add(a, consumer);
    for (const a of holder?.ability_modifiers ?? []) add(a, consumer);
  };
  for (const c of preview.characterTemplates) both(c, `character: ${c.id}`);
  for (const s of preview.statuses) both(s, `status: ${s.id}`);
  for (const it of preview.itemTemplates) both(it.status, `item: ${it.id}`);
  for (const sl of preview.skillSlots) both(sl.status, `skill slot: ${sl.id}`);
  usedBy.value = map;
}

// ── Card render preflight ──
// The card's description paths run the full text-resolver pipeline against a
// data-only hydrated singleton; anything it can't survive falls back to a plain
// row instead of breaking the whole grid.
const cardSafe = new Map<string, boolean>();
function canRenderCard(id: string): boolean {
  const cached = cardSafe.get(id);
  if (cached !== undefined) return cached;
  let ok = true;
  try {
    game.buildAbilityEffectsDescription(id);
    game.buildAbilityMetaDescription(id);
    const tpl = templatesById.value.get(id);
    if (tpl?.meta?.description) game.resolveString(tpl.meta.description, true);
    for (const eff of tpl?.effects ?? []) {
      if (eff?.description_attach) game.resolveString(eff.description_attach, true);
    }
  } catch (e) {
    console.warn(`[AbilityPicker] plain-row fallback for "${id}":`, e);
    ok = false;
  }
  cardSafe.set(id, ok);
  return ok;
}

// ── Tabs & selection ──
const activeTab = ref<'abilities' | 'modifiers'>('abilities');
const fieldKeyForTab = computed(() => activeTab.value === 'abilities' ? 'abilities' : 'ability_modifiers');

const abilityOptions = computed<string[]>(() => (abilitiesSchema.value?.options as string[] | undefined) ?? []);
const modifierOptions = computed<string[]>(() => (modifiersSchema.value?.options as string[] | undefined) ?? []);
const activeOptions = computed(() => activeTab.value === 'abilities' ? abilityOptions.value : modifierOptions.value);

const abilityEntries = computed(() => abilityOptions.value.map(id => ({ id, tpl: templatesById.value.get(id) })));
const modifierEntries = computed(() => modifierOptions.value.map(id => ({ id, tpl: templatesById.value.get(id) })));

const selectedIds = computed<string[]>(() => {
  const target = targetObject();
  return (target?.[fieldKeyForTab.value] as string[] | undefined) ?? [];
});
const selectedSet = computed(() => new Set(selectedIds.value));
const abilitiesCount = computed(() => ((targetObject()?.abilities as string[] | undefined) ?? []).length);
const modifiersCount = computed(() => ((targetObject()?.ability_modifiers as string[] | undefined) ?? []).length);

// Canonical order = options order, matching FormFieldRenderer's chooseMany re-sort
// so the next form touch produces no spurious diff.
function sortToOptions(ids: string[], options: string[]): string[] {
  const index = new Map(options.map((id, i) => [id, i]));
  return [...ids].sort((a, b) => (index.get(a) ?? Infinity) - (index.get(b) ?? Infinity));
}

function toggleSelect(id: string) {
  const target = targetObject(true);
  if (!target) return;
  const key = fieldKeyForTab.value;
  const current: string[] = Array.isArray(target[key]) ? [...target[key]] : [];
  const i = current.indexOf(id);
  if (i >= 0) current.splice(i, 1); else current.push(id);
  target[key] = sortToOptions(current, activeOptions.value);
  emit('update:item', localItem.value);
}

function clearSelection() {
  const target = targetObject();
  if (!target) return;
  target[fieldKeyForTab.value] = [];
  emit('update:item', localItem.value);
}

// ── Sifting (engine Dsearch — filters derived from the ability schema) ──
const clearCounter = ref(0);
const filtersDirty = ref(false);
const siftedIds = ref<Set<string> | null>(null);

// Dsearch filters the ACTIVE tab's pool; entries missing a merged object (shouldn't
// happen, but stay safe) sift as bare {id} rows.
const sifterData = computed(() =>
  (activeTab.value === 'abilities' ? abilityEntries.value : modifierEntries.value).map(e => e.tpl ?? { id: e.id }));

function onSifted(rows: any[]) {
  siftedIds.value = new Set(rows.map((r: any) => r.id));
}

const passesSift = (id: string) => siftedIds.value?.has(id) ?? true;

// Pool below the Selected row: sifted, minus what's already selected.
const filteredAbilities = computed(() =>
  abilityEntries.value.filter(e => !selectedSet.value.has(e.id) && passesSift(e.id)));
const filteredModifiers = computed(() =>
  modifierEntries.value.filter(e => !selectedSet.value.has(e.id) && passesSift(e.id)));

// ── Grouping / view modes ──
const NO_GROUP = '(none)';
const CD_NONE = 'none';

const groupsData = computed<any[]>(() => data.value?.groups ?? []);
const groupChips = computed<{ id: string; label: string }[]>(() => {
  const inPool = new Set<string>();
  let groupless = false;
  for (const e of abilityEntries.value) {
    if (e.tpl?.meta?.group) inPool.add(e.tpl.meta.group); else groupless = true;
  }
  if (!inPool.size) return [];
  const known = groupsData.value.filter((g: any) => inPool.has(g.id)).map((g: any) => ({ id: g.id, label: g.name || g.id }));
  const unknown = [...inPool].filter(id => !groupsData.value.some((g: any) => g.id === id)).map(id => ({ id, label: id }));
  const chips = [...known, ...unknown];
  if (groupless) chips.push({ id: NO_GROUP, label: 'No group' });
  return chips;
});

const cooldownDefined = computed(() => !!data.value?.definitions.some((d: any) => d.id === 'cd'));
const cdValues = computed<number[]>(() => {
  const values = new Set<number>();
  for (const e of abilityEntries.value) {
    const cd = e.tpl?.meta?.cd;
    if (typeof cd === 'number' && cd > 0) values.add(cd);
  }
  return [...values].sort((a, b) => a - b);
});
const cdBuckets = computed<string[]>(() => {
  if (!cooldownDefined.value || !cdValues.value.length) return [];
  const values = cdValues.value;
  if (values.length <= 5) return [CD_NONE, ...values.map(String)];
  return [CD_NONE, ...values.slice(0, 4).map(String), `${values[4]}+`];
});
function cdBucketOf(tpl: any): string {
  const cd = tpl?.meta?.cd;
  if (typeof cd !== 'number' || cd <= 0) return CD_NONE;
  const last = cdBuckets.value[cdBuckets.value.length - 1];
  if (last?.endsWith('+') && cd >= parseInt(last)) return last;
  return String(cd);
}

const pickerSettings = useStorage('ability-picker-settings',
  { viewMode: 'group' as 'group' | 'cooldown' | 'flat', selectedCollapsed: false });
const viewModes = computed(() => {
  const modes: { label: string; value: string }[] = [];
  if (groupChips.value.length) modes.push({ label: 'By group', value: 'group' });
  if (cdBuckets.value.length) modes.push({ label: 'By cooldown', value: 'cooldown' });
  modes.push({ label: 'Flat', value: 'flat' });
  return modes;
});
const effectiveViewMode = computed(() =>
  viewModes.value.some(m => m.value === pickerSettings.value.viewMode) ? pickerSettings.value.viewMode : 'flat');

// The game's ability order (Character.computeFinalAbilities): meta.order asc,
// then meta.cd asc. Id only as a stable last tiebreak.
function sortRuntime(items: { id: string; tpl: any }[]) {
  return [...items].sort((a, b) =>
    (a.tpl?.meta?.order ?? 0) - (b.tpl?.meta?.order ?? 0)
    || (a.tpl?.meta?.cd ?? 0) - (b.tpl?.meta?.cd ?? 0)
    || a.id.localeCompare(b.id));
}

// Selected entries render as normal cards in their own row on top, in in-game order:
// group order (grouped UIs), then the computeFinalAbilities sort (meta.order, then
// meta.cd) — authored order does not persist in chooseMany.
const selectedAbilityEntries = computed(() => {
  const groupOrder = new Map(groupsData.value.map((g: any, i: number) => [g.id, typeof g.order === 'number' ? g.order : i]));
  return ((targetObject()?.abilities as string[] | undefined) ?? [])
    .map(id => ({ id, tpl: templatesById.value.get(id) }))
    .sort((a, b) =>
      ((groupOrder.get(a.tpl?.meta?.group) as number | undefined) ?? 999) - ((groupOrder.get(b.tpl?.meta?.group) as number | undefined) ?? 999)
      || (a.tpl?.meta?.order ?? 0) - (b.tpl?.meta?.order ?? 0)
      || (a.tpl?.meta?.cd ?? 0) - (b.tpl?.meta?.cd ?? 0)
      || a.id.localeCompare(b.id));
});
const selectedModifierEntries = computed(() =>
  (((targetObject()?.ability_modifiers as string[] | undefined) ?? [])
    .map(id => ({ id, tpl: templatesById.value.get(id) })))
    .sort((a, b) => a.id.localeCompare(b.id)));

// One rendering loop for everything: the Selected row is just the first section.
const sections = computed<{ key: string; label: string; warn?: boolean; selectedRow?: boolean; items: { id: string; tpl: any }[] }[]>(() => {
  const result: { key: string; label: string; warn?: boolean; selectedRow?: boolean; items: { id: string; tpl: any }[] }[] = [];
  if (selectedAbilityEntries.value.length) {
    result.push({ key: '__selected', label: `Selected (${selectedAbilityEntries.value.length})`, selectedRow: true, items: selectedAbilityEntries.value });
  }
  const items = filteredAbilities.value;
  if (effectiveViewMode.value === 'group' && groupChips.value.length) {
    const byGroup = new Map<string, { id: string; tpl: any }[]>();
    for (const entry of items) {
      const group = entry.tpl?.meta?.group ?? NO_GROUP;
      (byGroup.get(group) ?? byGroup.set(group, []).get(group)!).push(entry);
    }
    for (const chip of groupChips.value) {
      const bucket = byGroup.get(chip.id);
      if (!bucket?.length) continue;
      result.push({
        key: chip.id,
        label: chip.id === NO_GROUP ? 'No group (hidden in game!)' : chip.label,
        warn: chip.id === NO_GROUP,
        items: sortRuntime(bucket),
      });
    }
  } else if (effectiveViewMode.value === 'cooldown' && cdBuckets.value.length) {
    for (const bucket of cdBuckets.value) {
      const bucketItems = sortRuntime(items.filter(e => cdBucketOf(e.tpl) === bucket));
      if (!bucketItems.length) continue;
      result.push({ key: bucket, label: bucket === CD_NONE ? 'No cooldown' : `Cooldown ${bucket}`, items: bucketItems });
    }
  } else {
    result.push({ key: 'all', label: '', items: sortRuntime(items) });
  }
  return result;
});

// Modifiers have no meta of their own by design — group them by the ability they modify,
// with the selected ones in their own row on top.
const modifierSections = computed(() => {
  const result: { key: string; label: string; selectedRow?: boolean; items: { id: string; tpl: any }[] }[] = [];
  if (selectedModifierEntries.value.length) {
    result.push({ key: '__selected', label: `Selected (${selectedModifierEntries.value.length})`, selectedRow: true, items: selectedModifierEntries.value });
  }
  const byTarget = new Map<string, { id: string; tpl: any }[]>();
  for (const entry of filteredModifiers.value) {
    const target = entry.tpl?.modifies || '(unknown target)';
    (byTarget.get(target) ?? byTarget.set(target, []).get(target)!).push(entry);
  }
  for (const [target, items] of [...byTarget.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    result.push({
      key: target,
      label: `modifies: ${templatesById.value.get(target)?.meta?.name ?? target}`,
      items: items.sort((a, b) => a.id.localeCompare(b.id)),
    });
  }
  return result;
});

// ── Warnings (engine-generic only: grouped UIs silently drop group-less abilities) ──
const warnings = computed<string[]>(() => {
  if (activeTab.value !== 'abilities' || !groupChips.value.some(c => c.id !== NO_GROUP)) return [];
  const out: string[] = [];
  for (const id of (targetObject()?.abilities as string[] | undefined) ?? []) {
    const tpl = templatesById.value.get(id);
    if (tpl && !tpl.meta?.group) out.push(`"${tpl.meta?.name || id}" has no group — hidden from grouped ability UIs in-game.`);
  }
  return out;
});

// ── Copy loadout from another character ──
const copyFromEnabled = computed(() =>
  (props.subtabId === 'character_templates' || props.subtabId === 'character_statuses') && activeTab.value === 'abilities');
const copySources = computed(() => (data.value?.characterTemplates ?? [])
  .filter((c: any) => c.abilities?.length && !(props.subtabId === 'character_templates' && c.id === localItem.value?.id))
  .map((c: any) => ({ label: `${c.traits?.name || c.id} (${c.abilities.length})`, value: c.id })));
const copyFrom = ref<string | null>(null);
watch(copyFrom, async (sourceId) => {
  if (!sourceId) return;
  copyFrom.value = null;
  const source = (data.value?.characterTemplates ?? []).find((c: any) => c.id === sourceId);
  if (!source) return;
  if (selectedIds.value.length) {
    const proceed = await showConfirm({
      message: `Replace the ${selectedIds.value.length} currently selected abilities with the loadout of "${source.id}"?`,
      header: 'Copy loadout',
    });
    if (!proceed) return;
  }
  const target = targetObject(true);
  if (!target) return;
  target.abilities = sortToOptions([...(source.abilities ?? [])], abilityOptions.value);
  emit('update:item', localItem.value);
});

// ── Per-entry actions ──
function requestJump(id: string) {
  emit('request-save-jump', { mainTab: 'characters', subTab: 'ability_templates', entityId: id });
}
function copyId(id: string) {
  navigator.clipboard?.writeText(id).catch(() => { /* clipboard unavailable — non-critical */ });
}
function usedByTitle(id: string): string {
  const consumers = usedBy.value.get(id);
  return consumers?.length ? `Used by:\n${consumers.join('\n')}` : 'Not used by any character, status, item, or skill slot';
}
function aspectSummary(tpl: any): string {
  const keys = new Set<string>();
  for (const effect of tpl?.effects ?? []) for (const key in effect?.aspects ?? {}) keys.add(key);
  return [...keys].join(', ');
}
</script>

<template>
  <div class="ability-picker">
    <div v-if="nestedKey === null" class="picker-error">
      This tab's schema has no <code>abilities</code> field — the ability picker cannot attach here.
    </div>
    <div v-else-if="loadError" class="picker-error">Failed to load ability data: {{ loadError }}</div>
    <div v-else-if="!ready" class="picker-loading">Loading abilities…</div>

    <template v-else>
      <!-- Header -->
      <div class="picker-header">
        <SelectButton
          :modelValue="activeTab"
          @update:modelValue="(v: any) => { if (v) activeTab = v; }"
          :options="[
            { label: `Abilities (${abilitiesCount})`, value: 'abilities' },
            { label: `Modifiers (${modifiersCount})`, value: 'modifiers' },
          ]" optionLabel="label" optionValue="value" :allowEmpty="false" size="small" />
        <SelectButton v-if="activeTab === 'abilities' && viewModes.length > 1"
          :modelValue="effectiveViewMode"
          @update:modelValue="(v: any) => { if (v) pickerSettings.viewMode = v; }"
          :options="viewModes" optionLabel="label" optionValue="value" :allowEmpty="false" size="small" />
        <span class="pool-count">{{ activeTab === 'abilities' ? filteredAbilities.length : filteredModifiers.length }}
          of {{ activeTab === 'abilities' ? abilityEntries.length : modifierEntries.length }}</span>
        <div class="header-spacer"></div>
        <Select v-if="copyFromEnabled && copySources.length" v-model="copyFrom" :options="copySources"
          optionLabel="label" optionValue="value" placeholder="Copy from…" size="small" filter
          appendTo="body" class="copy-from-select" />
        <Button v-if="selectedIds.length" label="Clear all" severity="danger" text size="small"
          @click="clearSelection" />
      </div>

      <div class="picker-body">
        <!-- Sifter column (engine Dsearch, standalone: no shared idFilter sync) -->
        <aside class="filter-col">
          <Button v-if="filtersDirty" label="Clear filters" text size="small" class="clear-filters-btn"
            @click="clearCounter++" />
          <Dsearch v-if="abilitySchema" :schema="abilitySchema" :data="sifterData" :triggerClear="clearCounter"
            :sync-shared-id-filter="false" @update:siftedData="onSifted"
            @update:isDirty="(v: boolean) => filtersDirty = v" />
        </aside>

        <!-- Grid column (editor-game-preview scopes plugin editor_preview css) -->
        <main class="grid-col editor-game-preview">
          <!-- Warnings -->
          <div v-if="warnings.length" class="warnings">
            <div v-for="(warning, i) in warnings" :key="i" class="warning-line">⚠ {{ warning }}</div>
          </div>

          <!-- Abilities grid (first section = selected row) -->
          <template v-if="activeTab === 'abilities'">
            <div v-for="section in sections" :key="section.key" class="section"
              :class="{ 'selected-section': section.selectedRow }">
              <h3 v-if="section.label" class="section-title"
                :class="{ 'section-warn': section.warn, 'selected-title': section.selectedRow }"
                @click="section.selectedRow && (pickerSettings.selectedCollapsed = !pickerSettings.selectedCollapsed)">
                <span v-if="section.selectedRow" class="collapse-chevron">{{ pickerSettings.selectedCollapsed ? '▸' : '▾'
                }}</span>
                {{ section.label }}
                <span v-if="!section.selectedRow" class="section-count">({{ section.items.length }})</span>
              </h3>
              <div class="card-grid" v-show="!(section.selectedRow && pickerSettings.selectedCollapsed)">
                <div v-for="entry in section.items" :key="entry.id" class="card-frame"
                  :class="{ selected: selectedSet.has(entry.id) }" @click="toggleSelect(entry.id)">
                  <div class="card-toolbar" @click.stop>
                    <span v-if="usedBy.get(entry.id)?.length" class="used-by" :title="usedByTitle(entry.id)">
                      ⌕ {{ usedBy.get(entry.id)!.length }}</span>
                    <button class="tool-btn" title="Copy id" @click="copyId(entry.id)">⧉</button>
                    <button class="tool-btn" title="Save & open in Ability Templates"
                      :disabled="!jumpTargets.has(entry.id)" @click="requestJump(entry.id)">✎</button>
                  </div>
                  <span v-if="selectedSet.has(entry.id)" class="check-badge">✓</span>
                  <AbilityCard v-if="canRenderCard(entry.id)" :ability-id="entry.id" />
                  <div v-else class="plain-row">
                    <b>{{ entry.tpl?.meta?.name || entry.id }}</b>
                    <div class="plain-id">{{ entry.id }}</div>
                    <div v-if="entry.tpl?.meta?.description" class="plain-desc" v-html="entry.tpl.meta.description">
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="!filteredAbilities.length" class="empty-note">No more abilities match the current filters.</div>
          </template>

          <!-- Modifiers list (first section = selected row) -->
          <template v-else>
            <div v-for="section in modifierSections" :key="section.key" class="section"
              :class="{ 'selected-section': section.selectedRow }">
              <h3 class="section-title" :class="{ 'selected-title': section.selectedRow }"
                @click="section.selectedRow && (pickerSettings.selectedCollapsed = !pickerSettings.selectedCollapsed)">
                <span v-if="section.selectedRow" class="collapse-chevron">{{ pickerSettings.selectedCollapsed ? '▸' : '▾'
                }}</span>
                {{ section.label }}
                <span v-if="!section.selectedRow" class="section-count">({{ section.items.length }})</span>
              </h3>
              <div class="modifier-list" v-show="!(section.selectedRow && pickerSettings.selectedCollapsed)">
                <div v-for="entry in section.items" :key="entry.id" class="modifier-row"
                  :class="{ selected: selectedSet.has(entry.id) }" @click="toggleSelect(entry.id)">
                  <span class="check-cell">{{ selectedSet.has(entry.id) ? '✓' : '' }}</span>
                  <span class="modifier-id">{{ entry.tpl?.meta?.name || entry.id }}</span>
                  <span v-if="section.selectedRow && entry.tpl?.modifies" class="modifier-req">→ {{
                    templatesById.get(entry.tpl.modifies)?.meta?.name ?? entry.tpl.modifies }}</span>
                  <span v-if="entry.tpl?.requires_status" class="modifier-req">needs {{ entry.tpl.requires_status
                  }}</span>
                  <span class="modifier-aspects">{{ aspectSummary(entry.tpl) }}</span>
                  <span v-if="usedBy.get(entry.id)?.length" class="used-by" :title="usedByTitle(entry.id)"
                    @click.stop>⌕ {{ usedBy.get(entry.id)!.length }}</span>
                  <button class="tool-btn" title="Save & open in Ability Templates"
                    :disabled="!jumpTargets.has(entry.id)" @click.stop="requestJump(entry.id)">✎</button>
                </div>
              </div>
            </div>
            <div v-if="!filteredModifiers.length" class="empty-note">No more modifiers match the current filters.</div>
          </template>
        </main>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ability-picker {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 0.5rem;
}

.picker-error,
.picker-loading {
  padding: 2rem;
  text-align: center;
  color: #666;
}

.picker-error {
  color: #c62828;
}

.picker-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 0 0 auto;
  padding: 0 0.25rem;
}

.pool-count {
  font-size: 0.85rem;
  color: #666;
  white-space: nowrap;
}

.header-spacer {
  flex: 1;
}

.copy-from-select {
  min-width: 14rem;
}

.picker-body {
  display: flex;
  gap: 0.75rem;
  flex: 1;
  min-height: 0;
}

/* ── Sifter column ── */
.filter-col {
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  overflow-y: auto;
  padding: 0.25rem;
}

.clear-filters-btn {
  align-self: flex-end;
}

/* ── Grid column (dark backdrop so the game-styled cards read correctly) ── */
.grid-col {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  background: #16181d;
  border-radius: 8px;
  padding: 0.75rem;
}

.warnings {
  background: rgba(240, 198, 116, 0.12);
  border: 1px solid rgba(240, 198, 116, 0.45);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
}

.warning-line {
  color: #f0c674;
  font-size: 0.85rem;
}

.section {
  margin-bottom: 1rem;
}

.section-title {
  color: #bbb;
  font-size: 0.95rem;
  margin: 0 0 0.5rem 0;
  border-bottom: 1px solid #333;
  padding-bottom: 0.25rem;
}

.section-warn {
  color: #ef9a9a;
}

.selected-section {
  border: 1px solid rgba(255, 87, 34, 0.35);
  border-radius: 8px;
  padding: 0.5rem 0.6rem 0.6rem;
  background: rgba(255, 87, 34, 0.04);
}

.selected-title {
  color: #ffab91;
  border-bottom-color: rgba(255, 87, 34, 0.35);
  cursor: pointer;
  user-select: none;
}

.collapse-chevron {
  display: inline-block;
  width: 1em;
  color: #ffab91;
}

.selected-section:has(.card-grid[style*="none"]),
.selected-section:has(.modifier-list[style*="none"]) {
  padding-bottom: 0.1rem;
}

.section-count {
  font-weight: normal;
  color: #777;
  font-size: 0.8rem;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 0.6rem;
}

.card-frame {
  position: relative;
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.card-frame:hover {
  border-color: rgba(255, 87, 34, 0.5);
}

.card-frame.selected {
  border-color: #ff5722;
  background: rgba(255, 87, 34, 0.08);
}

.card-frame :deep(.ability-card) {
  max-width: none;
}

/* Status hover cards work against the hydrated singleton (StatusCard's only hard
   dependency is the registered character_statuses data; character-bound paths are
   inert without a characterId). Item links stay inert: their hover factory calls
   game.createItem() on the hollow singleton — unverified editor-side. */
.card-frame :deep(.lore-link[data-lore-kind='item']) {
  pointer-events: none;
}

.check-badge {
  position: absolute;
  top: -8px;
  left: -8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ff5722;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: bold;
  z-index: 1;
}

.card-toolbar {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  z-index: 1;
}

.used-by {
  font-size: 0.75rem;
  color: #9cc;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 8px;
  padding: 0.05rem 0.4rem;
  cursor: help;
}

.tool-btn {
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid #555;
  color: #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.1rem 0.35rem;
  line-height: 1.2;
}

.tool-btn:hover:not(:disabled) {
  border-color: #ff5722;
  color: #fff;
}

.tool-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.plain-row {
  background: rgba(26, 26, 26, 0.95);
  border: 2px solid #444;
  border-radius: 8px;
  padding: 12px;
  color: #fff;
}

.plain-id {
  color: #888;
  font-size: 0.8rem;
  font-family: monospace;
}

.plain-desc {
  color: #ccc;
  font-size: 0.9rem;
  margin-top: 0.4rem;
}

.empty-note {
  color: #888;
  text-align: center;
  padding: 2rem;
}

/* ── Modifiers list ── */
.modifier-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.modifier-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: rgba(26, 26, 26, 0.95);
  border: 2px solid #333;
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
  cursor: pointer;
  color: #ddd;
  font-size: 0.85rem;
}

.modifier-row:hover {
  border-color: rgba(255, 87, 34, 0.5);
}

.modifier-row.selected {
  border-color: #ff5722;
  background: rgba(255, 87, 34, 0.1);
}

.check-cell {
  flex: 0 0 1rem;
  color: #ff5722;
  font-weight: bold;
}

.modifier-id {
  font-family: monospace;
  color: #fff;
}

.modifier-req {
  color: #f0c674;
  font-size: 0.75rem;
}

.modifier-aspects {
  color: #81a2be;
  font-size: 0.75rem;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
