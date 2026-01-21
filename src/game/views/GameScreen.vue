<script setup lang="ts">
import { ref, onMounted, onUpdated, computed, onUnmounted } from 'vue';
import { useStorage } from '@vueuse/core';
import { Global } from '../../global/global';
import { Game } from '../game';
import Debug from './Debug.vue';
import BackgroundAsset from './BackgroundAsset.vue';
import EventsContainer from './events-container/EventsContainer.vue';
import UiContainer from './UiContainer.vue';
import ProgressionContainer from './progression/ProgressionContainer.vue';
import PopupContainer from './PopupContainer.vue';
import LogsPopup from './LogsPopup.vue';
import OverlayContainer from './overlays/OverlayContainer.vue';

const global = Global.getInstance();
const game = Game.getInstance();


onUpdated(() => {
  game.trigger('html_mount');
  // console.warn(`${componentName.value} component updated.`); // Original onUpdated console log
});



const currentGameStateComponent = computed(() => {
  if (game.coreSystem.gameInitiated.value && game.coreSystem.getState('game_state')) {
    return game.coreSystem.getStateComponent(game.coreSystem.getState('game_state'));
  }
  return null;
});

// Debug panel visibility from localStorage (reactive)
const showDebugPanel = useStorage('showDebugPanel', true);

// Check if debug panel should be visible
const shouldShowDebugPanel = computed(() => {
  const isDevMode = localStorage.getItem('devMode') === 'true';
  return isDevMode && showDebugPanel.value;
});
</script>

<template>

  <div class="game-screen">
    <div class="is_loading" v-if="game.coreSystem.stateLoading.value">
      Loading...
    </div>
    <div class="game-body dark-scrollbar" v-else>


      <div class="game-body-content">

        <div class="game-state-wrapper" id="game-state-wrapper">
          <component :is="currentGameStateComponent" v-if="currentGameStateComponent" />
          <div class="no-game-state" v-else>
            No game state is currently active.
          </div>
        </div>

        <div class="backgrounds-wrapper" id="backgrounds-wrapper">
          <BackgroundAsset v-for="asset in game.dungeonSystem.assets.value" :key="asset.id" :asset="asset" />
        </div>

        <div class="progression-wrapper" id="progression-wrapper" v-if="game.coreSystem.getState('progression_state')">
          <ProgressionContainer />
        </div>


        <div class="events-body" v-if="game.dungeonSystem.currentSceneId.value">
          <!--  && !game.coreSystem.getState('progression_state')-->
          <div :class="{ 'events-zone': game.coreSystem.getDebugSetting('events_zone') }" class="events-wrapper"
            id="events-wrapper">
            <EventsContainer />
          </div>
        </div>

        <div class="overlay-wrapper" v-show="!game.coreSystem.getState('progression_state')">
          <OverlayContainer />
        </div>

        <div class="ui-wrapper">
          <UiContainer />
        </div>

        <div class="popup-wrapper">
          <PopupContainer />
        </div>

        <LogsPopup />

      </div>
      <div v-if="shouldShowDebugPanel" class="game-body-panel">
        <Debug />
      </div>



    </div>
  </div>
</template>

<style scoped>
.game-body {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: row;
}

.game-body-content {
  position: relative;
  flex-grow: 1;
  /* Make this take remaining space */
  height: 100%;
  width: 100%;
  container-type: size;
  /* Enable container queries */
}

.game-body-panel {
  width: 350px;
  flex-shrink: 0;
  /* Prevent shrinking */
  height: 100%;
  background-color: #f0f0f0;
  z-index: 999;
}

.game-screen {
  /*background-color: #787878a7;*/
  background-color: black;
  width: 100vw;
  height: 100vh;
}


.game-state-wrapper {
  position: absolute;
  width: 100%;
  height: 100%;
}

.backgrounds-wrapper {
  position: absolute;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}

.progression-wrapper {
  color: white;
  position: absolute;
  height: 100%;
  width: 100%;
  z-index: 100;
}

.events-body {
  width: 100%;
  height: 100%;
  z-index: 1;
  position: absolute;

  /*slight blur glass background*/
  /*
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  overflow: hidden;
  */
}

.events-wrapper.events-zone {
  background: #f2e8e8c6;
}

.events-wrapper {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  aspect-ratio: 16 / 9;

  /* Default: assume we're width-constrained */
  width: 100%;
  height: auto;
  max-height: 100%;
}

/* When container is wider than 16:9, we're height-constrained */
@container (min-aspect-ratio: 16/9) {
  .events-wrapper {
    width: auto;
    height: 100%;
    max-width: 100%;
  }
}

.overlay-wrapper {
  pointer-events: none;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 300;
}

.ui-wrapper {
  pointer-events: none;
  position: absolute;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  z-index: 400;
}

.ui-container * {
  pointer-events: auto;
}

.popup-wrapper {
  pointer-events: none;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
}

.no-game-state {
  color: white;
  font-size: 2rem;
  font-weight: bold;
  text-align: center;
  padding: 20px;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 10px;
  margin: 20px;
}
</style>
