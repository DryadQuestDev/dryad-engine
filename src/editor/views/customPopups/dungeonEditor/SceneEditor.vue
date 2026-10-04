<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import RichContentEditor from './PlainEditor.vue';
import ParamsInput from './ParamsInput.vue';
import type { SceneBlock, SceneColumn, SceneRow } from '../../../../utility/dungeonEditor/ast';
import { newSceneColumn, newSceneRow } from '../../../../utility/dungeonEditor/ast';
import { readMeta, writeMeta, isMetaLayout } from '../../../../utility/dungeonEditor/meta';
import type { LintIssue } from '../../../../utility/dungeonEditor/lint';
import { tagWithUid } from './uid';
import { inputMatchesSearch } from './searchState';
import { flashElement, focusFieldAt, type RevealRequest } from './reveal';

const props = defineProps<{
  block: SceneBlock;
  issues?: LintIssue[];
  /** Focus request aimed at one of this scene's cells; `null` otherwise. */
  reveal?: RevealRequest | null;
}>();
const emit = defineEmits<{ 'update:block': [block: SceneBlock] }>();

const rootRef = ref<HTMLElement | null>(null);

const cellKey = (rowIdx: number, colIdx: number) => `${rowIdx}:${colIdx}`;

// Per-cell lookups built once per lint pass. Each PlainEditor keeps getting
// the same array reference across scene re-renders, so typing in one column
// doesn't recompute every sibling's overlay.
const contentIssueRanges = computed(() => {
  const m = new Map<string, Array<[number, number]>>();
  for (const issue of props.issues ?? []) {
    const at = issue.at;
    if (!at || at.target !== 'column-content') continue;
    if (at.rowIndex === undefined || at.colIndex === undefined || at.start === undefined) continue;
    const key = cellKey(at.rowIndex, at.colIndex);
    const list = m.get(key) ?? [];
    list.push([at.start, at.end ?? at.start + 1]);
    m.set(key, list);
  }
  return m;
});

const paramsIssueCells = computed(() => {
  const set = new Set<string>();
  for (const issue of props.issues ?? []) {
    const at = issue.at;
    if (at?.target === 'column-params' && at.rowIndex !== undefined && at.colIndex !== undefined) {
      set.add(cellKey(at.rowIndex, at.colIndex));
    }
  }
  return set;
});

// Comment lines the parser parks off the grid — under the `#id` header, or
// between a row number and its first `%`/`~`. They have no cell of their own,
// so without these they'd be invisible here and only reachable in the Raw view.
//
// Force comment syntax on write: the parser only parks lines that ARE
// comments, so anything else typed here falls through to the content fallback
// on reload and fabricates the very phantom row/column this carrier exists to
// prevent. The `//` must sit at column 0 too — the engine tests the untrimmed
// line, so an indented `// x` is prose to it. Blank lines are dropped because
// the parser cannot park those either.
//
// Emptying a strip drops the carrier entirely and there is no button to make
// a new one — these exist so comments already in the file survive a save, not
// to author new ones. Add those in the Raw view.
function normalizeParked(value: string): string | undefined {
  const lines = value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => (line.startsWith('//') ? line : '// ' + line));
  return lines.length ? lines.join('\n') : undefined;
}

function updateScenePre(value: string) {
  emit('update:block', { ...props.block, preRows: normalizeParked(value) });
}

function updateRowPre(rowIdx: number, value: string) {
  const rows = [...props.block.rows];
  rows[rowIdx] = { ...rows[rowIdx], preColumns: normalizeParked(value) };
  emit('update:block', { ...props.block, rows });
}

function revealFor(rowIdx: number, colIdx: number): RevealRequest | null {
  const r = props.reveal;
  if (!r || r.at.target !== 'column-content') return null;
  return r.at.rowIndex === rowIdx && r.at.colIndex === colIdx ? r : null;
}

watch(() => props.reveal, (r) => {
  if (!r || r.at.rowIndex === undefined) return;
  const rowIdx = r.at.rowIndex;
  const colIdx = r.at.colIndex ?? 0;
  nextTick(() => {
    const cell = rootRef.value?.querySelector<HTMLElement>(
      `[data-scene-row="${rowIdx}"] [data-scene-col="${colIdx}"]`,
    );
    if (!cell) return;
    if (r.at.target === 'column-params') {
      focusFieldAt(cell.querySelector('.params-input'), r.at.start, r.at.end);
    }
    flashElement(cell);
  });
});

const choiceDialogVisible = ref(false);
const choiceCount = ref(3);

function emitRows(rows: SceneRow[]) {
  emit('update:block', { ...props.block, rows });
}

function addRow() {
  emitRows([...props.block.rows, tagWithUid(newSceneRow())]);
}

function openChoiceRowDialog() {
  choiceCount.value = 3;
  choiceDialogVisible.value = true;
}

function confirmChoiceRow() {
  const n = Math.max(1, Math.floor(choiceCount.value || 1));
  const columns = Array.from({ length: n }, (_, i) =>
    tagWithUid({ ...newSceneColumn('~'), name: `choice${i + 1}` }),
  );
  emitRows([...props.block.rows, tagWithUid({ columns } as SceneRow)]);
  choiceDialogVisible.value = false;
}

function removeRow(rowIdx: number) {
  emitRows(props.block.rows.filter((_, i) => i !== rowIdx));
}

function moveRow(rowIdx: number, direction: -1 | 1) {
  const rows = [...props.block.rows];
  const target = rowIdx + direction;
  if (target < 0 || target >= rows.length) return;
  [rows[rowIdx], rows[target]] = [rows[target], rows[rowIdx]];
  emitRows(rows);
}

function addColumn(rowIdx: number, kind: '%' | '~') {
  const rows = props.block.rows.map((row, i) =>
    i === rowIdx ? { ...row, columns: [...row.columns, tagWithUid(newSceneColumn(kind))] } : row,
  );
  emitRows(rows);
}

function removeColumn(rowIdx: number, colIdx: number) {
  const rows = props.block.rows.map((row, i) =>
    i === rowIdx ? { ...row, columns: row.columns.filter((_, j) => j !== colIdx) } : row,
  );
  emitRows(rows);
}

function moveColumn(rowIdx: number, colIdx: number, direction: -1 | 1) {
  const row = props.block.rows[rowIdx];
  const target = colIdx + direction;
  if (target < 0 || target >= row.columns.length) return;
  const columns = [...row.columns];
  [columns[colIdx], columns[target]] = [columns[target], columns[colIdx]];
  const rows = props.block.rows.map((r, i) => (i === rowIdx ? { ...r, columns } : r));
  emitRows(rows);
}

// Column layout for one row, carried as `__meta` on the row-number line.
// Side-by-side lanes are the default — the flag marks the rows the author
// opted OUT of, so an untouched document carries no layout meta at all.
function isStackedRow(row: SceneRow): boolean {
  return isMetaLayout(readMeta(row.paramsRaw)?.layout);
}

function toggleRowLayout(rowIdx: number) {
  const row = props.block.rows[rowIdx];
  const meta = readMeta(row.paramsRaw) ?? {};
  const layout = isStackedRow(row) ? undefined : 'rows' as const;
  const rows = [...props.block.rows];
  rows[rowIdx] = { ...row, paramsRaw: writeMeta(row.paramsRaw, { ...meta, layout }) };
  emitRows(rows);
}

function updateColumn<K extends keyof SceneColumn>(
  rowIdx: number,
  colIdx: number,
  key: K,
  value: SceneColumn[K],
) {
  const rows = props.block.rows.map((row, i) => {
    if (i !== rowIdx) return row;
    const columns = row.columns.map((col, j) => (j === colIdx ? { ...col, [key]: value } : col));
    return { ...row, columns };
  });
  emitRows(rows);
}
</script>

<template>
  <div ref="rootRef" class="scene-editor">
    <div v-if="block.rows.length === 0" class="scene-empty">
      No rows yet. Click <strong>+ Row</strong> below to add the first one.
    </div>

    <div v-if="block.preRows !== undefined" class="parked-comment">
      <i class="pi pi-comment parked-icon" v-tooltip.top="'Comment above the first row'" />
      <textarea class="parked-input" :value="block.preRows" :rows="block.preRows.split('\n').length"
        @change="(e: any) => updateScenePre(e.target.value)" />
    </div>

    <div v-for="(row, rowIdx) in block.rows" :key="(row as any).__uid ?? rowIdx" class="scene-row"
      v-bind="{ 'data-scene-row': rowIdx }">
      <div class="row-header">
        <span class="row-label">Row {{ rowIdx + 1 }}</span>
        <div class="flex-spacer" />
        <Button :icon="isStackedRow(row) ? 'pi pi-bars' : 'pi pi-pause'" severity="secondary" text rounded
          size="small" :class="{ 'layout-btn--on': isStackedRow(row) }"
          v-tooltip.top="isStackedRow(row) ? 'Columns stacked — click to put them side by side' : 'Columns side by side — click to stack them'"
          @click="toggleRowLayout(rowIdx)" aria-label="Toggle column layout" />
        <Button icon="pi pi-arrow-up" severity="secondary" text rounded size="small" :disabled="rowIdx === 0"
          @click="moveRow(rowIdx, -1)" aria-label="Move row up" />
        <Button icon="pi pi-arrow-down" severity="secondary" text rounded size="small"
          :disabled="rowIdx === block.rows.length - 1" @click="moveRow(rowIdx, 1)" aria-label="Move row down" />
        <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="removeRow(rowIdx)"
          aria-label="Remove row" />
      </div>

      <div v-if="row.preColumns !== undefined" class="parked-comment parked-comment--row">
        <i class="pi pi-comment parked-icon" v-tooltip.top="'Comment above the first column'" />
        <textarea class="parked-input" :value="row.preColumns" :rows="row.preColumns.split('\n').length"
          @change="(e: any) => updateRowPre(rowIdx, e.target.value)" />
      </div>

      <div class="columns-list" :class="{ 'columns-list--lanes': !isStackedRow(row) }">
        <div v-for="(column, colIdx) in row.columns" :key="(column as any).__uid ?? colIdx" class="scene-column"
          :class="`col--${column.kind === '~' ? 'tilde' : 'percent'}`" v-bind="{ 'data-scene-col': colIdx }">
          <div class="col-header">
            <span class="col-index">{{ colIdx + 1 }}</span>
            <span class="col-sigil"
              v-tooltip.top="column.kind === '~' ? 'Branch choice' : 'Column'">{{ column.kind }}</span>
            <template v-if="column.kind === '~'">
              <InputText :model-value="column.name ?? ''"
                @update:model-value="(v: any) => updateColumn(rowIdx, colIdx, 'name', v ?? '')"
                placeholder="name" class="name-input"
                :class="{ 'input-search-hit': inputMatchesSearch(column.name) }" />
              <ParamsInput :model-value="column.paramsRaw ?? ''"
                @update:model-value="(v: string) => updateColumn(rowIdx, colIdx, 'paramsRaw', v ? v : undefined)"
                class="params-input"
                :class="{ 'params-input--error': paramsIssueCells.has(cellKey(rowIdx, colIdx)), 'input-search-hit': inputMatchesSearch(column.paramsRaw) }" />
            </template>
            <div v-else class="col-spacer" />
            <Button :icon="isStackedRow(row) ? 'pi pi-chevron-up' : 'pi pi-chevron-left'" severity="secondary" text
              rounded size="small" :disabled="colIdx === 0" @click="moveColumn(rowIdx, colIdx, -1)"
              aria-label="Move column earlier" />
            <Button :icon="isStackedRow(row) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" severity="secondary" text
              rounded size="small" :disabled="colIdx === row.columns.length - 1"
              @click="moveColumn(rowIdx, colIdx, 1)" aria-label="Move column later" />
            <Button icon="pi pi-times" severity="danger" text rounded size="small"
              @click="removeColumn(rowIdx, colIdx)" aria-label="Remove column" />
          </div>
          <RichContentEditor :model-value="column.content"
            @update:model-value="(v: string) => updateColumn(rowIdx, colIdx, 'content', v)"
            placeholder="content…" class="content-area"
            :issue-ranges="contentIssueRanges.get(cellKey(rowIdx, colIdx))"
            :reveal="revealFor(rowIdx, colIdx)" />
        </div>
      </div>

      <div class="row-toolbar">
        <button type="button" class="add-btn add-btn--percent" @click="addColumn(rowIdx, '%')">
          <span class="add-btn__plus">+</span>
          <span class="add-btn__sigil">%</span>
          <span class="add-btn__label">column</span>
        </button>
        <button type="button" class="add-btn add-btn--tilde" @click="addColumn(rowIdx, '~')">
          <span class="add-btn__plus">+</span>
          <span class="add-btn__sigil">~</span>
          <span class="add-btn__label">branch</span>
        </button>
      </div>
    </div>

    <div class="scene-toolbar">
      <button type="button" class="add-btn add-btn--row" @click="addRow">
        <span class="add-btn__plus">+</span>
        <span class="add-btn__label">Row</span>
        <span class="add-btn__sigil">%</span>
      </button>
      <button type="button" class="add-btn add-btn--row add-btn--row-tilde" @click="openChoiceRowDialog">
        <span class="add-btn__plus">+</span>
        <span class="add-btn__label">Row</span>
        <span class="add-btn__sigil">~</span>
      </button>
    </div>

    <Dialog v-model:visible="choiceDialogVisible" modal header="Add branch row" :style="{ width: '20rem' }">
      <div class="choice-dialog-body">
        <label for="choice-count">How many branches?</label>
        <InputNumber input-id="choice-count" v-model="choiceCount" :min="1" :max="20" showButtons />
      </div>
      <template #footer>
        <Button label="Cancel" text severity="secondary" @click="choiceDialogVisible = false" />
        <Button label="Create" @click="confirmChoiceRow" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.scene-editor {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.5rem 0.75rem;
}

.scene-empty {
  color: var(--editor-text-faint);
  font-style: italic;
  padding: 0.5rem 0;
}

.parked-comment {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  margin: 0 0 0.4rem;
  padding: 0.25rem 0.45rem;
  border-left: 2px solid var(--p-surface-500);
  background: color-mix(in srgb, var(--p-surface-800) 45%, transparent);
  border-radius: 3px;
}

.parked-comment--row {
  margin: 0.35rem 0 0.4rem 0.5rem;
}

.parked-icon {
  flex: 0 0 auto;
  margin-top: 0.15rem;
  font-size: 0.7rem;
  opacity: 0.55;
}

.parked-input {
  flex: 1 1 auto;
  resize: vertical;
  border: none;
  outline: none;
  background: transparent;
  color: var(--p-text-muted-color);
  font-family: inherit;
  font-size: 0.78rem;
  line-height: 1.35;
  padding: 0;
}

.scene-row {
  border: 1px solid rgba(129, 199, 132, 0.18);
  border-radius: 4px;
  background: rgba(129, 199, 132, 0.04);
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  /* Force own compositor layer — moving rows/cols (insert / arrows) needs
     this to avoid stale-paint of icons + Quill toolbar inside. */
  transform: translateZ(0);
}

.row-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.row-label {
  font-family: var(--font-family-mono, monospace);
  font-weight: 700;
  color: var(--editor-ink-green);
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.flex-spacer {
  flex: 1 1 0;
}

/* The stacked fallback, for a row the author flagged `layout:"rows"`. The
   modifier below is the DEFAULT appearance — it is on unless that flag is
   set — so read the two together. */
.columns-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

/* Lanes never wrap: a six-branch row is one strip you scroll, not two
   half-rows where the fourth choice reads as a different beat. */
.columns-list--lanes {
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: stretch;
  overflow-x: auto;
  /* A thin but always-drawn scrollbar: with overlay scrollbars the only cue
     that lanes continue is the clipped one at the edge. `padding-bottom`
     keeps it off the last lane's content box. */
  scrollbar-width: thin;
  padding-bottom: 0.3rem;
}

/* `flex-shrink: 0` is what turns "more lanes than fit" into a scroll rather
   than a rank of unreadably thin ones — they still grow to share the width
   while they all fit. `min-width: 0` is load-bearing too: a flex item
   defaults to `min-width: auto`, and the textarea's intrinsic width would
   otherwise override the basis. */
.columns-list--lanes > .scene-column {
  flex: 1 0 16rem;
  min-width: 0;
}

/* A lane is a fraction of the row's width, so a `~name` squeezed in beside
   the sigil and the three buttons has room for about six characters. Give
   the name and the params a full header line each instead: `order` puts them
   after the default-0 buttons and the 100% basis forces the wrap, leaving
   the index, sigil and buttons on the line above. */
.columns-list--lanes .col-header {
  flex-wrap: wrap;
}

/* The job the inputs did in the wide layout — without them on the line, the
   buttons need something else to push them to the right edge. */
.columns-list--lanes .col-sigil {
  margin-right: auto;
}

.columns-list--lanes .name-input {
  order: 2;
  flex: 1 1 100%;
  min-width: 0;
}

.columns-list--lanes .params-input {
  order: 3;
  flex: 1 1 100%;
  min-width: 0;
}

.layout-btn--on {
  color: var(--editor-ink-teal) !important;
}

.scene-column {
  border: 1px solid var(--editor-border);
  border-radius: 4px;
  background: var(--editor-surface-hover);
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  transform: translateZ(0);
}

.col--tilde {
  border-left: 2px solid var(--editor-ink-teal);
}

.col--percent {
  border-left: 2px solid var(--editor-ink-blue);
}

.col-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.col-index {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.75rem;
  color: var(--editor-text-faint);
  min-width: 1rem;
  text-align: right;
  user-select: none;
}

.col-sigil {
  font-family: var(--font-family-mono, monospace);
  font-weight: 700;
  font-size: 1rem;
  width: 1.25rem;
  text-align: center;
  cursor: help;
}

.col--tilde .col-sigil {
  color: var(--editor-ink-teal);
}

.col--percent .col-sigil {
  color: var(--editor-ink-blue);
}

.col-spacer {
  flex: 1 1 0;
}

.name-input {
  flex: 1 1 0;
  min-width: 120px;
}

.params-input {
  flex: 1 1 0;
  min-width: 120px;
}

.params-input {
  color: var(--editor-ink-purple) !important;
  font-weight: 600;
}

.params-input--error {
  outline: 2px solid #d32f2f;
  outline-offset: -1px;
}

/* Target of a TOC sub-jump or a lint reveal. */
.scene-row.flash,
.scene-column.flash {
  animation: scene-flash 1.2s ease-out;
}

@keyframes scene-flash {
  0% { box-shadow: 0 0 0 0 rgba(255, 235, 59, 0.6); }
  30% { box-shadow: 0 0 0 4px rgba(255, 235, 59, 0.45); }
  100% { box-shadow: 0 0 0 0 rgba(255, 235, 59, 0); }
}

.content-area {
  width: 100%;
}

.content-area :deep(textarea) {
  width: 100%;
  resize: vertical;
  min-height: 2.25rem;
}

.row-toolbar,
.scene-toolbar {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.row-toolbar {
  padding-top: 0.4rem;
  border-top: 1px dashed var(--editor-border);
}

.scene-toolbar {
  padding-top: 0.25rem;
}

.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 500;
  padding: 0.3rem 0.75rem;
  border: 1.5px dashed;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  color: inherit;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.05s ease;
}

.add-btn:hover {
  border-style: solid;
}

.add-btn:active {
  transform: translateY(1px);
}

.add-btn__plus {
  font-weight: 700;
  font-size: 1rem;
  line-height: 1;
}

.add-btn__sigil {
  font-family: var(--font-family-mono, monospace);
  font-weight: 700;
  font-size: 0.95rem;
}

.add-btn__label {
  letter-spacing: 0.02em;
}

.add-btn--percent {
  border-color: rgba(121, 134, 203, 0.55);
  color: var(--editor-ink-blue);
}

.add-btn--percent:hover {
  background: rgba(121, 134, 203, 0.14);
  border-color: var(--editor-ink-blue);
}

.add-btn--tilde {
  border-color: rgba(77, 182, 172, 0.55);
  color: var(--editor-ink-teal);
}

.add-btn--tilde:hover {
  background: rgba(77, 182, 172, 0.14);
  border-color: var(--editor-ink-teal);
}

.add-btn--row {
  border-color: rgba(129, 199, 132, 0.6);
  color: var(--editor-ink-green);
  padding: 0.4rem 1rem;
  font-size: 0.88rem;
}

.add-btn--row:hover {
  background: rgba(129, 199, 132, 0.18);
  border-color: var(--editor-ink-green);
}

.add-btn--row-tilde {
  border-color: rgba(77, 182, 172, 0.6);
  color: var(--editor-ink-teal);
}

.add-btn--row-tilde:hover {
  background: rgba(77, 182, 172, 0.18);
  border-color: var(--editor-ink-teal);
}

.add-btn--row-tilde .add-btn__sigil {
  color: var(--editor-ink-teal);
}

.choice-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.25rem 0;
}

.choice-dialog-body label {
  font-size: 0.9rem;
  color: var(--editor-text);
}
</style>
