<script setup lang="ts">
import { computed } from 'vue';
import { Character } from '../../core/character/character';
import CharacterStatuses from './CharacterStatuses.vue';
import CharacterStats from './CharacterStats.vue';
import InventoryComponent from './InventoryComponent.vue';
import { PARTY_INVENTORY_ID } from '../../systems/itemSystem';
import AbilitiesViewer from './AbilitiesViewer.vue';
import CustomComponentContainer from '../CustomComponentContainer.vue';

const props = defineProps<{
  character: Character;
  hideInventory?: boolean;
}>();

const hasStats = computed(() => {
  return props.character.statIds.size > 0;
});

const hasAbilities = computed(() => props.character.abilities.size > 0);
</script>

<template>
  <div class="character-sheet-container">
    <!-- Top slot -->
    <CustomComponentContainer slot="character-sheet-top" :context="{ character }" />

    <div class="inventory-section" v-if="!hideInventory">
      <InventoryComponent :inventory_id="PARTY_INVENTORY_ID" />
    </div>
    <div class="stats-wrapper" :class="{ 'with-inventory': !hideInventory }">
      <div class="statuses-section">
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
    <CustomComponentContainer slot="character-sheet-bottom" :context="{ character }" />
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

.character-sheet-container > * {
  flex-shrink: 0;
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
