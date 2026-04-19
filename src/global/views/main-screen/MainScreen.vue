<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Global } from '../../global'; // Import the Global singleton
import { useMobile } from '../../composables/useMobile';
import { ManifestObject } from '../../../schemas/manifestSchema'; // Import ManifestObject type
import Savelist from '../Savelist.vue';
import ManifestInfo from '../ManifestInfo.vue';
import InstallGamesModal from './InstallGamesModal.vue';
import InstallPwaModal from '../InstallPwaModal.vue';
import PwaInstalledModal from '../PwaInstalledModal.vue';
import { sortGamesByPlayOrder } from '../../../utility/game-order-tracker';
import { checkManifestCompatibility } from '../../../utility/version-checker';
import { showConfirm } from '../../../services/dialogService';
import ToggleSwitch from 'primevue/toggleswitch';

const global = Global.getInstance();
const { showInstallButton, justInstalled } = useMobile();

const showPwaModal = ref(false);

// Reactive state variables
const games = ref<ManifestObject[]>([]);
const mods = ref<ManifestObject[]>([]);
const selectedGame = ref<ManifestObject | null>(null);
const selectedMod = ref<ManifestObject | null>(null);
const activeMods = ref<ManifestObject[]>([]);
const gamesLoaded = ref(false);
const showInstallModal = ref(false);
const isWebMode = import.meta.env.VITE_WEB_MODE === 'true';

// Computed property for current manifest (game or mod)
const currentManifest = computed(() => {
  return selectedMod.value || selectedGame.value;
});

// Check if selected game is compatible with current engine version
const gameCompatibility = computed(() => {
  if (!selectedGame.value) {
    return { isCompatible: true };
  }
  return checkManifestCompatibility(
    global.engineVersion,
    selectedGame.value.engine_version_min,
    global.getString.bind(global)
  );
});

// Check if a mod is compatible with current engine version
function isModCompatible(mod: ManifestObject): boolean {
  const result = checkManifestCompatibility(
    global.engineVersion,
    mod.engine_version_min,
    global.getString.bind(global)
  );
  return result.isCompatible;
}

// Get warning message for a mod
function getModWarning(mod: ManifestObject): string | undefined {
  const result = checkManifestCompatibility(
    global.engineVersion,
    mod.engine_version_min,
    global.getString.bind(global)
  );
  return result.warningMessage;
}

const QUERY_KEY_GAME = 'g';
const QUERY_KEY_MODS = 'm';

function readQuery(): { gameId: string | null; modIds: string[] } {
  const params = new URLSearchParams(window.location.search);
  const gameId = params.get(QUERY_KEY_GAME);
  const modsRaw = params.get(QUERY_KEY_MODS);
  const modIds = modsRaw ? modsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  return { gameId, modIds };
}

function syncUrl() {
  const params = new URLSearchParams(window.location.search);
  if (selectedGame.value?.id) {
    params.set(QUERY_KEY_GAME, selectedGame.value.id);
  } else {
    params.delete(QUERY_KEY_GAME);
  }
  const modIds = activeMods.value.map(m => m.id).filter(Boolean) as string[];
  if (modIds.length) {
    params.set(QUERY_KEY_MODS, modIds.join(','));
  } else {
    params.delete(QUERY_KEY_MODS);
  }
  const qs = params.toString();
  const newUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
  history.replaceState(history.state, '', newUrl);
}

// NSFW toggle
async function toggleNsfw() {
  if (!global.nsfwEnabled.value) {
    const confirmed = await showConfirm({
      message: 'This content is intended for adults only. Are you 18 or older?',
      header: 'Age Verification',
      acceptLabel: 'Yes, I am 18+',
      rejectLabel: 'No'
    });
    if (!confirmed) return;
    global.nsfwEnabled.value = true;
  } else {
    global.nsfwEnabled.value = false;
  }
  await loadGames();
}

// Methods
async function loadGames() {
  try {
    const loadedGames = await global.getGamesList();
    // Sort games by last played (played first, unplayed last), filter NSFW
    games.value = sortGamesByPlayOrder(loadedGames.filter(g => global.isNsfwAllowed(g)));
    if (games.value.length > 0) {
      await selectGame(games.value[0]); // await selection to load mods/saves
    } else {
      selectedGame.value = null;
      mods.value = [];
    }
    gamesLoaded.value = true;
    //console.log('Games loaded:', games.value);
  } catch (error) {
    console.error('Failed to load games:', error);
    games.value = [];
    gamesLoaded.value = true;
  }
}

function openInstallModal() {
  showInstallModal.value = true;
}

async function handleInstallationComplete() {
  // Reload games after successful installation
  await loadGames();
}

async function selectGame(game: ManifestObject) {
  selectedGame.value = game;
  try {
    const loadedMods = await global.getModsList(game.id || '');
    mods.value = loadedMods.filter(m => global.isNsfwAllowed(m));
  } catch (error) {
    console.error('Failed to load mods for game', game.id, ':', error);
    mods.value = [];
  }
  // Reset selected mod when game changes
  selectedMod.value = null;
  activeMods.value = [];
}

async function onGameClick(game: ManifestObject) {
  await selectGame(game);
  syncUrl();
}

async function initFromQuery(): Promise<boolean> {
  const { gameId, modIds } = readQuery();
  if (!gameId) return false;

  const allGames = await global.getGamesList();
  const target = allGames.find(g => g.id === gameId);
  if (!target) return false;

  // Check unfiltered mod list so we can detect NSFW mods before the NSFW gate runs.
  const allMods = await global.getModsList(target.id || '');
  const requestedMods = modIds
    .map(id => allMods.find(m => m.id === id))
    .filter((m): m is ManifestObject => !!m);
  const anyNsfw = target.nsfw || requestedMods.some(m => m.nsfw);

  if (anyNsfw && global.isWebSite && !global.nsfwEnabled.value) {
    const confirmed = await showConfirm({
      message: 'This content is intended for adults only. Are you 18 or older?',
      header: 'Age Verification',
      acceptLabel: 'Yes, I am 18+',
      rejectLabel: 'No'
    });
    if (!confirmed) return false;
    global.nsfwEnabled.value = true;
  }

  games.value = sortGamesByPlayOrder(allGames.filter(g => global.isNsfwAllowed(g)));
  if (!games.value.some(g => g.id === target.id)) return false;

  await selectGame(target);

  for (const id of modIds) {
    const mod = mods.value.find(m => m.id === id);
    if (mod && isModCompatible(mod) && !activeMods.value.some(a => a.id === mod.id)) {
      activeMods.value.push(mod);
    }
  }

  gamesLoaded.value = true;
  syncUrl();
  return true;
}

async function selectMod(mod: ManifestObject) {
  // When clicking a mod, toggle its selection and display its info
  selectedMod.value = selectedMod.value === mod ? null : mod;
}

function toggleModActive(mod: ManifestObject) {
  // Don't allow activating incompatible mods
  if (!isModCompatible(mod)) {
    global.addNotification(getModWarning(mod) || global.getString('version_incompatible_generic'));
    return;
  }

  const index = activeMods.value.findIndex(m => m.id === mod.id);
  if (index > -1) {
    activeMods.value.splice(index, 1);
  } else {
    activeMods.value.push(mod);
  }
  syncUrl();
  //console.log('Active mods:', activeMods.value);
}

function isModActive(mod: ManifestObject): boolean {
  return activeMods.value.some(m => m.id === mod.id);
}

async function playGame() {
  if (!selectedGame.value) {
    console.warn("No game selected to play.");
    return;
  }

  // Check if game is compatible with current engine version
  if (!gameCompatibility.value.isCompatible) {
    global.addNotification(
      gameCompatibility.value.warningMessage ||
      global.getString('version_incompatible_generic')
    );
    return;
  }

  global.engineState.value = 'game'; // Direct assignment
  try {
    await global.createNewGame(selectedGame.value, [...activeMods.value]);
    console.log("The game has been started:", selectedGame.value.name);
  } catch (error) {
    console.error("Failed to create new game:", error);
    global.addNotificationId("error_start_game_failed");
    global.engineState.value = 'main_menu'; // Revert state on failure
    window.location.reload();
    return;
  }
}

function openEditor() {
  global.engineState.value = 'editor'; // Direct assignment
}

function testGame() {
  selectedGame.value = games.value[0];
  playGame();
}


// Lifecycle hooks
onMounted(async () => {
  // Automatically enable dev mode when running in dev environment (not web builds)
  const isLocalhost = !isWebMode && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );

  if (isLocalhost) {
    localStorage.setItem('devMode', 'true');
    console.log('[MainScreen] Dev mode enabled automatically (localhost detected)');
  } else {
    // Clear dev mode when not in dev environment
    localStorage.removeItem('devMode');
  }

  // Clear game/mod selection from previous dev sessions
  localStorage.removeItem('dev_mode_selected_game');
  localStorage.removeItem('dev_mode_selected_mod');

  const handledByQuery = await initFromQuery();
  if (!handledByQuery) {
    await loadGames(); // Load games when the component is mounted
  }
  //testGame();
});
</script>

<template>
  <div class="main_screen">
    <div class="main_header">
      <div class="header_left">
        <div v-if="!isWebMode" class="header_item install-button" @click="openInstallModal()"
          :class="{ 'disabled': !gamesLoaded }">
          <i class="pi pi-download"></i>
          <span>Install</span>
        </div>
        <div class="header_item" @click="global.toggleMenu">
          <i class="pi pi-bars"></i>
          <span>Menu</span>
        </div>
        <div v-if="global.isWebSite" class="nsfw-toggle" @click="toggleNsfw">
          <span class="nsfw-label">18+</span>
          <ToggleSwitch :modelValue="global.nsfwEnabled.value" class="nsfw-switch" />
          <span class="nsfw-status">NSFW is {{ global.nsfwEnabled.value ? 'enabled' : 'disabled' }}</span>
        </div>
        <div v-if="!isWebMode || global.isWebSite" class="header_item" @click="openEditor()">
          <i class="pi pi-pencil"></i>
          <span>Editor</span>
        </div>
        <div v-if="showInstallButton" class="header_item fullscreen-cta" @click="showPwaModal = true">
          <i class="pi pi-window-maximize"></i>
          <span>Fullscreen</span>
        </div>
      </div>
      <div class="header_right">
        <!-- <div class="engine_name" @click="global.setViewer('changelog')" style="cursor: pointer;">Dryad Engine v{{ global.engineVersion }}</div> -->
        <a href="https://dryadengine.com" target="_blank" class="engine_name">Dryad Engine v{{ global.engineVersion
          }}</a>
      </div>
    </div>

    <div class="main_content">
      <!-- Savelist component will be placed here -->
      <div class="save_list_container">
        <h3>{{ global.getString("saves") }}</h3>
        <Savelist :game-id="selectedGame?.id || null" :is-from-game="false" />
      </div>
      <div class="column">
        <h3>Choose Game</h3>
        <div v-if="games.length === 0" class="no_games">
          No Games Available. Put some in the 'games_files' folder or Create your own!
        </div>
        <div v-else class="game_and_mods_list">
          <div v-for="game in games" :key="game.id" class="game_section">
            <div class="game_item" @click="onGameClick(game)" :class="{ 'selected': game === selectedGame }">
              {{ game.name }}
            </div>

            <!-- Mods list shown directly under the selected game -->
            <div v-if="game === selectedGame && mods.length > 0" class="mods_section">
              <h4>Available Mods:</h4>
              <div class="mod_list">
                <div v-for="mod in mods" :key="mod.id" class="mod_item"
                  :class="{ 'selected': mod === selectedMod, 'incompatible': !isModCompatible(mod) }"
                  @click="selectMod(mod)">
                  <div class="mod_header">
                    <div class="mod_choose" @click.stop="toggleModActive(mod)"
                      :class="{ 'active': isModActive(mod), 'disabled': !isModCompatible(mod) }">
                    </div>
                    <div class="mod_name">
                      {{ mod.name }}
                      <span v-if="!isModCompatible(mod)" class="incompatible-badge">Incompatible</span>
                    </div>
                  </div>
                  <div v-if="mod === selectedMod && !isModCompatible(mod)" class="mod-version-warning">
                    {{ getModWarning(mod) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="column">
        <div class="play_button" @click="playGame()"
          :class="{ 'disabled': !selectedGame || !gameCompatibility.isCompatible }">
          <span class="play_label">Play</span>
          <span class="play_game_name" :title="selectedGame?.name || ''">{{ selectedGame?.name }}</span>
        </div>

        <!-- Show version compatibility warning for game -->
        <div v-if="selectedGame && !gameCompatibility.isCompatible" class="version-warning">
          <i class="pi pi-exclamation-triangle"></i>
          <span>{{ gameCompatibility.warningMessage }}</span>
        </div>

        <!-- Show info for selected mod or game -->
        <ManifestInfo :manifest="currentManifest" class="info_content" />
      </div>
    </div>

    <!-- Removed ng-template, conditional rendering handled by v-if directly -->

    <!-- Install Games Modal -->
    <InstallGamesModal v-if="!isWebMode" v-model:visible="showInstallModal" :games="games"
      @installation-complete="handleInstallationComplete" />

    <InstallPwaModal v-if="showPwaModal" @close="showPwaModal = false" />

    <PwaInstalledModal v-if="justInstalled" @close="justInstalled = false" />

  </div>
</template>

<style scoped src="./main-screen.component.css"></style>
