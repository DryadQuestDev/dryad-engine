<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import Tooltip from 'primevue/tooltip';

const game = Game.getInstance();
const dungeonSystem = game.dungeonSystem;

const isInactive = () => {
  return !dungeonSystem.hasVisibleEncounters.value;
};

const handleClick = () => {
  dungeonSystem.cycleToNextEncounter();
};

const counterText = computed(() => {
  return dungeonSystem.getEncounterCounterText();
});

const isCounterVisible = () => {
  return dungeonSystem.selectedEncounter.value !== null && dungeonSystem.selectedEncounter.value?.getVisibilityState();
};
</script>

<template>
  <div class="toolbar-item icon_encounter" :class="{ 'inactive': isInactive() }" v-tooltip.top="'Next encounter'"
    @click="handleClick" />
  <div v-if="isCounterVisible()" class="toolbar-item encounter-counter" v-tooltip.top="'Current encounter'">
    <span class="button-text">{{ counterText }}</span>
  </div>
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

.toolbar-item.icon_encounter {
  background-image: url('/assets/engine_assets/ui/adventure-bar/icon_encounter.png');
}

.toolbar-item.encounter-counter {
  color: #a15335;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  pointer-events: none;
}

.toolbar-item:hover:not(.inactive):not(.encounter-counter) {
  transform: scale(1.1);
}

.toolbar-item.inactive {
  opacity: 0.4;
  filter: grayscale(100%);
  cursor: not-allowed;
  pointer-events: none;
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
