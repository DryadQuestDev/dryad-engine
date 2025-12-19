<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import { useStorage } from '@vueuse/core';
import { Editor } from '../editor';
import { Global } from '../../global/global';
import type { ManifestObject } from '../../schemas/manifestSchema';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const editor = Editor.getInstance();
const global = Global.getInstance();

// Storage key pattern: playtest-mods-{gameId}
// This stores an array of mod IDs that should be loaded during playtest
const getStorageKey = (gameId: string) => `playtest-mods-${gameId}`;

// Reactive storage for the current game's selected mods
const selectedMods = ref<Set<string>>(new Set());

// Available mods list (excluding _core)
const availableMods = computed(() => {
  return editor.mods.filter(mod => mod.id !== '_core');
});

// Load stored mods when popup opens or game changes
watch(() => [props.visible, editor.selectedGame], async ([visible, gameId]) => {
  if (visible && gameId && typeof gameId === 'string') {
    await loadStoredMods(gameId);
  }
}, { immediate: true });

async function loadStoredMods(gameId: string): Promise<void> {
  const storageKey = getStorageKey(gameId);
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    try {
      const storedModIds: string[] = JSON.parse(stored);
      // Validate that stored mods still exist
      const validMods = storedModIds.filter(modId =>
        editor.mods.some(mod => mod.id === modId)
      );
      selectedMods.value = new Set(validMods);

      // If some mods were removed (no longer exist), update storage
      if (validMods.length !== storedModIds.length) {
        saveSelectedMods();
      }
    } catch (e) {
      console.error('Failed to parse stored playtest mods:', e);
      selectedMods.value = new Set();
    }
  } else {
    selectedMods.value = new Set();
  }
}

function saveSelectedMods(): void {
  if (!editor.selectedGame) return;

  const storageKey = getStorageKey(editor.selectedGame);
  const modsArray = Array.from(selectedMods.value);
  localStorage.setItem(storageKey, JSON.stringify(modsArray));
}

function toggleMod(modId: string): void {
  if (selectedMods.value.has(modId)) {
    selectedMods.value.delete(modId);
  } else {
    selectedMods.value.add(modId);
  }
  // Force reactivity update
  selectedMods.value = new Set(selectedMods.value);
  saveSelectedMods();
}

function isModSelected(modId: string): boolean {
  return selectedMods.value.has(modId);
}

function selectAll(): void {
  availableMods.value.forEach(mod => {
    if (mod.id) {
      selectedMods.value.add(mod.id);
    }
  });
  selectedMods.value = new Set(selectedMods.value);
  saveSelectedMods();
}

function deselectAll(): void {
  selectedMods.value.clear();
  selectedMods.value = new Set(selectedMods.value);
  saveSelectedMods();
}

function closeDialog(): void {
  emit('update:visible', false);
}

// Check if mod is the currently active mod in editor
function isActiveMod(modId: string): boolean {
  return editor.selectedMod === modId;
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="closeDialog" modal header="Playtest Mods Configuration"
    :style="{ width: '500px' }">

    <div class="actions-row">
      <button @click="selectAll" class="action-btn">Select All</button>
      <button @click="deselectAll" class="action-btn">Deselect All</button>
    </div>

    <div class="mods-list">
      <div v-if="availableMods.length === 0" class="no-mods">
        No additional mods available for this game.
      </div>
      <div v-else>
        <div v-for="mod in availableMods" :key="mod.id" class="mod-item"
          :class="{ 'active-mod': isActiveMod(mod.id || '') }">
          <label class="mod-label">
            <input type="checkbox" :checked="isModSelected(mod.id || '') || isActiveMod(mod.id || '')"
              @change="toggleMod(mod.id || '')" :disabled="isActiveMod(mod.id || '')" class="mod-checkbox" />
            <div class="mod-info">
              <div class="mod-name">
                {{ mod.id }}<span v-if="mod.name"> ({{ mod.name }})</span>
                <span v-if="isActiveMod(mod.id || '')" class="active-badge">Active</span>
              </div>
              <div class="mod-meta">
                <span v-if="mod.author">by {{ mod.author }}</span>
                <span v-if="mod.version">v{{ mod.version }}</span>
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>


  </Dialog>
</template>

<style scoped>
.actions-row {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.action-btn {
  padding: 6px 12px;
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85em;
  transition: background-color 0.2s;
}

.action-btn:hover {
  background-color: #e0e0e0;
}

.mods-list {
  max-height: 350px;
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 10px;
}

.no-mods {
  padding: 20px;
  text-align: center;
  color: #666;
  font-style: italic;
}

.mod-item {
  padding: 10px;
  border-bottom: 1px solid #eee;
  transition: background-color 0.2s;
}

.mod-item:last-child {
  border-bottom: none;
}

.mod-item:hover {
  background-color: #f8f9fa;
}

.mod-item.active-mod {
  background-color: #e8f5e9;
  border-left: 3px solid #4caf50;
}

.mod-label {
  display: flex;
  align-items: flex-start;
  cursor: pointer;
  gap: 10px;
}

.mod-checkbox {
  margin-top: 3px;
  cursor: pointer;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.mod-checkbox:disabled {
  cursor: not-allowed;
}

.mod-info {
  flex: 1;
}

.mod-name {
  font-weight: 500;
  margin-bottom: 3px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.mod-meta {
  font-size: 0.8em;
  color: #666;
  display: flex;
  gap: 12px;
}

.active-badge {
  display: inline-block;
  padding: 2px 8px;
  background-color: #4caf50;
  color: white;
  font-size: 0.75em;
  border-radius: 3px;
  font-weight: 600;
}
</style>
