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



    <div class="menu-container-bg" @click="handleClickOutside">
      <div class="menu-container-content">
        <CustomComponentContainer :slot="'menu-before'" />

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
        <CustomComponentContainer :slot="'menu-after'" />
      </div>
    </div>


  </div>
</template>

<style scoped>
.menu-container {
  position: absolute;
  z-index: 1200;

}

.menu-container-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.3);
}

.menu-container-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  height: 80vh;
  width: 500px;
  background-color: #f0f0f0;
  padding: 20px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  scrollbar-gutter: stable;
}

.menu-container-content ul {
  list-style-type: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.menu-container-content li {
  background-color: #e0e0e0;
  color: #333;
  padding: 10px 20px;
  margin: 10px 0;
  border: 1px solid #ccc;
  border-radius: 5px;
  cursor: pointer;
  text-align: center;
  min-width: 200px;
  transition: background-color 0.3s ease;
}

.menu-container-content li:hover {
  background-color: #d0d0d0;
}

/* Fade transition classes */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.5s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Dev Mode Section */
.dev-mode-section {
  width: 100%;
  margin-bottom: 20px;
  padding: 15px;
  background-color: #fff3cd;
  border: 2px solid #ffc107;
  border-radius: 8px;
}

.dev-mode-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 15px;
  color: #856404;
  font-weight: bold;
}

.dev-badge {
  background-color: #ff9800;
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.9em;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.debug-panel-toggle {
  display: flex;
  justify-content: center;
  padding: 10px;
  background-color: white;
  border-radius: 5px;
  border: 1px solid #ffc107;
}

.debug-panel-toggle label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #333;
}

.debug-panel-toggle input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}
</style>
