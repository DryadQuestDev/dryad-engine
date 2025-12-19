<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import Tooltip from 'primevue/tooltip';

const game = Game.getInstance();
const dungeonSystem = game.dungeonSystem;

const tooltip = computed(() => {
  return dungeonSystem.showLocationCircles.value
    ? "Hide location markers"
    : "Show location markers";
});

const handleClick = () => {
  dungeonSystem.showLocationCircles.value = !dungeonSystem.showLocationCircles.value;
};

const isVisible = () => {
  return game.getDungeonType() === 'map';
};
</script>

<template>
  <div v-if="isVisible()" class="toolbar-item toggle-circles" v-tooltip.top="tooltip" @click="handleClick" />
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

.toolbar-item.toggle-circles {
  background-image: url('/assets/engine_assets/ui/adventure-bar/icon_route.png');
}

.toolbar-item:hover {
  transform: scale(1.1);
}
</style>
