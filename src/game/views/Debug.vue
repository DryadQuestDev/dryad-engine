<script setup lang="ts">
import { Global } from '../../global/global';
import { Game } from '../game';
import CustomComponentContainer from './CustomComponentContainer.vue';
import { computed, watch, onMounted, onUnmounted, ref, nextTick } from 'vue';
import { useStorage } from '@vueuse/core';
import Button from 'primevue/button';
import { editorTheme, scopePrimeVueTokens } from '../../editor/editorTheme';
import {
  hardSceneReset, stepBack, canStepBack, backToEditor, playPosition, debugPanelCollapsed, takeSnapshot, loadSnapshot,
  namingSnapshotId, HARD_RESET_KEY, STEP_BACK_KEY, TOGGLE_PANEL_KEY, SNAPSHOT_KEY,
} from '../utils/devPlaytest';
import { devProblems } from '../utils/devProblems';
import { listSnapshots, renameSnapshot, deleteSnapshot, snapshotAge, snapshotPlace, type DevSnapshot } from '../../services/devSnapshots';

const COMPONENT_ID = 'debug-panel';

const global = Global.getInstance();
const game = Game.getInstance();

const expanded = useStorage('debug-panel-expanded', false);

// Panel width in px, applied by GameScreen.vue on `.game-body-panel` (ignored while expanded).
// Set by dragging the panel's left edge.
const DEFAULT_PANEL_WIDTH = 350;
const MIN_PANEL_WIDTH = 200;
const panelWidth = useStorage('debug-panel-width', DEFAULT_PANEL_WIDTH);

function startResize(event: PointerEvent) {
  const handle = event.currentTarget as HTMLElement;
  handle.setPointerCapture(event.pointerId);
  const onMove = (e: PointerEvent) => {
    const width = window.innerWidth - e.clientX;
    panelWidth.value = Math.round(Math.max(MIN_PANEL_WIDTH, Math.min(window.innerWidth - 240, width)));
  };
  const onUp = () => {
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onUp);
  };
  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onUp);
}

// Where Back to Editor lands: the dungeon and room, and the paragraph on screen.
const placeLine = computed(() => [playPosition.value.dungeonId, playPosition.value.roomId].filter(Boolean).join(' › '));

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

  // No tab yet, or a stored one that no longer exists (a renamed or removed tab): open the first.
  const known = debugMenuOptions.value.some(option => option.id === activeTabId.value);
  if (!known && debugMenuOptions.value.length > 0) {
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

const isWebMode = import.meta.env.VITE_WEB_MODE === 'true';

const inScene = computed(() => !!game.dungeonSystem.currentSceneId.value);

const hardResetLabel = computed(() => `${inScene.value ? '🔄 Replay paragraph' : '🔄 Reload Game'} (${HARD_RESET_KEY})`);

const hardResetTooltip = computed(() => inScene.value
  ? 'Replay the paragraph on screen with your latest saved changes. Its actions run once, on the state it had before.'
  : 'Reload the game and carry on where you are, with your latest content, script and CSS changes.');

const stepBackLabel = `⏪ Back one paragraph (${STEP_BACK_KEY})`;
const stepBackTooltip = 'Go back one paragraph and replay it on the state it had then, for example to pick the other answer of a menu.';

// Snapshots: named moments kept per game, across reloads.
const snapshots = computed(() => listSnapshots(game.coreSystem.gameId));

// Ages ("3 min ago") tick on their own while the panel is open.
const now = ref(Date.now());
let ageTimer: number | undefined;

const editingId = ref<string | null>(null);
const draftName = ref('');
// A snapshot just taken is named in place; Escape then drops it, where it only cancels a rename.
const editingIsNew = ref(false);
const nameInput = ref<HTMLInputElement[] | HTMLInputElement | null>(null);
const menuId = ref<string | null>(null);
const confirmDeleteId = ref<string | null>(null);

function startEditing(snapshot: DevSnapshot, isNew: boolean) {
  menuId.value = null;
  editingId.value = snapshot.id;
  editingIsNew.value = isNew;
  draftName.value = snapshot.name;
  nextTick(() => {
    const input = Array.isArray(nameInput.value) ? nameInput.value[0] : nameInput.value;
    input?.focus();
    input?.select();
  });
}

watch(namingSnapshotId, (id) => {
  if (!id) return;
  namingSnapshotId.value = null;
  const snapshot = snapshots.value.find(s => s.id === id);
  if (snapshot) startEditing(snapshot, true);
});

function commitName() {
  const id = editingId.value;
  if (!id) return;
  editingId.value = null;
  renameSnapshot(game.coreSystem.gameId, id, draftName.value);
}

function cancelName() {
  const id = editingId.value;
  if (!id) return;
  editingId.value = null;
  if (editingIsNew.value) deleteSnapshot(game.coreSystem.gameId, id);
}

function toggleMenu(id: string) {
  confirmDeleteId.value = null;
  menuId.value = menuId.value === id ? null : id;
}

function removeSnapshot(id: string) {
  if (confirmDeleteId.value !== id) {
    confirmDeleteId.value = id;
    return;
  }
  menuId.value = null;
  confirmDeleteId.value = null;
  deleteSnapshot(game.coreSystem.gameId, id);
}

function closeMenuOutside(event: PointerEvent) {
  if (!menuId.value) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('.snapshot-menu, .snapshot-more')) return;
  menuId.value = null;
  confirmDeleteId.value = null;
}

onMounted(() => {
  ageTimer = window.setInterval(() => { now.value = Date.now(); }, 15000);
  window.addEventListener('pointerdown', closeMenuOutside);
});

onUnmounted(() => {
  window.clearInterval(ageTimer);
  window.removeEventListener('pointerdown', closeMenuOutside);
});

</script>

<template>
  <!-- The dev panel is editor furniture parked next to the game, so it follows the editor's
       theme preference. The class is local: it themes this subtree (PrimeVue tokens included)
       and leaves the game beside it alone. -->
  <div :id="COMPONENT_ID" class="debug-panel" :class="{ 'editor-dark': editorTheme === 'dark' }">
    <!--<Button label="Test" @click="test" class="mb-2" />-->

    <!-- Outside the scrolling box, so the handle stays along the whole edge at any scroll. -->
    <div v-if="!expanded" class="resize-handle" title="Drag to resize" @pointerdown.prevent="startResize"></div>

    <div class="debug-panel-scroll">
      <div class="panel-top-row">
        <button class="panel-icon-button" @click="debugPanelCollapsed = true" :title="`Hide the panel (${TOGGLE_PANEL_KEY})`">
          <i class="pi pi-angle-double-right"></i>
        </button>
        <button class="panel-icon-button" @click="expanded = !expanded"
          :title="expanded ? 'Back to the side' : 'Expand to full width'">
          <i :class="expanded ? 'pi pi-window-minimize' : 'pi pi-window-maximize'"></i>
        </button>
      </div>

      <div class="back-to-editor-container">
        <Button label="Back to Editor" icon="pi pi-arrow-left" @click="backToEditor()" class="back-to-editor-button"
          severity="warning" v-tooltip.left="'Opens the editor on the paragraph on screen'" />
        <div v-if="placeLine" class="play-position">
          <span class="play-position-place">{{ placeLine }}</span>
          <code v-if="playPosition.sceneId" class="play-position-scene">{{ playPosition.sceneId }}</code>
        </div>
      </div>

      <!-- Documentation Button -->
      <div class="docs-button-container">
        <Button label="📚 Documentation" @click="global.setViewer('docs')" class="docs-button" />
      </div>

      <!-- Hard reset: re-enters the current scene, or plain reloads when outside one -->
      <div class="hard-reset-container">
        <Button :label="hardResetLabel" @click="hardSceneReset" class="hard-reset-button" severity="secondary"
          v-tooltip.left="hardResetTooltip" />
        <Button :label="stepBackLabel" @click="stepBack" :disabled="!canStepBack" class="hard-reset-button step-back-button"
          severity="secondary" v-tooltip.left="stepBackTooltip" />

        <div class="snapshots">
          <div class="snapshots-head">
            <span class="snapshots-title">Snapshots</span>
            <button type="button" class="snapshot-save" @click="takeSnapshot()"
              v-tooltip.left="'Save this moment under a name. Load it any time, even after a reload.'">
              <i class="pi pi-camera" />
              <span>Save snapshot</span>
              <kbd>{{ SNAPSHOT_KEY }}</kbd>
            </button>
          </div>
          <div v-for="snap in snapshots" :key="snap.id" class="snapshot"
            :class="{ 'snapshot--naming': editingId === snap.id }">
            <template v-if="editingId === snap.id">
              <div class="snapshot-body">
                <input ref="nameInput" v-model="draftName" class="snapshot-name-input" spellcheck="false"
                  @keydown.enter.prevent="commitName" @keydown.esc.prevent.stop="cancelName" @blur="commitName" />
                <div class="snapshot-meta"><code>{{ snapshotPlace(snap) }}</code> · {{ snapshotAge(snap.savedAt, now) }}</div>
              </div>
              <button type="button" class="snapshot-confirm" title="Keep this name (Enter)" @mousedown.prevent
                @click="commitName">
                <i class="pi pi-check" />
              </button>
            </template>
            <template v-else>
              <div class="snapshot-body" :title="snap.dungeonId ?? ''">
                <div class="snapshot-name">{{ snap.name }}</div>
                <div class="snapshot-meta">
                  <code>{{ snapshotPlace(snap) }}</code> · {{ snapshotAge(snap.savedAt, now) }}<template
                    v-if="snap.summary"> · <span class="snapshot-summary">{{ snap.summary }}</span></template>
                </div>
              </div>
              <button type="button" class="snapshot-load" @click="loadSnapshot(snap.id)">Load</button>
              <button type="button" class="snapshot-more" :class="{ 'snapshot-more--open': menuId === snap.id }"
                title="Rename or delete" @click="toggleMenu(snap.id)">
                <i class="pi pi-ellipsis-v" />
              </button>
              <div v-if="menuId === snap.id" class="snapshot-menu">
                <button type="button" @click="startEditing(snap, false)"><i class="pi pi-pencil" /> Rename</button>
                <button type="button" class="snapshot-menu-delete" @click="removeSnapshot(snap.id)">
                  <i class="pi pi-trash" /> {{ confirmDeleteId === snap.id ? 'Click again to delete' : 'Delete' }}
                </button>
              </div>
            </template>
          </div>
          <div class="snapshots-hint">Kept per game, across reloads. Playtest ▾ in the editor can start from one.</div>
        </div>
      </div>

      <!-- Custom tabs -->
      <div class="custom-tabs">
        <div class="tab-buttons">
          <button v-for="option in debugMenuOptions" :key="option.id"
            :class="['tab-button', { active: activeTabId === option.id }]" @click="activeTabId = option.id">
            {{ option.name }}
            <span v-if="option.id === 'debug-problems' && devProblems.length" class="tab-badge">{{ devProblems.length }}</span>
          </button>
        </div>
        <div v-if="activeComponent" class="tab-content">
          <component :is="activeComponent.component" v-bind="activeComponent.props" />
        </div>
      </div>

      <!-- Custom components registered to this container -->
      <CustomComponentContainer :slot="COMPONENT_ID" :context="{ activeTabId }" />
    </div>
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
  background: var(--dp-bg);
  color: var(--dp-text);
  box-sizing: border-box;
}

.debug-panel-scroll {
  height: 100%;
  padding: 1rem;
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

.resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 2;
}

.resize-handle:hover {
  background: var(--dp-border-hover);
}

.panel-top-row {
  display: flex;
  gap: 0.35rem;
  margin: -0.5rem 0 0.5rem;
}

.panel-icon-button {
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
}

.panel-icon-button:hover {
  background: var(--dp-control-hover);
  border-color: var(--dp-border-hover);
  color: var(--dp-text-strong);
}

.play-position {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.8rem;
  min-width: 0;
}

.play-position-place {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.play-position-scene {
  font-size: 0.75rem;
  opacity: 0.8;
  overflow-wrap: anywhere;
}

.tab-badge {
  display: inline-block;
  min-width: 1.2rem;
  margin-left: 0.3rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: #d9534f;
  color: #fff;
  font-size: 0.72rem;
  font-weight: 700;
  line-height: 1.2rem;
  text-align: center;
}

.back-to-editor-container {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
  background: var(--dp-block);
  border: 2px solid var(--dp-block-border);
  border-radius: 6px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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

.step-back-button {
  margin-top: 0.5rem;
}

.snapshots {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--dp-border);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.snapshots-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.snapshots-title {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--dp-text-strong);
}

.snapshot-save {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.55rem;
  background: var(--dp-content-bg);
  border: 1px solid var(--dp-border);
  border-radius: 6px;
  color: var(--dp-text-strong);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.snapshot-save:hover {
  border-color: var(--dp-border-hover);
  background: var(--dp-control-hover);
}

.snapshot-save kbd {
  padding: 0 0.25rem;
  border: 1px solid var(--dp-border-hover);
  border-radius: 3px;
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 600;
}

.snapshot {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.45rem 0.4rem 0.6rem;
  background: var(--dp-content-bg);
  border: 1px solid var(--dp-content-border);
  border-radius: 6px;
}

.snapshot--naming {
  border: 2px solid var(--editor-fg-success);
  padding: calc(0.4rem - 1px) calc(0.45rem - 1px) calc(0.4rem - 1px) calc(0.6rem - 1px);
}

.snapshot-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.snapshot-name {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--dp-text-strong);
  overflow-wrap: anywhere;
}

.snapshot-name-input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--dp-border);
  border-radius: 4px;
  background: var(--dp-content-bg);
  color: var(--dp-text-strong);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
}

.snapshot-name-input:focus {
  outline: none;
  border-color: var(--dp-border-hover);
}

.snapshot-meta {
  font-size: 0.72rem;
  opacity: 0.8;
  overflow-wrap: anywhere;
}

.snapshot-meta code {
  font-size: 0.7rem;
}

.snapshot-summary {
  display: inline-block;
}

.snapshot-load {
  flex: 0 0 auto;
  padding: 0.25rem 0.6rem;
  background: var(--dp-control);
  border: 1px solid var(--dp-border-hover);
  border-radius: 5px;
  color: var(--dp-text-strong);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.snapshot-load:hover {
  background: var(--dp-control-hover);
}

.snapshot-confirm {
  flex: 0 0 auto;
  width: 2.2rem;
  height: 1.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 5px;
  background: #16a34a;
  color: #fff;
  cursor: pointer;
}

.snapshot-confirm:hover {
  background: #15803d;
}

.snapshot-more {
  flex: 0 0 auto;
  width: 1.4rem;
  height: 1.7rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--dp-text);
  cursor: pointer;
}

.snapshot-more:hover,
.snapshot-more--open {
  background: var(--dp-control);
}

.snapshot-menu {
  position: absolute;
  right: 0.3rem;
  top: calc(100% - 0.2rem);
  z-index: 3;
  display: flex;
  flex-direction: column;
  min-width: 9rem;
  padding: 0.25rem;
  background: var(--dp-content-bg);
  border: 1px solid var(--dp-border-hover);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}

.snapshot-menu button {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--dp-text);
  font: inherit;
  font-size: 0.8rem;
  text-align: left;
  cursor: pointer;
}

.snapshot-menu button:hover {
  background: var(--dp-control);
}

.snapshot-menu .snapshot-menu-delete {
  color: var(--editor-fg-danger);
}

.snapshots-hint {
  font-size: 0.72rem;
  opacity: 0.75;
  line-height: 1.35;
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
