<script setup lang="ts">
import { computed } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import StatEntity from './StatEntity.vue';

interface StatGroup {
  id: string;
  stats: string[];
}

const props = defineProps<{
  character: Character;
  tags?: string[];
  noHeaders?: boolean;
}>();

const game = Game.getInstance();

// Get the appropriate stats map based on debug settings
const activeStatsMap = computed(() => {
  return game.coreSystem.getDebugSetting('show_hidden_stats')
    ? game.characterSystem.statsMap
    : game.characterSystem.statsVisibleMap;
});

// Sort stat IDs by order field, then by id
const sortStats = (statIds: string[]) => {
  return statIds.sort((a, b) => {
    const statA = activeStatsMap.value.get(a);
    const statB = activeStatsMap.value.get(b);
    const orderDiff = (statA?.order || 0) - (statB?.order || 0);
    if (orderDiff !== 0) return orderDiff;
    return a.localeCompare(b);
  });
};

// Build stat groups from tags prop, resolver, or default Resources/Stats split
const buildGroupsFromTags = (tags: string[]): StatGroup[] => {
  const groups: StatGroup[] = [];
  for (const tag of tags) {
    const statIds: string[] = [];
    for (const [statId, stat] of activeStatsMap.value.entries()) {
      if (stat.tags?.includes(tag)) statIds.push(statId);
    }
    if (statIds.length) {
      sortStats(statIds);
      groups.push({ id: tag, stats: statIds });
    }
  }
  return groups.filter(group =>
    group.stats.some(statId => props.character.hasStat(statId) || props.character.getStat(statId) !== 0)
  );
};

const statGroups = computed((): StatGroup[] => {
  // Tags prop overrides everything — used by custom components for filtered views
  if (props.tags) return buildGroupsFromTags(props.tags);

  const resolver = game.characterSystem.getStatGroupResolver();

  if (resolver) {
    return buildGroupsFromTags(resolver(props.character));
  }

  // Default: separate resources from regular stats
  const resourceIds: string[] = [];
  const regularIds: string[] = [];
  for (const [statId, stat] of activeStatsMap.value.entries()) {
    if (props.character.hasStat(statId) || props.character.getStat(statId) !== 0) {
      if (stat.is_resource) resourceIds.push(statId);
      else regularIds.push(statId);
    }
  }
  sortStats(resourceIds);
  sortStats(regularIds);

  const groups: StatGroup[] = [];
  if (resourceIds.length > 0) groups.push({ id: 'resources', stats: resourceIds });
  if (regularIds.length > 0) groups.push({ id: 'stats', stats: regularIds });
  return groups;
});

</script>

<template>
  <div v-if="statGroups.length" class="character-stats">
    <div v-for="group in statGroups" :key="group.id" class="stats-section">
      <h3 v-if="group.id && !noHeaders">{{ game.getLine('group.' + group.id) }}</h3>
      <StatEntity v-for="statId in group.stats" :key="statId" :character="character" :statId="statId" />
    </div>
  </div>
</template>

<style scoped>
.character-stats {
  width: 100%;
  border: 1px solid #444;
  padding: 1rem;
  border-radius: 4px;
  background: rgba(26, 26, 26, 0.5);
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-content: flex-start;
}

.stats-section {
  flex: 1 1 250px;
  min-width: 250px;
}

.stats-section h3 {
  margin: 0 0 0.75em 0;
  color: #42b983;
  font-size: 1.1em;
  font-weight: bold;
  border-bottom: 1px solid #555;
  padding-bottom: 0.5em;
}

</style>
