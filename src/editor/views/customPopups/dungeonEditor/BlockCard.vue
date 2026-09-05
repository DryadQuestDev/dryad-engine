<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import { inject } from 'vue';
import Sortable from 'sortablejs';
import RowEditor from './RowEditor.vue';
import SceneEditor from './SceneEditor.vue';
import RichContentEditor from './PlainEditor.vue';
import { inputMatchesSearch } from './searchState';
import { tagWithUid } from './uid';
import { focusFieldAt, type RevealRequest } from './reveal';

const sceneExistsForBlock = inject<(blockIndex: number, sceneId: string) => boolean>('sceneExistsForBlock');

function sceneExistsForRow(rowIndex: number): boolean {
  if (!sceneExistsForBlock) return false;
  if (props.block.kind !== 'encounter') return false;
  const row = props.block.rows[rowIndex];
  if (!row || row.kind !== 'choice') return false;
  const encId = (props.block as any).id || 'encounter';
  const choiceId = (row as any).name || 'choice';
  return sceneExistsForBlock(props.index, `${encId}~${choiceId}`);
}
import type { Block, Row, SceneBlock } from '../../../../utility/dungeonEditor/ast';
import { isCommentLine } from '../../../../utility/dungeonEditor/comments';
import type { LintIssue } from '../../../../utility/dungeonEditor/lint';

type QuestKind = 'title' | 'main_stage' | 'goal' | 'goal_stage';

function questKindOf(id: string | undefined): QuestKind | null {
  if (!id) return null;
  const parts = id.split('.');
  if (parts.length === 2 && parts[1] === 'main') return 'title';
  if (parts.length === 2 && parts[1] && parts[1] !== 'main') return 'goal';
  if (parts.length === 3 && parts[1] === 'main') return 'main_stage';
  if (parts.length === 3 && parts[1] && parts[1] !== 'main') return 'goal_stage';
  return null;
}

const questLabel: Record<QuestKind, string> = {
  title: 'Quest Title',
  main_stage: 'Main Stage',
  goal: 'Quest Goal',
  goal_stage: 'Goal Stage',
};

const props = withDefaults(defineProps<{
  block: Block;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  issues?: LintIssue[];
  locked?: boolean;
  /** Focus request aimed at this block; `null` for every other block. */
  reveal?: RevealRequest | null;
}>(), { issues: () => [], locked: false, reveal: null });

const paramsHasIssue = computed(() =>
  (props.issues ?? []).some((i) => i.field === 'paramsRaw'),
);
const issueSummary = computed(() =>
  (props.issues ?? []).map((i) => i.message).join('\n'),
);

const NO_RANGES: Array<[number, number]> = [];
// Ranges inside the merged prose textarea, in its model coordinates.
const proseIssueRanges = computed<Array<[number, number]>>(() => {
  const out: Array<[number, number]> = [];
  for (const issue of props.issues ?? []) {
    const at = issue.at;
    if (at?.target === 'prose' && at.start !== undefined) out.push([at.start, at.end ?? at.start + 1]);
  }
  return out.length ? out : NO_RANGES;
});
const rowParamsErrors = computed(() => {
  const set = new Set<number>();
  for (const issue of props.issues ?? []) {
    const at = issue.at;
    if (at?.target === 'row-params' && at.rowIndex !== undefined) set.add(at.rowIndex);
  }
  return set;
});

// Route the reveal to whichever child owns the target; children receive
// `null` unless it is theirs, so their watchers stay quiet.
const proseReveal = computed(() => (props.reveal?.at.target === 'prose' ? props.reveal : null));
const sceneReveal = computed(() => {
  const r = props.reveal;
  return r && (r.at.target === 'column-content' || r.at.target === 'column-params') ? r : null;
});
function rowReveal(rowIndex: number): RevealRequest | null {
  const r = props.reveal;
  if (!r || (r.at.target !== 'row-params' && r.at.target !== 'row-text')) return null;
  return r.at.rowIndex === rowIndex ? r : null;
}

const paramsInputRef = ref<InstanceType<typeof InputText> | null>(null);
const rawTextareaRef = ref<HTMLTextAreaElement | null>(null);

watch(() => props.reveal, (r) => {
  if (!r) return;
  nextTick(() => {
    if (r.at.target === 'header-params') focusFieldAt(paramsInputRef.value, r.at.start, r.at.end);
    else if (r.at.target === 'raw') focusFieldAt(rawTextareaRef.value, r.at.start, r.at.end);
  });
});

const questKind = computed<QuestKind | null>(() => {
  if (props.block.kind !== 'template') return null;
  return questKindOf(props.block.id);
});

const questDisplay = computed(() => (questKind.value ? questLabel[questKind.value] : null));

const labelTooltip = computed(() => {
  if (questDisplay.value) return questDisplay.value;
  if (props.block.kind === 'encounter' && (props.block as any).id === 'description') return 'Description';
  return kindLabel[props.block.kind] ?? '';
});

// All events carry the block's `index` as the first arg. Lets the parent
// bind plain function references (e.g. `@update:block="updateBlock"`)
// instead of inline arrows that close over `item.idx` — those create a new
// listener reference per render and force a re-render of every visible
// BlockCard on every keystroke.
const emit = defineEmits<{
  'update:block': [idx: number, block: Block];
  'remove': [idx: number];
  'move-up': [idx: number];
  'move-down': [idx: number];
  'insert-scene': [idx: number, sceneId: string];
}>();

function onInsertSceneForChoice(rowIndex: number) {
  if (props.block.kind !== 'encounter') return;
  const row = props.block.rows[rowIndex];
  if (row.kind !== 'choice') return;
  const encId = props.block.id || 'encounter';
  const choiceId = row.name || 'choice';
  emit('insert-scene', props.index, `${encId}~${choiceId}`);
}

const kindLabel: Record<string, string> = {
  room: 'Room',
  encounter: 'Encounter',
  scene: 'Scene',
  template: 'Template',
  raw: 'Raw',
};

const kindSigil: Record<string, string> = {
  room: '^',
  encounter: '@',
  scene: '#',
  template: '$',
  raw: '',
};

function isTextLike(row: Row): boolean {
  return row.kind === 'text' || row.kind === 'empty' || row.kind === 'comment';
}

function rowToLine(row: Row): string {
  if (row.kind === 'text') return row.text;
  if (row.kind === 'empty') return '';
  if (row.kind === 'comment') return row.text;
  return '';
}

type Group =
  | { kind: 'text'; value: string }
  | { kind: 'struct'; rowIndex: number };

// Generic body groups — only used by encounter/template. Scene has its own editor.
// An encounter/template always has exactly ONE text group (all prose merged),
// rendered after any struct rows (choices). Saving a text edit always rewrites
// the block as: [structs in original order..., merged text rows].
const groups = computed<Group[]>(() => {
  const b = props.block;
  if (b.kind !== 'encounter' && b.kind !== 'template') return [];

  const out: Group[] = [];
  const textLines: string[] = [];

  b.rows.forEach((row, idx) => {
    if (isTextLike(row)) {
      textLines.push(rowToLine(row));
    } else {
      out.push({ kind: 'struct', rowIndex: idx });
    }
  });

  out.push({ kind: 'text', value: textLines.join('\n') });
  return out;
});

function linesToRows(value: string): Row[] {
  if (value === '') return [];
  return value.split('\n').map((line): Row => {
    if (line === '') return { kind: 'empty' };
    if (isCommentLine(line)) return { kind: 'comment', text: line };
    return { kind: 'text', text: line };
  });
}

function updateHeader(field: 'id' | 'paramsRaw', value: string) {
  const b = { ...props.block } as any;
  if (field === 'paramsRaw') {
    b.paramsRaw = value ? value : undefined;
  } else {
    b.id = value;
  }
  emit('update:block', props.index, b);
}

function updateTextGroup(value: string) {
  if (props.block.kind !== 'encounter' && props.block.kind !== 'template') return;
  // Drop every existing text-like row, then append the new prose as one block at the end.
  const rows = props.block.rows.filter((r) => !isTextLike(r));
  rows.push(...linesToRows(value));
  emit('update:block', props.index, { ...props.block, rows });
}

function findStructIndex(rows: Row[], from: number, direction: -1 | 1): number {
  for (let i = from + direction; i >= 0 && i < rows.length; i += direction) {
    if (!isTextLike(rows[i])) return i;
  }
  return -1;
}

function canMoveStruct(rowIndex: number, direction: -1 | 1): boolean {
  if (props.block.kind !== 'encounter' && props.block.kind !== 'template') return false;
  return findStructIndex(props.block.rows, rowIndex, direction) !== -1;
}

function updateRow(rowIndex: number, row: Row) {
  if (props.block.kind !== 'encounter' && props.block.kind !== 'template') return;
  const rows = [...props.block.rows];
  rows[rowIndex] = row;
  emit('update:block', props.index, { ...props.block, rows });
}

function removeRow(rowIndex: number) {
  if (props.block.kind !== 'encounter' && props.block.kind !== 'template') return;
  const rows = props.block.rows.filter((_, i) => i !== rowIndex);
  emit('update:block', props.index, { ...props.block, rows });
}

function moveRow(rowIndex: number, direction: -1 | 1) {
  if (props.block.kind !== 'encounter' && props.block.kind !== 'template') return;
  const rows = [...props.block.rows];
  const target = findStructIndex(rows, rowIndex, direction);
  if (target === -1) return;
  [rows[rowIndex], rows[target]] = [rows[target], rows[rowIndex]];
  emit('update:block', props.index, { ...props.block, rows });
}

// Drag-reorder of `!choice` rows within an encounter/template body. Other
// rows (text/comment/code) stay in place — only choice rows are draggable
// and their relative positions in `block.rows` are remapped from the new
// DOM order. `newChoiceUids` is the choice rows' `__uid` values in their
// new visual order (DOM order after the drop). Uids are stable per row
// identity, so the mapping survives Vue's positional reuse of components.
function reorderChoices(newChoiceUids: number[]) {
  if (props.block.kind !== 'encounter' && props.block.kind !== 'template') return;
  const choicePositions: number[] = [];
  const uidToRow = new Map<number, Row>();
  props.block.rows.forEach((r, i) => {
    if (r.kind !== 'choice') return;
    choicePositions.push(i);
    const uid = (r as any).__uid;
    if (typeof uid === 'number') uidToRow.set(uid, r);
  });
  if (choicePositions.length !== newChoiceUids.length) return;
  const newRows = [...props.block.rows];
  for (let k = 0; k < choicePositions.length; k++) {
    const r = uidToRow.get(newChoiceUids[k]);
    if (!r) return; // bail on any unknown uid — better than silent corruption
    newRows[choicePositions[k]] = r;
  }
  emit('update:block', props.index, { ...props.block, rows: newRows });
}

// Wire SortableJS to the body container. Only `[data-row-kind=choice]`
// elements are draggable (text-groups stay pinned). On end, read DOM order
// and call reorderChoices.
const bodyRef = ref<HTMLElement | null>(null);
let sortable: Sortable | null = null;

watch(bodyRef, (el) => {
  if (sortable) { sortable.destroy(); sortable = null; }
  if (!el) return;
  if (props.block.kind !== 'encounter' && props.block.kind !== 'template') return;
  sortable = Sortable.create(el, {
    animation: 150,
    draggable: '[data-row-kind=choice]',
    handle: '.row-drag-handle',
    ghostClass: 'choice-drag-ghost',
    onEnd: () => {
      if (!el) return;
      const choiceEls = el.querySelectorAll('[data-row-kind=choice]');
      const newOrder: number[] = [];
      choiceEls.forEach((c) => {
        const uid = parseInt(c.getAttribute('data-row-uid') ?? '-1', 10);
        if (uid >= 0) newOrder.push(uid);
      });
      reorderChoices(newOrder);
    },
  });
});

onBeforeUnmount(() => {
  if (sortable) { sortable.destroy(); sortable = null; }
});

function addChoice() {
  if (props.block.kind !== 'encounter') return;
  emit('update:block', props.index, {
    ...props.block,
    rows: [...props.block.rows, tagWithUid({ kind: 'choice', name: '' }) as Row],
  });
}

function updateRawText(v: string) {
  if (props.block.kind !== 'raw') return;
  emit('update:block', props.index, { ...props.block, text: v });
}

function onSceneUpdate(newScene: SceneBlock) {
  emit('update:block', props.index, newScene);
}
</script>

<template>
  <div class="block-card" :class="[
    `block--${block.kind}`,
    block.kind === 'encounter' && (block as any).id === 'description' ? 'block--encounter-description' : '',
    block.kind === 'scene' && !((block as any).id ?? '').includes('~') ? 'block--scene-event' : '',
    questKind ? `block--quest-${questKind.replace('_', '-')}` : '',
    issues && issues.length ? 'block--has-issues' : '',
  ]">
    <div class="block-header">
      <span class="kind-badge">
        <span class="sigil" v-tooltip.top="labelTooltip">{{ kindSigil[block.kind] }}</span>
        <span v-if="issues && issues.length" class="lint-badge" :title="issueSummary">
          ⚠ {{ issues.length }}
        </span>
      </span>
      <template v-if="block.kind !== 'raw'">
        <InputText :model-value="(block as any).id" @update:model-value="(v: any) => updateHeader('id', v ?? '')"
          placeholder="id" class="id-input" :disabled="locked"
          :class="{ 'input-search-hit': !!(block as any).id && inputMatchesSearch(kindSigil[block.kind] + (block as any).id) }" />
        <InputText v-if="block.kind !== 'room'" ref="paramsInputRef" :model-value="(block as any).paramsRaw ?? ''"
          @update:model-value="(v: any) => updateHeader('paramsRaw', v ?? '')" placeholder="{params}"
          class="params-input"
          :class="{ 'params-input--error': paramsHasIssue, 'input-search-hit': inputMatchesSearch((block as any).paramsRaw) }" />
      </template>
      <div class="block-actions">
        <Button v-if="!locked" icon="pi pi-arrow-up" severity="secondary" text rounded size="small"
          :disabled="!canMoveUp" @click="emit('move-up', props.index)" aria-label="Move block up" />
        <Button v-if="!locked" icon="pi pi-arrow-down" severity="secondary" text rounded size="small"
          :disabled="!canMoveDown" @click="emit('move-down', props.index)" aria-label="Move block down" />
        <Button v-if="!locked" icon="pi pi-trash" severity="danger" text rounded size="small" @click="emit('remove', props.index)"
          aria-label="Remove block" />
        <span v-if="locked" class="locked-indicator" title="This block is required and cannot be moved or removed">
          <i class="pi pi-lock"></i>
        </span>
      </div>
    </div>

    <!-- Raw body -->
    <div v-if="block.kind === 'raw'" class="raw-body">
      <textarea ref="rawTextareaRef" class="raw-textarea" :value="block.text"
        @input="(e: any) => updateRawText(e.target.value)" spellcheck="false" rows="3" />
    </div>

    <!-- Scene body — dedicated grid editor -->
    <SceneEditor v-else-if="block.kind === 'scene'" :block="block" :issues="issues" :reveal="sceneReveal"
      @update:block="onSceneUpdate" />

    <!-- Encounter / Template body — flat row groups -->
    <div v-else-if="block.kind === 'encounter' || block.kind === 'template'" ref="bodyRef" class="block-body">
      <template v-for="(group, gIdx) in groups"
        :key="group.kind === 'struct' ? `row:${(block.rows[group.rowIndex] as any).__uid ?? group.rowIndex}` : `text:${gIdx}`">
        <div v-if="group.kind === 'text'" class="text-group">
          <RichContentEditor :model-value="group.value"
            @update:model-value="(v: string) => updateTextGroup(v)"
            placeholder="content…" class="text-group-area"
            :issue-ranges="proseIssueRanges" :reveal="proseReveal" />
        </div>
        <RowEditor v-else :row="(block.rows[group.rowIndex] as Row)" :index="group.rowIndex"
          :can-move-up="canMoveStruct(group.rowIndex, -1)" :can-move-down="canMoveStruct(group.rowIndex, 1)"
          @update:row="(r: Row) => updateRow(group.rowIndex, r)" @remove="removeRow(group.rowIndex)"
          @move-up="moveRow(group.rowIndex, -1)" @move-down="moveRow(group.rowIndex, 1)"
          :scene-exists="sceneExistsForRow(group.rowIndex)"
          :params-error="rowParamsErrors.has(group.rowIndex)" :reveal="rowReveal(group.rowIndex)"
          @insert-scene="onInsertSceneForChoice(group.rowIndex)"
          v-bind="{ 'data-row-kind': (block.rows[group.rowIndex] as Row).kind, 'data-row-uid': (block.rows[group.rowIndex] as any).__uid }" />
      </template>

      <div v-if="block.kind === 'encounter'" class="add-row-toolbar">
        <button type="button" class="add-btn add-btn--choice" @click="addChoice">
          <span class="add-btn__plus">+</span>
          <span class="add-btn__sigil">!</span>
          <span class="add-btn__label">choice</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.block-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  /* Force own compositor layer. Without this, moving a block (insert / drag /
     up-down arrows) leaves stale paint inside this card — icons, the Quill
     toolbar, sometimes the whole card go invisible until any unrelated style
     change forces a repaint. The contenteditable subtree appears to break
     the browser's default paint invalidation when its ancestor moves. */
  transform: translateZ(0);
}

.block--room {
  background: linear-gradient(135deg, rgba(255, 213, 79, 0.28), rgba(255, 235, 59, 0.10));
  border-color: rgba(245, 127, 23, 0.55);
  box-shadow: 0 1px 3px rgba(245, 127, 23, 0.18);
}

.block--room .block-header {
  background: transparent;
  padding: 0.75rem 1rem;
  border-bottom: none;
}

.block--room .sigil {
  font-size: 1.35rem;
  color: #f57f17;
}

.block--room .id-input :deep(input) {
  font-size: 1.05rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.5);
}

.block--encounter {
  border-left: 3px solid #9c27b0;
}

.block--encounter-description {
  border-left: 3px solid #f9a825;
  background: rgba(255, 213, 79, 0.08);
}

.block--scene {
  border-left: 3px solid #81c784;
}

.block--scene-event {
  border-left: 3px solid #1976d2;
}

.block--template {
  border-left: 3px solid #9e9e9e;
}

.block--quest-title {
  border-left: 3px solid #00838f;
  background: rgba(0, 188, 212, 0.08);
}

.block--quest-title .sigil { color: #00838f; }

.block--quest-main-stage {
  border-left: 3px solid #e65100;
  background: rgba(255, 183, 77, 0.1);
}

.block--quest-main-stage .sigil { color: #e65100; }

.block--quest-goal {
  border-left: 3px solid #c17900;
  background: rgba(255, 235, 59, 0.12);
}

.block--quest-goal .sigil { color: #c17900; }

.block--quest-goal-stage {
  border-left: 3px solid #e65100;
  background: rgba(255, 183, 77, 0.1);
}

.block--quest-goal-stage .sigil { color: #e65100; }

.block--raw {
  border-left: 3px solid #888;
  opacity: 0.85;
}

.block--has-issues {
  box-shadow: 0 0 0 2px rgba(211, 47, 47, 0.55), 0 1px 3px rgba(211, 47, 47, 0.15);
}

.lint-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.05rem 0.4rem;
  margin-left: 0.3rem;
  background: #d32f2f;
  color: #fff;
  border-radius: 10px;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: help;
  white-space: pre-line;
}

input.params-input--error,
.params-input--error :deep(input) {
  outline: 2px solid #d32f2f;
  outline-offset: -1px;
}

.block-header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: rgba(0, 0, 0, 0.15);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.block--encounter .block-header {
  background: rgba(123, 31, 162, 0.2);
}

.block--encounter-description .block-header {
  background: rgba(245, 127, 23, 0.22);
}

.block--scene .block-header {
  background: rgba(46, 125, 50, 0.18);
}

.block--scene-event .block-header {
  background: rgba(25, 118, 210, 0.18);
}

.block--template .block-header {
  background: rgba(97, 97, 97, 0.2);
}

.block--quest-title .block-header {
  background: rgba(0, 131, 143, 0.18);
}

.block--quest-main-stage .block-header {
  background: rgba(230, 81, 0, 0.2);
}

.block--quest-goal .block-header {
  background: rgba(193, 121, 0, 0.22);
}

.block--quest-goal-stage .block-header {
  background: rgba(230, 81, 0, 0.2);
}

.kind-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.sigil {
  font-weight: 700;
  font-size: 1rem;
}

.block--room .sigil {
  color: #f57f17;
}

.block--encounter .sigil {
  color: #9c27b0;
}

.block--encounter-description .sigil {
  color: #f57f17;
}

.block--scene .sigil {
  color: #81c784;
}

.block--scene-event .sigil {
  color: #1976d2;
}

.block--template .sigil {
  color: #757575;
}

.sigil {
  cursor: help;
}

.id-input {
  flex: 0 1 240px;
}

.params-input {
  flex: 1 1 0;
  min-width: 120px;
}

input.params-input {
  color: #9c27b0 !important;
  font-weight: 600;
}

.flex-spacer {
  /* Removed — params-input now stretches to fill remaining space. */
}

.block-actions {
  display: flex;
  gap: 0.1rem;
  flex: 0 0 auto;
}

.block-body {
  padding: 0.5rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.text-group {
  padding: 0.1rem 0;
}

.text-group-area {
  width: 100%;
}

.text-group-area :deep(textarea) {
  width: 100%;
  resize: vertical;
  min-height: 2.25rem;
}

.add-row-toolbar {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  padding: 0.5rem 0 0.25rem;
  border-top: 1px dashed rgba(0, 0, 0, 0.1);
  margin-top: 0.25rem;
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

.add-btn--choice {
  border-color: rgba(156, 39, 176, 0.5);
  color: #7b1fa2;
}

.add-btn--choice:hover {
  background: rgba(156, 39, 176, 0.12);
  border-color: #7b1fa2;
}

.raw-body {
  padding: 0.5rem 0.75rem;
}

.raw-textarea {
  width: 100%;
  max-width: 800px;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.85rem;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  padding: 0.5rem;
  color: inherit;
  resize: vertical;
}
</style>
