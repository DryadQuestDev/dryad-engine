<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue';
import { watchDebounced } from '@vueuse/core';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import FloatLabel from 'primevue/floatlabel';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import { Editor, type EditorCustomPopupProps } from '../../../editor';
import { Game } from '../../../../game/game';
import { Global } from '../../../../global/global';
import type { Schema } from '../../../../utility/schema';
import { normalizeAbilityEffects, sortEffectIds } from '../../../../utility/abilityEffects';
import { hydrateAbilityPreview, type AbilityPreviewData } from '../../../gamePreviewHydration';
import { emptyLayout, loadEditorLayouts, resolveLayout, type ResolvedLayout } from '../../../editorLayouts';
import AbilityCard from '../../../../game/views/progression/AbilityCard.vue';
import EffectCard from './EffectCard.vue';
import FieldGroupsPanel from '../../shared/fields/FieldGroupsPanel.vue';
import TagChipsInput from '../../shared/fields/TagChipsInput.vue';
import {
  aspectSummary, buildCompanionIndex, buildPalette, clone, effectKey, entityName, fileOfSubtab, findUsage,
  idLabel, lintAbility, mainTabOf, nextEffectId, plainText, sortedEffectIndexes,
  type AspectContext, type LintItem, type UsageRef,
} from './abilityEditorModel';

const props = defineProps<EditorCustomPopupProps>();

const emit = defineEmits<{
  'update:item': [item: any];
  'request-save-jump': [payload: { mainTab: string; subTab: string; entityId: string }];
  'request-open-entry': [payload: { entityId: string; componentId?: string }];
}>();

const editor = Editor.getInstance();
const game = Game.getInstance();

const localItem = ref<any>(props.item);
watch(() => props.item, (item) => { localItem.value = item; });

// The id other entities reference: a rename in the popup leaves their references behind.
const initialId: string | undefined = props.item?.id;

function changed() {
  emit('update:item', localItem.value);
}

// ── Schema ──
const schemaAny = computed<any>(() => props.schema ?? {});
const metaFields = computed<Schema>(() => schemaAny.value.meta?.objects ?? {});
const effectFields = computed<Schema>(() => schemaAny.value.effects?.objects ?? {});
const aspectFields = computed<Schema>(() => effectFields.value.aspects?.objects ?? {});
const tabFile = fileOfSubtab(props.subtabId) ?? props.subtabId;

// ── Data ──
const ready = ref(false);
const loadError = ref('');
const data = shallowRef<AbilityPreviewData | null>(null);
const defsById = shallowRef(new Map<string, any>());
const metaLayout = shallowRef<ResolvedLayout>(emptyLayout());
const aspectLayout = shallowRef<ResolvedLayout>(emptyLayout());
const labelMaps = shallowRef(new Map<string, Map<string, string>>());
const jumpable = shallowRef(new Map<string, Set<string>>());

onMounted(async () => {
  try {
    const preview = await hydrateAbilityPreview();
    data.value = preview;
    defsById.value = new Map(preview.definitions.filter((def: any) => def?.id).map((def: any) => [def.id, def]));
    const layouts = await loadEditorLayouts(editor);
    metaLayout.value = resolveLayout(layouts, `${tabFile}:meta`);
    aspectLayout.value = resolveLayout(layouts, `${tabFile}:effects.aspects`);
    labelMaps.value = await buildLabelMaps(preview);
    jumpable.value = await loadJumpable();
    ready.value = true;
    refreshPreview();
  } catch (e) {
    console.error('[AbilityEditor] load failed:', e);
    loadError.value = String(e);
  }
});

async function buildLabelMaps(preview: AbilityPreviewData): Promise<Map<string, Map<string, string>>> {
  const rowsByFile = new Map<string, any[]>([
    ['character_statuses', preview.statuses],
    ['character_templates', preview.characterTemplates],
    ['ability_templates', preview.templates],
    ['item_templates', preview.itemTemplates],
    ['ability_groups', preview.groups],
    ['character_stats', preview.stats],
  ]);
  const wanted = new Set<string>(['character_statuses|', 'ability_templates|']);
  for (const def of preview.definitions) {
    if (typeof def?.fromFile === 'string' && def.fromFile) wanted.add(`${def.fromFile}|${def.ingame_description_ref ?? ''}`);
  }
  const maps = new Map<string, Map<string, string>>();
  for (const key of wanted) {
    const [file, ref] = key.split('|');
    let rows = rowsByFile.get(file);
    if (!rows) {
      try { rows = await editor.loadFullData(file); } catch { rows = []; }
      rowsByFile.set(file, rows);
    }
    const map = new Map<string, string>();
    for (const row of rows) {
      if (!row?.id) continue;
      const name = entityName(row, ref || undefined);
      if (name) map.set(row.id, name);
    }
    maps.set(key, map);
  }
  return maps;
}

// Jump buttons only land on rows the target tab shows: the selected folder's own file.
async function loadJumpable(): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  for (const subTab of ['ability_templates', 'character_templates', 'character_statuses', 'item_templates', 'skill_slots']) {
    const file = fileOfSubtab(subTab) ?? subTab;
    try {
      const rows = await Global.getInstance().readJson(`games_files/${editor.selectedGame}/${editor.selectedMod}/${file}.json`) as any[];
      map.set(subTab, new Set(Array.isArray(rows) ? rows.map((row: any) => row.id) : []));
    } catch {
      map.set(subTab, new Set());
    }
  }
  return map;
}

function labelsFor(key: string): Map<string, string> | undefined {
  const def = defsById.value.get(key);
  if (!def?.fromFile) return undefined;
  return labelMaps.value.get(`${def.fromFile}|${def.ingame_description_ref ?? ''}`);
}

// ── Derived structure ──
const aspectCompanions = computed(() => buildCompanionIndex(data.value?.definitions ?? [], 'aspect'));
const metaCompanions = computed(() => buildCompanionIndex(data.value?.definitions ?? [], 'meta'));

function countUsage(collect: (template: any) => string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const template of data.value?.templates ?? []) {
    for (const key of collect(template)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}
const aspectUsage = computed(() => countUsage(template =>
  (template?.effects ?? []).flatMap((effect: any) => Object.keys(effect?.aspects ?? {}))));
const metaUsage = computed(() => countUsage(template => Object.keys(template?.meta ?? {})));

const aspectCtx = computed<AspectContext>(() => {
  const keys = Object.keys(aspectFields.value);
  return {
    fields: aspectFields.value,
    effectFields: effectFields.value,
    defsById: defsById.value,
    companions: aspectCompanions.value,
    layout: aspectLayout.value,
    labelsFor,
    palette: buildPalette(keys.filter(key => !aspectCompanions.value.ownersOf.has(key)), aspectLayout.value, defsById.value, aspectUsage.value),
    paletteAll: buildPalette(keys, aspectLayout.value, defsById.value, aspectUsage.value),
  };
});

// ── Identity ──
const isModifier = computed(() => !!localItem.value?.modifies);
const templatesById = computed(() => new Map<string, any>((data.value?.templates ?? []).map((t: any) => [t.id, t])));

const modifiesOptions = computed(() => ((schemaAny.value.modifies?.options ?? []) as string[])
  .filter(id => id !== localItem.value?.id)
  .map(id => ({ label: idLabel(id, templatesById.value.get(id)?.meta?.name), value: id })));

const statusOptions = computed(() => {
  const names = labelMaps.value.get('character_statuses|');
  return ((schemaAny.value.requires_status?.options ?? []) as string[]).map(id => ({ label: idLabel(id, names?.get(id)), value: id }));
});

function setRoot(key: 'id' | 'modifies' | 'requires_status', value: any) {
  if (value === null || value === undefined || value === '') delete localItem.value[key];
  else localItem.value[key] = value;
  if (key === 'modifies' && !localItem.value.modifies) delete localItem.value.requires_status;
  changed();
}

function setTags(value: any) {
  if (!Array.isArray(value) || !value.length) delete localItem.value.tags;
  else localItem.value.tags = value;
  changed();
}

const idInputId = `ae-id-${Math.random().toString(36).slice(2, 8)}`;

// ── Meta ──
function setMeta(key: string, value: any) {
  if (!localItem.value.meta || typeof localItem.value.meta !== 'object') localItem.value.meta = {};
  localItem.value.meta[key] = value === undefined ? null : value;
  changed();
}

function removeMeta(key: string) {
  if (!localItem.value.meta) return;
  delete localItem.value.meta[key];
  if (!Object.keys(localItem.value.meta).length) delete localItem.value.meta;
  changed();
}

// A modifier normally carries no meta, so its panel starts folded unless it already has some.
const metaOpen = ref(!props.item?.modifies || Object.keys(props.item?.meta ?? {}).length > 0);

// ── Effects ──
const effects = computed<any[]>(() => Array.isArray(localItem.value?.effects) ? localItem.value.effects : []);
const orderedIndexes = computed(() => sortedEffectIndexes(effects.value));

const baseTemplate = computed(() => isModifier.value ? templatesById.value.get(localItem.value.modifies) ?? null : null);
const baseEffectsById = computed(() => new Map<string, any>((baseTemplate.value?.effects ?? []).map((effect: any) => [effectKey(effect), effect])));

const duplicateIds = computed(() => {
  const counts = new Map<string, number>();
  for (const effect of effects.value) counts.set(effectKey(effect), (counts.get(effectKey(effect)) ?? 0) + 1);
  return new Set([...counts].filter(([, count]) => count > 1).map(([id]) => id));
});

function ensureEffects(): any[] {
  if (!Array.isArray(localItem.value.effects)) localItem.value.effects = [];
  return localItem.value.effects;
}

function usesOrder(list: any[]): boolean {
  return list.some(effect => typeof effect?.order === 'number');
}

/** Writes `list` as the card order: array order and, when orders are in use, 1..n. */
function writeSequence(sequence: any[], numbered: boolean) {
  if (numbered) sequence.forEach((effect, i) => { effect.order = i + 1; });
  localItem.value.effects = sequence;
}

function newEffect(id: string, extra: Record<string, any> = {}): any {
  return { uid: editor.createUid(), id, ...extra, aspects: extra.aspects ?? {} };
}

function focusEffect(uid: string, selector: string | null = 'input') {
  nextTick(() => {
    const card = document.querySelector<HTMLElement>(`[data-effect-uid="${uid}"]`);
    card?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (selector) card?.querySelector<HTMLElement>(selector)?.focus();
  });
}

function addEffect(extra: { id?: string; name?: string } = {}) {
  const list = ensureEffects();
  const effect = newEffect(extra.id ?? nextEffectId(list, baseEffectsById.value.keys()), extra.name !== undefined ? { name: extra.name } : {});
  const sequence = orderedIndexes.value.map(i => list[i]);
  sequence.push(effect);
  writeSequence(sequence, usesOrder(list));
  changed();
  focusEffect(effect.uid, extra.name !== undefined ? '.ec-name input' : 'input');
}

function removeEffect(index: number) {
  effects.value.splice(index, 1);
  if (!effects.value.length) delete localItem.value.effects;
  changed();
}

function insertAfter(index: number, effect: any) {
  const list = effects.value;
  const sequence = orderedIndexes.value.map(i => list[i]);
  sequence.splice(sequence.indexOf(list[index]) + 1, 0, effect);
  writeSequence(sequence, usesOrder(list));
  changed();
  focusEffect(effect.uid);
}

function duplicateEffect(index: number) {
  const copy = clone(effects.value[index]);
  copy.uid = editor.createUid();
  copy.id = nextEffectId(effects.value, baseEffectsById.value.keys());
  insertAfter(index, copy);
}

function moveEffect(index: number, delta: number) {
  const list = effects.value;
  const sequence = orderedIndexes.value.map(i => list[i]);
  const from = sequence.indexOf(list[index]);
  const to = from + delta;
  if (to < 0 || to >= sequence.length) return;
  [sequence[from], sequence[to]] = [sequence[to], sequence[from]];
  writeSequence(sequence, true);
  changed();
}

function splitAspect(index: number, key: string) {
  const source = effects.value[index];
  const moved: Record<string, any> = {};
  for (const k of [key, ...(aspectCompanions.value.companionsOf.get(key) ?? [])]) {
    if (source.aspects && k in source.aspects) {
      moved[k] = source.aspects[k];
      delete source.aspects[k];
    }
  }
  insertAfter(index, newEffect(nextEffectId(effects.value, baseEffectsById.value.keys()), { aspects: moved }));
}

// ── Modifier: the base ability ──
function baseLinesOf(id: string, aspects: Record<string, any>): string[] {
  try {
    return (game.buildAbilityEffectsDescription({ effects: { [id]: aspects } }, undefined, true) as string[]).map(plainText).filter(Boolean);
  } catch {
    return [];
  }
}

const baseEffectRows = computed(() => {
  if (!baseTemplate.value) return [];
  const normalized = normalizeAbilityEffects(baseTemplate.value.effects);
  const localIds = new Set(effects.value.map(effectKey));
  return sortEffectIds(normalized).map(id => ({
    id,
    name: normalized[id].__name as string | undefined,
    lines: baseLinesOf(id, normalized[id]),
    extended: localIds.has(id),
  }));
});

function extendBaseEffect(id: string) {
  const existing = effects.value.find(effect => effectKey(effect) === id);
  if (existing) {
    focusEffect(existing.uid);
    return;
  }
  addEffect({ id });
}

function mergeModeOf(effect: any): 'merge' | 'new' | null {
  if (!isModifier.value || !baseTemplate.value) return null;
  return baseEffectsById.value.has(effectKey(effect)) ? 'merge' : 'new';
}

function baseAspectsOf(effect: any): Record<string, any> | null {
  if (!isModifier.value) return null;
  return baseEffectsById.value.get(effectKey(effect))?.aspects ?? null;
}

function baseLinesFor(effect: any): string[] {
  if (mergeModeOf(effect) !== 'merge') return [];
  return baseEffectRows.value.find(row => row.id === effectKey(effect))?.lines ?? [];
}

// ── Where it is used, and its modifiers ──
const usageSources = computed(() => data.value ? {
  characterTemplates: data.value.characterTemplates,
  statuses: data.value.statuses,
  itemTemplates: data.value.itemTemplates,
  skillSlots: data.value.skillSlots,
} : null);

const usedBy = computed<UsageRef[]>(() => findUsage(localItem.value?.id, usageSources.value));
const staleRefs = computed<UsageRef[]>(() =>
  initialId && localItem.value?.id !== initialId ? findUsage(initialId, usageSources.value) : []);

function jumpTo(use: UsageRef) {
  const mainTab = mainTabOf(use.subTab);
  if (!mainTab) return;
  emit('request-save-jump', { mainTab, subTab: use.subTab, entityId: use.id });
}

const modifiersOfThis = computed(() => isModifier.value || !localItem.value?.id ? [] :
  (data.value?.templates ?? []).filter((template: any) => template?.modifies === localItem.value.id));
const checkedModifiers = ref<string[]>([]);

function openEntry(id: string) {
  emit('request-open-entry', { entityId: id });
}

// ── Warnings ──
const lint = computed<LintItem[]>(() => {
  if (!ready.value) return [];
  const items = lintAbility({
    item: localItem.value,
    metaFields: metaFields.value,
    aspectFields: aspectFields.value,
    defsById: defsById.value,
    aspectCompanions: aspectCompanions.value,
    base: baseTemplate.value,
    groupsExist: (data.value?.groups?.length ?? 0) > 0,
  });
  if (staleRefs.value.length) {
    items.unshift({ level: 'warn', text: `Renamed from "${initialId}": ${staleRefs.value.length} entities still reference the old id (${staleRefs.value.map(ref => ref.id).join(', ')}).` });
  }
  return items;
});

function focusLint(item: LintItem) {
  if (item.effectIndex === undefined) return;
  const effect = effects.value[item.effectIndex];
  if (effect?.uid) focusEffect(effect.uid, null);
}

// ── Live card ──
const PREVIEW_ID = '(unsaved)';
const gatedView = ref(false);

interface PreviewState {
  key: number;
  abilityId: string;
  improvementData?: { meta: Record<string, any>; effects: Record<string, Record<string, any>> };
  inactiveData?: { meta?: Record<string, any>; effects: Record<string, Record<string, any>> };
  error?: string;
}

const preview = shallowRef<PreviewState | null>(null);
let previewVersion = 0;

// The card reads the hydrated, editor-only ability map (see gamePreviewHydration), so the edit is
// written into it under its id. The next popup open rehydrates the map from the saved files.
function refreshPreview() {
  if (!ready.value || !localItem.value) return;
  const item = localItem.value;
  const map = game.characterSystem.abilityTemplatesMap;
  const key = ++previewVersion;
  try {
    if (item.modifies) {
      const base = map.get(item.modifies);
      if (!base) {
        preview.value = { key, abilityId: item.modifies, error: `No ability "${item.modifies}" to preview the modifier on.` };
        return;
      }
      const modifier = { meta: clone(item.meta ?? {}), effects: normalizeAbilityEffects(clone(item.effects ?? [])) };
      const merged = game.mergeAbilityData(base, modifier);
      game.buildAbilityEffectsDescription(merged);
      game.buildAbilityMetaDescription(merged);
      preview.value = gatedView.value && item.requires_status
        ? { key, abilityId: item.modifies, inactiveData: modifier }
        : { key, abilityId: item.modifies, improvementData: modifier };
      return;
    }
    const id = item.id || PREVIEW_ID;
    const template = clone(item);
    template.id = id;
    // The card reads "not found" without a meta block; an unnamed draft still previews.
    template.meta = { ...(template.meta ?? {}) };
    if (!item.id && !template.meta.name) template.meta.name = 'New ability';
    map.set(id, template);
    let improvementData: PreviewState['improvementData'];
    const applied = modifiersOfThis.value.filter((modifier: any) => checkedModifiers.value.includes(modifier.id));
    if (applied.length) {
      let combined: any = { meta: {}, effects: {} };
      for (const modifier of applied) combined = game.mergeAbilityData(combined, { meta: modifier.meta ?? {}, effects: modifier.effects ?? [] });
      improvementData = combined;
    }
    game.buildAbilityEffectsDescription(id);
    game.buildAbilityMetaDescription(id);
    if (template.meta?.description) game.resolveString(template.meta.description, true);
    preview.value = { key, abilityId: id, improvementData };
  } catch (e) {
    preview.value = { key, abilityId: '', error: `The card cannot render this yet: ${e}` };
  }
}

watchDebounced([localItem, checkedModifiers, gatedView], refreshPreview, { deep: true, debounce: 150 });

const tagsField = computed(() => schemaAny.value.tags);
const tagSuggestions = computed(() => {
  const tags = new Set<string>();
  for (const template of data.value?.templates ?? []) for (const tag of template?.tags ?? []) tags.add(tag);
  return [...tags].sort();
});
</script>

<template>
  <div class="ability-editor">
    <div v-if="loadError" class="ae-message error">Failed to load ability data: {{ loadError }}</div>
    <div v-else-if="!ready" class="ae-message">Loading ability data…</div>

    <template v-else>
      <div class="ae-identity">
        <FloatLabel variant="on" class="ae-id" v-tooltip.top="schemaAny.id?.tooltip">
          <InputText :id="idInputId" :modelValue="localItem.id ?? ''" size="small"
            @update:modelValue="(v: string | undefined) => setRoot('id', v)" />
          <label :for="idInputId">id</label>
        </FloatLabel>
        <FloatLabel variant="on" class="ae-modifies" v-tooltip.top="schemaAny.modifies?.tooltip">
          <Select inputId="ae-modifies" :modelValue="localItem.modifies ?? null" :options="modifiesOptions"
            optionLabel="label" optionValue="value" filter showClear size="small" appendTo="body"
            @update:modelValue="(v: string | null) => setRoot('modifies', v)" />
          <label for="ae-modifies">modifies</label>
        </FloatLabel>
        <FloatLabel v-if="isModifier" variant="on" class="ae-requires" v-tooltip.top="schemaAny.requires_status?.tooltip">
          <Select inputId="ae-requires" :modelValue="localItem.requires_status ?? null" :options="statusOptions"
            optionLabel="label" optionValue="value" filter showClear size="small" appendTo="body"
            @update:modelValue="(v: string | null) => setRoot('requires_status', v)" />
          <label for="ae-requires">requires status</label>
        </FloatLabel>
        <span class="ae-mode" :class="isModifier ? 'modifier' : 'ability'">{{ isModifier ? 'Modifier' : 'Ability'
        }}</span>
        <div v-if="tagsField" class="ae-tags" v-tooltip.top="tagsField.tooltip">
          <TagChipsInput :modelValue="localItem.tags" :suggestions="tagSuggestions" placeholder="tags"
            @update:modelValue="setTags" />
        </div>
      </div>

      <div class="ae-body">
        <main class="ae-form">
          <div v-if="lint.length" class="ae-lint">
            <div v-for="(item, i) in lint" :key="i" class="ae-lint-line" :class="[item.level, { link: item.effectIndex !== undefined }]"
              @click="focusLint(item)">
              <span class="pi" :class="item.level === 'warn' ? 'pi-exclamation-triangle' : 'pi-info-circle'" />
              {{ item.text }}
            </div>
          </div>

          <section class="ae-section">
            <button type="button" class="ae-section-head" @click="metaOpen = !metaOpen">
              <span class="pi" :class="metaOpen ? 'pi-chevron-down' : 'pi-chevron-right'" />
              Meta
              <span v-if="isModifier" class="ae-section-note">A modifier's meta replaces the base ability's value.</span>
            </button>
            <FieldGroupsPanel v-show="metaOpen" add-label="+ Add meta field" :values="localItem.meta" :fields="metaFields" :defs-by-id="defsById"
              :companions="metaCompanions" :layout="metaLayout" :labels-for="labelsFor" :usage="metaUsage"
              :show-pinned="!isModifier" @set="setMeta" @remove="removeMeta" />
          </section>

          <section v-if="isModifier" class="ae-section">
            <div class="ae-section-head static">
              Base ability
              <template v-if="baseTemplate">
                <b>{{ baseTemplate.meta?.name || baseTemplate.id }}</b>
                <code>{{ baseTemplate.id }}</code>
                <Button v-if="jumpable.get('ability_templates')?.has(baseTemplate.id)" label="Open" icon="pi pi-external-link"
                  text size="small" v-tooltip.top="'Save, then open the base ability here'"
                  @click="openEntry(baseTemplate.id)" />
              </template>
            </div>
            <div v-if="baseTemplate" class="ae-base-list">
              <div v-for="row in baseEffectRows" :key="row.id" class="ae-base-row">
                <code class="ae-base-id">{{ row.id }}</code>
                <span v-if="row.name" class="ae-base-name">{{ row.name }}</span>
                <span class="ae-base-lines">{{ row.lines.join(' · ') || '(no printed lines)' }}</span>
                <Button :label="row.extended ? 'Extended' : 'Extend'" :icon="row.extended ? 'pi pi-check' : 'pi pi-plus'"
                  size="small" :severity="row.extended ? 'secondary' : 'info'" outlined
                  v-tooltip.top="'Add an effect with this id: numbers add to the base values, lists join them.'"
                  @click="extendBaseEffect(row.id)" />
              </div>
              <Button label="New group" icon="pi pi-plus" size="small" severity="success" outlined class="ae-new-group"
                v-tooltip.top="'Add an effect with a new id: the card shows it as its own titled group.'"
                @click="addEffect({ name: '' })" />
            </div>
          </section>

          <section class="ae-section">
            <div class="ae-section-head static">
              Effects <span class="ae-count">{{ effects.length }}</span>
              <span class="ae-section-note">Listed in card and combat order.</span>
            </div>
            <div class="ae-effects">
              <div v-for="(index, position) in orderedIndexes" :key="effects[index].uid ?? index"
                v-bind="{ 'data-effect-uid': effects[index].uid }">
                <EffectCard :effect="effects[index]" :position="position" :count="effects.length" :ctx="aspectCtx"
                  :merge-mode="mergeModeOf(effects[index])" :base-aspects="baseAspectsOf(effects[index])"
                  :base-lines="baseLinesFor(effects[index])" :duplicate-id="duplicateIds.has(effectKey(effects[index]))"
                  @changed="changed" @remove="removeEffect(index)" @duplicate="duplicateEffect(index)"
                  @move="(delta: number) => moveEffect(index, delta)" @split="(key: string) => splitAspect(index, key)" />
              </div>
              <Button v-if="!isModifier" label="Add effect" icon="pi pi-plus" size="small" outlined class="ae-add-effect"
                @click="addEffect()" />
            </div>
          </section>
        </main>

        <aside class="ae-side">
          <div class="ae-card editor-game-preview">
            <div v-if="preview?.error" class="ae-card-error">{{ preview.error }}</div>
            <AbilityCard v-else-if="preview" :key="preview.key" :ability-id="preview.abilityId"
              :improvement-data="preview.improvementData" :inactive-data="preview.inactiveData" />
          </div>

          <div v-if="isModifier && localItem.requires_status" class="ae-side-block">
            <SelectButton v-model="gatedView" :options="[
              { label: 'Status held', value: false },
              { label: 'Status missing', value: true },
            ]" optionLabel="label" optionValue="value" :allowEmpty="false" size="small" />
            <p class="ae-hint">How the card reads while the character {{ gatedView ? 'lacks' : 'holds' }}
              <code>{{ localItem.requires_status }}</code>.</p>
          </div>

          <div v-if="!isModifier && modifiersOfThis.length" class="ae-side-block">
            <h4>Modifiers of this ability <span class="ae-count">{{ modifiersOfThis.length }}</span></h4>
            <p class="ae-hint">Tick modifiers to preview them applied.</p>
            <div v-for="modifier in modifiersOfThis" :key="modifier.id" class="ae-mod-row">
              <Checkbox v-model="checkedModifiers" :value="modifier.id" :inputId="`ae-mod-${modifier.id}`" />
              <label :for="`ae-mod-${modifier.id}`" class="ae-mod-label">
                <code>{{ modifier.id }}</code>
                <span v-if="modifier.requires_status" class="ae-mod-req">needs {{ modifier.requires_status }}</span>
                <span class="ae-mod-aspects">{{ aspectSummary(modifier) }}</span>
              </label>
              <Button v-if="jumpable.get('ability_templates')?.has(modifier.id)" icon="pi pi-external-link" text rounded
                size="small" v-tooltip.top="'Save, then open this modifier here'" @click="openEntry(modifier.id)" />
            </div>
          </div>

          <div class="ae-side-block">
            <h4>Used by <span class="ae-count">{{ usedBy.length }}</span></h4>
            <p v-if="!usedBy.length" class="ae-hint">No character, status, item or skill slot grants this {{ isModifier ?
              'modifier' : 'ability' }} yet.</p>
            <div v-for="use in usedBy" :key="`${use.subTab}-${use.id}-${use.asModifier}`" class="ae-use-row">
              <span class="ae-use-kind">{{ use.kind }}</span>
              <span class="ae-use-label">{{ use.label }}</span>
              <span v-if="use.asModifier" class="ae-use-tag">modifier</span>
              <Button icon="pi pi-external-link" text rounded size="small" :disabled="!jumpable.get(use.subTab)?.has(use.id)"
                v-tooltip.top="'Save, then open it in its tab'" @click="jumpTo(use)" />
            </div>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ability-editor {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  height: 100%;
  min-height: 0;
}

.ae-message {
  padding: 2rem;
  text-align: center;
  color: var(--editor-text-muted);
}

.ae-message.error {
  color: var(--editor-fg-danger);
}

.ae-identity {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem 0.8rem;
  padding: 0.55rem 0.7rem;
  background: var(--editor-surface-sunken);
  border: 1px solid var(--editor-border);
  border-radius: 6px;
}

.ae-id {
  width: 16rem;
}

.ae-id :deep(input) {
  width: 100%;
  font-family: var(--font-family-mono);
}

.ae-modifies,
.ae-requires {
  width: 17rem;
}

.ae-modifies :deep(.p-select),
.ae-requires :deep(.p-select) {
  width: 100%;
}

.ae-mode {
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
}

.ae-mode.ability {
  background: var(--editor-tint-success);
  color: var(--editor-fg-success);
}

.ae-mode.modifier {
  background: var(--editor-tint-info);
  color: var(--editor-fg-info);
}

.ae-tags {
  flex: 1 1 18rem;
  min-width: 14rem;
}

.ae-form :deep(.htmlarea-resizable) {
  height: 150px;
  min-height: 110px;
}

.ae-body {
  display: flex;
  gap: 0.9rem;
  flex: 1;
  min-height: 0;
}

.ae-form {
  flex: 1 1 auto;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding-right: 0.3rem;
}

.ae-side {
  flex: 0 0 360px;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  overflow-y: auto;
  min-height: 0;
}

.ae-lint {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.45rem 0.7rem;
  background: var(--editor-tint-warning);
  border-left: 4px solid var(--editor-ink-orange);
  border-radius: 4px;
}

.ae-lint-line {
  font-size: 0.83rem;
  color: var(--editor-text);
}

.ae-lint-line .pi {
  font-size: 0.78rem;
  margin-right: 0.3rem;
}

.ae-lint-line.warn .pi {
  color: var(--editor-fg-warning);
}

.ae-lint-line.info .pi {
  color: var(--editor-fg-info);
}

.ae-lint-line.link {
  cursor: pointer;
}

.ae-lint-line.link:hover {
  text-decoration: underline;
}

.ae-section {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.ae-section-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  background: none;
  border: none;
  padding: 0 0 0.3rem;
  border-bottom: 1px solid var(--editor-border);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--editor-text-muted);
  cursor: pointer;
  text-align: left;
}

.ae-section-head.static {
  cursor: default;
}

.ae-section-head b,
.ae-section-head code {
  text-transform: none;
  letter-spacing: 0;
  color: var(--editor-text);
}

.ae-section-head .pi {
  font-size: 0.7rem;
}

.ae-section-note {
  font-weight: normal;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.78rem;
  font-style: italic;
}

.ae-count {
  font-weight: normal;
  font-size: 0.75rem;
  color: var(--editor-text-muted);
}

.ae-base-list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.ae-base-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  background: var(--editor-surface-sunken);
  font-size: 0.85rem;
}

.ae-base-id {
  flex: 0 0 auto;
}

.ae-base-name {
  font-weight: 600;
  color: var(--editor-text);
}

.ae-base-lines {
  flex: 1;
  min-width: 0;
  color: var(--editor-text-muted);
}

.ae-new-group {
  align-self: flex-start;
}

.ae-effects {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.ae-add-effect {
  align-self: flex-start;
}

.ae-card {
  background: #16181d;
  border-radius: 8px;
  padding: 0.75rem;
}

.ae-card :deep(.ability-card) {
  max-width: none;
}

.ae-card :deep(.lore-link[data-lore-kind='item']) {
  pointer-events: none;
}

.ae-card-error {
  color: #ef9a9a;
  font-size: 0.85rem;
}

.ae-side-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.55rem 0.7rem;
  background: var(--editor-surface-raised);
  border: 1px solid var(--editor-border);
  border-radius: 6px;
}

.ae-side-block h4 {
  margin: 0;
  font-size: 0.88rem;
  color: var(--editor-text);
}

.ae-hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--editor-text-muted);
  font-style: italic;
}

.ae-mod-row,
.ae-use-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  min-height: 1.8rem;
}

.ae-mod-label {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.2rem 0.45rem;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.ae-mod-req {
  color: var(--editor-fg-info);
}

.ae-mod-aspects {
  color: var(--editor-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.ae-use-kind {
  flex: 0 0 4.6rem;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--editor-text-muted);
}

.ae-use-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--editor-text);
}

.ae-use-tag {
  font-size: 0.68rem;
  padding: 0 0.35rem;
  border-radius: 3px;
  background: var(--editor-tint-info);
  color: var(--editor-fg-info);
}

@media (max-width: 1100px) {
  .ae-body {
    flex-direction: column;
    overflow-y: auto;
  }

  .ae-form,
  .ae-side {
    overflow: visible;
    flex: 0 0 auto;
  }
}
</style>
