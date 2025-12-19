<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Game } from '../../game';
import { Choice } from '../../core/content/choice';
import Tooltip from 'primevue/tooltip';

const game = Game.getInstance();
const debugChoices = ref<Choice[]>([]);

// Store original CustomChoiceObjects to access description
const customChoiceObjects = ref<Map<string, any>>(new Map());

// Load debug choices on mount (customChoiceMap is static, not reactive)
onMounted(() => {
  const choices: Choice[] = [];
  for (const [id, customChoice] of game.logicSystem.customChoiceMap.entries()) {
    if (customChoice.group === 'debug') {
      // Store the original object to access description later
      customChoiceObjects.value.set(id, customChoice);
      // Create Choice instance from CustomChoiceObject
      const choice = game.logicSystem.createCustomChoice(customChoice);
      choices.push(choice);
    }
  }
  debugChoices.value = choices;
});

const handleChoiceClick = async (choice: any) => {
  await choice.do();
};

// Helper to get choice name (handles Vue auto-unwrapping)
const getChoiceName = (choice: any): string => {
  // Vue auto-unwraps ComputedRefs in reactive arrays
  // So nameComputed might be a string or ComputedRef
  const name = choice.nameComputed || choice.id;
  return typeof name === 'string' ? name : (name?.value || choice.name);
};

// Helper to get description for tooltip
const getDescription = (choice: any): string | undefined => {
  const customChoice = customChoiceObjects.value.get(choice.id);
  let description = customChoice?.description || "";
  return description + "\n\nParams: " + JSON.stringify(choice.params, null, 2);
};
</script>

<template>
  <div class="debug-choices">
    <h3 v-if="debugChoices.length === 0">No debug choices available</h3>
    <div v-else class="choices-container">
      <button v-for="choice in debugChoices" :key="choice.id" class="debug-choice-button"
        :class="{ 'disabled': !choice.isChoiceAvailable() }" :disabled="!choice.isChoiceAvailable()"
        @click="handleChoiceClick(choice)" v-show="choice.isVisible" v-tooltip.top="getDescription(choice)">
        <span v-html="getChoiceName(choice)"></span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.debug-choices {
  padding: 1rem;
}

.choices-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.debug-choice-button {
  padding: 0.75rem 1.5rem;
  background: #4a5568;
  color: white;
  border: 2px solid #2d3748;
  border-radius: 0.375rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition: all 0.2s ease;
  min-width: 120px;
}

.debug-choice-button:hover:not(.disabled) {
  background: #5a6578;
  border-color: #4a5568;
  transform: translateY(-1px);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.debug-choice-button:active:not(.disabled) {
  transform: translateY(0);
  box-shadow: none;
}

.debug-choice-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #2d3748;
}
</style>
