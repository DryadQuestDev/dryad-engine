<script setup lang="ts">
import { computed, markRaw } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import type { EntityStatObject } from '../../../schemas/entityStatSchema';
import ProgressBar from './ProgressBar.vue';
import StatCard from '../popups/cards/StatCard.vue';
import { popover as vPopover } from '../../directives/popoverDirective';

const props = defineProps<{
  character: Character;
  statId: string;
}>();

const game = Game.getInstance();

const stat = computed((): EntityStatObject | undefined => {
  const showHidden = game.coreSystem.getDebugSetting('show_hidden_stats');
  const statsMap = showHidden
    ? game.characterSystem.statsMap
    : game.characterSystem.statsVisibleMap;
  return statsMap.get(props.statId);
});

const isResource = computed(() => stat.value?.is_resource ?? false);

const currentValue = computed(() => props.character.getResource(props.statId));
const maxValue = computed(() => props.character.getStat(props.statId));

const displayValue = computed(() => {
  return props.character.getStat(props.statId);
});

const isBinary = computed(() => stat.value?.is_binary ?? false);
const hasDescription = computed(() => !!stat.value?.ingame_description);
const binaryColor = computed(() => {
  const reductionIsGood = stat.value?.reduction_is_good ?? false;
  return reductionIsGood ? '#ff453a' : '#42b983';
});

const StatCardComp = markRaw(StatCard);

// Only attach popover when the stat has an ingame description.
const popoverBinding = computed(() => {
  if (!hasDescription.value) return null;
  return { component: StatCardComp, props: { statId: props.statId, characterId: props.character.id }, placement: 'left-start' as const };
});
</script>

<template>
  <div v-if="stat && isBinary && displayValue" class="stat-entity binary-stat"
    :class="{ 'has-description': hasDescription }" v-popover="popoverBinding">
    <span class="binary-check" :style="{ color: binaryColor }">&#10003;</span>
    <span class="stat-name">{{ stat.name || statId }}</span>
  </div>
  <div v-else-if="stat && isResource && (character.hasStat(statId) || maxValue !== 0)" class="stat-entity resource-row"
    :class="{ 'has-description': hasDescription }" v-popover="popoverBinding">
    <ProgressBar :current="currentValue" :max="maxValue" :barColor="stat.color ? `#${stat.color}` : undefined"
      :label="stat.name || statId" width="100%" />
  </div>
  <div v-else-if="stat && (character.hasStat(statId) || maxValue !== 0)" class="stat-entity numeric-row"
    :class="{ 'has-description': hasDescription }" v-popover="popoverBinding">
    <span class="stat-name">{{ stat.name || statId }}</span>
    <span class="stat-value">{{ displayValue }}</span>
  </div>
</template>

<style scoped>
.stat-entity {
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid #333;
  transition: all 0.2s;
}

.stat-entity.resource-row {
  flex-wrap: nowrap;
}

.stat-entity.numeric-row {
  padding-left: 0.5em;
  padding-right: 0.5em;
}

.stat-entity:last-child {
  border-bottom: none;
}

.stat-entity.has-description {
  cursor: help;
  border-radius: 2px;
}

.stat-entity.has-description:hover {
  background: rgba(66, 185, 131, 0.1);
}

.stat-name {
  flex: 1;
  font-weight: bold;
  color: #fff;
  text-shadow:
    0 0 2px rgba(0, 0, 0, 0.9),
    0 0 3px rgba(0, 0, 0, 0.8),
    0 1px 2px rgba(0, 0, 0, 0.9);
}

.stat-value {
  font-weight: bold;
  color: #fff;
  text-shadow:
    0 0 2px rgba(0, 0, 0, 0.9),
    0 0 3px rgba(0, 0, 0, 0.8),
    0 1px 2px rgba(0, 0, 0, 0.9);
}

.binary-stat {
  gap: 0.4rem;
}

.binary-check {
  font-weight: bold;
  font-size: 1.1em;
}
</style>
