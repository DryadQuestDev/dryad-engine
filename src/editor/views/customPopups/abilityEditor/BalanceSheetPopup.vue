<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import Button from 'primevue/button';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import MultiSelect from 'primevue/multiselect';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import { Editor, type EditorCustomPopupProps } from '../../../editor';
import type { Schema, Schemable } from '../../../../utility/schema';
import {
  EDITOR_LAYOUTS_FILE, loadColumnSets, loadEditorLayouts, removeColumnSet, saveColumnSet, type ColumnSet,
} from '../../../editorLayouts';
import { showConfirm } from '../../../../services/dialogService';
import Dsearch from '../../dsearch/Dsearch.vue';
import { effectKey, fileOfSubtab, isEmptyValue, isNumberMap, sortedEffectIndexes } from './abilityEditorModel';

/**
 * Every ability of the tab as one table: rows are entries, columns are paths the dev picks
 * (meta fields, one key of a number map such as costs, or an aspect wherever it sits in the
 * effects). Cells edit in place. Edits to the entry the popup is open on go into the popup's
 * item; edits to other entries wait as drafts until Save, which applies them before the tab
 * saves (the wrapper calls `commitEntries`).
 */
const props = defineProps<EditorCustomPopupProps>();

const emit = defineEmits<{
  'update:item': [item: any];
  'request-open-entry': [payload: { entityId: string; componentId?: string }];
}>();

const editor = Editor.getInstance();

const localItem = ref<any>(props.item);
watch(() => props.item, (item) => { localItem.value = item; });

const schemaAny = computed<any>(() => props.schema ?? {});
const metaFields = computed<Schema>(() => schemaAny.value.meta?.objects ?? {});
const aspectFields = computed<Schema>(() => schemaAny.value.effects?.objects?.aspects?.objects ?? {});
const tabFile = fileOfSubtab(props.subtabId) ?? props.subtabId;
const sheetScope = `${tabFile}:sheet`;

// ── Columns ──

interface Column {
  id: string;
  label: string;
  group: string;
  field: Schemable;
}

const allColumns = computed<Column[]>(() => {
  const out: Column[] = [];
  const editable = (field: Schemable) => ['number', 'boolean', 'chooseOne', 'string'].includes(field.type);
  for (const key in metaFields.value) {
    const field = metaFields.value[key];
    if (isNumberMap(field)) {
      for (const sub in field.objects ?? {}) out.push({ id: `meta.${key}.${sub}`, label: `${key}.${sub}`, group: 'Meta maps', field: field.objects![sub] });
    } else if (editable(field)) {
      out.push({ id: `meta.${key}`, label: key, group: 'Meta', field });
    }
  }
  for (const key in aspectFields.value) {
    const field = aspectFields.value[key];
    if (editable(field)) out.push({ id: `aspect.${key}`, label: key, group: 'Aspects', field });
  }
  return out;
});
const columnsById = computed(() => new Map(allColumns.value.map(column => [column.id, column])));

const columnOptions = computed(() => {
  const groups = new Map<string, { label: string; items: { label: string; value: string }[] }>();
  for (const column of allColumns.value) {
    const group = groups.get(column.group) ?? { label: column.group, items: [] };
    group.items.push({ label: column.label, value: column.id });
    groups.set(column.group, group);
  }
  return [...groups.values()];
});

const settings = useStorage<{ columns: string[] | null; kind: 'abilities' | 'modifiers' | 'all'; filtersOpen: boolean }>(
  `balance-sheet:${tabFile}`, { columns: null, kind: 'abilities', filtersOpen: true });

// Without saved columns: cooldown, each cost key in use, and the five most used number aspects.
const defaultColumns = computed<string[]>(() => {
  const counts = new Map<string, number>();
  for (const entry of entryRows.value) {
    for (const key in entry.meta ?? {}) {
      const value = entry.meta[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const sub in value) counts.set(`meta.${key}.${sub}`, (counts.get(`meta.${key}.${sub}`) ?? 0) + 1);
      } else {
        counts.set(`meta.${key}`, (counts.get(`meta.${key}`) ?? 0) + 1);
      }
    }
    for (const effect of entry.effects ?? []) {
      for (const key in effect?.aspects ?? {}) counts.set(`aspect.${key}`, (counts.get(`aspect.${key}`) ?? 0) + 1);
    }
  }
  const valid = (id: string) => columnsById.value.get(id);
  const out: string[] = [];
  if (valid('meta.cd')) out.push('meta.cd');
  for (const [id] of [...counts].filter(([id]) => id.split('.').length === 3 && valid(id)).sort((a, b) => b[1] - a[1]).slice(0, 3)) out.push(id);
  const aspects = [...counts]
    .filter(([id]) => id.startsWith('aspect.') && valid(id)?.field.type === 'number')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
  return [...out, ...aspects];
});

const columns = computed<string[]>({
  get: () => (settings.value.columns ?? defaultColumns.value).filter(id => columnsById.value.has(id)),
  set: (value) => { settings.value.columns = value; },
});
const visibleColumns = computed(() => columns.value.map(id => columnsById.value.get(id)!).filter(Boolean));

// ── Column sets (dev/editor_layouts, scope <tab>:sheet) ──
const columnSets = shallowRef<ColumnSet[]>([]);
const saveName = ref('');
const saving = ref(false);

async function reloadColumnSets() {
  columnSets.value = await loadColumnSets(editor, await loadEditorLayouts(editor), sheetScope);
}

onMounted(reloadColumnSets);

const activeSet = computed(() => columnSets.value.find(set => JSON.stringify(set.columns) === JSON.stringify(columns.value))?.id ?? null);

function applySet(set: ColumnSet) {
  columns.value = set.columns.filter(id => columnsById.value.has(id));
}

async function saveSet() {
  const name = saveName.value.trim();
  if (!name || !columns.value.length) return;
  saving.value = true;
  try {
    await saveColumnSet(editor, sheetScope, name, columns.value);
    saveName.value = '';
    await reloadColumnSets();
  } finally {
    saving.value = false;
  }
}

async function deleteSet(set: ColumnSet) {
  const ok = await showConfirm({ header: 'Delete column set', message: `Delete the column set "${set.name}"?`, acceptLabel: 'Delete' });
  if (!ok) return;
  await removeColumnSet(editor, set.id);
  await reloadColumnSets();
}

// ── Rows ──

// The tab's entries, with the popup's own item standing in for its live row so its edits show.
const entryRows = computed<any[]>(() => {
  const list = Array.isArray(editor.activeObject.value) ? editor.activeObject.value : [];
  const uid = localItem.value?.uid;
  return list.map((entry: any) => (uid && entry.uid === uid ? localItem.value : entry));
});

const kindRows = computed(() => entryRows.value.filter(entry => {
  if (settings.value.kind === 'abilities') return !entry.modifies;
  if (settings.value.kind === 'modifiers') return !!entry.modifies;
  return true;
}));

const clearCounter = ref(0);
const siftedUids = ref<Set<string> | null>(null);
function onSifted(rows: any[]) {
  siftedUids.value = new Set(rows.map((row: any) => row.uid));
}

const sortBy = ref<{ column: string; dir: 1 | -1 } | null>(null);

const rows = computed(() => {
  let list = kindRows.value.filter(entry => siftedUids.value?.has(entry.uid) ?? true);
  const sort = sortBy.value;
  if (sort) {
    list = [...list].sort((a, b) => {
      const va = cellValue(a, sort.column).value;
      const vb = cellValue(b, sort.column).value;
      if (isEmptyValue(va) && isEmptyValue(vb)) return 0;
      if (isEmptyValue(va)) return 1;
      if (isEmptyValue(vb)) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sort.dir;
      return String(va).localeCompare(String(vb)) * sort.dir;
    });
  }
  return list;
});

function toggleSort(column: string) {
  const current = sortBy.value;
  if (!current || current.column !== column) sortBy.value = { column, dir: -1 };
  else if (current.dir === -1) sortBy.value = { column, dir: 1 };
  else sortBy.value = null;
}

// ── Cell reads and writes ──

const REMOVE = Symbol('remove');
type Draft = Map<string, any>;
const drafts = ref(new Map<string, Draft>());
const hasPendingChanges = computed(() => drafts.value.size > 0);

interface CellRead {
  value: any;
  /** Further effects that also carry the aspect; the cell edits the first. */
  more: number;
}

function readRaw(entry: any, columnId: string): CellRead {
  const [kind, key, sub] = columnId.split('.');
  if (kind === 'meta') {
    const value = entry.meta?.[key];
    return { value: sub ? value?.[sub] : value, more: 0 };
  }
  const effects: any[] = Array.isArray(entry.effects) ? entry.effects : [];
  const holders = sortedEffectIndexes(effects).map(i => effects[i]).filter(effect => effect?.aspects && key in effect.aspects);
  return { value: holders[0]?.aspects[key], more: Math.max(0, holders.length - 1) };
}

function cellValue(entry: any, columnId: string): CellRead {
  const draft = drafts.value.get(entry.uid);
  if (draft?.has(columnId)) {
    const value = draft.get(columnId);
    return { value: value === REMOVE ? undefined : value, more: readRaw(entry, columnId).more };
  }
  return readRaw(entry, columnId);
}

function isDrafted(entry: any, columnId: string): boolean {
  return !!drafts.value.get(entry.uid)?.has(columnId);
}

function writeRaw(entry: any, columnId: string, value: any) {
  const [kind, key, sub] = columnId.split('.');
  const remove = value === REMOVE || isEmptyValue(value);
  if (kind === 'meta') {
    if (!entry.meta || typeof entry.meta !== 'object') {
      if (remove) return;
      entry.meta = {};
    }
    if (sub) {
      const map = entry.meta[key] && typeof entry.meta[key] === 'object' ? { ...entry.meta[key] } : {};
      if (remove) delete map[sub]; else map[sub] = value;
      if (Object.keys(map).length) entry.meta[key] = map; else delete entry.meta[key];
    } else if (remove) {
      delete entry.meta[key];
    } else {
      entry.meta[key] = value;
    }
    return;
  }
  // Aspects: edit the first effect (card order) that carries the aspect; a new value goes into the
  // first effect, or a new one when the entry has none.
  if (!Array.isArray(entry.effects)) {
    if (remove) return;
    entry.effects = [];
  }
  const effects: any[] = entry.effects;
  const ordered = sortedEffectIndexes(effects).map(i => effects[i]);
  let target = ordered.find(effect => effect?.aspects && key in effect.aspects);
  if (!target) {
    if (remove) return;
    target = ordered[0];
    if (!target) {
      target = { uid: editor.createUid(), id: 'e1', aspects: {} };
      effects.push(target);
    }
  }
  if (!target.aspects || typeof target.aspects !== 'object') target.aspects = {};
  if (remove) delete target.aspects[key]; else target.aspects[key] = value;
}

function setCell(entry: any, columnId: string, value: any) {
  if (entry === localItem.value) {
    writeRaw(localItem.value, columnId, value === null ? REMOVE : value);
    emit('update:item', localItem.value);
    return;
  }
  const next = new Map(drafts.value);
  const draft = new Map(next.get(entry.uid) ?? []);
  const original = readRaw(entry, columnId).value;
  const normalized = value === null || value === undefined || value === '' ? REMOVE : value;
  const unchanged = normalized === REMOVE ? isEmptyValue(original) : JSON.stringify(normalized) === JSON.stringify(original);
  if (unchanged) draft.delete(columnId); else draft.set(columnId, normalized);
  if (draft.size) next.set(entry.uid, draft); else next.delete(entry.uid);
  drafts.value = next;
}

/** Called by the popup wrapper right before it saves the tab. */
function commitEntries() {
  const list = Array.isArray(editor.activeObject.value) ? editor.activeObject.value : [];
  for (const [uid, draft] of drafts.value) {
    const entry = list.find((row: any) => row.uid === uid);
    if (!entry) continue;
    for (const [columnId, value] of draft) writeRaw(entry, columnId, value);
  }
  drafts.value = new Map();
}

defineExpose({ hasPendingChanges, commitEntries });

// ── Editing state ──
const editing = ref<{ uid: string; column: string } | null>(null);
const editValue = ref<any>(null);

function startEdit(entry: any, column: Column) {
  if (column.field.type === 'boolean') {
    setCell(entry, column.id, cellValue(entry, column.id).value === true ? null : true);
    return;
  }
  editing.value = { uid: entry.uid, column: column.id };
  editValue.value = cellValue(entry, column.id).value ?? null;
  nextTick(() => {
    const el = document.querySelector<HTMLElement>('.bs-editing input, .bs-editing .p-select');
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  });
}

function finishEdit(entry: any, column: Column) {
  if (!editing.value || editing.value.uid !== entry.uid || editing.value.column !== column.id) return;
  setCell(entry, column.id, editValue.value);
  editing.value = null;
}

function isEditing(entry: any, column: Column): boolean {
  const current = editing.value;
  return !!current && current.uid === entry.uid && current.column === column.id;
}

function choiceOptions(field: Schemable) {
  return (field.options ?? []).map((option: any) => (option && typeof option === 'object' ? option : { label: String(option), value: option }));
}

function display(value: any, field: Schemable): string {
  if (isEmptyValue(value)) return '';
  if (field.type === 'boolean') return value ? '✓' : '✗';
  if (typeof value === 'number') return String(Math.round(value * 1000) / 1000);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ── Column statistics over the visible rows ──
function stats(column: Column): string {
  if (column.field.type !== 'number') {
    const set = rows.value.filter(entry => !isEmptyValue(cellValue(entry, column.id).value)).length;
    return set ? `${set} set` : '';
  }
  const values = rows.value.map(entry => cellValue(entry, column.id).value).filter((v): v is number => typeof v === 'number').sort((a, b) => a - b);
  if (!values.length) return '';
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  const round = (v: number) => Math.round(v * 100) / 100;
  return `${values.length} · ${round(values[0])} / ${round(median)} / ${round(values[values.length - 1])}`;
}

function openInEditor(entry: any) {
  emit('request-open-entry', { entityId: entry.id, componentId: 'ability-editor' });
}

const sifterSchema = computed(() => props.schema);
const draftCount = computed(() => [...drafts.value.values()].reduce((sum, draft) => sum + draft.size, 0));
</script>

<template>
  <div class="balance-sheet">
    <div class="bs-toolbar">
      <Button :icon="settings.filtersOpen ? 'pi pi-filter-slash' : 'pi pi-filter'" text size="small"
        :label="settings.filtersOpen ? 'Hide filters' : 'Filters'" @click="settings.filtersOpen = !settings.filtersOpen" />
      <SelectButton v-model="settings.kind" :options="[
        { label: 'Abilities', value: 'abilities' },
        { label: 'Modifiers', value: 'modifiers' },
        { label: 'All', value: 'all' },
      ]" optionLabel="label" optionValue="value" :allowEmpty="false" size="small" />
      <MultiSelect v-model="columns" :options="columnOptions" optionLabel="label" optionValue="value"
        optionGroupLabel="label" optionGroupChildren="items" filter display="comma" :maxSelectedLabels="0"
        selectedItemsLabel="{0} columns" placeholder="Columns" size="small" appendTo="body" class="bs-columns" />
      <Button label="Default columns" text size="small" severity="secondary" :disabled="settings.columns === null"
        @click="settings.columns = null" />
      <span class="bs-spacer" />
      <span class="bs-count">{{ rows.length }} of {{ kindRows.length }} rows</span>
      <span v-if="draftCount" class="bs-pending">{{ draftCount }} {{ draftCount === 1 ? 'edit' : 'edits' }} pending – Save
        applies them</span>
    </div>

    <div class="bs-sets">
      <span class="bs-sets-label">Column sets</span>
      <span v-for="set in columnSets" :key="set.id" class="bs-set" :class="{ active: activeSet === set.id }">
        <button type="button" class="bs-set-apply" @click="applySet(set)">{{ set.name }}</button>
        <button v-if="set.writable" type="button" class="bs-set-remove" v-tooltip.top="'Delete this set'"
          @click="deleteSet(set)">×</button>
      </span>
      <span v-if="!columnSets.length" class="bs-hint">None saved yet.</span>
      <InputText v-model="saveName" placeholder="Name the current columns" size="small" class="bs-save-name"
        @keydown.enter.prevent="saveSet" />
      <Button label="Save set" icon="pi pi-bookmark" size="small" outlined :disabled="!saveName.trim() || !columns.length"
        :loading="saving" v-tooltip.top="`Stored in ${EDITOR_LAYOUTS_FILE}.json of the selected folder`" @click="saveSet" />
    </div>

    <div class="bs-body">
      <aside v-show="settings.filtersOpen" class="bs-filters">
        <Dsearch v-if="sifterSchema" :schema="sifterSchema" :data="kindRows" :triggerClear="clearCounter"
          :sync-shared-id-filter="false" :preset-scope="tabFile" @update:siftedData="onSifted" />
      </aside>

      <div class="bs-table-wrap">
        <table class="bs-table">
          <thead>
            <tr>
              <th class="bs-name-col">Ability</th>
              <th v-for="column in visibleColumns" :key="column.id" class="bs-col" :class="{ sorted: sortBy?.column === column.id }"
                @click="toggleSort(column.id)">
                <span class="bs-col-label">{{ column.label }}</span>
                <span v-if="sortBy?.column === column.id" class="pi" :class="sortBy.dir === 1 ? 'pi-sort-amount-up-alt' : 'pi-sort-amount-down'" />
              </th>
            </tr>
            <tr class="bs-stats">
              <th class="bs-name-col">count · min / median / max</th>
              <th v-for="column in visibleColumns" :key="`s-${column.id}`">{{ stats(column) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in rows" :key="entry.uid" :class="{ current: entry === localItem }">
              <td class="bs-name-col">
                <button type="button" class="bs-open" v-tooltip.right="'Open in the Ability Editor'" @click="openInEditor(entry)">
                  <code>{{ entry.id }}</code>
                </button>
                <span class="bs-name">{{ entry.meta?.name || (entry.modifies ? `modifies ${entry.modifies}` : '') }}</span>
              </td>
              <td v-for="column in visibleColumns" :key="column.id" class="bs-cell"
                :class="{ drafted: isDrafted(entry, column.id), 'bs-editing': isEditing(entry, column), num: column.field.type === 'number' }"
                @click="!isEditing(entry, column) && startEdit(entry, column)">
                <template v-if="isEditing(entry, column)">
                  <span v-if="column.field.type === 'number'" @keydown.enter.prevent="finishEdit(entry, column)">
                    <InputNumber v-model="editValue" size="small" :useGrouping="false" :maxFractionDigits="3"
                      inputClass="bs-input" @input="(e: any) => editValue = typeof e.value === 'number' ? e.value : null"
                      @blur="finishEdit(entry, column)" />
                  </span>
                  <Select v-else-if="column.field.type === 'chooseOne'" v-model="editValue" :options="choiceOptions(column.field)"
                    optionLabel="label" optionValue="value" showClear size="small" appendTo="body" class="bs-select"
                    @change="finishEdit(entry, column)" @hide="finishEdit(entry, column)" />
                  <InputText v-else v-model="editValue" size="small" class="bs-input" @blur="finishEdit(entry, column)"
                    @keydown.enter.prevent="finishEdit(entry, column)" />
                </template>
                <template v-else>
                  {{ display(cellValue(entry, column.id).value, column.field) }}
                  <span v-if="cellValue(entry, column.id).more" class="bs-more"
                    v-tooltip.top="'More effects also carry this aspect; the cell edits the first.'">+{{ cellValue(entry, column.id).more }}</span>
                </template>
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td :colspan="visibleColumns.length + 1" class="bs-empty">No rows match.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.balance-sheet {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 100%;
  min-height: 0;
}

.bs-toolbar,
.bs-sets {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.bs-columns {
  min-width: 11rem;
}

.bs-spacer {
  flex: 1;
}

.bs-count {
  font-size: 0.8rem;
  color: var(--editor-text-muted);
}

.bs-pending {
  font-size: 0.8rem;
  color: var(--editor-fg-warning);
  font-style: italic;
}

.bs-sets-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--editor-text-muted);
}

.bs-set {
  display: inline-flex;
  align-items: center;
  border: 1px dashed var(--editor-border-strong);
  border-radius: 999px;
  overflow: hidden;
}

.bs-set.active {
  border-style: solid;
  border-color: var(--editor-accent);
  background: var(--editor-surface-selected);
}

.bs-set button {
  background: none;
  border: none;
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  color: var(--editor-text);
  padding: 0.15rem 0.55rem;
}

.bs-set-remove {
  color: var(--editor-fg-danger) !important;
  padding-left: 0 !important;
}

.bs-hint {
  font-size: 0.8rem;
  color: var(--editor-text-muted);
  font-style: italic;
}

.bs-save-name {
  width: 14rem;
}

.bs-body {
  display: flex;
  gap: 0.6rem;
  flex: 1;
  min-height: 0;
}

.bs-filters {
  flex: 0 0 270px;
  overflow-y: auto;
}

.bs-table-wrap {
  flex: 1;
  min-width: 0;
  overflow: auto;
  border: 1px solid var(--editor-border);
  border-radius: 4px;
  background: var(--editor-surface);
}

.bs-table {
  border-collapse: collapse;
  font-size: 0.83rem;
  min-width: 100%;
}

.bs-table th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--editor-surface-raised);
  color: var(--editor-text);
  text-align: left;
  padding: 0.35rem 0.55rem;
  white-space: nowrap;
  border-bottom: 1px solid var(--editor-border);
}

.bs-table thead tr.bs-stats th {
  top: 2rem;
  font-weight: normal;
  font-size: 0.72rem;
  color: var(--editor-text-muted);
  border-bottom: 1px solid var(--editor-border-strong);
  font-variant-numeric: tabular-nums;
}

.bs-col {
  cursor: pointer;
  user-select: none;
}

.bs-col .pi {
  font-size: 0.7rem;
  margin-left: 0.3rem;
}

.bs-col.sorted {
  color: var(--editor-accent);
}

.bs-col-label {
  font-family: var(--font-family-mono);
  font-size: 0.78rem;
}

.bs-table td {
  padding: 0.15rem 0.55rem;
  border-bottom: 1px solid var(--editor-border);
  color: var(--editor-text);
  white-space: nowrap;
  height: 2rem;
}

.bs-table tbody tr:hover td {
  background: var(--editor-surface-hover);
}

.bs-table tbody tr.current td {
  background: var(--editor-surface-selected);
}

.bs-name-col {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--editor-surface);
  min-width: 15rem;
}

thead .bs-name-col {
  z-index: 3;
}

.bs-open {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--editor-ink-blue);
}

.bs-open:hover code {
  text-decoration: underline;
}

.bs-name {
  margin-left: 0.45rem;
  color: var(--editor-text-muted);
}

.bs-cell {
  cursor: cell;
  min-width: 5.5rem;
}

.bs-cell.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.bs-cell.drafted {
  background: var(--editor-tint-warning) !important;
  font-weight: 600;
}

.bs-cell.bs-editing {
  padding: 0.05rem 0.2rem;
}

.bs-cell :deep(.bs-input) {
  width: 6.5rem;
  padding: 0.15rem 0.35rem;
}

.bs-select {
  min-width: 8rem;
}

.bs-more {
  font-size: 0.68rem;
  color: var(--editor-fg-info);
  margin-left: 0.2rem;
}

.bs-empty {
  text-align: center;
  color: var(--editor-text-muted);
  padding: 1rem !important;
}
</style>
