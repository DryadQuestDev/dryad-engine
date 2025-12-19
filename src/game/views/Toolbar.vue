<script setup lang="ts">
import { Game } from '../game';
import CustomComponentContainer from './CustomComponentContainer.vue';

// Get game instance
const game = Game.getInstance();
const dungeonSystem = game.dungeonSystem;

const COMPONENT_SLOT = 'navigation-toolbar';

</script>

<template>
  <div v-if="!game.coreSystem.isTextUIContent.value" class="toolbar"
    :class="{ 'minimized': dungeonSystem.toolbarMinimized.value }">
    <!-- Custom components registered to navigation-toolbar slot -->
    <CustomComponentContainer :slot="COMPONENT_SLOT" />
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 10px;
  padding: 5px;
  background-color: #f5f5f5;
  border-radius: 4px;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
}

.toolbar.minimized {
  width: 60px;
  overflow: hidden;
}
</style>
