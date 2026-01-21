<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import CharacterDoll from './CharacterDoll.vue';
import CharacterSlot from './CharacterSlot.vue';

const props = defineProps<{
  character: Character;
}>();

const game = Game.getInstance();

// Get tabs from unified registry
const tabs = computed(() => game.coreSystem.getComponentsBySlot('character-tabs'));

// Lifecycle hooks
onMounted(() => {
  // If no tab is selected, and there are tabs, select the first one.
  if (!game.coreSystem.getState('progression_sub_state') && tabs.value.length > 0) {
    game.coreSystem.setState('progression_sub_state', tabs.value[0].id || null);
  }
});

const activeTabPayload = computed(() => {
  if (game.coreSystem.getState('progression_sub_state')) {
    return tabs.value.find(tab => tab.id === game.coreSystem.getState('progression_sub_state'));
  }
  return undefined;
});

function selectTab(tabId: string) {
  game.coreSystem.setState('progression_sub_state', tabId);
}

</script>

<template>


  <div class="character-sheet-container" v-if="game.getState('selected_character')">
    <div class="character-doll-wrapper">
      <CharacterSlot :key="character.id" :character="character" :slot="{ scale: 1 }" :showItemSlots="true"
        :enableAppear="true" />
    </div>

    <div class="character-sheet">
      <div class="character-sheet-content">
        <div class="tabs">
          <div class="tab" v-for="tab of tabs" :key="tab.id" @click="selectTab(tab.id)"
            :class="{ 'active-tab': game.coreSystem.getState('progression_sub_state') === tab.id }">
            {{ tab.title }}
          </div>
        </div>
        <div class="tab-content" v-if="activeTabPayload">
          <component :is="activeTabPayload.component" :character="character" v-bind="activeTabPayload.props" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-sheet-container {
  display: flex;
  gap: 0.5rem;
  width: 100%;
  height: 100%;
}

.character-doll-wrapper {
  /*width: 600px;*/
  width: 50vh;
  flex-shrink: 0;
  height: 100%;
  position: relative;
  display: flex;
  /*justify-content: center;*/
  align-items: center;
  padding-bottom: 4vh;
}

.character-doll-wrapper :deep(.character-slot) {
  position: relative;
  width: auto;
  height: 100%;
  aspect-ratio: 1 / 1;
  left: auto;
  top: auto;
}

.character-doll-wrapper :deep(.character-slot-positioner) {
  position: relative;
  width: 100%;
  height: 100%;
}

.character-doll-wrapper :deep(.character-slot-rotation-wrapper) {
  justify-content: flex-start;
}


.character-sheet {
  flex: 1;
  min-width: 400px;
  position: relative;
  z-index: 20;
  display: flex;
  justify-content: left;
}

.character-sheet-content {
  /*border: 1px solid #eee;*/
  padding: 1rem;
  border-radius: 4px;
  width: 100%;
  max-width: 1000px;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.character-sheet h1 {
  margin-top: 0;
  color: #42b983;
  /* Vue green */
}

.tabs {
  display: flex;
  border-bottom: 1px solid #444;
}

.tab {
  padding: 10px 20px;
  cursor: pointer;
  border: 1px solid transparent;
  border-bottom: none;
  margin-right: 5px;
  border-radius: 4px 4px 0 0;
  background-color: #3a3a3a;
  transition: background-color 0.3s ease, color 0.3s ease;
}

.tab:hover {
  background-color: #4a4a4a;
}

.active-tab {
  background-color: #5a5a5a;
  color: #fff;
  border-color: #666;
}

.tab-content {
  padding: 20px;
  background-color: #333;
  border-radius: 0 0 8px 8px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/*
@media (min-width: 1800px) {
  .character-doll-wrapper {
    max-width: 1000px;
     Adjust this value as needed 
  }
}
*/
</style>
