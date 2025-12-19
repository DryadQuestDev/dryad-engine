<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../game';

const game = Game.getInstance();

const popupComponent = computed(() => {
  const popupState = game.coreSystem.getState<string>('popup_state');
  if (popupState) {
    const components = game.coreSystem.getComponentsBySlot('popup');
    const component = components.find(c => c.id === popupState);
    return component?.component;
  }
  return null;
});

const isOpen = computed(() => {
  return game.coreSystem.getState<string>('popup_state') !== null;
});
</script>

<template>
  <div v-if="isOpen" class="popup-overlay" @click.self="() => { }">
    <div class="popup-content">
      <component :is="popupComponent" v-if="popupComponent" />
      <div v-else class="popup-error">
        Popup component not found for id: {{ game.coreSystem.getState('popup_state') }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  pointer-events: auto;
}

.popup-content {
  min-width: 500px;
  min-height: 300px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  overflow: auto;
  max-width: 90vw;
  max-height: 90vh;
  pointer-events: auto;
}

.popup-error {
  padding: 20px;
  color: red;
  font-weight: bold;
  text-align: center;
}
</style>
