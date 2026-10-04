<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import { Global } from '../../../global/global';

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

function statName(statId: string): string {
  return game.characterSystem.statsMap.get(statId)?.name || statId;
}

// Same key as StatCard's breakdown rows: the colon belongs to the locale entry, not the markup.
function statRowLabel(statId: string): string {
  return Global.getInstance().getString('stat_breakdown.row_label', { name: statName(statId) });
}

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

// The sign rides along with the number rather than sitting in its own template node: it is
// arithmetic notation, not prose, and keeping it separate only fragments the readout further.
const signedStat = (statId: string, value: number): string => {
  const rounded = roundStat(statId, value);
  return rounded > 0 ? `+${rounded}` : String(rounded);
};

// One locale line covers both the multiplier and the stacks readout, so the two cannot drift.
const multipliedText = (statId: string, value: number, factor: number = 1): string =>
  Global.getInstance().getString('status_stats.multiplied', {
    value: signedStat(statId, value),
    multiplier: factor,
    total: roundStat(statId, value * factor),
  });

const statsLabel = computed(() => Global.getInstance().getString('status_stats.stats_label'));

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
    <h5 :class="{ inactive: !isActive }">{{ statsLabel }}</h5>
    <ul>
      <li v-for="(value, statId) in visibleStats" :key="statId" :class="{ 'binary-li': isBinaryStat(statId as string) }">
        <template v-if="isBinaryStat(statId as string)">
          <span :style="{ color: getBinaryColor(statId as string) }">&#10003;</span>
          {{ statName(statId as string) }}
        </template>
        <template v-else>
          {{ statRowLabel(statId as string) }}
          <span v-if="multiplier && multiplier > 1" :style="{ color: getStatColor(statId as string, value * multiplier) }">
            {{ multipliedText(statId as string, value, multiplier) }}
          </span>
          <span v-else-if="stacks && stacks > 1" :style="{ color: getStatColor(statId as string, value * stacks) }">
            {{ multipliedText(statId as string, value, stacks) }}
          </span>
          <span v-else :style="{ color: getStatColor(statId as string, value) }">
            {{ signedStat(statId as string, value) }}
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
