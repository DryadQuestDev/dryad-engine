<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Global } from '../../global'; // Import the Global singleton
import { ManifestObject } from '../../../schemas/manifestSchema'; // Import ManifestObject type
import Savelist from '../Savelist.vue';
import ManifestInfo from '../ManifestInfo.vue';
import InstallGamesModal from './InstallGamesModal.vue';
import { sortGamesByPlayOrder } from '../../../utility/game-order-tracker';
import { checkManifestCompatibility } from '../../../utility/version-checker';

const global = Global.getInstance();
//console.log('Accessing Global singleton:', global.test);

// Reactive state variables
const games = ref<ManifestObject[]>([]);
const mods = ref<ManifestObject[]>([]);
const selectedGame = ref<ManifestObject | null>(null);
const selectedMod = ref<ManifestObject | null>(null);
const activeMods = ref<ManifestObject[]>([]);
const gamesLoaded = ref(false);
const showInstallModal = ref(false);

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

// Methods
async function loadGames() {
  try {
    const loadedGames = await global.getGamesList();
    // Sort games by last played (played first, unplayed last)
    games.value = sortGamesByPlayOrder(loadedGames);
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
    mods.value = await global.getModsList(game.id || '');
    //console.log('Mods loaded for game', game.id, ':', mods.value);
  } catch (error) {
    console.error('Failed to load mods for game', game.id, ':', error);
    mods.value = [];
  }
  // Reset selected mod when game changes
  selectedMod.value = null;
  activeMods.value = [];
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
  // Automatically enable dev mode when running on localhost
  const isLocalhost = window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  // || window.location.hostname === '';

  if (isLocalhost) {
    localStorage.setItem('devMode', 'true');
    console.log('[MainScreen] Dev mode enabled automatically (localhost detected)');
  } else {
    // Clear dev mode only when NOT on localhost
    localStorage.removeItem('devMode');
  }

  // Clear game/mod selection from previous dev sessions
  localStorage.removeItem('dev_mode_selected_game');
  localStorage.removeItem('dev_mode_selected_mod');

  await loadGames(); // Load games when the component is mounted
  //testGame();
});
</script>

<template>
  <div class="main_screen">
    <div class="main_header">
      <div class="header_left">
        <div class="header_item install-button" @click="openInstallModal()" :class="{ 'disabled': !gamesLoaded }">
          <i class="pi pi-download"></i>
          <span>Install</span>
        </div>
        <div class="header_item" @click="global.toggleMenu">
          <i class="pi pi-bars"></i>
          <span>Menu</span>
        </div>
        <div class="header_item" @click="openEditor()">
          <i class="pi pi-pencil"></i>
          <span>Editor</span>
        </div>
      </div>
      <div class="header_right">
        <a href="https://discord.gg/3aAmjtesHU" target="_blank" class="promo_button">
          <img src="/assets/engine_assets/ui/promo/discord_button.jpeg" alt="Discord" />
        </a>
        <a href="https://www.reddit.com/r/DryadEngine" target="_blank" class="promo_button">
          <img src="/assets/engine_assets/ui/promo/reddit_button.png" alt="Reddit" />
        </a>
        <a href="https://github.com/DryadQuestDev/dryad-engine" target="_blank" class="promo_button">
          <img src="/assets/engine_assets/ui/promo/github_button.png" alt="GitHub" />
        </a>
        <div class="engine_name">Dryad Engine v{{ global.engineVersion }}</div>
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
            <div class="game_item" @click="selectGame(game)" :class="{ 'selected': game === selectedGame }">
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
          :class="{ 'disabled': !selectedGame || !gameCompatibility.isCompatible }">Play {{ selectedGame?.name
          }}</div>

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
    <InstallGamesModal v-model:visible="showInstallModal" :games="games"
      @installation-complete="handleInstallationComplete" />

  </div>
</template>

<style scoped src="./main-screen.component.css"></style>
