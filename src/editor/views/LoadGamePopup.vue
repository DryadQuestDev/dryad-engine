<script setup lang="ts">
import { watch, ref } from 'vue';
import Dialog from 'primevue/dialog';
import { Global } from '../../global/global';
import type { SaveMetaData } from '../../services/indexeddb-save.service';

const props = defineProps<{
  visible: boolean;
  gameId: string | null;
  selectedModId: string | null;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

interface SaveFileDisplayItem {
  slot: string;
  saveMeta?: SaveMetaData;
}

const global = Global.getInstance();
const saveFiles = ref<SaveFileDisplayItem[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);

// Watch for when popup opens - set dev mode flags so we can load dev saves
watch(() => props.visible, async (newVisible) => {
  if (newVisible) {
    // Temporarily set dev mode flag so we can see dev saves in the list
    const wasDevMode = localStorage.getItem('devMode');
    if (!wasDevMode) {
      localStorage.setItem('devMode', 'true');
      localStorage.setItem('_temp_dev_mode_for_popup', 'true');
    }
    // Load saves when popup opens
    await loadSaveList();
  } else {
    // Restore dev mode state when closing
    if (localStorage.getItem('_temp_dev_mode_for_popup')) {
      localStorage.removeItem('devMode');
      localStorage.removeItem('_temp_dev_mode_for_popup');
    }
  }
});

async function loadSaveList(): Promise<void> {
  if (!props.gameId) {
    saveFiles.value = [];
    return;
  }
  try {
    const isDevMode = localStorage.getItem('devMode') === 'true';
    const savesWithMeta = await global.indexedDbSaveService.listSlots(props.gameId, isDevMode);
    saveFiles.value = savesWithMeta;
  } catch (error) {
    console.error(`LoadGamePopup: Failed to load saves:`, error);
    saveFiles.value = [];
  }
}

// Helper function to format playtime
const formatPlayTime = (totalSeconds: number | undefined): string => {
  if (totalSeconds === undefined || totalSeconds < 0) return 'N/A';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// Load game using reload pattern (like playtest)
function loadSelectedGame(slot: string): void {
  if (!props.gameId) {
    global.addNotification('No game selected');
    return;
  }

  // Set dev mode flags
  localStorage.setItem('devMode', 'true');
  localStorage.setItem('dev_mode_selected_game', props.gameId);

  // Set selected mod if available
  if (props.selectedModId) {
    localStorage.setItem('dev_mode_selected_mod', props.selectedModId);
  }

  // Set showDebugPanel to true (using localStorage directly)
  localStorage.setItem('showDebugPanel', 'true');

  // Set flags for App.vue to load the save on reload
  localStorage.setItem('game_loading_slot', slot);
  localStorage.setItem('game_loading_game_id', props.gameId);

  // Clean up temp flag
  localStorage.removeItem('_temp_dev_mode_for_popup');

  // Reload page to properly initialize game
  window.location.reload();
}

async function deleteSaveSlot(slot: string): Promise<void> {
  if (!props.gameId) {
    global.addNotification('No game selected');
    return;
  }
  try {
    await global.indexedDbSaveService.delete(props.gameId, slot);
    global.addNotification('Save deleted');
    await loadSaveList();
  } catch (error) {
    console.error(`LoadGamePopup: Failed to delete save:`, error);
    global.addNotification('Failed to delete save');
  }
}

function triggerLoadFromFile(): void {
  fileInput.value?.click();
}

async function handleFileUpload(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) {
    return;
  }

  const file = target.files[0];
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const fileContent = e.target?.result as string;
      const loadedGameData = JSON.parse(fileContent);

      // Extract gameId from the save data structure
      let gameId = loadedGameData.gameId || loadedGameData.coreSystem?.gameId;

      if (!gameId || typeof gameId !== 'string') {
        global.addNotification('Invalid save file');
        return;
      }

      const tempSlotName = '__load_temporary_save__';
      await global.indexedDbSaveService.save(gameId, tempSlotName, loadedGameData);

      // Set dev mode flags
      localStorage.setItem('devMode', 'true');
      localStorage.setItem('dev_mode_selected_game', gameId);

      // Set selected mod if available
      if (props.selectedModId) {
        localStorage.setItem('dev_mode_selected_mod', props.selectedModId);
      }

      // Set showDebugPanel to true (using localStorage directly)
      localStorage.setItem('showDebugPanel', 'true');

      // Set flags to load this save
      localStorage.setItem('game_loading_slot', tempSlotName);
      localStorage.setItem('game_loading_game_id', gameId);

      // Clean up temp flag
      localStorage.removeItem('_temp_dev_mode_for_popup');

      window.location.reload();
    } catch (error) {
      console.error("LoadGamePopup: Failed to read save file:", error);
      global.addNotification('Failed to load save file');
    } finally {
      if (target) {
        target.value = '';
      }
    }
  };

  reader.onerror = (error) => {
    console.error("LoadGamePopup: Error reading file:", error);
    global.addNotification('Error reading file');
    if (target) {
      target.value = '';
    }
  };

  reader.readAsText(file);
}

function closeDialog() {
  emit('update:visible', false);
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="closeDialog" modal header="Load Game in Dev Mode"
    :style="{ width: '600px' }">

    <div class="load_controls">
      <input type="file" ref="fileInput" @change="handleFileUpload" accept=".json" style="display: none;" />
      <button @click="triggerLoadFromFile" class="load_button">Load from File</button>
    </div>

    <div class="save_list">
      <div v-if="!props.gameId || saveFiles.length === 0" class="no_saves_message">
        <span v-if="!props.gameId">Select a game to see saves.</span>
        <span v-else>No saves found for this game.</span>
      </div>
      <div class="save_item" @click="loadSelectedGame(item.slot)" v-for="item in saveFiles" :key="item.slot">
        <div class="save_item_main_content">
          <div class="save_item_header">
            <div class="save_name">
              <span v-if="item.saveMeta?.isDevMode" class="dev_badge">Dev</span>
              <span>{{ item.slot }}</span>
            </div>
            <button class="delete_save_button" @click.stop="deleteSaveSlot(item.slot)">Delete</button>
          </div>
          <div class="save_meta" v-if="item.saveMeta">
            <span><b>{{ item.saveMeta.mods.join(', ') }}</b></span>
            <span>Date: {{ new Date(item.saveMeta.saveDate).toLocaleString() }}</span>
            <span>Playtime: {{ formatPlayTime(item.saveMeta.playTime) }}</span>
            <span>Engine: v{{ item.saveMeta.engineVersion }}</span>
          </div>
          <div class="save_meta" v-else>
            <span>Metadata not available.</span>
          </div>
        </div>
      </div>
    </div>

  </Dialog>
</template>

<style scoped>
.save_list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
  max-height: 400px;
}

.save_item {
  cursor: pointer;
  display: flex;
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.save_item:hover {
  background-color: #f5f5f5;
  border-color: #9b9b9b;
}

.save_item_main_content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  width: 100%;
}

.save_item_header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  margin-bottom: 8px;
}

.save_name {
  font-weight: bold;
  margin-right: 10px;
  flex-grow: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dev_badge {
  background-color: #ff9800;
  color: white;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.85em;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.delete_save_button {
  padding: 5px 10px;
  background-color: #ff6b6b;
  color: white;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.9em;
  transition: background-color 0.2s ease;
  flex-shrink: 0;
}

.delete_save_button:hover {
  background-color: #ef0000;
  outline: 1px solid #000000;
}

.save_meta {
  font-size: 0.8em;
  color: #555;
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
}

.save_meta span {
  overflow: hidden;
  text-overflow: ellipsis;
  word-wrap: break-word;
}

.no_saves_message {
  padding: 10px;
  font-style: italic;
  color: #888;
  text-align: center;
  flex-grow: 1;
  display: flex;
  justify-content: center;
}

.load_controls {
  margin-top: 10px;
  padding-bottom: 10px;
  display: flex;
}

.load_button {
  padding: 8px 15px;
  background-color: #2196F3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  width: 100%;
}

.load_button:hover {
  background-color: #1e88e5;
}
</style>
