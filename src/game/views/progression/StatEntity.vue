<script setup lang="ts">
import { computed } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import type { EntityStatObject } from '../../../schemas/entityStatSchema';
import ProgressBar from './ProgressBar.vue';

const props = defineProps<{
  character: Character;
  statId: string;
}>();

const emit = defineEmits<{
  (e: 'statHover', event: MouseEvent, statId: string, stat: EntityStatObject): void;
  (e: 'statLeave'): void;
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

const hasDescription = computed(() => !!stat.value?.ingame_description);

const onMouseEnter = (event: MouseEvent) => {
  if (stat.value) {
    emit('statHover', event, props.statId, stat.value);
  }
};

const onMouseLeave = () => {
  emit('statLeave');
};
</script>

<template>
  <div v-if="stat && character.hasStat(statId)" class="stat-entity" :class="{ 'has-description': hasDescription }" @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave">
    <span class="stat-name">{{ stat.name || statId }}:</span>
    <ProgressBar v-if="isResource" class="resource-bar-right" :current="currentValue" :max="maxValue"
      :barColor="stat.color ? `#${stat.color}` : undefined" width="150px" />
    <span v-else class="stat-value">{{ displayValue }}</span>
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

.stat-entity:last-child {
  border-bottom: none;
}

.stat-entity.has-description {
  cursor: help;
  padding-left: 0.5rem;
  margin-left: -0.5rem;
  border-radius: 2px;
}

.stat-entity.has-description:hover {
  background: rgba(66, 185, 131, 0.1);
}

.stat-name {
  flex: 1;
  font-weight: 500;
  color: #ccc;
}

.stat-value {
  font-weight: bold;
  color: #42b983;
}

.resource-bar-right {
  margin-left: auto;
}
</style>
