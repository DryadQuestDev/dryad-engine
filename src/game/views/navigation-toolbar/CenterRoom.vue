<script setup lang="ts">
import { Game } from '../../game';
import Tooltip from 'primevue/tooltip';

const game = Game.getInstance();
const dungeonSystem = game.dungeonSystem;

const handleClick = () => {
  dungeonSystem.centerToActiveLocation(true);
};

const isVisible = () => {
  return game.getDungeonType() === 'map';
};
</script>

<template>
  <div v-if="isVisible()" class="toolbar-item center-room" v-tooltip.top="'Center on current room'"
    @click="handleClick" />
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

.toolbar-item.center-room {
  background-image: url('/assets/engine_assets/ui/adventure-bar/icon_center.png');
}

.toolbar-item:hover {
  transform: scale(1.1);
}
</style>
