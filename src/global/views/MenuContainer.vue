<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStorage } from '@vueuse/core';
import { Game } from '../../game/game';
import { Global } from '../global';
import Savelist from './Savelist.vue';
import Gform from './forms/Gform.vue';
import ModPicker from './ModPicker.vue';
import CustomComponentContainer from '../../game/views/CustomComponentContainer.vue';

const game = Game.getInstance();
const global = Global.getInstance();

// Game settings go through the API so game_setting_change fires; a direct write into the ref would not.
const setGameSetting = (key: string, value: any) => game.setGameSetting(key, value);

// Consume the requested initial tab (game.openMenu('saves') etc.); the component is
// v-if-mounted fresh on every open, so setup reruns and the reset keeps later opens on 'main'.
const menuState = ref(global.menuInitialState.value);
global.menuInitialState.value = 'main';
// A game script can open straight into the settings panel via game.openMenu('engine_settings'),
// which never runs setMenuState, so the language list is requested here too.
if (menuState.value === 'engine_settings') global.ensureLanguagesDiscovered();

const isGameRunning = global.engineState.value === 'game';

// Changing mods writes the running state to a temporary slot and reloads into it, so it is a save
// in all but name — blocked whenever saving is (a battle, replay, a game-over screen). Without
// this the save silently no-ops and the reload lands on a slot that was never written.
const savesBlocked = computed(() => isGameRunning && game.coreSystem.isSaveDisabled());

// Check if in dev mode
const isDevMode = computed(() => localStorage.getItem('devMode') === 'true');

const showDebugPanel = useStorage('showDebugPanel', true);

function handleClickOutside(event: MouseEvent) {
  // Ensure the click is directly on the background and not on the content
  if (event.target === event.currentTarget) {
    global.toggleMenu();
  }
}

function setMenuState(state: string) {
  menuState.value = state;
  // The language dropdown needs every shipped locale file's own name, so the folder is listed and
  // read here rather than at boot. Idempotent, and the panel renders before it resolves: until it
  // does the list holds English and the current language, and the rest appear when it lands.
  if (state === 'engine_settings') global.ensureLanguagesDiscovered();
}
</script>

<template>
  <div id="menu-container" class="menu-container">



    <div class="menu-container-bg glass-popup-mask" @click="handleClickOutside">
      <div class="menu-container-content glass-popup-surface dark-scrollbar">
        <CustomComponentContainer :slot="'menu-before'" :context="{ menuState }" />

        <ul v-if="menuState === 'main'">
          <!-- Dev Mode Indicator and Toggle. Literal English on purpose: no shipped player build
               renders this block, so its wording is not a translator's to carry. -->
          <div v-if="isDevMode" class="dev-mode-section">
            <div class="dev-mode-indicator">
              <span class="dev-badge">DEV</span>
              <span>Mode Active</span>
            </div>
            <div class="debug-panel-toggle">
              <label>
                <input type="checkbox" v-model="showDebugPanel" />
                <span>Show Debug Panel</span>
              </label>
            </div>
          </div>

          <li v-if="isGameRunning" @click="setMenuState('saves')">{{ global.getString('menu.saves') }}</li>
          <li @click="setMenuState('engine_settings')">{{ global.getString('menu.engine_settings') }}</li>
          <li v-if="isGameRunning && game.coreSystem.gameSettingsSchema.length > 0"
            @click="setMenuState('game_settings')">{{ global.getString('menu.game_settings') }}</li>
          <li v-if="isGameRunning" :class="{ 'menu-disabled': savesBlocked }"
            @click="savesBlocked || setMenuState('mod_picker')">
            {{ global.getString('menu.mods_manager') }}
            <span v-if="savesBlocked" class="menu-disabled-hint">{{ global.getString('mods_save_disabled') }}</span>
          </li>
          <li v-if="isGameRunning" @click="global.toMainMenu">{{ global.getString('menu.main_menu') }}</li>
          <li @click="global.toggleMenu">{{ global.getString('menu.close') }}</li>
        </ul>
        <ul v-if="menuState === 'saves'">
          <li @click="setMenuState('main')">{{ global.getString('menu.back') }}</li>
          <Savelist :game-id="game.coreSystem.gameId" :is-from-game="true" />
        </ul>
        <ul v-if="menuState === 'engine_settings'">
          <li @click="setMenuState('main')">{{ global.getString('menu.back') }}</li>
          <Gform :schema="global.menuOptions.value" :values="global.userSettings" />
        </ul>
        <ul v-if="menuState === 'game_settings'">
          <li @click="setMenuState('main')">{{ global.getString('menu.back') }}</li>
          <Gform :schema="game.coreSystem.gameSettingsSchema" :values="game.coreSystem.settings" :setter="setGameSetting" />
        </ul>
        <ul v-if="menuState === 'mod_picker'">
          <li @click="setMenuState('main')">{{ global.getString('menu.back') }}</li>
          <ModPicker />
        </ul>
        <CustomComponentContainer :slot="'menu-after'" :context="{ menuState }" />
      </div>
    </div>


  </div>
</template>

<style scoped>
.menu-container {
  position: absolute;
  z-index: 1200;
}

/* Layout only — glass surface comes from .glass-popup-mask / .glass-popup-surface in src/style.css */
.menu-container-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  width: 100dvw;
  height: 100vh;
  height: 100dvh;
}

.menu-container-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  height: 80vh;
  height: 80dvh;
  width: min(500px, 92vw);
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  scrollbar-gutter: stable;
}


.menu-container-content ul {
  list-style-type: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
}

.menu-container-content li {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px 20px;
  font-family: inherit;
  font-size: 14px;
  letter-spacing: 0.04em;
  color: rgba(216, 221, 228, 0.92);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.menu-container-content li:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: var(--glass-tint);
  color: #fff;
}

.menu-container-content li.menu-disabled {
  flex-direction: column;
  gap: 4px;
  opacity: 0.45;
  cursor: not-allowed;
}

.menu-container-content li.menu-disabled:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(216, 221, 228, 0.92);
}

.menu-disabled-hint {
  font-size: 11px;
  letter-spacing: 0.03em;
  opacity: 0.8;
}

@media (pointer: coarse),
(max-width: 720px) {
  .menu-container-content {
    padding: 28px 22px;
    gap: 12px;
  }

  .menu-container-content ul {
    gap: 12px;
  }

  .menu-container-content li {
    padding: 18px 24px;
    font-size: 16px;
    border-radius: 10px;
  }
}


/* Dev Mode Section */
.dev-mode-section {
  width: 100%;
  margin-bottom: 16px;
  padding: 14px 16px;
  background: rgba(180, 110, 0, 0.18);
  border: 1px solid rgba(255, 180, 60, 0.45);
  border-radius: 10px;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}

.dev-mode-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 12px;
  color: #ffd6a8;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: 0.04em;
}

.dev-badge {
  background-color: #ff9800;
  color: #0b0d10;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.debug-panel-toggle {
  display: flex;
  justify-content: center;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  border: 1px solid rgba(255, 180, 60, 0.25);
}

.debug-panel-toggle label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: rgba(216, 221, 228, 0.9);
  font-size: 13px;
}

.debug-panel-toggle input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--glass-tint);
}
</style>
