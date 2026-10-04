<script setup lang="ts">
import { computed, unref } from 'vue';
import { useEventListener } from '@vueuse/core';
import { Choice } from '../core/content/choice';
import { Game } from '../game';
import { Global } from '../../global/global';

let game = Game.getInstance();
const global = Global.getInstance();

// The list mounts the instant the typewriter lands on the last character, beside a flash that
// already fades in — so it fades in too. A player who turned the reveal off asked for no
// animation at all, so the list pops for them.
const revealsInstantly = computed(() => global.userSettings.value.typing_speed === 'none');

const normalizedChoices = computed(() => {
  const rawChoices = game.dungeonSystem.relevantChoices.value;
  if (!rawChoices) {
    return [];
  }
  if (Array.isArray(rawChoices)) {
    return rawChoices;
  }
  return [rawChoices as Choice];
});

const visibleChoices = computed(() => {
  return normalizedChoices.value.filter(choice => choice?.isVisible && (choice.name || choice.nameKey));
});

function isChoiceVisited(choice: Choice): boolean {
  if (game.dungeonSystem.choiceType.value === 'encounter' || !choice.id) {
    return false;
  }
  return game.dungeonSystem.usedDungeonData.value.visitedChoices.has(choice.id);
}

function handleChoice(choice: Choice) {
  //console.log('handleChoice', choice);
  if (game.coreSystem.getState('disable_ui')) {
    return;
  }
  choice.do();
  if (game.dungeonSystem.choiceType.value == 'encounter') {
    if (!game.dungeonSystem.currentSceneId) {
      // go to #encounter/choice scene
    }
  }
}

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  const activeElement = document.activeElement;
  if (activeElement) {
    const tagName = activeElement.tagName.toUpperCase();
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
      return;
    }
  }

  // Same rule as the Space/Enter advance in OverlayNavigation: a modal popup covers the list
  // and eats mouse clicks, but this listener stays mounted underneath it. Without the guard a
  // number key picks a choice the player can't even see — and a delayed one ({xp}) re-fires
  // it on every press. (hide_events needs no check here: it v-ifs this component away.)
  if (game.getOpenPopups().length) {
    return;
  }

  if (visibleChoices.value.length > 0 && game.dungeonSystem.choiceType.value !== 'encounter') {
    const key = parseInt(e.key, 10);
    if (!isNaN(key) && key >= 0 && key <= 9) {
      e.preventDefault();
      const choiceIndex = key === 0 ? 9 : key - 1; // 0 is 10th, 1 is 1st etc.
      if (choiceIndex < visibleChoices.value.length) {
        handleChoice(visibleChoices.value[choiceIndex]);
      }
    }
  }
});
</script>

<template>
  <div v-if="visibleChoices.length > 0" class="choice-list"
    :class="[game.dungeonSystem.choiceType.value, { instant: revealsInstantly }]">
    <template v-for="(choice, index) in visibleChoices" :key="choice.id">
      <div @click.stop="handleChoice(choice)" class="choice"
        :class="[unref(choice.className), { visited: isChoiceVisited(choice), unavailable: !choice.isAvailable, clue: choice.isClue() }]">
        <span v-if="game.dungeonSystem.choiceType.value != 'encounter'" class="choice-number">
          {{ index + 1 }}.
        </span>
        <span v-script="{ html: (choice.nameComputed as unknown as string) || choice.name, resolver: false }"></span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.choice-list {
  /* Add your component-specific styles here */
  /*border: 1px solid #007bff;*/
  padding: 1rem;
  margin: 1rem 0;
  border-radius: 4px;
  background: #000c;
  width: 100%;
  max-height: 40dvh;
  min-height: 0;
  overflow-y: auto;
  font-family: var(--font-family-serif);
  /* Enter only: the list is torn down synchronously when a choice is picked, so a leave
     transition would linger over the next text. Input works from the first frame. */
  animation: choice-list-enter 0.25s ease-out;
}

.choice-list.instant {
  animation: none;
}

@keyframes choice-list-enter {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .choice-list {
    animation: none;
  }
}

.overlay.text .choice-list {
  border: none;
  padding: 0 1rem;
  margin: 0;
  background: none;
  max-height: none;
  overflow: visible;
}

.choice-list h1 {
  margin-top: 0;
  color: #42b983;
  /* Vue green */
}

.choice {
  cursor: pointer;
  color: #79a4e6;
  font-weight: bold;
  line-height: 1.1em;
}

.choice-list .choice:hover {
  color: #2584ea;
}

.choice:hover::before {
  content: "➺";
}

.choice.visited {
  color: #d1d1d1;
  font-weight: normal;
}

/* An untaken {clue: true} hint. Same orange as the map encounter glow. Declared BEFORE
   .unavailable so that a greyed-out choice wins on equal specificity — a choice you
   cannot pick should not beckon. */
.choice.clue {
  color: #ff6600;
  text-shadow: 0 0 6px rgba(255, 102, 0, 0.5);
}

.choice.unavailable {
  color: red;
  pointer-events: none;
}
</style>
