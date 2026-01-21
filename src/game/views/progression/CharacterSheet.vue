<script setup lang="ts">
import { computed } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import CharacterStatuses from './CharacterStatuses.vue';
import CharacterStats, { type StatGroup } from './CharacterStats.vue';
import InventoryComponent from './InventoryComponent.vue';
import { PARTY_INVENTORY_ID } from '../../systems/itemSystem';

const props = defineProps<{
  character: Character;
  groups?: StatGroup[];
  hideInventory?: boolean;
}>();

const game = Game.getInstance();

// Use prop if provided, otherwise read from state (null/undefined means use default)
const statGroups = computed((): StatGroup[] | undefined => {
  if (props.groups) return props.groups;
  const stateGroups = game.coreSystem.getState('character_stat_groups');
  return Array.isArray(stateGroups) ? stateGroups as StatGroup[] : undefined;
});

const hasVisibleStatuses = computed(() => {
  if (game.coreSystem.getDebugSetting('show_hidden_stats')) {
    return props.character.statuses.length > 0;
  }
  return props.character.statuses.some(status => !status.isHidden);
});

const hasStats = computed(() => {
  return props.character.statIds.size > 0;
});

const hasStatsOrStatuses = computed(() => hasVisibleStatuses.value || hasStats.value);
</script>

<template>
  <div class="character-sheet-container">
    <!-- Top slot -->
    <component v-for="cm in game.coreSystem.getComponentsBySlot('character-sheet-top')" :key="cm.id" :is="cm.component"
      :character="character" v-bind="cm.props" />

    <div class="stats-wrapper" :class="{ 'with-inventory': !hideInventory }" v-if="hasStatsOrStatuses">
      <div class="statuses-section" v-if="hasVisibleStatuses">
        <CharacterStatuses :character="character" />
      </div>
      <div class="stats-section" v-if="hasStats">
        <CharacterStats :character="character" :groups="statGroups" />
      </div>
    </div>
    <div class="inventory-section" v-if="!hideInventory">
      <InventoryComponent :inventory_id="PARTY_INVENTORY_ID" />
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
  overflow: hidden;
  gap: 0.5rem;
}

.stats-wrapper {
  display: flex;
  flex-direction: column;
  flex: 0 1 auto;
  overflow: hidden;
  min-height: 65px;
  gap: 0.5rem;
}

.stats-wrapper.with-inventory {
  max-height: 50%;
}

.statuses-section {
  flex: 0 1 auto;
  max-height: 40%;
  overflow: hidden;
  min-height: 65px;
}

.stats-section {
  flex: 1 1 auto;
  overflow-y: auto;
  min-height: 0;
}

.inventory-section {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  overflow: hidden;
  min-height: 0;
}
</style>
