<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';

const props = withDefaults(defineProps<{
  stats: Record<string, number>;
  stacks?: number;
  multiplier?: number;
  isActive?: boolean;
}>(), {
  isActive: true
});

const game = Game.getInstance();

// Helper to check if a stat should be visible
const isStatVisible = (statId: string): boolean => {
  if (game.coreSystem.getDebugSetting('show_hidden_stats')) {
    return true; // Show all stats in debug mode
  }
  return game.characterSystem.statsVisibleMap.has(statId);
};

// Get visible stats
const visibleStats = computed(() => {
  return Object.entries(props.stats)
    .filter(([statId]) => isStatVisible(statId))
    .reduce((acc, [statId, value]) => {
      acc[statId] = value;
      return acc;
    }, {} as Record<string, number>);
});

// Check if there are any visible stats
const hasVisibleStats = computed(() => {
  return Object.keys(visibleStats.value).length > 0;
});
</script>

<template>
  <div v-if="hasVisibleStats" class="status-stats-display">
    <h5 :class="{ inactive: !isActive }">Stats:</h5>
    <ul>
      <li v-for="(value, statId) in visibleStats" :key="statId">
        {{ game.characterSystem.statsMap.get(statId)?.name || statId }}:
        <span v-if="multiplier && multiplier > 1">
          {{ value }} x {{ multiplier }} = {{ value * multiplier }}
        </span>
        <span v-else-if="stacks && stacks > 1">
          {{ value }} x {{ stacks }} = {{ value * stacks }}
        </span>
        <span v-else>
          {{ value }}
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.status-stats-display h5 {
  margin: 0 0 6px 0;
  font-size: 14px;
  color: #ffd700;
}

.status-stats-display h5.inactive {
  color: #888;
}

.status-stats-display ul {
  margin: 0;
  padding-left: 20px;
  list-style: none;
}

.status-stats-display li {
  margin: 4px 0;
  color: #ddd;
}

.status-stats-display li::before {
  content: "• ";
  color: #42b983;
  font-weight: bold;
  margin-right: 4px;
}
</style>
