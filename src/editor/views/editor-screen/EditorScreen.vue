<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { Editor } from '../../editor';
import { EDITOR_TABS, type EditorTab } from '../../editorTabs';
import { Global } from '../../../global/global';
import EditorContent from '../editor-content/EditorContent.vue';
import LoadGamePopup from '../LoadGamePopup.vue';
import PlaytestModsPopup from '../PlaytestModsPopup.vue';
import Select from 'primevue/select';
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';
import DungeonSelect from '../shared/DungeonSelect.vue';
import PlaytestMenu from './PlaytestMenu.vue';
import FocusStrip from './FocusStrip.vue';
import {
  startPlaytest,
  continuePlaytest,
  openLoadGamePopup,
  showLoadGamePopup,
  showPlaytestModsPopup,
} from './usePlaytest';
import { editorTheme, applyEditorTheme, clearEditorTheme, toggleEditorTheme } from '../../editorTheme';
import { hideEmptyOn, setHideEmpty, subtabShown, mainTabShown, trackTabData } from '../../hideEmptyTabs';
import { currentFirstSteps, markFirstStep } from '../../firstSteps';
import { openPlaceFromGame } from '../../openAt';
import { FOCUS_KEY, canFocus, focusMode, toggleFocusMode } from '../../focusMode';

const componentName = ref('EditorScreen');
const editor = Editor.getInstance();
// After boot, a playtest's hand-over (Back to Editor, Open in editor) opens the Content tab on its paragraph.
editor.init().then(openPlaceFromGame);
const global = Global.getInstance();

// TODO: add tabs from plugins
//const visibleMainTabs = EDITOR_TABS.filter(tab => !tab.disabled);

// vue computed property for basic tabs + plugin tabs
const visibleMainTabs = computed(() => [...EDITOR_TABS, ...editor.pluginManager.pluginTabs.value]); //.filter(tab => !tab.disabled)

// With Hide empty tabs on, the header lists only tabs with data (and the open one); the rest stay
// reachable greyed in their tab's menu, and whole empty main tabs under ⋯.
trackTabData();
const shownMainTabs = computed(() => visibleMainTabs.value.filter(tab => mainTabShown(tab.id, allSubtabsForMainTab(tab.id).map(s => s.id))));
const hiddenMainTabs = computed(() => hideEmptyOn.value
  ? visibleMainTabs.value.filter(tab => !tab.disabled && !shownMainTabs.value.includes(tab))
  : []);

const hideEmpty = computed({
  get: () => hideEmptyOn.value,
  set: (on: boolean) => { if (editor.selectedGame) setHideEmpty(editor.selectedGame, on); },
});

// The editor opens again after a playtest only by coming back from one, so that ticks First steps'
// Back to Editor. Checked once, when the game is known: the Playtest tick itself happens later,
// in this same editor, right before the reload into the game.
let backChecked = false;
watch(() => editor.selectedGame, (game) => {
  if (backChecked || !game) return;
  backChecked = true;
  const steps = currentFirstSteps.value;
  if (steps?.done.includes('playtest')) markFirstStep('back', game);
}, { immediate: true });


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
  if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f' && canFocus.value) {
    event.preventDefault();
    toggleFocusMode();
  }
}

// Lifecycle hooks
onMounted(() => {
  console.log(`${componentName.value} component mounted.`);

  // The dark palette is the editor's alone — the game and main menu bring their own.
  applyEditorTheme();

  // Add keyboard shortcut listener
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  clearEditorTheme();
  window.removeEventListener('keydown', handleKeyDown);
  cancelCloseHoverMenu();
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

/** A main tab's subtabs for the open dungeon's type, empty ones included. */
function allSubtabsForMainTab(mainTabId: string) {
  // Explicitly read reactive values for proper dependency tracking
  const dungeonConfig = editor.dungeonConfig.value;

  const mainTabConfig = visibleMainTabs.value.find(tab => tab.id === mainTabId);

  let filteredSubtabs = mainTabConfig?.subtabs ?? [];
  // filter subtabs based on dungeon config
  if (dungeonConfig) {
    filteredSubtabs = filteredSubtabs.filter(subtab =>
      !subtab.specificDungeonTypes ||
      subtab.specificDungeonTypes.includes(dungeonConfig.dungeon_type as 'map' | 'screen' | 'text')
    );
  }

  return filteredSubtabs;
}

function subtabsForMainTab(mainTabId: string) {
  return allSubtabsForMainTab(mainTabId).filter(subtab => subtabShown(mainTabId, subtab.id));
}

const getSecondaryTabsForCurrentMain = computed(() => subtabsForMainTab(editor.mainTab));

// --- Main tab hover menu ---
// The tab row scrolls (overflow-x: auto), which would clip an absolutely
// positioned child, so the menu is teleported to body and placed from the
// hovered tab's bounding rect.
const hoverMenuTab = ref<string | null>(null);
const hoverMenuPos = ref({ left: 0, top: 0 });
let hoverMenuCloseTimer: number | undefined;

type HoverMenuItem = { main: string; sub?: EditorTab['subtabs'][number]; header?: string; dim?: boolean; toggle?: boolean };

// A tab's menu lists its subtabs, then its empty ones greyed. The ⋯ menu ('__more') holds the
// Hide empty tabs switch, then the subtabs of the main tabs that are hidden whole.
const hoverMenuItems = computed<HoverMenuItem[]>(() => {
  const tabId = hoverMenuTab.value;
  if (!tabId || !editor.selectedGame || !editor.selectedMod) return [];
  if (tabId === '__more') {
    return [{ main: '', toggle: true }, ...hiddenMainTabs.value.flatMap(tab => [
      { main: tab.id, header: tab.name ?? global.getString('tab.' + tab.id) },
      ...allSubtabsForMainTab(tab.id).map(sub => ({ main: tab.id, sub, dim: true })),
    ])];
  }
  const shown = subtabsForMainTab(tabId);
  const empty = allSubtabsForMainTab(tabId).filter(sub => !shown.includes(sub));
  return [...shown.map(sub => ({ main: tabId, sub })), ...empty.map(sub => ({ main: tabId, sub, dim: true }))];
});

function openHoverMenu(tabId: string, event: MouseEvent) {
  cancelCloseHoverMenu();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  hoverMenuPos.value = {
    left: Math.max(4, Math.min(rect.left, window.innerWidth - 240)),
    top: rect.bottom,
  };
  hoverMenuTab.value = tabId;
}

// Delayed so the pointer can travel from the tab into the teleported menu.
function scheduleCloseHoverMenu() {
  cancelCloseHoverMenu();
  hoverMenuCloseTimer = window.setTimeout(() => {
    hoverMenuTab.value = null;
    hoverMenuCloseTimer = undefined;
  }, 150);
}

function cancelCloseHoverMenu() {
  if (hoverMenuCloseTimer !== undefined) {
    clearTimeout(hoverMenuCloseTimer);
    hoverMenuCloseTimer = undefined;
  }
}

function closeHoverMenu() {
  cancelCloseHoverMenu();
  hoverMenuTab.value = null;
}

async function selectSubtabFromMenu(tabId: string, subtabId: string) {
  closeHoverMenu();
  if (editor.mainTab === tabId) {
    await editor.setSecondaryTab(subtabId);
  } else {
    await editor.setMainTab(tabId, subtabId);
  }
}

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
    <div class="editor_header" :class="{ 'editor_header--focus': focusMode }">
      <FocusStrip v-if="focusMode" :mainTabs="shownMainTabs" :subtabs="getSecondaryTabsForCurrentMain" />
      <template v-else>
      <div class="main_row tab_row">
        <!-- Focus: where the slim strip has its way back, so the button stays put between modes -->
        <Button icon="pi pi-window-maximize" text size="small" class="focus-toggle" :disabled="!canFocus"
          aria-label="Focus" v-tooltip.bottom="`Focus: one slim header for more room (${FOCUS_KEY}). F11 also hides the window's title bar.`"
          @click="toggleFocusMode" />

        <!-- Light / Dark Theme Toggle -->
        <Button :icon="editorTheme === 'dark' ? 'pi pi-sun' : 'pi pi-moon'" @click="toggleEditorTheme"
          v-tooltip.bottom="editorTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          class="theme-button" text />

        <div class="tab main_tab" @click="global.toMainMenu">
          Exit
        </div>
        <div class="tab main_tab" :class="{ 'selected': editor.mainTab === 'start' }" @click="editor.setMainTab('start')">
          Start
        </div>
        <div class="create_new tab main_tab" :class="{ 'selected': editor.mainTab === 'new' }"
          @click="editor.setMainTab('new')">
          + New
        </div>

        <!-- Playtest Mods Configuration Button -->
        <Button icon="pi pi-list" @click="showPlaytestModsPopup = true" :disabled="!editor.selectedGame"
          v-tooltip.bottom="'Configure which mods to load during playtest'" class="playtest-mods-button" text />

        <!-- Playtest, with a menu: from the scene being edited, or from a snapshot -->
        <PlaytestMenu />

        <!-- Continue Button — resume last playtest, replaying the paragraph you were on -->
        <Button icon="pi pi-replay" label="Continue" severity="success" @click="continuePlaytest"
          :disabled="!editor.selectedGame || editor.hasUnsavedChanges.value"
          v-tooltip.bottom="editor.hasUnsavedChanges.value ? 'You have unsaved changes' : 'Resume your last playtest: replays the paragraph you left on, with your latest saved changes. Outside a scene it carries on where you were.'" />

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
        <div v-for="tab in shownMainTabs" :key="tab.id" class="tab main_tab"
          :class="{ 'selected': editor.mainTab === tab.id }" @click="editor.setMainTab(tab.id)" :hidden="tab.disabled"
          @mouseenter="openHoverMenu(tab.id, $event)" @mouseleave="scheduleCloseHoverMenu">
          {{ tab.name ?? global.getString("tab." + tab.id) }}
        </div>

        <div v-if="editor.selectedGame && editor.mainTab !== 'start'" class="tab main_tab more_tabs"
          v-tooltip.bottom="hiddenMainTabs.length ? 'Empty tabs, and the Hide empty tabs switch' : 'Hide empty tabs'"
          @mouseenter="openHoverMenu('__more', $event)" @mouseleave="scheduleCloseHoverMenu">⋯</div>
      </div>
      <div class="secondary_row tab_row" v-if="editor.mainTab !== 'start' && (editor.mainTab == 'new' || (editor.selectedGame && editor.selectedMod))">

        <!-- choose dungeon-->
        <DungeonSelect v-if="editor.mainTab === 'dungeons'" class="choose_dungeon" />

        <!-- Secondary Tabs - Iterate over subtabs for the current main tab -->
        <div v-for="subtab in getSecondaryTabsForCurrentMain" :key="subtab.id" class="tab secondary_tab"
          :class="{ 'selected': editor.secondaryTab === subtab.id }" @click="editor.setSecondaryTab(subtab.id)">
          {{ subtab.name ?? global.getString("tab." + editor.mainTab + "." + subtab.id) }}
        </div>

      </div>
      </template>
    </div>
    <div class="content">

      <div v-if="editor.mainTab !== 'new' && editor.mainTab !== 'start' && (!editor.selectedGame || !editor.selectedMod)"
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

    <!-- Main tab hover menu - jump straight to a subtab instead of the last used one -->
    <Teleport to="body">
      <div v-if="hoverMenuItems.length" class="main_tab_menu"
        :style="{ left: hoverMenuPos.left + 'px', top: hoverMenuPos.top + 'px' }" @mouseenter="cancelCloseHoverMenu"
        @mouseleave="closeHoverMenu">
        <template v-for="item in hoverMenuItems" :key="item.main + '/' + (item.sub?.id ?? '')">
          <label v-if="item.toggle" class="hide-empty-toggle">
            <ToggleSwitch v-model="hideEmpty" />
            <span>Hide empty tabs</span>
          </label>
          <div v-else-if="item.header" class="main_tab_menu_header">{{ item.header }}</div>
          <div v-else-if="item.sub" class="main_tab_menu_item"
            :class="{ 'selected': editor.mainTab === item.main && editor.secondaryTab === item.sub.id, 'main_tab_menu_item--empty': item.dim }"
            @click="selectSubtabFromMenu(item.main, item.sub.id)">
            {{ item.sub.name ?? global.getString("tab." + item.main + "." + item.sub.id) }}
          </div>
        </template>
      </div>
    </Teleport>

  </div>
</template>

<style scoped src="./editor-screen.component.css"></style>
