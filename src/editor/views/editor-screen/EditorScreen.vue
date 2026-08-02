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
import DungeonSelect from '../shared/DungeonSelect.vue';
import {
  startPlaytest,
  continuePlaytest,
  openLoadGamePopup,
  showLoadGamePopup,
  showPlaytestModsPopup,
} from './usePlaytest';

const componentName = ref('EditorScreen');
const editor = Editor.getInstance();
editor.init();
const global = Global.getInstance();

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
// Bump these to force the matching Select to remount with the editor's
// current value. PrimeVue Select shows the user's clicked option before our
// async confirm dialog resolves; if the user cancels, modelValue prop stays
// the same but the Select's internal display sticks on the new value. A key
// bump remounts the Select against the unchanged prop, snapping it back.
const gameSelectKey = ref(0);
const modSelectKey = ref(0);

const handleGameChange = async (event: any) => {
  const target = event.value;
  await editor.setGame(target);
  if (editor.selectedGame !== target) gameSelectKey.value++;
};

const handleModChange = async (event: any) => {
  const target = event.value;
  await editor.setMod(target);
  if (editor.selectedMod !== target) modSelectKey.value++;
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
        <Button class="playtest-button" icon="pi pi-play" label="Playtest" @click="startPlaytest"
          :disabled="!editor.selectedGame || editor.hasUnsavedChanges.value"
          v-tooltip.bottom="editor.hasUnsavedChanges.value ? 'You have unsaved changes' : 'Start playtesting with dev mode (Ctrl/Cmd+P)'" />

        <!-- Continue Button — resume last playtest, hard-reset the scene you were on -->
        <Button icon="pi pi-replay" label="Continue" severity="success" @click="continuePlaytest"
          :disabled="!editor.selectedGame || editor.hasUnsavedChanges.value"
          v-tooltip.bottom="editor.hasUnsavedChanges.value ? 'You have unsaved changes' : 'Resume your last playtest and hard-reset the scene you were on — reloads with your latest content edits and re-plays the scene fresh (plain resume if you left outside a scene).'" />

        <!-- Load Game Button -->
        <Button icon="pi pi-file-arrow-up" @click="openLoadGamePopup"
          :disabled="!editor.selectedGame || editor.hasUnsavedChanges.value"
          v-tooltip.bottom="editor.hasUnsavedChanges.value ? 'You have unsaved changes' : 'Load save in dev mode'"
          class="load-game-button" text />

        <!-- Documentation Button -->
        <Button label="📚 Docs" @click="global.setViewer('docs')" v-tooltip.bottom="'View engine documentation'"
          class="docs-button" text />

        <Select :key="gameSelectKey" :modelValue="editor.selectedGame" :options="editor.filteredGames.value"
          @change="handleGameChange"
          filter :resetFilterOnHide="true" placeholder="Choose Game" filterPlaceholder="Find game..."
          class="choose_game" :disabled="!editor.filteredGames.value || editor.filteredGames.value.length === 0"
          emptyFilterMessage="No games found" emptyMessage="choose or create a game first" scrollHeight="250px" />

        <Select :key="modSelectKey" :modelValue="editor.selectedMod" :options="editor.filteredMods.value"
          @change="handleModChange" filter
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
        <DungeonSelect v-if="editor.mainTab === 'dungeons'" class="choose_dungeon" />

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
