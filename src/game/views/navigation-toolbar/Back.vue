<script setup lang="ts">
import { Game } from '../../game';
import Tooltip from 'primevue/tooltip';

const game = Game.getInstance();
const dungeonSystem = game.dungeonSystem;

const isInactive = () => {
  return dungeonSystem.selectedEncounter.value === null;
};

const handleClick = () => {
  dungeonSystem.selectedEncounterId.value = null;
};
</script>

<template>
  <div class="toolbar-item back" :class="{ 'inactive': isInactive() }" v-tooltip.top="'Back'" @click="handleClick" />
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

.toolbar-item.back {
  background-image: url('/assets/engine_assets/ui/adventure-bar/icon_back.png');
}

.toolbar-item:hover:not(.inactive) {
  transform: scale(1.1);
}

.toolbar-item.inactive {
  opacity: 0.4;
  filter: grayscale(100%);
  cursor: not-allowed;
  pointer-events: none;
}
</style>
