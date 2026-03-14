<script setup lang="ts">
import { computed } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import CharacterStatuses from './CharacterStatuses.vue';
import CharacterStats from './CharacterStats.vue';
import InventoryComponent from './InventoryComponent.vue';
import { PARTY_INVENTORY_ID } from '../../systems/itemSystem';
import AbilitiesViewer from './AbilitiesViewer.vue';

const props = defineProps<{
  character: Character;
  hideInventory?: boolean;
}>();

const game = Game.getInstance();

const hasVisibleStatuses = computed(() => {
  if (game.coreSystem.getDebugSetting('show_hidden_stats')) {
    return props.character.getStatuses().length > 0;
  }
  return props.character.getStatuses().some(status => !status.isHidden);
});

const hasStats = computed(() => {
  return props.character.statIds.size > 0;
});

const hasStatsOrStatuses = computed(() => hasVisibleStatuses.value || hasStats.value);

const hasAbilities = computed(() => props.character.abilities.size > 0);
</script>

<template>
  <div class="character-sheet-container">
    <!-- Top slot -->
    <component v-for="cm in game.coreSystem.getComponentsBySlot('character-sheet-top')" :key="cm.id" :is="cm.component"
      :character="character" v-bind="cm.props" />

    <div class="inventory-section" v-if="!hideInventory">
      <InventoryComponent :inventory_id="PARTY_INVENTORY_ID" />
    </div>
    <div class="stats-wrapper" :class="{ 'with-inventory': !hideInventory }" v-if="hasStatsOrStatuses">
      <div class="statuses-section" v-if="hasVisibleStatuses">
        <CharacterStatuses :character="character" :showItems="false" />
      </div>
      <div class="stats-section" v-if="hasStats">
        <CharacterStats :character="character" />
      </div>
    </div>
    <div class="abilities-section" v-if="hasAbilities">
      <AbilitiesViewer :character="character" :show-delta="true" />
    </div>

    <!-- Bottom slot -->
    <component v-for="cm in game.coreSystem.getComponentsBySlot('character-sheet-bottom')" :key="cm.id"
      :is="cm.component" :character="character" v-bind="cm.props" />
  </div>
</template>

<style scoped>
.character-sheet-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  gap: 0.5rem;
  padding-right: 4px;
}

.stats-wrapper {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  gap: 0.5rem;
}

.statuses-section {
  flex: 0 0 auto;
}

.stats-section {
  flex: 0 0 auto;
}

.inventory-section {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  min-height: 200px;
}
</style>
