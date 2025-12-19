<script setup lang="ts">
import { computed } from 'vue';
import { useEventListener } from '@vueuse/core';
import { Choice } from '../core/content/choice';
import { Game } from '../game';

let game = Game.getInstance();

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
  return normalizedChoices.value.filter(choice => choice?.isVisible && choice.name);
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
  <div v-if="visibleChoices.length > 0" class="choice-list" :class="game.dungeonSystem.choiceType.value">
    <template v-for="(choice, index) in visibleChoices" :key="choice.id">
      <div @click.stop="handleChoice(choice)" class="choice"
        :class="{ visited: isChoiceVisited(choice), unavailable: !choice.isAvailable }">
        <span v-if="game.dungeonSystem.choiceType.value != 'encounter'">
          {{ index + 1 }}.
        </span>
        {{ choice.name }}
      </div>
    </template>
  </div>
</template>

<style scoped>
.choice-list {
  /* Add your component-specific styles here */
  border: 1px solid #007bff;
  padding: 1rem;
  margin: 1rem 0;
  border-radius: 4px;
  background: #000c;
  width: 100%;
  font-family: var(--font-family-serif);
}

.overlay.text .choice-list {
  border: none;
  padding: 0 1rem;
  margin: 0;
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
  color: #ffffff;
  font-weight: normal;
}

.choice.unavailable {
  color: red;
  pointer-events: none;
}
</style>
