<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import type { DevChoice, DevChoiceKind } from '../../systems/dungeonSystem';
import type { ConditionExplanation, ConditionGroup } from '../../systems/logicSystem';
import DebugClauses from './DebugClauses.vue';

type ChoiceState = 'shown' | 'hidden' | 'greyed' | 'error';

type ChoiceRow = DevChoice & {
  state: ChoiceState;
  groups: ConditionGroup[];
  note: string | null;
};

const game = Game.getInstance();
const ds = game.dungeonSystem;

const STATE_LABEL: Record<ChoiceState, string> = {
  shown: 'Shown',
  hidden: 'Hidden',
  greyed: 'Greyed out',
  error: 'Error',
};

const KIND_TIP: Record<DevChoiceKind, string> = {
  '~': 'Branch choice',
  '>': 'Inline choice',
  '!': 'Encounter choice',
  menu: 'From a {choices} menu',
};

const sceneId = computed(() => ds.currentSceneId.value);
const place = computed(() => [ds.currentDungeonId.value, ds.currentRoomId.value].filter(Boolean).join(' › '));

function readFlag(read: () => boolean): boolean | null {
  try {
    return read();
  } catch {
    return null;
  }
}

function inReplayLock(row: DevChoice): boolean {
  return !!game.getState('replay_mode') && !game.getState('replay_mode_unlock_choices')
    && !ds.usedDungeonData.value.visitedChoices.has(row.id);
}

// The chip comes from the choice itself, as the choice list reads it; the clauses say why.
// A group that throws is not read through the real computed, which would throw and report again.
function rowState(row: DevChoice, visibility: ConditionExplanation, availability: ConditionExplanation): { state: ChoiceState; note: string | null } {
  if (visibility.throws) return { state: 'error', note: null };
  const visible = readFlag(() => row.choice.isChoiceVisible());
  if (visible === null) return { state: 'error', note: null };
  if (!visible) return { state: 'hidden', note: visibility.pass ? 'Hidden by an action on the choice' : null };
  if (availability.throws) return { state: 'error', note: null };
  const available = readFlag(() => row.choice.isChoiceAvailable());
  if (available === null) return { state: 'error', note: null };
  if (!available) {
    if (!availability.pass) return { state: 'greyed', note: null };
    return { state: 'greyed', note: inReplayLock(row) ? 'Locked in replay' : 'Greyed out by an action on the choice' };
  }
  return { state: 'shown', note: null };
}

const rows = computed<ChoiceRow[]>(() => ds.getDevChoices().map(row => {
  const visibility = game.logicSystem.explainCondition(row.choice.params, false);
  const availability = game.logicSystem.explainCondition(row.choice.params, true);
  return { ...row, ...rowState(row, visibility, availability), groups: [...visibility.groups, ...availability.groups] };
}));

const hiddenCount = computed(() => rows.value.filter(r => r.state === 'hidden').length);
const greyedCount = computed(() => rows.value.filter(r => r.state === 'greyed').length);
const errorCount = computed(() => rows.value.filter(r => r.state === 'error').length);
</script>

<template>
  <div class="debug-scene">
    <div class="scene-header">
      <code v-if="sceneId" class="scene-id">{{ sceneId }}</code>
      <div v-else class="scene-none">
        <strong>Not in a scene</strong>
        <code v-if="place" class="scene-place">{{ place }}</code>
      </div>
      <div v-if="rows.length" class="scene-summary">
        <span>{{ rows.length }} {{ rows.length === 1 ? 'choice' : 'choices' }}</span>
        <span v-if="hiddenCount" class="summary-hidden">{{ hiddenCount }} hidden</span>
        <span v-if="greyedCount" class="summary-greyed">{{ greyedCount }} greyed out</span>
        <span v-if="errorCount" class="summary-hidden">{{ errorCount }} {{ errorCount === 1 ? 'error' : 'errors' }}</span>
      </div>
    </div>

    <div v-if="!rows.length" class="scene-empty">No choices.</div>

    <div v-for="row in rows" :key="row.id" class="scene-choice" :class="`state-${row.state}`">
      <div class="choice-top">
        <span class="choice-state">{{ STATE_LABEL[row.state] }}</span>
        <span class="choice-label">{{ row.label || row.id }}</span>
        <span class="choice-kind" v-tooltip.left="KIND_TIP[row.kind]">{{ row.kind }}</span>
      </div>

      <DebugClauses v-if="row.groups.length" :groups="row.groups" />

      <div v-if="row.note" class="choice-note">{{ row.note }}</div>
    </div>
  </div>
</template>

<style scoped>
.debug-scene {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.875rem;
  --scene-hidden: #d9534f;
  --scene-greyed: #c98a00;
  --scene-shown: #3c9a5f;
}

.scene-header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  background: var(--editor-surface-sunken);
  border: 1px solid var(--dp-border);
  border-radius: 4px;
}

.scene-id,
.scene-place {
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}

.scene-none {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
}

.scene-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  font-size: 0.8rem;
  opacity: 0.85;
}

.summary-hidden {
  color: var(--scene-hidden);
  font-weight: 700;
}

.summary-greyed {
  color: var(--scene-greyed);
  font-weight: 600;
}

.scene-empty {
  padding: 0.5rem 0;
  opacity: 0.7;
}

.scene-choice {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--dp-border);
  border-left: 4px solid var(--dp-border);
  border-radius: 4px;
  background: var(--dp-control);
}

.scene-choice.state-hidden,
.scene-choice.state-error {
  border-color: var(--scene-hidden);
  background: color-mix(in srgb, var(--scene-hidden) 12%, var(--dp-control));
}

.scene-choice.state-greyed {
  border-left-color: var(--scene-greyed);
}

.scene-choice.state-shown {
  border-left-color: var(--scene-shown);
}

.choice-top {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}

.choice-state {
  flex-shrink: 0;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
}

.state-hidden .choice-state,
.state-error .choice-state {
  background: var(--scene-hidden);
}

.state-greyed .choice-state {
  background: var(--scene-greyed);
}

.state-shown .choice-state {
  background: var(--scene-shown);
}

.choice-label {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.state-shown .choice-label {
  font-weight: 500;
}

.choice-kind {
  flex-shrink: 0;
  font-family: monospace;
  font-size: 0.75rem;
  opacity: 0.7;
}

.choice-note {
  font-size: 0.75rem;
  opacity: 0.8;
}
</style>
