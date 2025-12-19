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
    <button @click="triggerLoadFromFile" class="load_button">Load from File</button>
  </div>

  <div class="ingame_block" v-if="isFromGame">
    <div class="save_controls">
      <input type="text" v-model="newSaveName" class="save_name_input" />
      <button @click="saveLocally" class="save_button" :disabled="isSaveDisabled">Save Locally</button>
      <button @click="saveToFile" class="save_button" :disabled="isSaveDisabled">Save to File</button>
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
h3 {
  margin-top: 0;
  margin-bottom: 10px;
  font-size: 1.2em;
  /* Consistent with other column titles */
  color: #333;
}

.save_list {
  margin-top: 10px;
  /* Matches original .column > .save_list structure */
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
  flex-grow: 1;
}

.save_item {
  cursor: pointer;
  display: flex;
  /* Changed from flex to allow save_item_main_content to control layout */
  /* justify-content: space-between; Removed, handled by inner elements */
  /* align-items: center; Removed, handled by inner elements */
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
  /* Stack header and meta vertically */
  flex-grow: 1;
  width: 100%;
  /* Ensure it takes full width */
}

.save_item_header {
  display: flex;
  justify-content: space-between;
  /* Puts save_name left, button right */
  align-items: center;
  /* Vertically align name and button */
  width: 100%;
  margin-bottom: 8px;
  /* Space between header and meta */
}

.save_name {
  font-weight: bold;
  margin-right: 10px;
  /* Space between name and delete button if they were closer */
  flex-grow: 1;
  /* Allow name to take available space */
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
  /* Space between meta items */
  width: 100%;
  /* Ensure meta section takes full width */
}

.save_meta span {
  /* white-space: nowrap; Removed */
  overflow: hidden;
  /* Ellipsis still useful for very long individual lines */
  text-overflow: ellipsis;
  word-wrap: break-word;
  /* Allow long words/strings to break and wrap */
  /* Or use overflow-wrap: break-word; */
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

.save_controls {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
  align-items: center;
}

.save_name_input {
  padding: 8px 12px;
  border: 1px solid #ccc;
  border-radius: 4px;
  flex-grow: 1;
}

.save_button {
  padding: 8px 15px;
  background-color: #4CAF50;
  /* Green */
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.save_button:hover:not(:disabled) {
  background-color: #45a049;
}

.save_button:disabled {
  background-color: #a5d6a7;
  cursor: not-allowed;
}

.load_controls {
  margin-top: 10px;
  /* Add some space above the load button */
  padding-bottom: 10px;
  display: flex;
}

.load_button {
  padding: 8px 15px;
  background-color: #2196F3;
  /* Blue */
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s ease;
  width: 100%;
  /* Make it full width similar to other controls if desired */
}

.load_button:hover {
  background-color: #1e88e5;
}
</style>
