<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { Global } from '../../global';
import { useMobile } from '../../composables/useMobile';
import { ManifestObject } from '../../../schemas/manifestSchema';
import { AssetObject } from '../../../schemas/assetSchema';
import { MusicObject } from '../../../schemas/musicSchema';
import type { SaveMetaData } from '../../../services/indexeddb-save.service';
import { sortGamesByPlayOrder } from '../../../utility/game-order-tracker';
import { checkManifestCompatibility } from '../../../utility/version-checker';
import { showConfirm } from '../../../services/dialogService';
import { MusicPlayer } from '../../../services/musicPlayer';
import BackgroundAsset from '../../../game/views/BackgroundAsset.vue';
import GamesDropdown from './GamesDropdown.vue';
import ModsStrip from './ModsStrip.vue';
import ManifestPanel from './ManifestPanel.vue';
import ScreenshotsOverlay from './ScreenshotsOverlay.vue';
import SavesDrawer from './SavesDrawer.vue';
import EngineLogo from './EngineLogo.vue';
import InstallGamesModal from './InstallGamesModal.vue';
import InstallPwaModal from '../InstallPwaModal.vue';
import PwaInstalledModal from '../PwaInstalledModal.vue';

const global = Global.getInstance();
const { showInstallButton, justInstalled } = useMobile();

const showPwaModal = ref(false);
const showInstallModal = ref(false);
const showSavesDrawer = ref(false);
const screenshotsManifest = ref<ManifestObject | null>(null);

const games = ref<ManifestObject[]>([]);
const mods = ref<ManifestObject[]>([]);
const selectedGame = ref<ManifestObject | null>(null);
const selectedMod = ref<ManifestObject | null>(null);
const activeMods = ref<ManifestObject[]>([]);
const gamesLoaded = ref(false);
const isWebMode = import.meta.env.VITE_WEB_MODE === 'true';

const assetsMap = ref<Map<string, AssetObject>>(new Map());
const musicMap = ref<Map<string, MusicObject>>(new Map());
const latestSave = ref<{ slot: string; meta: SaveMetaData } | null>(null);

const QUERY_KEY_GAME = 'g';
const QUERY_KEY_MODS = 'm';

const manifests = computed<ManifestObject[]>(() => {
  const list: ManifestObject[] = [];
  if (selectedGame.value) list.push(selectedGame.value);
  for (const mod of activeMods.value) list.push(mod);
  return list;
});

const landingBgs = computed<AssetObject[]>(() => {
  const out: AssetObject[] = [];
  for (const m of manifests.value) {
    const id = m?.landing_bg_asset;
    if (!id) continue;
    const asset = assetsMap.value.get(id);
    if (asset) out.push(asset);
  }
  return out;
});

const landingSoundtrack = computed<string | null>(() => {
  for (let i = manifests.value.length - 1; i >= 0; i--) {
    const v = manifests.value[i]?.landing_soundtrack;
    if (v) return v;
  }
  return null;
});

const disableEngineLink = computed(() => manifests.value.some(m => !!m?.disable_engine_link));

const gameCompatibility = computed(() => {
  if (!selectedGame.value) return { isCompatible: true, warningMessage: undefined as string | undefined };
  return checkManifestCompatibility(
    global.engineVersion,
    selectedGame.value.engine_version_min,
    global.getString.bind(global)
  );
});

function readQuery(): { gameId: string | null; modIds: string[] } {
  const params = new URLSearchParams(window.location.search);
  const gameId = params.get(QUERY_KEY_GAME);
  const modsRaw = params.get(QUERY_KEY_MODS);
  const modIds = modsRaw ? modsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
  return { gameId, modIds };
}

function syncUrl() {
  const params = new URLSearchParams(window.location.search);
  if (selectedGame.value?.id) params.set(QUERY_KEY_GAME, selectedGame.value.id);
  else params.delete(QUERY_KEY_GAME);
  const modIds = activeMods.value.map(m => m.id).filter(Boolean) as string[];
  if (modIds.length) params.set(QUERY_KEY_MODS, modIds.join(','));
  else params.delete(QUERY_KEY_MODS);
  const qs = params.toString();
  const newUrl = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
  history.replaceState(history.state, '', newUrl);
}

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

async function loadGames() {
  try {
    const loaded = await global.getGamesList();
    games.value = sortGamesByPlayOrder(loaded.filter(g => global.isNsfwAllowed(g)));
    if (games.value.length > 0) {
      await selectGame(games.value[0]);
    } else {
      selectedGame.value = null;
      mods.value = [];
    }
    gamesLoaded.value = true;
  } catch (err) {
    console.error('Failed to load games:', err);
    games.value = [];
    gamesLoaded.value = true;
  }
}

async function selectGame(game: ManifestObject) {
  selectedGame.value = game;
  selectedMod.value = null;
  try {
    const loadedMods = await global.getModsList(game.id || '');
    mods.value = loadedMods.filter(m => global.isNsfwAllowed(m));
  } catch (err) {
    console.error('Failed to load mods for game', game.id, ':', err);
    mods.value = [];
  }
  activeMods.value = [];
}

async function onSelectGame(game: ManifestObject) {
  await selectGame(game);
  syncUrl();
}

function onToggleMod(mod: ManifestObject) {
  const idx = activeMods.value.findIndex(m => m.id === mod.id);
  if (idx > -1) activeMods.value.splice(idx, 1);
  else activeMods.value.push(mod);
  syncUrl();
}

function onSelectMod(mod: ManifestObject) {
  selectedMod.value = selectedMod.value?.id === mod.id ? null : mod;
}

function modIdsWithCore(): string[] {
  const ids = activeMods.value.map(m => m.id).filter(Boolean) as string[];
  return ['_core', ...ids];
}

async function loadGameAssets(gameId: string) {
  try {
    const assets = await global.loadAndMergeArrayFile<AssetObject>(gameId, 'assets', modIdsWithCore(), true);
    const map = new Map<string, AssetObject>();
    for (const a of assets) if (a.id) map.set(a.id, a);
    assetsMap.value = map;
  } catch (err) {
    console.warn('No assets file or failed to load assets for landing:', err);
    assetsMap.value = new Map();
  }
}

async function loadGameMusic(gameId: string) {
  try {
    const tracks = await global.loadAndMergeArrayFile<MusicObject>(gameId, 'music', modIdsWithCore(), true);
    const map = new Map<string, MusicObject>();
    for (const t of tracks) if (t.id) map.set(t.id, t);
    musicMap.value = map;
  } catch (err) {
    console.warn('No music file or failed to load music for landing:', err);
    musicMap.value = new Map();
  }
}

async function loadLatestSave(gameId: string | null) {
  if (!gameId) {
    latestSave.value = null;
    return;
  }
  try {
    const isDevMode = localStorage.getItem('devMode') === 'true';
    const slots = await global.indexedDbSaveService.listSlots(gameId, isDevMode);
    const withMeta = slots.filter(s => s.saveMeta);
    if (withMeta.length === 0) {
      latestSave.value = null;
      return;
    }
    withMeta.sort((a, b) => (b.saveMeta!.saveDate || 0) - (a.saveMeta!.saveDate || 0));
    latestSave.value = { slot: withMeta[0].slot, meta: withMeta[0].saveMeta! };
  } catch (err) {
    console.error('Failed to load latest save:', err);
    latestSave.value = null;
  }
}

function applyLandingMusic() {
  const id = landingSoundtrack.value;
  if (!id) {
    MusicPlayer.getInstance().stop({ fade: 1.0 });
    return;
  }
  const track = musicMap.value.get(id);
  if (!track || !track.files || track.files.length === 0) return;
  const volume = (global.userSettings.value.music_volume || 0) / 100;
  MusicPlayer.getInstance().play(id, track.files, { fade: 1.5, volume });
}

watch(
  () => [selectedGame.value?.id, activeMods.value.map(m => m.id).join(',')],
  async () => {
    const gameId = selectedGame.value?.id;
    if (!gameId) {
      assetsMap.value = new Map();
      musicMap.value = new Map();
      latestSave.value = null;
      global.unloadLandingCss();
      global.clearEngineTheme();
      MusicPlayer.getInstance().stop({ fade: 1.0 });
      return;
    }
    global.applyEngineTheme(manifests.value);
    await Promise.all([
      loadGameAssets(gameId),
      loadGameMusic(gameId),
      loadLatestSave(gameId),
      global.loadLandingCss(manifests.value),
    ]);
    applyLandingMusic();
  },
  { immediate: false }
);

async function initFromQuery(): Promise<boolean> {
  const { gameId, modIds } = readQuery();
  if (!gameId) return false;

  const allGames = await global.getGamesList();
  const target = allGames.find(g => g.id === gameId);
  if (!target) return false;

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
    const compatible = mod ? checkManifestCompatibility(global.engineVersion, mod.engine_version_min, global.getString.bind(global)).isCompatible : false;
    if (mod && compatible && !activeMods.value.some(a => a.id === mod.id)) {
      activeMods.value.push(mod);
    }
  }

  gamesLoaded.value = true;
  syncUrl();
  return true;
}

async function playGame() {
  if (!selectedGame.value) return;
  if (!gameCompatibility.value.isCompatible) {
    global.addNotification(
      gameCompatibility.value.warningMessage ||
      global.getString('version_incompatible_generic')
    );
    return;
  }
  global.engineState.value = 'game';
  try {
    await global.createNewGame(selectedGame.value, [...activeMods.value]);
  } catch (err) {
    console.error('Failed to create new game:', err);
    global.addNotificationId('error_start_game_failed');
    global.engineState.value = 'main_menu';
    window.location.reload();
  }
}

function continueGame() {
  if (!selectedGame.value || !latestSave.value) return;
  global.loadGameSlot(selectedGame.value.id || '', latestSave.value.slot);
}

function openEditor() {
  global.engineState.value = 'editor';
}

function openInstallModal() {
  showInstallModal.value = true;
}

async function handleInstallationComplete() {
  await loadGames();
}

onMounted(async () => {
  const isLocalhost = !isWebMode && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
  if (isLocalhost) {
    localStorage.setItem('devMode', 'true');
  } else {
    localStorage.removeItem('devMode');
  }
  localStorage.removeItem('dev_mode_selected_game');
  localStorage.removeItem('dev_mode_selected_mod');

  const handledByQuery = await initFromQuery();
  if (!handledByQuery) {
    await loadGames();
  }

  if (selectedGame.value) {
    const gameId = selectedGame.value.id || '';
    global.applyEngineTheme(manifests.value);
    await Promise.all([
      loadGameAssets(gameId),
      loadGameMusic(gameId),
      loadLatestSave(gameId),
      global.loadLandingCss(manifests.value),
    ]);
    applyLandingMusic();
  }
});

onUnmounted(() => {
  global.unloadLandingCss();
  if (global.engineState.value !== 'game') {
    MusicPlayer.getInstance().stop({ fade: 0.6 });
    global.clearEngineTheme();
  }
});
</script>

<template>
  <div class="main-screen">
    <div class="main-screen-bg">
      <BackgroundAsset
        v-for="(asset, i) in landingBgs"
        :key="(asset.id || '') + '_' + i"
        :asset="asset"
      />
    </div>

    <header class="main-screen-header">
      <div class="main-screen-header-left">
        <button v-if="!isWebMode" class="main-screen-hbtn main-screen-hbtn--accent" @click="openInstallModal" :disabled="!gamesLoaded">
          <i class="pi pi-download"></i>
          <span>Install</span>
        </button>
        <GamesDropdown
          :games="games"
          :selected-game="selectedGame"
          @select-game="onSelectGame"
        />
      </div>

      <div class="main-screen-header-right">
        <button class="main-screen-hbtn" @click="global.toggleMenu">
          <i class="pi pi-bars"></i>
          <span>Menu</span>
        </button>
        <div v-if="global.isWebSite" class="main-screen-nsfw" @click="toggleNsfw">
          <span class="main-screen-nsfw-label">18+</span>
          <button
            type="button"
            class="main-screen-nsfw-toggle"
            :class="{ 'main-screen-nsfw-toggle--on': global.nsfwEnabled.value }"
            role="switch"
            :aria-checked="global.nsfwEnabled.value"
            aria-label="Enable adult content"
            @click.stop="toggleNsfw"
          ></button>
        </div>
        <button v-if="!isWebMode || global.isWebSite" class="main-screen-hbtn" @click="openEditor">
          <i class="pi pi-pencil"></i>
          <span>Editor</span>
        </button>
        <button v-if="showInstallButton" class="main-screen-hbtn" @click="showPwaModal = true">
          <i class="pi pi-window-maximize"></i>
          <span>Fullscreen</span>
        </button>
      </div>
    </header>

    <main class="main-screen-stage">
      <div v-if="!gamesLoaded" class="main-screen-empty">Loading…</div>

      <div v-else-if="games.length === 0" class="main-screen-empty">
        No games installed. Drop one into <code>games_files/</code> or build your own.
      </div>

      <div v-else-if="selectedGame" class="main-screen-cards">
        <ManifestPanel
          :manifest="selectedGame"
          @screenshots="screenshotsManifest = selectedGame"
        >
          <div v-if="!gameCompatibility.isCompatible" class="main-screen-warning">
            <i class="pi pi-exclamation-triangle"></i>
            <span>{{ gameCompatibility.warningMessage }}</span>
          </div>

          <div class="main-screen-cta-row">
            <button
              v-if="latestSave"
              class="main-screen-cta main-screen-cta--primary"
              @click="continueGame"
            >
              <i class="pi pi-play"></i>
              <span>Continue</span>
            </button>
            <button
              class="main-screen-cta"
              :class="{ 'main-screen-cta--primary': !latestSave }"
              :disabled="!gameCompatibility.isCompatible"
              @click="playGame"
            >
              <i class="pi pi-plus"></i>
              <span>New Game</span>
            </button>
            <button
              v-if="latestSave"
              class="main-screen-cta"
              @click="showSavesDrawer = true"
            >
              <i class="pi pi-folder-open"></i>
              <span>Saves</span>
            </button>
          </div>

          <ModsStrip
            :mods="mods"
            :active-mods="activeMods"
            :selected-mod="selectedMod"
            @toggle-mod="onToggleMod"
            @select-mod="onSelectMod"
          />
        </ManifestPanel>

        <ManifestPanel
          v-if="selectedMod"
          :manifest="selectedMod"
          :active="activeMods.some(m => m.id === selectedMod?.id)"
          @screenshots="screenshotsManifest = selectedMod"
          @toggle="selectedMod && onToggleMod(selectedMod)"
        />
      </div>
    </main>

    <EngineLogo :disable-link="disableEngineLink" />

    <ScreenshotsOverlay
      v-if="screenshotsManifest"
      :assets="screenshotsManifest.cover_assets || []"
      @close="screenshotsManifest = null"
    />

    <SavesDrawer
      :game-id="selectedGame?.id || null"
      :open="showSavesDrawer"
      @close="showSavesDrawer = false"
    />

    <InstallGamesModal
      v-if="!isWebMode"
      v-model:visible="showInstallModal"
      :games="games"
      @installation-complete="handleInstallationComplete"
    />
    <InstallPwaModal v-if="showPwaModal" @close="showPwaModal = false" />
    <PwaInstalledModal v-if="justInstalled" @close="justInstalled = false" />
  </div>
</template>

<style scoped src="./main-screen.component.css"></style>
