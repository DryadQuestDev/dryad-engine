<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import { Item } from '../../core/character/item';
import { Choice } from '../../core/content/choice';
import { Global } from '../../../global/global';
import { PARTY_INVENTORY_ID } from '../../systems/itemSystem';

const game = Game.getInstance();

const COMPONENT_ID = 'item-choices';

const props = defineProps<{
  item: Item;
}>();

// Get choices dynamically from the item
const choices = computed(() => {
  return game.characterSystem.selectedCharacter.value?.getItemChoices(props.item) || [];
});

// Handle choice click
function handleChoiceClick(choice: Choice) {
  if (!choice.isChoiceAvailable()) {
    Global.getInstance().addNotificationId("items_no_use");
    return;
    //console.warn("Items cannot be used during scenes.");
  }
  game.coreSystem.setState('active_character', game.coreSystem.getState('selected_character'));
  game.coreSystem.setState('active_inventory', PARTY_INVENTORY_ID);
  game.coreSystem.setState('active_item', props.item.uid);
  choice.do();
}


</script>

<template>
  <div :id="COMPONENT_ID" class="item-choices">
    <!-- ItemChoices content with dynamic choices from item.getChoices() -->
    <div class="choices-list">
      <template v-for="(choice, index) in choices" :key="`${choice.id}-${index}`">
        <button v-if="choice.isVisible.value" class="choice-button" :class="{ 'disabled': !choice.isAvailable.value }"
          @click="handleChoiceClick(choice)">
          <span class="choice-text" v-html="choice.nameComputed.value"></span>
        </button>
      </template>
    </div>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" />
  </div>
</template>

<style scoped>
.item-choices {
  background: rgba(26, 26, 26, 0.95);
  border: 2px solid #444;
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.choices-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 150px;
}

.choice-button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(42, 42, 42, 0.9);
  border: 1px solid #555;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  text-align: left;
  white-space: nowrap;
}

.choice-button:hover {
  background: rgba(66, 185, 131, 0.3);
  border-color: #42b983;
  transform: translateX(-2px);
}

.choice-button:active {
  transform: translateX(-2px) scale(0.98);
}

.choice-button.disabled,
.choice-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: rgba(42, 42, 42, 0.5);
}

.choice-button.disabled:hover,
.choice-button:disabled:hover {
  background: rgba(42, 42, 42, 0.5);
  border-color: #555;
  transform: none;
}

.choice-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.choice-text {
  flex: 1;
}
</style>
