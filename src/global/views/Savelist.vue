<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { Global } from '../global'; // Import the Global singleton
import { Game } from '../../game/game';
import type { SaveMetaData } from '../../services/indexeddb-save.service'; // Import the interface

const props = defineProps<{
  gameId: string | null;
  isFromGame: boolean;
}>();

interface SaveFileDisplayItem {
  slot: string;
  saveMeta?: SaveMetaData;
}

const saveFiles = ref<SaveFileDisplayItem[]>([]); // Updated type
const global = Global.getInstance();
const game = Game.getInstance(); // Get game instance
const newSaveName = ref<string>(''); // For the new save input
const fileInput = ref<HTMLInputElement | null>(null); // Ref for the file input
const isSaveDisabled = computed(() => props.isFromGame && game.coreSystem.isSaveDisabled());

// Generate default save name
const generateDefaultSaveName = () => {
  const dungeonName = game.dungeonSystem.currentDungeon.value?.getDungeonName() || 'Unknown';
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${dungeonName}(${month}/${day}/${year} ${hours}:${minutes}:${seconds})`;
};

// Set default save name when component is mounted
onMounted(() => {
  if (props.isFromGame) {
    newSaveName.value = generateDefaultSaveName();
  }
});

async function loadSaveList(currentGameId: string | null): Promise<void> {
  //console.log(`Savelist: Loading saves for ${currentGameId}`);
  if (!currentGameId) {
    saveFiles.value = [];
    return;
  }
  try {
    // Check if in dev mode to include dev saves
    const isDevMode = localStorage.getItem('devMode') === 'true';
    // listSlots now returns { slot: string; saveMeta?: SaveMetaData }[]
    const savesWithMeta = await global.indexedDbSaveService.listSlots(currentGameId, isDevMode);
    saveFiles.value = savesWithMeta;
    //console.log(`Savelist: Loaded saves for ${currentGameId}:`, savesWithMeta);
  } catch (error) {
    console.error(`Savelist: Failed to load saves for ${currentGameId}:`, error);
    saveFiles.value = []; // Reset saves on error
    global.addNotificationId("error_load_saves_failed");
  }
}

watch(() => props.gameId, async (newGameId) => {
  await loadSaveList(newGameId);
}, { immediate: true });

// Helper function to format playtime from seconds to HH:MM:SS
const formatPlayTime = (totalSeconds: number | undefined): string => {
  if (totalSeconds === undefined || totalSeconds < 0) return 'N/A';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

async function loadSelectedGame(slot: string): Promise<void> {
  if (!props.gameId) {
    console.error("Savelist: Cannot load game: No game ID available.");
    global.addNotificationId("error_load_no_game");
    return;
  }

  global.loadGameSlot(props.gameId, slot);
}

async function deleteSaveSlot(slot: string): Promise<void> {
  if (!props.gameId) {
    console.error("Savelist: Cannot delete save: No game ID available.");
    global.addNotificationId("error_delete_save_no_game");
    return;
  }
  const currentgameId = props.gameId;
  //console.log(`Savelist: Attempting to delete save: ${slot} for game: ${currentgameId}`);
  try {
    await global.indexedDbSaveService.delete(currentgameId, slot);
    console.log(`Savelist: Save slot ${slot} deleted successfully for game ${currentgameId}.`);
    global.addNotificationId("info_save_deleted");
    await loadSaveList(currentgameId); // Reload the save list
  } catch (error) {
    console.error(`Savelist: Failed to delete save slot ${slot} for game ${currentgameId}:`, error);
    global.addNotificationId("error_delete_save_failed");
  }
}

async function saveLocally(): Promise<void> {
  const saveName = newSaveName.value.trim();
  if (!saveName) {
    console.error("Savelist: Save name cannot be empty.");
    global.addNotificationId("error_save_empty_name");
    return;
  }
  try {
    await game.saveGame(saveName);
    await loadSaveList(props.gameId); // Refresh the list
    newSaveName.value = ''; // Clear input (will trigger regeneration)
  } catch (error) {
    console.error("Savelist: Failed to save game locally:", error);
    // Notification for generic save failure is handled in Game.saveGame
  }
}

async function saveToFile(): Promise<void> {
  if (!props.gameId) {
    console.error("Savelist: Cannot save game to file: No game ID available.");
    global.addNotificationId("error_save_no_game_file");
    return;
  }
  const saveName = newSaveName.value.trim();
  if (!saveName) {
    console.error("Savelist: Save name cannot be empty for file save.");
    global.addNotificationId("error_save_empty_name_file");
    return;
  }
  try {
    // This method will be implemented in Game.ts
    await game.saveGameToFile(saveName);
    // No need to refresh save list as it's a download
    // newSaveName.value = ''; // Optionally clear name after download
  } catch (error) {
    console.error("Savelist: Failed to save game to file:", error);
    global.addNotificationId("error_save_to_file_failed");
  }
}

function triggerLoadFromFile(): void {
  fileInput.value?.click();
}

async function handleFileUpload(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement;
  if (!target.files || target.files.length === 0) {
    console.warn("Savelist: No file selected for loading.");
    return;
  }

  const file = target.files[0];
  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const fileContent = e.target?.result as string;
      const loadedGameData = JSON.parse(fileContent);

      // Extract gameId from the save data structure
      // The gameId can be at the root level or inside coreSystem
      let gameId = loadedGameData.gameId || loadedGameData.coreSystem?.gameId;

      if (!gameId || typeof gameId !== 'string') {
        console.error("Savelist: Invalid game file. Missing or invalid gameId.", loadedGameData);
        global.addNotificationId("error_load_file_invalid_data");
        return;
      }

      const tempSlotName = '__load_temporary_save__';
      // The loadedGameData is the state of the 'Game' object, which is what indexedDbSaveService.save expects.
      await global.indexedDbSaveService.save(gameId, tempSlotName, loadedGameData);

      localStorage.setItem('game_loading_slot', tempSlotName);
      localStorage.setItem('game_loading_game_id', gameId);

      console.log(`Savelist: Game file "${file.name}" prepared for loading into slot "${tempSlotName}" for gameId "${gameId}". Reloading...`);
      window.location.reload();

    } catch (error) {
      console.error("Savelist: Failed to read or parse game file:", error);
      global.addNotificationId("error_load_file_failed");
    } finally {
      // Reset file input to allow selecting the same file again if needed
      if (target) {
        target.value = '';
      }
    }
  };

  reader.onerror = (error) => {
    console.error("Savelist: Error reading file:", error);
    global.addNotificationId("error_load_file_read_failed");
    if (target) {
      target.value = '';
    }
  };

  reader.readAsText(file);
}

</script>

<template>

  <div class="load_controls">
    <input type="file" ref="fileInput" @change="handleFileUpload" accept=".json" style="display: none;" />
    <button @click="triggerLoadFromFile" class="load_button">
      <i class="pi pi-upload"></i>
      <span>Load from File</span>
    </button>
    <button v-if="isFromGame" @click="saveToFile" class="load_button" :disabled="isSaveDisabled">
      <i class="pi pi-download"></i>
      <span>Save to File</span>
    </button>
  </div>

  <div class="ingame_block" v-if="isFromGame">
    <div class="save_controls">
      <input type="text" v-model="newSaveName" class="save_name_input" />
      <button @click="saveLocally" class="save_button save_button--primary" :disabled="isSaveDisabled">
        <i class="pi pi-save"></i>
        <span>Save Locally</span>
      </button>
    </div>

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

</template>

<style scoped>
.save_list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex-grow: 1;
}

.save_item {
  cursor: pointer;
  display: flex;
  padding: 12px 14px;
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 10px;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.save_item:hover {
  background: var(--glass-bg-strong);
  border-color: var(--glass-tint);
}

.save_item_main_content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
  width: 100%;
}

.save_item_header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  width: 100%;
  margin-bottom: 8px;
}

.save_name {
  font-weight: 600;
  font-size: 13px;
  color: rgba(216, 221, 228, 0.95);
  margin-right: 10px;
  flex-grow: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.save_name span {
  overflow-wrap: break-word;
  min-width: 0;
}

.dev_badge {
  background-color: #ff9800;
  color: #0b0d10;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.delete_save_button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  background: rgba(192, 57, 43, 0.18);
  color: #ff8a80;
  border: 1px solid rgba(192, 57, 43, 0.4);
  border-radius: 999px;
  cursor: pointer;
  font-size: 11px;
  letter-spacing: 0.04em;
  transition: background 0.15s ease, color 0.15s ease;
  flex-shrink: 0;
}

.delete_save_button:hover {
  background: rgba(192, 57, 43, 0.6);
  color: #fff;
}

.save_meta {
  font-size: 11px;
  color: rgba(216, 221, 228, 0.55);
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

.save_meta b {
  color: rgba(216, 221, 228, 0.75);
  font-weight: 500;
}

.no_saves_message {
  padding: 24px 12px;
  font-style: italic;
  font-size: 13px;
  color: rgba(216, 221, 228, 0.5);
  text-align: center;
  flex-grow: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.save_controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}

.save_name_input {
  padding: 8px 12px;
  font-family: inherit;
  font-size: 13px;
  color: rgba(216, 221, 228, 0.92);
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 8px;
  flex-grow: 1;
  min-width: 0;
  outline: none;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: border-color 0.15s ease;
}

.save_name_input:focus {
  border-color: var(--glass-tint);
}

.save_button,
.load_button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: rgba(216, 221, 228, 0.92);
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 8px;
  cursor: pointer;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, transform 0.12s ease;
}

.save_button i,
.load_button i {
  font-size: 13px;
}

.save_button:hover:not(:disabled),
.load_button:hover:not(:disabled) {
  background: var(--glass-bg-strong);
  border-color: var(--glass-tint);
  color: #fff;
  transform: translateY(-1px);
}

.save_button:disabled,
.load_button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.save_button--primary {
  color: #0b0d10;
  background: var(--glass-tint);
  border-color: var(--glass-tint);
  font-weight: 600;
}

.save_button--primary:hover:not(:disabled) {
  color: #0b0d10;
  background: var(--glass-tint);
  filter: brightness(1.1);
}

.load_controls {
  margin-bottom: 12px;
  display: flex;
  gap: 8px;
}

.load_button {
  flex: 1;
  min-width: 0;
}

@supports not (backdrop-filter: blur(1px)) {
  .save_item,
  .save_name_input,
  .save_button,
  .load_button {
    background: rgba(20, 24, 29, 0.92);
  }
}
</style>
