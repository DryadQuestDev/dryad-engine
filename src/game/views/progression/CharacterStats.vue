<script setup lang="ts">
import { computed, ref } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { Status } from '../../core/character/status';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';
import type { EntityStatObject } from '../../../schemas/entityStatSchema';
import StatusStatsDisplay from './StatusStatsDisplay.vue';

const props = defineProps<{
  character: Character;
}>();
const game = Game.getInstance();

// Get the appropriate stats map based on debug settings
const activeStatsMap = computed(() => {
  return game.coreSystem.getDebugSetting('show_hidden_stats')
    ? game.characterSystem.statsMap
    : game.characterSystem.statsVisibleMap;
});

// Helper to check if character has a stat defined
const characterHasStat = (statId: string): boolean => {
  // Check if any status on the character has this stat
  return props.character.statuses.some(status =>
    status.stats && statId in status.stats
  );
};

// Separate resources from regular stats
const resources = computed(() => {
  return Array.from(activeStatsMap.value.entries())
    .filter(([statId, stat]) => stat.is_resource && characterHasStat(statId))
    .map(([statId, stat]) => ({ statId, stat }));
});

const regularStats = computed(() => {
  return Array.from(activeStatsMap.value.entries())
    .filter(([statId, stat]) => !stat.is_resource && characterHasStat(statId))
    .map(([statId, stat]) => ({ statId, stat }));
});

// Popup state for statuses
const hoveredStatus = ref<Status | null>(null);
const popupPosition = ref({ x: 0, y: 0 });

const showStatusPopup = (event: MouseEvent, status: Status) => {
  hoveredStatus.value = status;
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  popupPosition.value = {
    x: rect.left - 10, // 10px gap to the left
    y: rect.top
  };
};

const hideStatusPopup = () => {
  hoveredStatus.value = null;
};

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

const showStatPopup = (event: MouseEvent, statId: string, stat: EntityStatObject) => {
  if (!stat.ingame_description) return;
  statReferenceRef.value = event.currentTarget as HTMLElement;
  hoveredStat.value = { statId, stat };
};

const hideStatPopup = () => {
  hoveredStat.value = null;
  statReferenceRef.value = null;
};

// Helper functions to get status info
const getStatusName = (status: Status): string => {
  const statusObject = game.characterSystem.statusesMap.get(status.id);
  return statusObject?.name || status.id;
};

const getStatusDescription = (status: Status): string => {
  const statusObject = game.characterSystem.statusesMap.get(status.id);
  return statusObject?.description || '';
};

// Filter visible statuses based on isHidden property
const visibleStatuses = computed(() => {
  if (game.coreSystem.getDebugSetting('show_hidden_stats')) {
    return props.character.statuses; // Show all statuses in debug mode
  }
  return props.character.statuses.filter(status => !status.isHidden);
});
</script>

<template>
  <div class="character-stats">
    <!-- Resources Section -->
    <div class="stats-section" v-if="resources.length > 0">
      <h3>Resources</h3>
      <div v-for="{ statId, stat } in resources" :key="statId" class="stat-item"
        :class="{ 'has-description': stat.ingame_description }" @mouseenter="showStatPopup($event, statId, stat)"
        @mouseleave="hideStatPopup">
        <span class="stat-name">{{ stat.name || statId }}:</span>
        <span class="stat-value">
          {{ character.getResource(statId) }} / {{ character.getStat(statId) }}
        </span>
      </div>
    </div>

    <!-- Regular Stats Section -->
    <div class="stats-section" v-if="regularStats.length > 0">
      <h3>Stats</h3>
      <div v-for="{ statId, stat } in regularStats" :key="statId" class="stat-item"
        :class="{ 'has-description': stat.ingame_description }" @mouseenter="showStatPopup($event, statId, stat)"
        @mouseleave="hideStatPopup">
        <span class="stat-name">{{ stat.name || statId }}:</span>
        <span class="stat-value">{{ character.getStat(statId) }}</span>
      </div>
    </div>

    <!-- Statuses Section -->
    <div class="stats-section" v-if="visibleStatuses.length > 0">
      <h3>Statuses</h3>
      <div class="status-list">
        <div v-for="status in visibleStatuses" :key="status.id" class="status-badge"
          @mouseenter="showStatusPopup($event, status)" @mouseleave="hideStatusPopup">
          {{ getStatusName(status) }}
          <span v-if="status.isStackable() && status.currentStacks > 1" class="stack-count">
            x{{ status.currentStacks }}
          </span>
        </div>
      </div>
    </div>

    <!-- Status Popup -->
    <Teleport to="body">
      <div v-if="hoveredStatus" class="status-popup"
        :style="{ right: `calc(100vw - ${popupPosition.x}px)`, top: popupPosition.y + 'px' }">
        <div class="popup-header">
          <h4>
            {{ getStatusName(hoveredStatus) }}
            <span v-if="hoveredStatus.isStackable() && hoveredStatus.currentStacks > 1" class="popup-stack-count">
              x{{ hoveredStatus.currentStacks }}
            </span>
          </h4>
        </div>
        <div class="popup-body">
          <div class="popup-description" v-if="getStatusDescription(hoveredStatus)"
            v-html="getStatusDescription(hoveredStatus)">
          </div>
          <StatusStatsDisplay v-if="hoveredStatus.stats" :stats="hoveredStatus.stats"
            :stacks="hoveredStatus.currentStacks" />
        </div>
      </div>
    </Teleport>

    <!-- Stat/Resource Popup -->
    <Teleport to="body">
      <div v-if="hoveredStat" ref="statPopupRef" class="stat-popup" :style="statFloatingStyles">
        <div class="popup-header">
          <h4>{{ hoveredStat.stat.name || hoveredStat.statId }}</h4>
        </div>
        <div class="popup-body">
          <div class="popup-description" v-html="hoveredStat.stat.ingame_description"></div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
<style scoped>
.character-stats {
  max-width: 300px;
  border: 1px solid #444;
  padding: 1rem;
  margin: 1rem 0;
  border-radius: 4px;
  background: rgba(26, 26, 26, 0.5);
}

.stats-section {
  margin-bottom: 1.5rem;
}

.stats-section:last-child {
  margin-bottom: 0;
}

.stats-section h3 {
  margin: 0 0 0.75rem 0;
  color: #42b983;
  font-size: 1.1rem;
  font-weight: bold;
  border-bottom: 1px solid #555;
  padding-bottom: 0.5rem;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  padding: 0.4rem 0;
  border-bottom: 1px solid #333;
  transition: all 0.2s;
}

.stat-item:last-child {
  border-bottom: none;
}

.stat-item.has-description {
  cursor: help;
  padding-left: 0.5rem;
  margin-left: -0.5rem;
  border-radius: 2px;
}

.stat-item.has-description:hover {
  background: rgba(66, 185, 131, 0.1);
  /*padding-left: 0.75rem;*/
}

.stat-name {
  font-weight: 500;
  color: #ccc;
}

.stat-value {
  font-weight: bold;
  color: #42b983;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.status-badge {
  background: rgba(0, 0, 0, 0.3);
  border-left: 3px solid #42b983;
  padding: 0.6rem 0.8rem;
  border-radius: 2px;
  font-size: 0.9rem;
  color: #ccc;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  text-align: left;
}

.status-badge:hover {
  background: rgba(66, 185, 131, 0.15);
  border-left-color: #52c593;
  color: #fff;
  padding-left: 1rem;
}

.stack-count {
  margin-left: 0.5rem;
  font-weight: bold;
  color: #ffd700;
  font-size: 0.85em;
}

.status-popup {
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

.popup-header {
  border-bottom: 1px solid #555;
  padding-bottom: 8px;
  margin-bottom: 8px;
}

.popup-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: bold;
  color: #42b983;
}

.popup-stack-count {
  margin-left: 0.5rem;
  font-weight: bold;
  color: #ffd700;
  font-size: 0.9em;
}

.popup-body {
  font-size: 14px;
}

.popup-description {
  margin: 0 0 6px 0;
  color: #ccc;
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
