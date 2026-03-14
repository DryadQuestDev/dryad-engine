/// <reference path="../dtypes.d.ts" />

const { game, vue, components } = window.engine;
const { computed, ref, watch, onMounted, onUnmounted, defineComponent } = vue;
const { CharacterViewerPopup } = components;

import { currentBattle, runAutoTurn } from '../battle-flow.mjs';
import { endBattle } from '../main.mjs';
import { BattleGrid } from './BattleGrid.mjs';
import { BattleLog } from './BattleLog.mjs';
import { InitiativeBar } from './InitiativeBar.mjs';
import { FloatingCombatText } from './FloatingCombatText.mjs';

export const BattleScreen = defineComponent({
  components: { BattleGrid, BattleLog, InitiativeBar, CharacterViewerPopup, FloatingCombatText },
  setup() {
    const speeds = [0.5, 1, 2, 3, 5];
    const battleSpeed = computed(() => game.getState('battle_speed'));
    let turnRunning = false;
    let aborted = false;

    async function scheduleTurn() {
      if (turnRunning) return;
      const battle = currentBattle.value;
      if (!battle || battle.phase !== 'active' || battleSpeed.value === 0) return;

      turnRunning = true;
      aborted = false;

      while (!aborted && currentBattle.value?.phase === 'active' && battleSpeed.value > 0) {
        await runAutoTurn();
        if (aborted || currentBattle.value?.phase !== 'active') break;
      }

      turnRunning = false;
    }

    function stopTurns() {
      aborted = true;
    }

    watch([currentBattle, battleSpeed], () => {
      if (currentBattle.value?.phase === 'active' && battleSpeed.value > 0) {
        scheduleTurn();
      } else {
        stopTurns();
      }
    }, { immediate: true });

    onUnmounted(() => stopTurns());

    let savedSpeed = game.getState('battle_speed') || 1;

    function setSpeed(s) {
      game.setState('battle_speed', s);
    }

    function togglePause() {
      if (battleSpeed.value === 0) {
        game.setState('battle_speed', savedSpeed);
      } else {
        savedSpeed = battleSpeed.value;
        game.setState('battle_speed', 0);
      }
    }

    function onKeyDown(e) {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        togglePause();
      }
    }
    onMounted(() => window.addEventListener('keydown', onKeyDown));
    onUnmounted(() => window.removeEventListener('keydown', onKeyDown));

    function retreat() {
      const battle = currentBattle.value;
      if (battle) battle.retreating = true;
    }

    // Character viewer
    const viewerCharacters = ref(null);
    const viewerInitialIndex = ref(0);

    function openViewer(character, side) {
      const battle = currentBattle.value;
      if (!battle || !character) return;
      const grid = side === 'player' ? battle.playerGrid : battle.enemyGrid;
      const charIds = [...new Set(Object.values(grid))];
      const characters = charIds.map(id => game.getCharacter(id)).filter(Boolean);
      const index = characters.findIndex(c => c.id === character.id);
      viewerCharacters.value = characters;
      viewerInitialIndex.value = Math.max(index, 0);
    }

    function closeViewer() {
      viewerCharacters.value = null;
    }

    const isFinished = computed(() => currentBattle.value?.phase === 'finished');

    function getLine(id) { return game.getLine(id); }

    return {
      currentBattle, speeds, battleSpeed, setSpeed, togglePause, retreat, endBattle,
      viewerCharacters, viewerInitialIndex, openViewer, closeViewer,
      isFinished, getLine,
    };
  },
  template: /*html*/`
    <div class="battle-screen" v-if="currentBattle" style="position: relative;">
      <div class="battle-top-bar">
        <div class="speed-controls">
          <button class="speed-btn" :class="{ active: battleSpeed === 0 }" @click="togglePause" v-tooltip.top="getLine('battle_pause_tooltip')">&#x23F8;</button>
          <button v-for="s in speeds" :key="s"
            class="speed-btn" :class="{ active: battleSpeed === s }"
            @click="setSpeed(s)">{{ s }}x</button>
        </div>
        <InitiativeBar @select="(actor) => openViewer(actor.character, actor.side)" />
      </div>
      <div class="battle-arena">
        <BattleGrid side="player" @select="(char) => openViewer(char, 'player')" />
        <BattleGrid side="enemy" @select="(char) => openViewer(char, 'enemy')" />
        <div class="battle-center">
          <div v-if="!isFinished" class="battle-center-controls">
            <button v-if="!currentBattle.noRetreat && !currentBattle.retreating" class="retreat-btn" @click="retreat">{{ getLine('battle_retreat') }}</button>
            <button v-else-if="currentBattle.retreating" class="retreat-btn retreating" disabled>{{ getLine('battle_retreating') }}</button>
          </div>
          <BattleLog @select="(char, side) => openViewer(char, side)" @continue="endBattle()" />
        </div>
      </div>
      <div class="battle-controls">
      </div>
      <FloatingCombatText />
      <CharacterViewerPopup v-if="viewerCharacters"
        :characters="viewerCharacters" :initialIndex="viewerInitialIndex" @close="closeViewer" />
    </div>
    <div v-else class="battle-screen battle-no-data">
      <p>{{ getLine('battle_no_active') }}</p>
    </div>
  `
});
