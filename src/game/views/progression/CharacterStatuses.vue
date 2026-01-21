<script setup lang="ts">
import { computed, ref } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { Status } from '../../core/character/status';
import StatusStatsDisplay from './StatusStatsDisplay.vue';

const props = defineProps<{
  character: Character;
}>();
const game = Game.getInstance();

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

// Helper functions to get status info
const getStatusObject = (status: Status) => {
  return game.characterSystem.statusesMap.get(status.id);
};

const getStatusName = (status: Status): string => {
  const statusObject = getStatusObject(status);
  return statusObject?.name || status.id;
};

const getStatusImage = (status: Status): string | undefined => {
  const statusObject = getStatusObject(status);
  return statusObject?.image;
};

const getStatusDescription = (status: Status): string => {
  const statusObject = getStatusObject(status);
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
  <div class="character-statuses">
    <div class="status-list" v-if="visibleStatuses.length > 0">
      <div v-for="status in visibleStatuses" :key="status.id" class="status-brick"
        :class="{ 'has-image': getStatusImage(status) }" @mouseenter="showStatusPopup($event, status)"
        @mouseleave="hideStatusPopup">
        <img v-if="getStatusImage(status)" :src="getStatusImage(status)" :alt="getStatusName(status)"
          class="status-image" />
        <span v-else class="status-name">{{ getStatusName(status) }}</span>
        <span v-if="status.isStackable() && status.currentStacks > 1" class="stack-count">
          x{{ status.currentStacks }}
        </span>
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
  </div>
</template>

<style scoped>
.character-statuses {
  width: 100%;
  height: 100%;
  min-height: 68px;
  border: 1px solid #444;
  padding: 0.5rem;
  border-radius: 4px;
  background: rgba(26, 26, 26, 0.5);
  overflow-y: auto;
}

.status-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-content: flex-start;
}

.status-brick {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #42b983;
  border-radius: 4px;
  padding: 0.4rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 50px;
}

.status-brick:hover {
  background: rgba(66, 185, 131, 0.15);
  border-color: #52c593;
  transform: scale(1.05);
}

.status-brick.has-image {
  padding: 1px;
  background: transparent;
}

.status-brick.has-image:hover {
  background: transparent;
}

.status-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  will-change: transform;
}

.status-name {
  font-size: 0.8rem;
  color: #ccc;
  padding: 0.2rem 0.4rem;
  white-space: nowrap;
}

.stack-count {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: #1a1a1a;
  border: 1px solid #ffd700;
  border-radius: 8px;
  padding: 0 4px;
  font-size: 0.7rem;
  font-weight: bold;
  color: #ffd700;
  line-height: 1.2;
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
</style>
