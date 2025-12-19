<script setup lang="ts">
import { Game } from '../../game';
import Tooltip from 'primevue/tooltip';

const game = Game.getInstance();
const dungeonSystem = game.dungeonSystem;

const togglePopup = () => {
  dungeonSystem.isLogsPopupOpen.value = !dungeonSystem.isLogsPopupOpen.value;
};
</script>

<template>
  <div class="toolbar-item logs" v-tooltip.top="'Logs'" @click="togglePopup" />
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

.toolbar-item.logs {
  background-image: url('/assets/engine_assets/ui/adventure-bar/icon_log.png');
}

.toolbar-item:hover {
  transform: scale(1.1);
}
</style>
