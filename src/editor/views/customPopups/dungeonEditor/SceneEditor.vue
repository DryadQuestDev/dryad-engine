<script setup lang="ts">
import { ref } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
import RichContentEditor from './PlainEditor.vue';
import type { SceneBlock, SceneColumn, SceneRow } from '../../../../utility/dungeonEditor/ast';
import { newSceneColumn, newSceneRow } from '../../../../utility/dungeonEditor/ast';
import { tagWithUid } from './uid';
import { inputMatchesSearch } from './searchState';

const props = defineProps<{ block: SceneBlock }>();
const emit = defineEmits<{ 'update:block': [block: SceneBlock] }>();

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
  <div class="scene-editor">
    <div v-if="block.rows.length === 0" class="scene-empty">
      No rows yet. Click <strong>+ Row</strong> below to add the first one.
    </div>

    <div v-for="(row, rowIdx) in block.rows" :key="(row as any).__uid ?? rowIdx" class="scene-row"
      v-bind="{ 'data-scene-row': rowIdx }">
      <div class="row-header">
        <span class="row-label">Row {{ rowIdx + 1 }}</span>
        <div class="flex-spacer" />
        <Button icon="pi pi-arrow-up" severity="secondary" text rounded size="small" :disabled="rowIdx === 0"
          @click="moveRow(rowIdx, -1)" aria-label="Move row up" />
        <Button icon="pi pi-arrow-down" severity="secondary" text rounded size="small"
          :disabled="rowIdx === block.rows.length - 1" @click="moveRow(rowIdx, 1)" aria-label="Move row down" />
        <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="removeRow(rowIdx)"
          aria-label="Remove row" />
      </div>

      <div class="columns-list">
        <div v-for="(column, colIdx) in row.columns" :key="(column as any).__uid ?? colIdx" class="scene-column"
          :class="`col--${column.kind === '~' ? 'tilde' : 'percent'}`" v-bind="{ 'data-scene-col': colIdx }">
          <div class="col-header">
            <span class="col-index">{{ colIdx + 1 }}</span>
            <span class="col-sigil"
              v-tooltip.top="column.kind === '~' ? 'Choice' : 'Column'">{{ column.kind }}</span>
            <template v-if="column.kind === '~'">
              <InputText :model-value="column.name ?? ''"
                @update:model-value="(v: any) => updateColumn(rowIdx, colIdx, 'name', v ?? '')"
                placeholder="name" class="name-input"
                :class="{ 'input-search-hit': inputMatchesSearch(column.name) }" />
              <InputText :model-value="column.paramsRaw ?? ''"
                @update:model-value="(v: any) => updateColumn(rowIdx, colIdx, 'paramsRaw', v ? v : undefined)"
                placeholder="{params}" class="params-input"
                :class="{ 'input-search-hit': inputMatchesSearch(column.paramsRaw) }" />
            </template>
            <div v-else class="col-spacer" />
            <Button icon="pi pi-chevron-up" severity="secondary" text rounded size="small" :disabled="colIdx === 0"
              @click="moveColumn(rowIdx, colIdx, -1)" aria-label="Move column up" />
            <Button icon="pi pi-chevron-down" severity="secondary" text rounded size="small"
              :disabled="colIdx === row.columns.length - 1" @click="moveColumn(rowIdx, colIdx, 1)"
              aria-label="Move column down" />
            <Button icon="pi pi-times" severity="danger" text rounded size="small"
              @click="removeColumn(rowIdx, colIdx)" aria-label="Remove column" />
          </div>
          <RichContentEditor :model-value="column.content"
            @update:model-value="(v: string) => updateColumn(rowIdx, colIdx, 'content', v)"
            placeholder="content…" class="content-area" />
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
          <span class="add-btn__label">choice</span>
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

    <Dialog v-model:visible="choiceDialogVisible" modal header="Add choice row" :style="{ width: '20rem' }">
      <div class="choice-dialog-body">
        <label for="choice-count">How many choices?</label>
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
  color: #888;
  font-style: italic;
  padding: 0.5rem 0;
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
  color: #81c784;
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.flex-spacer {
  flex: 1 1 0;
}

.columns-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.scene-column {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.18);
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  transform: translateZ(0);
}

.col--tilde {
  border-left: 2px solid #4db6ac;
}

.col--percent {
  border-left: 2px solid #7986cb;
}

.col-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.col-index {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.75rem;
  color: #888;
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
  color: #4db6ac;
}

.col--percent .col-sigil {
  color: #7986cb;
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

input.params-input {
  color: #9c27b0 !important;
  font-weight: 600;
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
  border-top: 1px dashed rgba(0, 0, 0, 0.1);
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
  color: #3f51b5;
}

.add-btn--percent:hover {
  background: rgba(121, 134, 203, 0.14);
  border-color: #3f51b5;
}

.add-btn--tilde {
  border-color: rgba(77, 182, 172, 0.55);
  color: #00897b;
}

.add-btn--tilde:hover {
  background: rgba(77, 182, 172, 0.14);
  border-color: #00897b;
}

.add-btn--row {
  border-color: rgba(129, 199, 132, 0.6);
  color: #2e7d32;
  padding: 0.4rem 1rem;
  font-size: 0.88rem;
}

.add-btn--row:hover {
  background: rgba(129, 199, 132, 0.18);
  border-color: #2e7d32;
}

.add-btn--row-tilde {
  border-color: rgba(77, 182, 172, 0.6);
  color: #00897b;
}

.add-btn--row-tilde:hover {
  background: rgba(77, 182, 172, 0.18);
  border-color: #00897b;
}

.add-btn--row-tilde .add-btn__sigil {
  color: #4db6ac;
}

.choice-dialog-body {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.25rem 0;
}

.choice-dialog-body label {
  font-size: 0.9rem;
  color: #cfcfcf;
}
</style>
