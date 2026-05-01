<script setup lang="ts">
import { computed } from 'vue';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Button from 'primevue/button';
import RichContentEditor from './RichContentEditor.vue';
import { inputMatchesSearch } from './searchState';
import type { Block, Row, TemplateBlock } from '../../../../utility/dungeonEditor/ast';
import { newTemplate } from '../../../../utility/dungeonEditor/ast';
import type { QuestGroup } from '../../../../utility/dungeonEditor/quest';
import { tagBlockDeep as tagBlock } from './uid';

const props = defineProps<{
  group: QuestGroup;
  blocks: Block[];
}>();

const emit = defineEmits<{
  'update:block': [idx: number, block: Block];
  'add-block-after': [afterIdx: number, block: Block];
  'remove-block': [idx: number];
  'rename-quest-prefix': [oldPrefix: string, newPrefix: string];
  // Move a single block by ±1 — used for stages (each stage is one block,
  // its neighbor is a stage in the same goal).
  'move-block': [idx: number, direction: -1 | 1];
  // Move a goal range (its block + all its stages) past the adjacent goal.
  // Popup splices the range out and reinserts at the target offset.
  'move-goal': [questId: string, goalIdInGroup: string, direction: -1 | 1];
  // Move the entire quest range past its adjacent neighbor in `groupedItems`.
  'move-quest': [questId: string, direction: -1 | 1];
  // Remove all blocks belonging to the quest range.
  'remove-quest': [questId: string];
}>();

// --- Helpers ---------------------------------------------------------------

function asTemplate(idx: number): TemplateBlock | null {
  const b = props.blocks[idx];
  if (!b || b.kind !== 'template') return null;
  return b as TemplateBlock;
}

function bodyText(idx: number): string {
  const b = asTemplate(idx);
  if (!b) return '';
  return b.rows
    .filter((r) => r.kind === 'text' || r.kind === 'empty')
    .map((r) => (r.kind === 'text' ? r.text : ''))
    .join('\n');
}

function setBody(idx: number, value: string) {
  const b = asTemplate(idx);
  if (!b) return;
  const rows: Row[] = value === ''
    ? []
    : value.split('\n').map((line): Row => {
      if (line === '') return { kind: 'empty' };
      return { kind: 'text', text: line };
    });
  emit('update:block', idx, { ...b, rows });
}

function setTemplateParams(idx: number, newParams: string) {
  const b = asTemplate(idx);
  if (!b) return;
  emit('update:block', idx, { ...b, paramsRaw: newParams ? newParams : undefined });
}

// --- Progress helpers ------------------------------------------------------
//
// Quests use a single `progress` action: `{progress: 1}` finishes the goal,
// `{progress: 2}` finishes the whole quest. The action lives on stages —
// goals themselves don't have any params.

const PROGRESS_OPTIONS = [
  { label: '-', value: null as number | null },
  { label: 'Finishes goal(1)', value: 1 },
  { label: 'Finishes quest(2)', value: 2 },
];

function progressFromParams(paramsRaw: string | null | undefined): number | null {
  if (!paramsRaw) return null;
  const m = paramsRaw.match(/progress\s*:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function setStageProgress(idx: number, value: number | null) {
  setTemplateParams(idx, value === null ? '' : `{progress: ${value}}`);
}

// id-portion helpers — split the dot-segments
function lastSegment(idx: number): string {
  const b = asTemplate(idx);
  if (!b) return '';
  const parts = b.id.split('.');
  return parts[parts.length - 1] ?? '';
}

function fullId(idx: number): string {
  const b = asTemplate(idx);
  return b ? b.id : '';
}

function copyFullId(idx: number) {
  const id = fullId(idx);
  if (!id) return;
  navigator.clipboard?.writeText(id);
}

function setLastSegment(idx: number, newSeg: string) {
  const b = asTemplate(idx);
  if (!b) return;
  const parts = b.id.split('.');
  parts[parts.length - 1] = newSeg;
  emit('update:block', idx, { ...b, id: parts.join('.') });
}

function setGoalId(goalBlockIdx: number, newGoalId: string) {
  const b = asTemplate(goalBlockIdx);
  if (!b) return;
  // Skip empty / whitespace-only ids — clearing the input would produce
  // `<questId>.` which `questKindOf` treats as non-quest, splitting the
  // group out of the QuestCard. Input snaps back to the existing id on
  // next render.
  const trimmed = newGoalId.trim();
  if (!trimmed) return;
  // Renaming a goal also renames all `$<questId>.<oldGoalId>.*` stages.
  const parts = b.id.split('.');
  const oldGoalId = parts[1];
  if (trimmed === oldGoalId) return;
  const newId = `${parts[0]}.${trimmed}`;
  emit('update:block', goalBlockIdx, { ...b, id: newId });
  // Then ask the popup to rename every other block whose id begins with
  // `<questId>.<oldGoalId>.` to `<questId>.<newGoalId>.`.
  emit('rename-quest-prefix', `${parts[0]}.${oldGoalId}.`, `${parts[0]}.${trimmed}.`);
}

function setQuestId(newQuestId: string) {
  const oldId = props.group.questId;
  if (newQuestId === oldId || !newQuestId) return;
  emit('rename-quest-prefix', `${oldId}.`, `${newQuestId}.`);
}

// --- Unified goal model ---------------------------------------------------
//
// `main` is just the first goal — locked (its id can't change, can't be
// deleted) but otherwise rendered with the same template as custom goals:
// a header with id input, a body editor, a stages list, and a `+ Stage`
// button. Custom goals are append-after-main.

type UnifiedGoal = {
  goalId: string;
  blockIdx: number;       // -1 if author has stages but no goal block (degenerate)
  stageIdxs: number[];
  locked: boolean;
};

const unifiedGoals = computed<UnifiedGoal[]>(() => {
  const out: UnifiedGoal[] = [];
  // Main first — synthesized from titleBlockIdx + mainStageIdxs.
  if (props.group.titleBlockIdx !== null || props.group.mainStageIdxs.length > 0) {
    out.push({
      goalId: 'main',
      blockIdx: props.group.titleBlockIdx ?? -1,
      stageIdxs: props.group.mainStageIdxs,
      locked: true,
    });
  }
  for (const g of props.group.goals) {
    out.push({ goalId: g.goalId, blockIdx: g.blockIdx, stageIdxs: g.stageIdxs, locked: false });
  }
  return out;
});

// --- Insert positions ------------------------------------------------------

// Last index belonging to a goal (its block + all its stages). New stages
// for that goal go right after that.
function insertAfterGoal(goal: UnifiedGoal): number {
  if (goal.stageIdxs.length > 0) return goal.stageIdxs[goal.stageIdxs.length - 1];
  if (goal.blockIdx >= 0) return goal.blockIdx;
  // Degenerate: no block AND no stages — fall back to the quest's start.
  return props.group.startIndex;
}

// Last index of the entire quest group — `+ Goal` inserts after this.
function insertAfterAll(): number {
  return props.group.endIndex - 1;
}

// --- Add buttons -----------------------------------------------------------

function nextStageIdFor(goal: UnifiedGoal): string {
  const used = new Set(
    goal.stageIdxs.map((i) => asTemplate(i)?.id.split('.').pop() ?? ''),
  );
  let n = goal.stageIdxs.length + 1;
  while (used.has(`stage_${n}`)) n++;
  return `stage_${n}`;
}

function nextGoalId(): string {
  const used = new Set(props.group.goals.map((g) => g.goalId));
  let n = props.group.goals.length + 1;
  while (used.has(`goal_${n}`)) n++;
  return `goal_${n}`;
}

function addStage(goal: UnifiedGoal) {
  const id = `${props.group.questId}.${goal.goalId}.${nextStageIdFor(goal)}`;
  emit('add-block-after', insertAfterGoal(goal), tagBlock(newTemplate(id)));
}

function addGoal() {
  const id = `${props.group.questId}.${nextGoalId()}`;
  emit('add-block-after', insertAfterAll(), tagBlock(newTemplate(id)));
}

// --- Remove ---------------------------------------------------------------

function removeIdx(idx: number) {
  emit('remove-block', idx);
}

function removeGoal(goal: UnifiedGoal) {
  // Locked (main) can't be removed.
  if (goal.locked) return;
  // Remove stages last → first, then the goal block, so popup's splice indices
  // stay correct as they shift on each removal.
  for (let i = goal.stageIdxs.length - 1; i >= 0; i--) {
    emit('remove-block', goal.stageIdxs[i]);
  }
  if (goal.blockIdx >= 0) emit('remove-block', goal.blockIdx);
}

// --- Reorder helpers ------------------------------------------------------

function stagePosInGoal(stageIdx: number, goal: UnifiedGoal): number {
  return goal.stageIdxs.indexOf(stageIdx);
}

function canMoveStageUp(stageIdx: number, goal: UnifiedGoal): boolean {
  return stagePosInGoal(stageIdx, goal) > 0;
}

function canMoveStageDown(stageIdx: number, goal: UnifiedGoal): boolean {
  const pos = stagePosInGoal(stageIdx, goal);
  return pos >= 0 && pos < goal.stageIdxs.length - 1;
}

function moveStage(stageIdx: number, direction: -1 | 1) {
  emit('move-block', stageIdx, direction);
}

// Goals start at unifiedGoals index 1 (index 0 is the locked main). A custom
// goal can swap with another custom goal — never with main.
function goalPosInUnified(goalId: string): number {
  return unifiedGoals.value.findIndex((g) => g.goalId === goalId);
}

function canMoveGoalUp(goal: UnifiedGoal): boolean {
  if (goal.locked) return false;
  const pos = goalPosInUnified(goal.goalId);
  return pos > 1; // pos 1 is the first custom goal; can't move past main at 0.
}

function canMoveGoalDown(goal: UnifiedGoal): boolean {
  if (goal.locked) return false;
  const pos = goalPosInUnified(goal.goalId);
  return pos >= 1 && pos < unifiedGoals.value.length - 1;
}

function moveGoal(goal: UnifiedGoal, direction: -1 | 1) {
  if (goal.locked) return;
  emit('move-goal', props.group.questId, goal.goalId, direction);
}

function moveQuest(direction: -1 | 1) {
  emit('move-quest', props.group.questId, direction);
}

function removeQuest() {
  emit('remove-quest', props.group.questId);
}
</script>

<template>
  <div class="quest-card">
    <div class="quest-header">
      <span class="quest-sigil" v-tooltip.top="'Quest'">$</span>
      <span class="quest-label">Quest</span>
      <InputText :model-value="group.questId" @update:model-value="(v: any) => setQuestId(v ?? '')"
        placeholder="quest_id" class="quest-id-input"
        :class="{ 'input-search-hit': inputMatchesSearch(group.questId) }" />
      <div class="flex-spacer" />
      <Button icon="pi pi-arrow-up" severity="secondary" text rounded size="small" @click="moveQuest(-1)"
        v-tooltip.top="'Move quest up'" aria-label="Move quest up" />
      <Button icon="pi pi-arrow-down" severity="secondary" text rounded size="small" @click="moveQuest(1)"
        v-tooltip.top="'Move quest down'" aria-label="Move quest down" />
      <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="removeQuest()"
        v-tooltip.top="'Delete quest'" aria-label="Delete quest" />
    </div>

    <!-- Goals — `main` (locked) and any number of custom goals, all rendered
         identically: header with id input + `+ Stage` button, body editor,
         stage list with id inputs, `+ Goal` at the very end. -->
    <div class="quest-section quest-section--goals">
      <div v-for="goal in unifiedGoals"
        :key="goal.blockIdx >= 0 ? ((blocks[goal.blockIdx] as any).__uid ?? goal.goalId) : `synth:${goal.goalId}`"
        class="quest-goal" :class="{ 'quest-goal--locked': goal.locked }"
        v-bind="goal.blockIdx >= 0 ? { 'data-block-index': goal.blockIdx } : {}">
        <div class="goal-header">
          <span class="goal-marker" v-tooltip.top="goal.locked ? 'Main goal' : 'Goal'">◆</span>
          <InputText :model-value="goal.goalId"
            @update:model-value="(v: any) => goal.locked ? null : setGoalId(goal.blockIdx, v ?? '')"
            placeholder="goal_id" class="goal-id-input" :disabled="goal.locked"
            :class="{ 'input-search-hit': inputMatchesSearch(goal.goalId) }" />
          <div class="flex-spacer" />
          <Button v-if="!goal.locked" icon="pi pi-arrow-up" severity="secondary" text rounded size="small"
            :disabled="!canMoveGoalUp(goal)" @click="moveGoal(goal, -1)" aria-label="Move goal up" />
          <Button v-if="!goal.locked" icon="pi pi-arrow-down" severity="secondary" text rounded size="small"
            :disabled="!canMoveGoalDown(goal)" @click="moveGoal(goal, 1)" aria-label="Move goal down" />
          <Button v-if="!goal.locked" icon="pi pi-trash" severity="danger" text rounded size="small"
            @click="removeGoal(goal)" aria-label="Remove goal" />
        </div>
        <RichContentEditor v-if="goal.blockIdx >= 0" :model-value="bodyText(goal.blockIdx)"
          @update:model-value="(v: string) => setBody(goal.blockIdx, v)"
          :placeholder="goal.locked ? 'quest title…' : 'goal description…'" class="content-area" />
        <div v-for="stageIdx in goal.stageIdxs" :key="(blocks[stageIdx] as any).__uid ?? stageIdx"
          class="quest-goal-stage" v-bind="{ 'data-block-index': stageIdx }">
          <div class="stage-header">
            <span class="stage-marker" v-tooltip.top="'Stage'">▸</span>
            <InputText :model-value="lastSegment(stageIdx)"
              @update:model-value="(v: any) => setLastSegment(stageIdx, v ?? '')" placeholder="stage_id"
              class="stage-id-input" :class="{ 'input-search-hit': inputMatchesSearch(lastSegment(stageIdx)) }" />
            <Select :model-value="progressFromParams((blocks[stageIdx] as any)?.paramsRaw)"
              @update:model-value="(v: number | null) => setStageProgress(stageIdx, v)" :options="PROGRESS_OPTIONS"
              option-label="label" option-value="value" placeholder="-" class="progress-select" />
            <span class="stage-full-id" :title="fullId(stageIdx)">{{ fullId(stageIdx) }}</span>
            <Button icon="pi pi-copy" severity="secondary" text rounded size="small" @click="copyFullId(stageIdx)"
              v-tooltip.top="'Copy full id'" aria-label="Copy stage id" />
            <div class="flex-spacer" />
            <Button icon="pi pi-chevron-up" severity="secondary" text rounded size="small"
              :disabled="!canMoveStageUp(stageIdx, goal)" @click="moveStage(stageIdx, -1)" aria-label="Move stage up" />
            <Button icon="pi pi-chevron-down" severity="secondary" text rounded size="small"
              :disabled="!canMoveStageDown(stageIdx, goal)" @click="moveStage(stageIdx, 1)"
              aria-label="Move stage down" />
            <Button icon="pi pi-times" severity="danger" text rounded size="small" @click="removeIdx(stageIdx)"
              aria-label="Remove goal stage" />
          </div>
          <RichContentEditor :model-value="bodyText(stageIdx)" @update:model-value="(v: string) => setBody(stageIdx, v)"
            placeholder="stage body…" class="content-area" />
        </div>
        <div class="add-toolbar add-toolbar--nested">
          <button type="button" class="add-btn add-btn--stage" @click="addStage(goal)">
            <span class="add-btn__plus">+</span>
            <span class="add-btn__label">Stage</span>
          </button>
        </div>
      </div>
      <div class="add-toolbar">
        <button type="button" class="add-btn add-btn--goal" @click="addGoal">
          <span class="add-btn__plus">+</span>
          <span class="add-btn__label">Goal</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quest-card {
  border: 1px solid rgba(0, 131, 143, 0.45);
  border-left: 3px solid #00838f;
  border-radius: 6px;
  background: linear-gradient(180deg, rgba(0, 188, 212, 0.06), rgba(0, 188, 212, 0.02));
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.5rem 0.6rem;
  /* Own compositor layer — see .block-card for the same fix. */
  transform: translateZ(0);
}

.quest-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid rgba(0, 131, 143, 0.18);
}

.quest-sigil {
  font-family: var(--font-family-mono, monospace);
  font-weight: 700;
  font-size: 1.1rem;
  color: #00838f;
  cursor: help;
}

.quest-label {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #00838f;
  font-weight: 600;
}

.quest-id-input {
  flex: 1 1 200px;
}


.quest-section {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.3rem 0;
}

.section-label {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #00838f;
  font-weight: 700;
  opacity: 0.85;
}

.quest-section--title {
  border-bottom: 1px dashed rgba(0, 131, 143, 0.15);
  padding-bottom: 0.5rem;
}

.quest-stage,
.quest-goal-stage {
  border: 1px solid rgba(230, 81, 0, 0.18);
  background: rgba(255, 183, 77, 0.06);
  border-radius: 4px;
  padding: 0.35rem 0.5rem;
  margin-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  transform: translateZ(0);
}

.quest-goal {
  border: 1px solid rgba(193, 121, 0, 0.22);
  background: rgba(255, 235, 59, 0.05);
  border-radius: 4px;
  padding: 0.4rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  transform: translateZ(0);
}

.stage-header,
.goal-header {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.stage-marker {
  color: #e65100;
  font-weight: 700;
  cursor: help;
}

.goal-marker {
  color: #c17900;
  font-weight: 700;
  cursor: help;
}

.stage-id-input,
.goal-id-input {
  flex: 0 0 180px;
}


.progress-select {
  flex: 0 1 240px;
  min-width: 200px;
}

.stage-full-id {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.78rem;
  color: #888;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: text;
}

.flex-spacer {
  flex: 1 1 auto;
}

.content-area {
  width: 100%;
}

.add-toolbar {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.2rem;
}

.add-toolbar--nested {
  margin-left: 0.5rem;
}

/* Match the in-card add-button convention used by SceneEditor (`+ column`,
   `+ choice`, `+ Row`) and BlockCard (`+ choice`): raw <button> with dashed
   border that solidifies on hover. Per-kind color tinted to fit the quest
   palette (orange for stages, amber for goals). */
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

.add-btn__label {
  letter-spacing: 0.02em;
}

.add-btn--stage {
  border-color: rgba(230, 81, 0, 0.55);
  color: #e65100;
}

.add-btn--stage:hover {
  background: rgba(230, 81, 0, 0.12);
  border-color: #e65100;
}

.add-btn--goal {
  border-color: rgba(193, 121, 0, 0.55);
  color: #c17900;
}

.add-btn--goal:hover {
  background: rgba(193, 121, 0, 0.14);
  border-color: #c17900;
}
</style>
