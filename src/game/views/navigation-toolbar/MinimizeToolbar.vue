<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import Tooltip from 'primevue/tooltip';

const game = Game.getInstance();
const global = Global.getInstance();
const dungeonSystem = game.dungeonSystem;

const tooltip = computed(() => {
  return global.getString(dungeonSystem.toolbarMinimized.value ? 'toolbar.expand' : 'toolbar.minimize');
});

const handleClick = () => {
  dungeonSystem.toolbarMinimized.value = !dungeonSystem.toolbarMinimized.value;
};
</script>

<template>
  <div
    class="toolbar-item minimize-toolbar"
    v-tooltip.top="tooltip"
    @click="handleClick"
  />
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

.toolbar-item.minimize-toolbar {
  background-image: url('/assets/engine_assets/ui/adventure-bar/icon_minimize_panel.png');
}

.toolbar-item:hover {
  transform: scale(1.1);
}
</style>
