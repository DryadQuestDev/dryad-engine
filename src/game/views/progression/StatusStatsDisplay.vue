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

// Round a value for display using stat precision + 1 (one extra decimal for partial contributions)
const roundStat = (statId: string, value: number): number => {
  const basePrecision = game.characterSystem.statsMap.get(statId)?.precision ?? 0;
  const factor = Math.pow(10, basePrecision + 1);
  return Math.round(value * factor) / factor;
};

// Determine the color for a stat value based on whether the change is beneficial
const getStatColor = (statId: string, value: number): string => {
  if (value === 0) {
    return '#ddd'; // Neutral gray for zero values
  }

  const stat = game.characterSystem.statsMap.get(statId);
  const reductionIsGood = stat?.reduction_is_good ?? false;

  // Determine if this change is beneficial
  const isBeneficial = reductionIsGood ? value < 0 : value > 0;

  return isBeneficial ? '#42b983' : '#ff453a'; // Green for good, red for bad
};

// Check if we should show a + prefix for the value
const shouldShowPlus = (value: number): boolean => {
  return value > 0; // Show + for all positive values
};

const isBinaryStat = (statId: string): boolean => {
  return game.characterSystem.statsMap.get(statId)?.is_binary ?? false;
};

const getBinaryColor = (statId: string): string => {
  const stat = game.characterSystem.statsMap.get(statId);
  return (stat?.reduction_is_good) ? '#ff453a' : '#42b983';
};
</script>

<template>
  <div v-if="hasVisibleStats" class="status-stats-display">
    <h5 :class="{ inactive: !isActive }">Stats:</h5>
    <ul>
      <li v-for="(value, statId) in visibleStats" :key="statId" :class="{ 'binary-li': isBinaryStat(statId as string) }">
        <template v-if="isBinaryStat(statId as string)">
          <span :style="{ color: getBinaryColor(statId as string) }">&#10003;</span>
          {{ game.characterSystem.statsMap.get(statId)?.name || statId }}
        </template>
        <template v-else>
          {{ game.characterSystem.statsMap.get(statId)?.name || statId }}:
          <span v-if="multiplier && multiplier > 1" :style="{ color: getStatColor(statId as string, value * multiplier) }">
            <template v-if="shouldShowPlus(value * multiplier)">+</template>{{ roundStat(statId as string, value) }} x {{ multiplier }} = {{ roundStat(statId as string, value * multiplier) }}
          </span>
          <span v-else-if="stacks && stacks > 1" :style="{ color: getStatColor(statId as string, value * stacks) }">
            <template v-if="shouldShowPlus(value * stacks)">+</template>{{ roundStat(statId as string, value) }} x {{ stacks }} = {{ roundStat(statId as string, value * stacks) }}
          </span>
          <span v-else :style="{ color: getStatColor(statId as string, value) }">
            <template v-if="shouldShowPlus(value)">+</template>{{ roundStat(statId as string, value) }}
          </span>
        </template>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.status-stats-display h5 {
  margin: 0 0 6px 0;
  font-size: 1em;
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
}

.status-stats-display li::before {
  content: "• ";
  color: #42b983;
  font-weight: bold;
  margin-right: 4px;
}

.status-stats-display li.binary-li::before {
  content: none;
}
</style>
