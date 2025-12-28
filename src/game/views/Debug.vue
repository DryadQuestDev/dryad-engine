<script setup lang="ts">
import { Global } from '../../global/global';
import { Game } from '../game';
import CustomComponentContainer from './CustomComponentContainer.vue';
import { computed, watch, onMounted } from 'vue';
import { useStorage } from '@vueuse/core';
import Button from 'primevue/button';
import { DEV_AUTO_SAVE_SLOT } from '../../services/indexeddb-save.service';

const COMPONENT_ID = 'debug-panel';

const global = Global.getInstance();
const game = Game.getInstance();

// Get debug menu options from unified registry
const debugMenuOptions = computed(() => {
  return game.coreSystem.getComponentsBySlot('debug-tabs').map(tab => ({
    name: tab.title || tab.id,
    id: tab.id
  }));
});

// Track active tab ID
const activeTabId = useStorage('debug-active-tab-id', '');

// Lifecycle hooks
onMounted(() => {
  // If no tab is selected, select the first one
  if (!activeTabId.value && debugMenuOptions.value.length > 0) {
    activeTabId.value = debugMenuOptions.value[0].id;
  }
});

// Get active component based on selected tab
const activeComponent = computed(() => {
  if (!activeTabId.value) return undefined;
  return game.coreSystem.getComponentsBySlot('debug-tabs').find(tab => tab.id === activeTabId.value);
});

// Save debug settings to localStorage
watch(game.coreSystem.debugSettings, () => {
  let debugStorage = JSON.parse(localStorage.getItem('debug-settings') || '{}');
  debugStorage[game.coreSystem.gameId] = game.coreSystem.debugSettings.value;
  localStorage.setItem('debug-settings', JSON.stringify(debugStorage));
}, { deep: true });

function test() {
  console.warn("testing...");
  let item = game.itemSystem.getInventory('_party_inventory')?.getFirstItemById('ancient_tome') || null;
  item?.properties['durability'].addCurrentValue(-20);
  console.warn(item);

  game.getProperty('lewds')?.addCurrentValue(1);
}

// Check if in dev mode
const isDevMode = computed(() => localStorage.getItem('devMode') === 'true');

async function backToEditor() {
  if (!isDevMode.value) {
    global.addNotificationId('not_in_dev_mode');
    return;
  }

  try {
    // Auto-save to dev slot
    await game.saveGame(DEV_AUTO_SAVE_SLOT);

    // Set flag to return to editor after reload
    localStorage.setItem('returning_to_editor', 'true');

    // Reload page to clean up game's custom JS/CSS
    window.location.reload();
  } catch (error) {
    console.error('Failed to auto-save:', error);
    global.addNotificationId('auto_save_failed');

    // Still go back to editor even if save fails
    localStorage.setItem('returning_to_editor', 'true');
    window.location.reload();
  }
}
</script>

<template>
  <div :id="COMPONENT_ID" class="debug-panel">
    <!--<Button label="Test" @click="test" class="mb-2" />-->

    <!-- Back to Editor Button (only in dev mode) -->
    <div v-if="isDevMode" class="back-to-editor-container">
      <Button label="Back to Editor" icon="pi pi-arrow-left" @click="backToEditor" class="back-to-editor-button"
        severity="warning" />
    </div>

    <!-- Documentation Button -->
    <div class="docs-button-container">
      <Button label="📚 Documentation" @click="global.setViewer('docs')" class="docs-button" />
    </div>

    <!-- Custom tabs -->
    <div class="custom-tabs">
      <div class="tab-buttons">
        <button v-for="option in debugMenuOptions" :key="option.id"
          :class="['tab-button', { active: activeTabId === option.id }]" @click="activeTabId = option.id">
          {{ option.name }}
        </button>
      </div>
      <div v-if="activeComponent" class="tab-content">
        <component :is="activeComponent.component" v-bind="activeComponent.props" />
      </div>
    </div>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" />
  </div>
</template>

<style scoped>
.debug-panel {
  width: 100%;
  height: 100%;
  padding: 1rem;
  background: rgb(220, 220, 220);
  box-sizing: border-box;
  overflow: auto;
}

.debug-panel h1 {
  margin-top: 0;
  color: #42b983;
}

.mb-2 {
  margin-bottom: 0.5rem;
}

/* Custom tabs styling */
.custom-tabs {
  margin-bottom: 1rem;
}

.tab-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
  background: #e0e0e0;
  padding: 0.75rem;
  border-radius: 6px;
}

.tab-button {
  padding: 0.5rem 1rem;
  background: #f5f5f5;
  border: 2px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: #333;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.tab-button:hover {
  background: #fff;
  border-color: #999;
}

.tab-button.active {
  background: #fff;
  border-color: #666;
  color: #000;
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.tab-content {
  background-color: #ffffff;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 0.5rem;
}

.back-to-editor-container {
  background: #e0e0e0;
  border: 2px solid #999;
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.back-to-editor-button {
  width: 100%;
  font-size: 1rem;
  font-weight: 600;
  padding: 0.75rem;
  background-color: #333 !important;
  color: white !important;
  border: none !important;
  transition: all 0.2s ease;
}

.back-to-editor-button:hover {
  background-color: #555 !important;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.back-to-editor-button:active {
  transform: translateY(0);
  background-color: #4c4c4c !important;
}

.docs-button-container {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  transition: all 0.3s ease;
}

.docs-button-container:hover {
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
  transform: translateY(-1px);
}

.docs-button {
  width: 100%;
  font-size: 1rem;
  font-weight: 600;
  padding: 0.75rem;
  background-color: white !important;
  color: #667eea !important;
  border: 2px solid white !important;
  transition: all 0.2s ease;
}

.docs-button:hover {
  background-color: rgba(255, 255, 255, 0.95) !important;
  transform: scale(1.02);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15) !important;
}

.docs-button:active {
  transform: scale(0.98);
}
</style>
