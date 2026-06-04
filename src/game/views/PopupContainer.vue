<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../game';

const game = Game.getInstance();

const openPopups = computed(() => {
  const ids = game.coreSystem.getState<string[]>('popup_state') || [];
  const components = game.coreSystem.getComponentsBySlot('popup');
  return ids.map(id => {
    const cm = components.find(c => c.id === id);
    return { id, component: cm?.component, mask: cm?.mask };
  });
});

function maskFor(popup: { mask?: string | boolean }): string {
  if (popup.mask === false) return 'transparent';
  return typeof popup.mask === 'string' ? popup.mask : 'rgba(0, 0, 0, 0.7)';
}
</script>

<template>
  <div v-for="(popup, i) in openPopups" :key="popup.id" class="popup-overlay"
    :style="{ zIndex: 500 + i, backgroundColor: maskFor(popup) }" @click.self="() => { }">
    <div class="popup-content">
      <component :is="popup.component" v-if="popup.component" />
      <div v-else class="popup-error">
        Popup component not found for id: {{ popup.id }}
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
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  pointer-events: auto;
}

.popup-content {
  overflow: auto;
  max-width: 90vw;
  max-width: 90dvw;
  max-height: 90vh;
  max-height: 90dvh;
  pointer-events: auto;
  filter: drop-shadow(0 6px 20px rgba(0, 0, 0, 0.45));
}

.popup-error {
  padding: 20px;
  color: red;
  font-weight: bold;
  text-align: center;
}
</style>
