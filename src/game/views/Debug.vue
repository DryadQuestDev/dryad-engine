<script setup lang="ts">
import { Global } from '../../global/global';
import { Game } from '../game';
import CustomComponentContainer from './CustomComponentContainer.vue';
import { computed, watch, onMounted } from 'vue';
import { useStorage } from '@vueuse/core';
import Button from 'primevue/button';
import { DEV_AUTO_SAVE_SLOT, DEV_PREV_SCENE_SLOT, DEV_REPLAY_SCENE_KEY, DEV_LEFT_SCENE_KEY } from '../../services/indexeddb-save.service';

const COMPONENT_ID = 'debug-panel';

const global = Global.getInstance();
const game = Game.getInstance();

const expanded = useStorage('debug-panel-expanded', false);

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

const isWebMode = import.meta.env.VITE_WEB_MODE === 'true';

// Reload into the pre-scene checkpoint and force-replay the current scene, so an edited
// scene shows its new content and re-fires its enter actions once on clean state. The
// checkpoint carries its own currentSceneId, so the replay flag needs no scene id.
function hardSceneReset() {
  if (!game.dungeonSystem.currentSceneId.value) return;
  // Re-assert dev flags: a second app instance (the editor) shares localStorage and can
  // clear devMode, which would otherwise reload the game with the debug panel gone.
  localStorage.setItem('devMode', 'true');
  localStorage.setItem('showDebugPanel', 'true');
  localStorage.setItem(DEV_REPLAY_SCENE_KEY, '1');
  game.loadGame(DEV_PREV_SCENE_SLOT);
}

async function backToEditor() {

  // Record whether we left mid-scene so the editor "Continue" button knows which dev save
  // to resume from (pre-scene checkpoint for a clean re-enter, else the auto-save).
  const leftScene = game.dungeonSystem.currentSceneId.value;
  if (leftScene) localStorage.setItem(DEV_LEFT_SCENE_KEY, leftScene);
  else localStorage.removeItem(DEV_LEFT_SCENE_KEY);

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

    <!-- Expand/Collapse Button -->
    <button class="expand-button" @click="expanded = !expanded"
      :title="expanded ? 'Collapse panel' : 'Expand panel full width'">
      <i :class="expanded ? 'pi pi-chevron-right' : 'pi pi-chevron-left'"></i>
    </button>

    <div class="back-to-editor-container">
      <Button label="Back to Editor" icon="pi pi-arrow-left" @click="backToEditor" class="back-to-editor-button"
        severity="warning" />
    </div>

    <!-- Documentation Button -->
    <div class="docs-button-container">
      <Button label="📚 Documentation" @click="global.setViewer('docs')" class="docs-button" />
    </div>

    <!-- Hard Scene Reset — only while a scene is playing -->
    <div v-if="game.dungeonSystem.currentSceneId.value" class="hard-reset-container">
      <Button label="🔄 Hard Scene Reset" @click="hardSceneReset" class="hard-reset-button" severity="secondary"
        v-tooltip.left="'Dev tool: reload and re-enter the current scene from scratch — rebuilds its text from your latest content edits and re-runs its enter actions once (on clean pre-scene state).'" />
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
    <CustomComponentContainer :slot="COMPONENT_ID" :context="{ activeTabId }" />
  </div>
</template>

<style scoped>
.debug-panel {
  position: relative;
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

.expand-button {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e0e0e0;
  border: 1px solid #bbb;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: #555;
  z-index: 1;
  transition: all 0.15s ease;
}

.expand-button:hover {
  background: #d0d0d0;
  border-color: #999;
  color: #333;
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

.hard-reset-container {
  background: #e0e0e0;
  border: 2px solid #999;
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.hard-reset-button {
  width: 100%;
  font-size: 1rem;
  font-weight: 600;
  padding: 0.75rem;
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
