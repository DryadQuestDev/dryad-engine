<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import Tooltip from 'primevue/tooltip';

const game = Game.getInstance();
const dungeonSystem = game.dungeonSystem;

const zoomText = computed(() => {
  return `${Math.round(game.coreSystem.getState<number>('map_zoom_factor') * 100)}%`;
});

const zoomTooltip = computed(() => {
  return `Current zoom: ${Math.round(game.coreSystem.getState<number>('map_zoom_factor') * 100)}%`;
});

const handleZoomIn = () => {
  dungeonSystem.setMapZoomFactor(game.coreSystem.getState<number>('map_zoom_factor') + 0.1);
};

const handleZoomOut = () => {
  dungeonSystem.setMapZoomFactor(game.coreSystem.getState<number>('map_zoom_factor') - 0.1);
};

const isVisible = () => {
  return game.getDungeonType() === 'map';
};
</script>

<template>
  <template v-if="isVisible()">
    <div class="toolbar-item zoom-in" v-tooltip.top="'Zoom in'" @click="handleZoomIn" />
    <div class="toolbar-item zoom-value" v-tooltip.top="zoomTooltip">
      <span class="button-text">{{ zoomText }}</span>
    </div>
    <div class="toolbar-item zoom-out" v-tooltip.top="'Zoom out'" @click="handleZoomOut" />
  </template>
</template>

<style scoped>
.toolbar-item {
  width: 30px;
  height: 30px;
  cursor: pointer;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  transition: transform 0.2s;
  position: relative;
  flex-shrink: 0;
}

.toolbar-item.zoom-in {
  background-image: url('/assets/engine_assets/ui/adventure-bar/icon_zoom_in.png');
}

.toolbar-item.zoom-value {
  color: #a15335;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  pointer-events: none;
}

.toolbar-item.zoom-out {
  background-image: url('/assets/engine_assets/ui/adventure-bar/icon_zoom_out.png');
}

.toolbar-item:hover:not(.zoom-value) {
  transform: scale(1.1);
}

.button-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-weight: bold;
  pointer-events: none;
}
</style>
