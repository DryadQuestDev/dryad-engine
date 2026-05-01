<script setup lang="ts">
import { computed } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import type { EntityStatObject } from '../../../schemas/entityStatSchema';
import StatEntity from './StatEntity.vue';
import { useHoverPopup } from './useHoverPopup';

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

// Stat popup
const {
  hovered: hoveredStat,
  popupRef: statPopupRef,
  floatingStyles: statFloatingStyles,
  show: showStat,
  scheduleHide: hideStat,
  onPopupEnter: onStatPopupEnter,
  onPopupLeave: onStatPopupLeave,
} = useHoverPopup<{ statId: string; stat: EntityStatObject }>({ placement: 'left-start' });

const onStatHover = (event: MouseEvent, statId: string, stat: EntityStatObject) => {
  if (!stat.ingame_description) return;
  showStat({ statId, stat }, event.currentTarget as HTMLElement);
};

const onStatLeave = () => {
  hideStat();
};

</script>

<template>
  <div v-if="statGroups.length" class="character-stats">
    <div v-for="group in statGroups" :key="group.id" class="stats-section">
      <h3 v-if="group.id && !noHeaders">{{ game.getLine('group.' + group.id) }}</h3>
      <StatEntity
        v-for="statId in group.stats"
        :key="statId"
        :character="character"
        :statId="statId"
        @statHover="onStatHover"
        @statLeave="onStatLeave"
      />
    </div>

    <!-- Stat/Resource Popup -->
    <Teleport to="body">
      <div v-if="hoveredStat" ref="statPopupRef" class="stat-popup" :style="statFloatingStyles"
        @mouseenter="onStatPopupEnter" @mouseleave="onStatPopupLeave">
        <div class="popup-header">
          <h4>{{ hoveredStat.stat.name || hoveredStat.statId }}</h4>
        </div>
        <div class="popup-body">
          <div v-script="hoveredStat.stat.ingame_description || ''" class="popup-description"></div>
        </div>
      </div>
    </Teleport>
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
  flex: 1 1 150px;
  min-width: 150px;
}

.stats-section h3 {
  margin: 0 0 0.75em 0;
  color: #42b983;
  font-size: 1.1em;
  font-weight: bold;
  border-bottom: 1px solid #555;
  padding-bottom: 0.5em;
}

/* Stat/Resource Popup */
.stat-popup {
  position: fixed;
  z-index: 9999;
  background: rgba(26, 26, 26, 0.98);
  border: 2px solid #444;
  border-radius: 8px;
  padding: 12px;
  min-width: 200px;
  max-width: 300px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  color: #fff;
  pointer-events: none;
}

.stat-popup .popup-header {
  border-bottom: 1px solid #555;
  padding-bottom: 8px;
  margin-bottom: 8px;
}

.stat-popup .popup-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: bold;
  color: #42b983;
}

.stat-popup .popup-body {
  font-size: 14px;
}

.stat-popup .popup-description {
  color: #ccc;
  margin: 0;
}
</style>
