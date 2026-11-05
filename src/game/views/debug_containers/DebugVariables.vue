<script setup lang="ts">
import { computed, reactive } from 'vue';
import { useStorage } from '@vueuse/core';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import { Game } from '../../game';
import { DEV_LOG_FILTERS_KEY, devLogFilterDefaults, devLogConsoleRun } from '../../utils/devLog';

type Kind = 'flag' | 'property' | 'state' | 'store';
type Editor = 'number' | 'string' | 'boolean' | 'json';

interface VariableRow {
  id: string;
  kind: Kind;
  /** `dungeon.` or `store.` prefix of the name, empty for properties and states. */
  scope: string;
  name: string;
  value: unknown;
  /** The value as shown: plain for scalars, compact JSON for the rest. */
  text: string;
  editor: Editor;
  locked: boolean;
  /** Typed properties refuse a value of another shape and drop to undefined, so check first. */
  shape?: 'array' | 'object';
  write: (value: unknown) => void;
}

const KINDS: { id: Kind; label: string }[] = [
  { id: 'flag', label: 'Flag' },
  { id: 'property', label: 'Property' },
  { id: 'state', label: 'State' },
  { id: 'store', label: 'Store' },
];

const KIND_LABEL: Record<Kind, string> = { flag: 'Flag', property: 'Property', state: 'State', store: 'Store' };

const game = Game.getInstance();

// States start filtered out: the engine and its plugins register dozens of UI states, which would
// bury the few values a story keeps. One click on the State chip brings them in.
const filters = useStorage('debug-variables-filters', {
  search: '',
  kinds: ['flag', 'property', 'store'] as Kind[],
}, localStorage, { mergeDefaults: true });

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

function jsonReplacer(_key: string, value: unknown) {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  return value;
}

/** null when the value can't be written as JSON (cycles), which also makes it read-only. */
function toJson(value: unknown, indent?: number): string | null {
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value, jsonReplacer, indent) ?? String(value);
  } catch {
    return null;
  }
}

/** Lets a long snake_case name wrap at its underscores rather than mid-word. */
function nameParts(name: string): string[] {
  return name.split(/(?<=_)/);
}

function editorFor(value: unknown): Editor {
  const type = typeof value;
  return type === 'number' || type === 'string' || type === 'boolean' ? type : 'json';
}

function makeRow(row: Omit<VariableRow, 'text'>): VariableRow {
  if (row.editor !== 'json') {
    return { ...row, text: row.value === undefined || row.value === null ? '' : String(row.value) };
  }
  const json = toJson(row.value);
  return { ...row, text: json ?? String(row.value), locked: row.locked || json === null };
}

// One computed per kind so a flag ticking over doesn't re-serialize every store.
const flagRows = computed<VariableRow[]>(() => {
  const datas = game.dungeonSystem.dungeonDatas.value;
  const current = game.dungeonSystem.currentDungeonId.value;
  const dungeonIds = [...datas.keys()].sort((a, b) => a === current ? -1 : b === current ? 1 : byName(a, b));
  const rows: VariableRow[] = [];
  for (const dungeonId of dungeonIds) {
    const flags = datas.get(dungeonId)!.flags;
    for (const flagId of [...flags.keys()].sort(byName)) {
      rows.push(makeRow({
        id: `flag|${dungeonId}|${flagId}`, kind: 'flag', scope: `${dungeonId}.`, name: flagId,
        value: flags.get(flagId), editor: 'number', locked: false,
        write: (value) => game.getDungeonDataById(dungeonId).setFlag(flagId, value as number),
      }));
    }
  }
  return rows;
});

const propertyRows = computed<VariableRow[]>(() => {
  const rows: VariableRow[] = [];
  for (const [id, property] of game.coreSystem.properties.value) {
    const type = property.type;
    rows.push(makeRow({
      id: `property|${id}`, kind: 'property', scope: '', name: id, value: property.currentValue,
      editor: type === 'number' || type === 'string' || type === 'boolean' ? type : 'json',
      locked: property.skipSave,
      shape: type === 'array' ? 'array' : type === 'object' ? 'object' : undefined,
      write: (value) => { game.getProperty(id).currentValue = value; },
    }));
  }
  return rows.sort((a, b) => byName(a.name, b.name));
});

const stateRows = computed<VariableRow[]>(() => {
  const rows: VariableRow[] = [];
  for (const [key, value] of game.coreSystem.state.value) {
    // A save can carry a state no script registers any more; setState would throw on it.
    if (!game.hasState(key)) continue;
    rows.push(makeRow({
      id: `state|${key}`, kind: 'state', scope: '', name: key, value,
      editor: editorFor(value), locked: false,
      write: (next) => game.setState(key, next),
    }));
  }
  return rows.sort((a, b) => byName(a.name, b.name));
});

const storeRows = computed<VariableRow[]>(() => {
  const rows: VariableRow[] = [];
  const stores = game.coreSystem.store.value;
  for (const storeId of [...stores.keys()].sort(byName)) {
    const store = stores.get(storeId)!;
    const keys = [...store.keys()].sort((a, b) => byName(String(a), String(b)));
    for (const key of keys) {
      const value = store.get(key);
      rows.push(makeRow({
        id: `store|${storeId}|${String(key)}`, kind: 'store', scope: `${storeId}.`, name: String(key), value,
        editor: editorFor(value), locked: false,
        write: (next) => game.getStore(storeId).set(key, next),
      }));
    }
  }
  return rows;
});

const allRows = computed(() => [...flagRows.value, ...propertyRows.value, ...stateRows.value, ...storeRows.value]);

const searchedRows = computed(() => {
  const query = filters.value.search.trim().toLowerCase();
  if (!query) return allRows.value;
  return allRows.value.filter(row => (row.scope + row.name).toLowerCase().includes(query));
});

const kindCounts = computed(() => {
  const counts: Record<Kind, number> = { flag: 0, property: 0, state: 0, store: 0 };
  for (const row of searchedRows.value) counts[row.kind]++;
  return counts;
});

const visibleRows = computed(() => {
  const kinds = filters.value.kinds;
  return kinds.length ? searchedRows.value.filter(row => kinds.includes(row.kind)) : searchedRows.value;
});

function toggleKind(kind: Kind) {
  const kinds = filters.value.kinds;
  const at = kinds.indexOf(kind);
  if (at === -1) kinds.push(kind);
  else kinds.splice(at, 1);
}

// --- History: the Log tab filtered to the lines that changed a variable ---
// States and stores are not logged, so only flags and properties have one.
const logFilters = useStorage(DEV_LOG_FILTERS_KEY, devLogFilterDefaults(), localStorage, { mergeDefaults: true });
const activeTabId = useStorage('debug-active-tab-id', '');

function hasHistory(row: VariableRow): boolean {
  return row.kind === 'flag' || row.kind === 'property';
}

function showHistory(row: VariableRow) {
  if (!hasHistory(row)) return;
  logFilters.value.search = row.scope + row.name;
  if (!logFilters.value.kinds.includes('var')) logFilters.value.kinds.push('var');
  activeTabId.value = 'debug-log';
}

// Logged as the panel's own line, so an edit made here doesn't read as something the paragraph did.
function write(row: VariableRow, value: unknown) {
  if (!hasHistory(row)) {
    row.write(value);
    return;
  }
  const text = typeof value === 'string' ? value : toJson(value) ?? String(value);
  devLogConsoleRun(`${row.scope}${row.name} = ${text}`, () => row.write(value), 'Panel');
}

// --- New flag: one nobody set yet isn't listed, since it reads 0 ---
const newFlag = reactive({ open: false, dungeonId: '', name: '', value: '1', error: '' });

const dungeonIds = computed(() => {
  const current = game.dungeonSystem.currentDungeonId.value;
  return [...game.dungeonSystem.dungeonDatas.value.keys()].sort((a, b) => a === current ? -1 : b === current ? 1 : byName(a, b));
});

function openNewFlag() {
  newFlag.open = !newFlag.open;
  newFlag.dungeonId = game.dungeonSystem.currentDungeonId.value ?? dungeonIds.value[0] ?? '';
  newFlag.error = '';
}

function addFlag() {
  const name = newFlag.name.trim();
  const value = Number(newFlag.value);
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    newFlag.error = 'A flag name is letters, digits and _.';
    return;
  }
  if (newFlag.value.trim() === '' || !Number.isFinite(value)) {
    newFlag.error = 'Flags hold numbers.';
    return;
  }
  const action = `${newFlag.dungeonId}.${name} = ${value}`;
  devLogConsoleRun(`{flag: "${action}"}`, () => game.logicSystem.resolveActions({ flag: action }), 'Panel');
  if (filters.value.kinds.length && !filters.value.kinds.includes('flag')) filters.value.kinds.push('flag');
  Object.assign(newFlag, { open: false, name: '', value: '1', error: '' });
}

function cancelNewFlag(event: Event) {
  newFlag.open = false;
  (event.target as HTMLElement).blur();
}

// --- Inline scalar edits ---
// The typed text lives here while a field has focus, so a live re-render can't overwrite it.
const drafts = reactive(new Map<string, string>());

function fieldValue(row: VariableRow): string {
  return drafts.get(row.id) ?? row.text;
}

function onDraftInput(row: VariableRow, event: Event) {
  drafts.set(row.id, (event.target as HTMLInputElement).value);
}

function commitDraft(row: VariableRow) {
  const draft = drafts.get(row.id);
  if (draft === undefined) return;
  drafts.delete(row.id);
  let next: unknown = draft;
  if (row.editor === 'number') {
    next = draft.trim() === '' ? NaN : Number(draft);
    if (!Number.isFinite(next)) return;
  }
  if (next !== row.value) write(row, next);
}

// Escape handlers are bound with .prevent: the game opens its menu on any Escape left unhandled.
function cancelDraft(row: VariableRow, event: Event) {
  drafts.delete(row.id);
  (event.target as HTMLInputElement).blur();
}

function blurField(event: Event) {
  (event.target as HTMLInputElement).blur();
}

function onCheck(row: VariableRow, event: Event) {
  write(row, (event.target as HTMLInputElement).checked);
}

// --- JSON edits ---
const jsonEdit = reactive({ id: null as string | null, text: '', error: '' });

function startJsonEdit(row: VariableRow) {
  if (row.locked) return;
  jsonEdit.id = row.id;
  jsonEdit.text = toJson(row.value, 2) ?? '';
  jsonEdit.error = '';
}

function cancelJsonEdit() {
  jsonEdit.id = null;
  jsonEdit.text = '';
  jsonEdit.error = '';
}

function applyJsonEdit(row: VariableRow) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonEdit.text);
  } catch (e) {
    jsonEdit.error = (e as Error).message;
    return;
  }
  if (row.shape === 'array' && !Array.isArray(parsed)) {
    jsonEdit.error = 'Must be an array.';
    return;
  }
  if (row.shape === 'object' && (typeof parsed !== 'object' || parsed === null)) {
    jsonEdit.error = 'Must be an object.';
    return;
  }
  write(row, parsed);
  cancelJsonEdit();
}

const jsonRows = computed(() => Math.min(14, Math.max(3, jsonEdit.text.split('\n').length)));
</script>

<template>
  <div class="debug-variables">
    <div class="filters">
      <InputText :modelValue="filters.search" @update:modelValue="filters.search = $event ?? ''"
        placeholder="Search" class="filter-search" />
      <div class="filter-chips">
        <button v-for="kind in KINDS" :key="kind.id" class="chip" :class="{ active: filters.kinds.includes(kind.id) }"
          @click="toggleKind(kind.id)">
          <span class="chip-dot" :class="`kind-${kind.id}`"></span>{{ kind.label }}
          <span class="chip-count">{{ kindCounts[kind.id] }}</span>
        </button>
        <button class="add-flag-toggle" :class="{ active: newFlag.open }" @click="openNewFlag">+ Flag</button>
      </div>
      <div v-if="newFlag.open" class="new-flag" @keydown.esc.prevent="cancelNewFlag">
        <select v-model="newFlag.dungeonId" class="new-flag-dungeon" title="Dungeon">
          <option v-for="id in dungeonIds" :key="id" :value="id">{{ id }}</option>
        </select>
        <div class="new-flag-line">
          <input v-model="newFlag.name" class="value-input new-flag-name" placeholder="name" spellcheck="false"
            @input="newFlag.error = ''" @keydown.enter="addFlag" />
          <span>=</span>
          <input v-model="newFlag.value" class="value-input is-number" inputmode="decimal" spellcheck="false"
            @input="newFlag.error = ''" @keydown.enter="addFlag" />
          <Button label="Set" size="small" @click="addFlag" />
        </div>
        <div v-if="newFlag.error" class="json-error">{{ newFlag.error }}</div>
      </div>
    </div>

    <div v-if="visibleRows.length" class="variable-list">
      <div v-for="row in visibleRows" :key="row.id" class="variable-row">
        <span class="kind-chip" :class="`kind-${row.kind}`">{{ KIND_LABEL[row.kind] }}</span>
        <span class="variable-name" :class="{ 'has-history': hasHistory(row) }"
          :title="hasHistory(row) ? `${row.scope}${row.name}: show its history in the Log` : row.scope + row.name"
          @click="showHistory(row)">
          <span v-if="row.scope" class="name-scope">{{ row.scope }}<wbr></span><template
            v-for="(part, i) in nameParts(row.name)" :key="i">{{ part }}<wbr></template>
        </span>

        <!-- JSON: the control sits on the name line, the value on the line below -->
        <template v-if="row.editor === 'json'">
          <i v-if="row.locked" class="pi pi-lock lock-icon" :title="row.kind === 'property' ? 'Constant' : 'Read-only'"></i>
          <button v-else-if="jsonEdit.id !== row.id" class="icon-button" title="Edit" @click="startJsonEdit(row)">
            <i class="pi pi-pencil"></i>
          </button>
          <span v-else></span>

          <div v-if="jsonEdit.id === row.id" class="json-editor">
            <textarea v-model="jsonEdit.text" class="json-textarea" :rows="jsonRows" spellcheck="false"
              @keydown.esc.prevent="cancelJsonEdit" @keydown.ctrl.enter="applyJsonEdit(row)"></textarea>
            <div v-if="jsonEdit.error" class="json-error">{{ jsonEdit.error }}</div>
            <div class="json-actions">
              <Button label="Apply" size="small" @click="applyJsonEdit(row)" />
              <Button label="Cancel" size="small" severity="secondary" @click="cancelJsonEdit" />
            </div>
          </div>
          <code v-else class="json-preview" :class="{ editable: !row.locked }" @click="startJsonEdit(row)">{{ row.text }}</code>
        </template>

        <span v-else-if="row.locked" class="locked-value">
          <span class="locked-text" :title="row.text">{{ row.text }}</span>
          <i class="pi pi-lock lock-icon" title="Constant"></i>
        </span>

        <input v-else-if="row.editor === 'boolean'" type="checkbox" class="value-check" :checked="row.value === true"
          @change="onCheck(row, $event)" />

        <input v-else class="value-input" :class="`is-${row.editor}`" type="text"
          :inputmode="row.editor === 'number' ? 'decimal' : undefined" :value="fieldValue(row)" :title="row.text"
          spellcheck="false" @focus="drafts.set(row.id, row.text)" @input="onDraftInput(row, $event)"
          @blur="commitDraft(row)" @keydown.enter="blurField" @keydown.esc.prevent="cancelDraft(row, $event)" />
      </div>
    </div>
    <p v-else class="empty">{{ allRows.length ? 'No matches.' : 'No variables yet.' }}</p>
  </div>
</template>

<style scoped>
/* Painted against the host debug panel (Debug.vue), which follows the editor's theme. */
.debug-variables {
  --kind-flag: var(--editor-ink-amber);
  --kind-property: var(--editor-ink-blue);
  --kind-state: var(--editor-ink-teal);
  --kind-store: var(--editor-ink-purple);

  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  color: var(--editor-text);
  /* The game sets a large body font; the panel is narrow, so size from the root instead. */
  font-size: 0.875rem;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-search {
  width: 100%;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  border-radius: 1rem;
  border: 1px solid var(--editor-border-strong);
  background: var(--editor-surface-sunken);
  color: var(--editor-text-muted);
  font-size: 0.85em;
  cursor: pointer;
}

.chip:hover {
  background: var(--editor-surface);
}

.chip.active {
  background: #42b983;
  border-color: var(--editor-ink-green);
  color: #fff;
}

.chip-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--kind-color);
}

.chip-count {
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.kind-flag { --kind-color: var(--kind-flag); }
.kind-property { --kind-color: var(--kind-property); }
.kind-state { --kind-color: var(--kind-state); }
.kind-store { --kind-color: var(--kind-store); }

.variable-list {
  display: flex;
  flex-direction: column;
}

.variable-row {
  display: grid;
  grid-template-columns: 3.6rem minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 0.5rem;
  row-gap: 0.25rem;
  padding: 0.3rem 0.25rem;
  border-bottom: 1px solid var(--editor-border);
}

.variable-row:last-child {
  border-bottom: none;
}

.kind-chip {
  padding: 0.05rem 0;
  border: 1px solid var(--kind-color);
  border-radius: 3px;
  color: var(--kind-color);
  font-size: 0.7em;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
}

.variable-name {
  font-size: 0.95em;
  overflow-wrap: anywhere;
}

.variable-name.has-history {
  cursor: pointer;
}

.variable-name.has-history:hover {
  color: var(--editor-accent);
  text-decoration: underline;
}

.name-scope {
  color: var(--editor-text-faint);
}

.add-flag-toggle {
  margin-left: auto;
  padding: 0.15rem 0.4rem;
  border: none;
  background: none;
  color: var(--editor-ink-green);
  font: inherit;
  font-size: 0.85em;
  font-weight: 600;
  cursor: pointer;
}

.add-flag-toggle:hover,
.add-flag-toggle.active {
  text-decoration: underline;
}

.new-flag {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.45rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-left: 3px solid var(--kind-flag);
  border-radius: 4px;
  background: var(--dp-control, var(--editor-surface-sunken));
}

.new-flag-dungeon {
  padding: 0.15rem 0.3rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-radius: 4px;
  background: var(--editor-surface);
  color: var(--editor-text);
  font: inherit;
  font-size: 0.9em;
}

.new-flag-line {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.value-input.new-flag-name {
  flex: 1;
  min-width: 0;
}

.value-input {
  width: 4.5rem;
  padding: 0.15rem 0.35rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-radius: 4px;
  background: var(--dp-control, var(--editor-surface-sunken));
  color: var(--editor-text);
  font: inherit;
  font-size: 0.9em;
}

.value-input.is-number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.value-input.is-string {
  width: 7rem;
}

.value-input:hover {
  border-color: var(--dp-border-hover, var(--editor-border-strong));
}

.value-input:focus {
  outline: none;
  border-color: var(--editor-accent);
  background: var(--dp-control-hover, var(--editor-surface));
}

.value-check {
  justify-self: end;
  width: 1rem;
  height: 1rem;
  margin: 0 0.2rem;
  accent-color: var(--editor-accent);
  cursor: pointer;
}

.locked-value {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  max-width: 9rem;
  color: var(--editor-text-muted);
  font-size: 0.9em;
}

.locked-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lock-icon {
  justify-self: end;
  color: var(--editor-text-faint);
  font-size: 0.85em;
}

.icon-button {
  justify-self: end;
  padding: 0.15rem 0.3rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--editor-text-muted);
  font-size: 0.85em;
  cursor: pointer;
}

.icon-button:hover {
  background: var(--editor-surface-hover);
  color: var(--editor-text);
}

.json-preview,
.json-editor {
  grid-column: 2 / -1;
  min-width: 0;
}

.json-preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  background: var(--dp-control, var(--editor-surface-sunken));
  color: var(--editor-text-muted);
  font-size: 0.85em;
  word-break: break-all;
}

.json-preview.editable {
  cursor: pointer;
}

.json-preview.editable:hover {
  color: var(--editor-text);
}

.json-editor {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.json-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--editor-accent);
  border-radius: 4px;
  background: var(--dp-control-hover, var(--editor-surface));
  color: var(--editor-text);
  font-family: monospace;
  font-size: 0.85em;
  resize: vertical;
}

.json-textarea:focus {
  outline: none;
}

.json-error {
  color: var(--editor-fg-danger);
  font-size: 0.85em;
}

.json-actions {
  display: flex;
  gap: 0.35rem;
}

.empty {
  margin: 0;
  padding: 1rem 0;
  color: var(--editor-text-faint);
  font-style: italic;
  text-align: center;
}
</style>
