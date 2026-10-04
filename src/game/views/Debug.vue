<script setup lang="ts">
import { Global } from '../../global/global';
import { Game } from '../game';
import CustomComponentContainer from './CustomComponentContainer.vue';
import { computed, ref, watch, onMounted } from 'vue';
import { useStorage } from '@vueuse/core';
import Button from 'primevue/button';
import { editorTheme, scopePrimeVueTokens } from '../../editor/editorTheme';
import { DEV_AUTO_SAVE_SLOT, DEV_PREV_SCENE_SLOT, DEV_REPLAY_SCENE_KEY, DEV_LEFT_SCENE_KEY } from '../../services/indexeddb-save.service';

const COMPONENT_ID = 'debug-panel';

const global = Global.getInstance();
const game = Game.getInstance();

const expanded = useStorage('debug-panel-expanded', false);

// Panel width in px, applied by GameScreen.vue on `.game-body-panel` (ignored while expanded).
const DEFAULT_PANEL_WIDTH = 350;
const MIN_PANEL_WIDTH = 100;
const panelWidth = useStorage('debug-panel-width', DEFAULT_PANEL_WIDTH);

// Buffer the field locally so a half-typed value ("1" on the way to "150") doesn't collapse
// the panel mid-keystroke — the store is only written on change/blur, clamped.
const widthInput = ref(panelWidth.value);
watch(panelWidth, (w) => { widthInput.value = w; });

function commitWidth() {
  const parsed = Math.round(Number(widthInput.value));
  panelWidth.value = Number.isFinite(parsed) && parsed > 0 ? Math.max(MIN_PANEL_WIDTH, parsed) : DEFAULT_PANEL_WIDTH;
  widthInput.value = panelWidth.value;
}

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
  // The panel themes a subtree rather than the document, which PrimeVue's :root-level
  // token aliases do not survive on their own.
  scopePrimeVueTokens();

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
  if (item && typeof item.traits.durability === 'number') item.traits.durability -= 20;
  console.warn(item);

  game.getProperty('lewds')?.addCurrentValue(1);
}

const isWebMode = import.meta.env.VITE_WEB_MODE === 'true';

const inScene = computed(() => !!game.dungeonSystem.currentSceneId.value);

const hardResetLabel = computed(() => inScene.value ? '🔄 Hard Scene Reset' : '🔄 Reload Game');

const hardResetTooltip = computed(() => inScene.value
  ? 'Dev tool: reload and re-enter the current scene from scratch — rebuilds its text from your latest content edits and re-runs its enter actions once (on clean pre-scene state).'
  : 'Dev tool: reload the app and resume right where you are — picks up your latest content, script and CSS edits.');

// In a scene: reload into the pre-scene checkpoint and force-replay the current scene, so an
// edited scene shows its new content and re-fires its enter actions once on clean state. The
// checkpoint carries its own currentSceneId, so the replay flag needs no scene id.
// Outside a scene (map, menus): checkpoint where we stand and reload into it.
async function hardSceneReset() {
  // Re-assert dev flags: a second app instance (the editor) shares localStorage and can
  // clear devMode, which would otherwise reload the game with the debug panel gone.
  localStorage.setItem('devMode', 'true');
  localStorage.setItem('showDebugPanel', 'true');

  if (inScene.value) {
    localStorage.setItem(DEV_REPLAY_SCENE_KEY, '1');
    game.loadGame(DEV_PREV_SCENE_SLOT);
    return;
  }

  // Keep the editor's "Continue" marker honest: outside a scene it resumes the auto-save.
  localStorage.removeItem(DEV_LEFT_SCENE_KEY);
  // forceSave: the current state may have saves disabled (replay mode etc.), but a dev
  // reload still needs a checkpoint to come back to.
  await game.saveGame(DEV_AUTO_SAVE_SLOT, { noNotification: true, forceSave: true });
  game.loadGame(DEV_AUTO_SAVE_SLOT);
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
  <!-- The dev panel is editor furniture parked next to the game, so it follows the editor's
       theme preference. The class is local: it themes this subtree (PrimeVue tokens included)
       and leaves the game beside it alone. -->
  <div :id="COMPONENT_ID" class="debug-panel" :class="{ 'editor-dark': editorTheme === 'dark' }">
    <!--<Button label="Test" @click="test" class="mb-2" />-->

    <!-- Expand/Collapse Button -->
    <button class="expand-button" @click="expanded = !expanded"
      :title="expanded ? 'Collapse panel' : 'Expand panel full width'">
      <i :class="expanded ? 'pi pi-chevron-right' : 'pi pi-chevron-left'"></i>
    </button>

    <div class="back-to-editor-container">
      <input type="number" class="panel-width-input" v-model.number="widthInput" :min="MIN_PANEL_WIDTH" step="10"
        @change="commitWidth" @blur="commitWidth"
        v-tooltip.left="`Debug panel width in pixels (min ${MIN_PANEL_WIDTH})`" />
      <Button label="Back to Editor" icon="pi pi-arrow-left" @click="backToEditor" class="back-to-editor-button"
        severity="warning" />
    </div>

    <!-- Documentation Button -->
    <div class="docs-button-container">
      <Button label="📚 Documentation" @click="global.setViewer('docs')" class="docs-button" />
    </div>

    <!-- Hard reset: re-enters the current scene, or plain reloads when outside one -->
    <div class="hard-reset-container">
      <Button :label="hardResetLabel" @click="hardSceneReset" class="hard-reset-button" severity="secondary"
        v-tooltip.left="hardResetTooltip" />
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
  --dp-bg: rgb(220, 220, 220);
  --dp-block: #e0e0e0;
  --dp-block-border: #999;
  --dp-control: #f5f5f5;
  --dp-control-hover: #ffffff;
  --dp-border: #ccc;
  --dp-border-hover: #999;
  --dp-text: #333;
  --dp-text-strong: #000;
  --dp-content-bg: #ffffff;
  --dp-content-border: #dee2e6;
  --dp-accent-button: #333;
  --dp-accent-button-hover: #555;

  position: relative;
  width: 100%;
  height: 100%;
  padding: 1rem;
  background: var(--dp-bg);
  color: var(--dp-text);
  box-sizing: border-box;
  overflow: auto;
}

.debug-panel.editor-dark {
  --dp-bg: var(--editor-surface);
  --dp-block: var(--editor-surface-raised);
  --dp-block-border: var(--editor-border-strong);
  --dp-control: var(--editor-surface-hover);
  --dp-control-hover: var(--editor-surface-selected);
  --dp-border: var(--editor-border);
  --dp-border-hover: var(--editor-border-strong);
  --dp-text: var(--editor-text);
  --dp-text-strong: var(--editor-text);
  --dp-content-bg: var(--editor-surface-sunken);
  --dp-content-border: var(--editor-border);
  --dp-accent-button: var(--editor-surface-hover);
  --dp-accent-button-hover: var(--editor-surface-selected);
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
  background: var(--dp-block);
  border: 1px solid var(--dp-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  color: var(--dp-text);
  z-index: 1;
  transition: all 0.15s ease;
}

.expand-button:hover {
  background: var(--dp-control-hover);
  border-color: var(--dp-border-hover);
  color: var(--dp-text-strong);
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
  background: var(--dp-block);
  padding: 0.75rem;
  border-radius: 6px;
}

.tab-button {
  padding: 0.5rem 1rem;
  background: var(--dp-control);
  border: 2px solid var(--dp-border);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--dp-text);
  transition: all 0.2s ease;
  white-space: nowrap;
}

.tab-button:hover {
  background: var(--dp-control-hover);
  border-color: var(--dp-border-hover);
}

.tab-button.active {
  background: var(--dp-control-hover);
  border-color: var(--dp-border-hover);
  color: var(--dp-text-strong);
  font-weight: 600;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.tab-content {
  background-color: var(--dp-content-bg);
  border: 1px solid var(--dp-content-border);
  border-radius: 4px;
  padding: 0.5rem;
}

.back-to-editor-container {
  display: flex;
  align-items: stretch;
  gap: 0.5rem;
  background: var(--dp-block);
  border: 2px solid var(--dp-block-border);
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.panel-width-input {
  width: 4.5rem;
  flex-shrink: 0;
  padding: 0.5rem;
  background: var(--dp-control);
  border: 2px solid var(--dp-border);
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--dp-text);
  text-align: center;
  transition: all 0.2s ease;
}

.panel-width-input:hover {
  background: var(--dp-control-hover);
  border-color: var(--dp-border-hover);
}

.panel-width-input:focus {
  outline: none;
  background: var(--dp-control-hover);
  border-color: var(--dp-border-hover);
}

.back-to-editor-button {
  flex: 1;
  min-width: 0;
  font-size: 1rem;
  font-weight: 600;
  padding: 0.75rem;
  background-color: var(--dp-accent-button) !important;
  color: #fff !important;
  border: none !important;
  transition: all 0.2s ease;
}

.back-to-editor-button:hover {
  background-color: var(--dp-accent-button-hover) !important;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.back-to-editor-button:active {
  transform: translateY(0);
  background-color: var(--dp-accent-button-hover) !important;
}

.hard-reset-container {
  background: var(--dp-block);
  border: 2px solid var(--dp-block-border);
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
