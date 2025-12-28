<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { Editor } from '../../editor';
import { EDITOR_TABS } from '../../editorTabs';
import { Global } from '../../../global/global';
import EditorContent from '../editor-content/EditorContent.vue';
import LoadGamePopup from '../LoadGamePopup.vue';
import PlaytestModsPopup from '../PlaytestModsPopup.vue';
import Select from 'primevue/select';
import Button from 'primevue/button';
import { showConfirm } from '../../../services/dialogService';

const componentName = ref('EditorScreen');
const editor = Editor.getInstance();
editor.init();
const global = Global.getInstance();

const showLoadGamePopup = ref(false);
const showPlaytestModsPopup = ref(false);

// TODO: add tabs from plugins
//const visibleMainTabs = EDITOR_TABS.filter(tab => !tab.disabled);

// vue computed property for basic tabs + plugin tabs
const visibleMainTabs = computed(() => [...EDITOR_TABS, ...editor.pluginManager.pluginTabs.value]); //.filter(tab => !tab.disabled)


// Assume these properties/methods exist on the editor instance
// If not, they need to be defined or provided differently.
// const visibleMainTabs = computed(() => editor.visibleMainTabs || []);
// const getSecondaryTabsForCurrentMain = () => editor.getSecondaryTabsForCurrentMain() || [];

// Keyboard shortcut handler
function handleKeyDown(event: KeyboardEvent) {
  // Ctrl/Cmd+P for playtest
  if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
    event.preventDefault();
    startPlaytest();
  }
}

// Lifecycle hooks
onMounted(() => {
  console.log(`${componentName.value} component mounted.`);

  // Add keyboard shortcut listener
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

// Handle dropdown changes
const handleGameChange = (event: any) => {
  editor.setGame(event.value);
};

const handleModChange = (event: any) => {
  editor.setMod(event.value);
};

const handleDungeonChange = (event: any) => {
  editor.setDungeon(event.value);
};


const getSecondaryTabsForCurrentMain = computed(() => {
  // Explicitly read reactive values at top level for proper dependency tracking
  const dungeonConfig = editor.dungeonConfig.value;
  const mainTab = editor.mainTab;

  const currentMainTabConfig = visibleMainTabs.value.find(tab => tab.id === mainTab);

  let filteredSubtabs = currentMainTabConfig?.subtabs ?? [];
  // filter subtabs based on dungeon config
  if (dungeonConfig) {
    filteredSubtabs = filteredSubtabs.filter(subtab =>
      !subtab.specificDungeonTypes ||
      subtab.specificDungeonTypes.includes(dungeonConfig.dungeon_type as 'map' | 'screen' | 'text')
    );
  }

  return filteredSubtabs;
});

// (input) handlers now only need to set the filter when there IS a search term
function searchGame(event: Event): void {
  const searchTerm = (event.target as HTMLInputElement)?.value;
  if (searchTerm) {
    editor.setFilteredGames(searchTerm);
  } // Clear is handled by valueChanges subscription
}

function searchMod(event: Event): void {
  const searchTerm = (event.target as HTMLInputElement)?.value;
  if (searchTerm) {
    editor.setFilteredMods(searchTerm);
  } // Clear is handled by valueChanges subscription
}

function searchDungeon(event: Event): void {
  const searchTerm = (event.target as HTMLInputElement)?.value;
  if (searchTerm) {
    editor.setFilteredDungeons(searchTerm);
  } // Clear is handled by valueChanges subscription
}

// TODO: Implement filtering logic if PrimeVue's default isn't sufficient
// or if the editor methods need to be called explicitly on filter input.
// const searchGame = (event: any) => { editor.searchGame(event.query); };
// const searchMod = (event: any) => { editor.searchMod(event.query); };
// const searchDungeon = (event: any) => { editor.searchDungeon(event.query); };

// Get stored playtest mods for the current game
function getPlaytestMods(): string[] {
  if (!editor.selectedGame) return [];

  const storageKey = `playtest-mods-${editor.selectedGame}`;
  const stored = localStorage.getItem(storageKey);

  if (stored) {
    try {
      const storedModIds: string[] = JSON.parse(stored);
      // Validate that stored mods still exist
      return storedModIds.filter(modId =>
        editor.mods.some(mod => mod.id === modId)
      );
    } catch (e) {
      console.error('Failed to parse stored playtest mods:', e);
      return [];
    }
  }
  return [];
}

// Dev mode playtest functionality
async function startPlaytest() {
  if (!editor.selectedGame) {
    global.addNotification('Please select a game first');
    return;
  }

  // Check for unsaved changes
  if (editor.hasUnsavedChanges.value) {
    const confirmed = await showConfirm({
      message: 'You have unsaved changes. Are you sure you want to start playtesting? All unsaved changes will be lost.',
      header: 'Unsaved Changes'
    });

    if (!confirmed) {
      return;
    }
  }

  // Set dev mode flags
  localStorage.setItem('devMode', 'true');
  localStorage.setItem('dev_mode_selected_game', editor.selectedGame);

  // Build the mod list: stored selected mods + always include active mod
  const storedMods = getPlaytestMods();
  const modList = new Set(storedMods);

  // Always add the currently active mod
  if (editor.selectedMod && editor.selectedMod !== '_core') {
    modList.add(editor.selectedMod);
  }

  // Store the mod list as JSON array
  localStorage.setItem('dev_mode_selected_mods', JSON.stringify(Array.from(modList)));

  // Keep backward compatibility - store single mod too
  if (editor.selectedMod) {
    localStorage.setItem('dev_mode_selected_mod', editor.selectedMod);
  }

  // Set showDebugPanel to true (using localStorage directly)
  localStorage.setItem('showDebugPanel', 'true');

  // Set flags for App.vue to start a new game on reload
  localStorage.setItem('game_starting_new', 'true');
  localStorage.setItem('game_loading_game_id', editor.selectedGame);

  // Reload page to properly initialize game
  window.location.reload();
}

function openLoadGamePopup() {
  if (!editor.selectedGame) {
    global.addNotification('Please select a game first');
    return;
  }
  showLoadGamePopup.value = true;
}

</script>

<template>
  <div class="editor_container">

    <!--<pre>{{ JSON.stringify(editor.activeObject.value, null, 2) }}</pre>-->
    <!--<pre>{{ JSON.stringify(editor.coreObject.value, null, 2) }} </pre>-->
    <!-- <pre>{{ JSON.stringify(editor.schema.value, null, 2) }}</pre>-->
    <div class="editor_header">
      <div class="main_row tab_row">
        <div class="tab main_tab" @click="global.toMainMenu">
          Exit
        </div>
        <div class="create_new tab main_tab" :class="{ 'selected': editor.mainTab === 'new' }"
          @click="editor.setMainTab('new')">
          + New
        </div>

        <!-- Playtest Mods Configuration Button -->
        <Button icon="pi pi-list" @click="showPlaytestModsPopup = true" :disabled="!editor.selectedGame"
          v-tooltip.bottom="'Configure which mods to load during playtest'" class="playtest-mods-button" text />

        <!-- Playtest Button -->
        <Button icon="pi pi-play" label="Playtest" @click="startPlaytest" :disabled="!editor.selectedGame"
          v-tooltip.bottom="'Start playtesting with dev mode (Ctrl/Cmd+P)'" class="playtest-button" />

        <!-- Load Game Button -->
        <Button icon="pi pi-file-arrow-up" @click="openLoadGamePopup" :disabled="!editor.selectedGame"
          v-tooltip.bottom="'Load save in dev mode'" class="load-game-button" text />

        <!-- Documentation Button -->
        <Button label="📚 Docs" @click="global.setViewer('docs')" v-tooltip.bottom="'View engine documentation'"
          class="docs-button" text />

        <Select :modelValue="editor.selectedGame" :options="editor.filteredGames.value" @change="handleGameChange"
          filter :resetFilterOnHide="true" placeholder="Choose Game" filterPlaceholder="Find game..."
          class="choose_game" :disabled="!editor.filteredGames.value || editor.filteredGames.value.length === 0"
          emptyFilterMessage="No games found" emptyMessage="choose or create a game first" scrollHeight="250px" />

        <Select :modelValue="editor.selectedMod" :options="editor.filteredMods.value" @change="handleModChange" filter
          :resetFilterOnHide="true" placeholder="Choose Mod" filterPlaceholder="Find mod..." class="choose_mod"
          :disabled="!editor.selectedGame || !editor.filteredMods.value || editor.filteredMods.value.length === 0"
          emptyFilterMessage="No mods found" emptyMessage="select a game first" scrollHeight="250px" />

        <!-- Main Tabs - Iterate over visibleMainTabs from component -->
        <div v-for="tab in visibleMainTabs" :key="tab.id" class="tab main_tab"
          :class="{ 'selected': editor.mainTab === tab.id }" @click="editor.setMainTab(tab.id)" :hidden="tab.disabled">
          {{ tab.name ?? global.getString("tab." + tab.id) }}
        </div>

      </div>
      <div class="secondary_row tab_row" v-if="editor.mainTab == 'new' || (editor.selectedGame && editor.selectedMod)">

        <!-- choose dungeon-->
        <Select v-if="editor.mainTab === 'dungeons'" :modelValue="editor.selectedDungeon"
          :options="editor.filteredDungeons.value" @change="handleDungeonChange" filter :resetFilterOnHide="true"
          placeholder="Choose Dungeon" filterPlaceholder="Find dungeon..." class="choose_dungeon"
          :disabled="!editor.selectedGame || !editor.selectedMod || !editor.filteredDungeons.value || editor.filteredDungeons.value.length === 0"
          emptyFilterMessage="No dungeons found" emptyMessage="Select game and mod first" scrollHeight="250px" />

        <!-- Secondary Tabs - Iterate over subtabs for the current main tab -->
        <div v-for="subtab in getSecondaryTabsForCurrentMain" :key="subtab.id" class="tab secondary_tab"
          :class="{ 'selected': editor.secondaryTab === subtab.id }" @click="editor.setSecondaryTab(subtab.id)">
          {{ subtab.name ?? global.getString("tab." + editor.mainTab + "." + subtab.id) }}
        </div>
      </div>
    </div>
    <div class="content">

      <div v-if="editor.mainTab !== 'new' && (!editor.selectedGame || !editor.selectedMod)"
        class="nothing_selected_message">
        {{ global.getString('please_select_game') }}
      </div>

      <EditorContent></EditorContent>

    </div>

    <!-- Load Game Popup -->
    <LoadGamePopup v-model:visible="showLoadGamePopup" :gameId="editor.selectedGame"
      :selectedModId="editor.selectedMod" />

    <!-- Playtest Mods Configuration Popup -->
    <PlaytestModsPopup v-model:visible="showPlaytestModsPopup" />

  </div>
</template>

<style scoped src="./editor-screen.component.css"></style>
