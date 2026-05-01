<script setup lang="ts">
import { ref, computed } from 'vue';
import { useStorage } from '@vueuse/core';
import { Game } from '../../game/game';
import { Global } from '../global';
import Savelist from './Savelist.vue';
import Gform from './forms/Gform.vue';
import { MenuOptions } from '../menuOptions';
import ModPicker from './ModPicker.vue';
import CustomComponentContainer from '../../game/views/CustomComponentContainer.vue';

const game = Game.getInstance();
const global = Global.getInstance();

const menuState = ref('main');

const isGameRunning = global.engineState.value === 'game';

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
}
</script>

<template>
  <div id="menu-container" class="menu-container">



    <div class="menu-container-bg glass-popup-mask" @click="handleClickOutside">
      <div class="menu-container-content glass-popup-surface">
        <CustomComponentContainer :slot="'menu-before'" :context="{ menuState }" />

        <ul v-if="menuState === 'main'">
          <!-- Dev Mode Indicator and Toggle -->
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

          <li v-if="isGameRunning" @click="setMenuState('saves')">Saves</li>
          <li @click="setMenuState('engine_settings')">Engine Settings</li>
          <li v-if="isGameRunning && game.coreSystem.gameSettingsSchema.length > 0"
            @click="setMenuState('game_settings')">Game
            Settings</li>
          <li v-if="isGameRunning" @click="setMenuState('mod_picker')">Mods Manager</li>
          <li v-if="isGameRunning" @click="global.toMainMenu">Main Menu</li>
          <li @click="global.toggleMenu">Close</li>
        </ul>
        <ul v-if="menuState === 'saves'">
          <li @click="setMenuState('main')">Back</li>
          <Savelist :game-id="game.coreSystem.gameId" :is-from-game="true" />
        </ul>
        <ul v-if="menuState === 'engine_settings'">
          <li @click="setMenuState('main')">Back</li>
          <Gform :schema="MenuOptions" :values="global.userSettings" />
        </ul>
        <ul v-if="menuState === 'game_settings'">
          <li @click="setMenuState('main')">Back</li>
          <Gform :schema="game.coreSystem.gameSettingsSchema" :values="game.coreSystem.settings" />
        </ul>
        <ul v-if="menuState === 'mod_picker'">
          <li @click="setMenuState('main')">Back</li>
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

@media (pointer: coarse), (max-width: 720px) {
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
