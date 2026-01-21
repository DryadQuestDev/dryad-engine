<script setup lang="ts">
import { computed, ref } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';
import type { EntityStatObject } from '../../../schemas/entityStatSchema';
import StatEntity from './StatEntity.vue';

export interface StatGroup {
  groupName: string;
  stats: string[];
}

const props = defineProps<{
  character: Character;
  groups?: StatGroup[];
}>();

const game = Game.getInstance();

// Get the appropriate stats map based on debug settings
const activeStatsMap = computed(() => {
  return game.coreSystem.getDebugSetting('show_hidden_stats')
    ? game.characterSystem.statsMap
    : game.characterSystem.statsVisibleMap;
});

// Compute stat groups - use prop if provided, otherwise default to Resources/Stats
const statGroups = computed((): StatGroup[] => {
  let groups: StatGroup[];

  if (props.groups) {
    groups = props.groups;
  } else {
    // Default behavior: separate resources from regular stats
    const resourceIds: string[] = [];
    const regularIds: string[] = [];

    for (const [statId, stat] of activeStatsMap.value.entries()) {
      if (props.character.hasStat(statId)) {
        if (stat.is_resource) {
          resourceIds.push(statId);
        } else {
          regularIds.push(statId);
        }
      }
    }

    // Sort by order field, then by id
    const sortFn = (a: string, b: string) => {
      const statA = activeStatsMap.value.get(a);
      const statB = activeStatsMap.value.get(b);
      const orderDiff = (statA?.order || 0) - (statB?.order || 0);
      if (orderDiff !== 0) return orderDiff;
      return a.localeCompare(b);
    };
    resourceIds.sort(sortFn);
    regularIds.sort(sortFn);

    groups = [];
    const global = Global.getInstance();
    if (resourceIds.length > 0) {
      groups.push({ groupName: global.getString('stat_group.resources'), stats: resourceIds });
    }
    if (regularIds.length > 0) {
      groups.push({ groupName: global.getString('stat_group.stats'), stats: regularIds });
    }
  }

  // Filter out groups where character has none of the specified stats
  return groups.filter(group =>
    group.stats.some(statId => props.character.hasStat(statId))
  );
});

// Popup state for stats/resources
const hoveredStat = ref<{ statId: string; stat: EntityStatObject } | null>(null);
const statReferenceRef = ref<HTMLElement | null>(null);
const statPopupRef = ref<HTMLElement | null>(null);

// Floating UI setup for stat popups
const { floatingStyles: statFloatingStyles } = useFloating(statReferenceRef, statPopupRef, {
  placement: 'left-start',
  strategy: 'fixed',
  middleware: [
    offset(10),
    flip({ padding: 8 }),
    shift({ padding: 8 })
  ],
  whileElementsMounted: autoUpdate
});

const onStatHover = (event: MouseEvent, statId: string, stat: EntityStatObject) => {
  if (!stat.ingame_description) return;
  statReferenceRef.value = event.currentTarget as HTMLElement;
  hoveredStat.value = { statId, stat };
};

const onStatLeave = () => {
  hoveredStat.value = null;
  statReferenceRef.value = null;
};

const resolvedDescription = computed(() => {
  if (!hoveredStat.value?.stat.ingame_description) return '';
  return game.resolveString(hoveredStat.value.stat.ingame_description).output;
});
</script>

<template>
  <div class="character-stats">
    <div v-for="group in statGroups" :key="group.groupName" class="stats-section">
      <h3 v-if="group.groupName">{{ group.groupName }}</h3>
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
      <div v-if="hoveredStat" ref="statPopupRef" class="stat-popup" :style="statFloatingStyles">
        <div class="popup-header">
          <h4>{{ hoveredStat.stat.name || hoveredStat.statId }}</h4>
        </div>
        <div class="popup-body">
          <div class="popup-description" v-html="resolvedDescription"></div>
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
  margin: 0 0 0.75rem 0;
  color: #42b983;
  font-size: 1.1rem;
  font-weight: bold;
  border-bottom: 1px solid #555;
  padding-bottom: 0.5rem;
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
