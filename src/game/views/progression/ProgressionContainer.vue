<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { Game } from '../../game';
import CustomComponentContainer from '../CustomComponentContainer.vue';

const game = Game.getInstance();

const COMPONENT_ID = 'progression-container';

// Get tabs from unified registry
const tabs = computed(() => game.coreSystem.getComponentsBySlot('progression-tabs'));

// Lifecycle hooks
onMounted(() => {
  // If no tab is selected, and there are tabs, select the first one.
  if (!game.coreSystem.getState('progression_state') && tabs.value.length > 0) {
    game.coreSystem.setState('progression_state', tabs.value[0].id || null);
  }
});

const activeTabPayload = computed(() => {
  if (game.coreSystem.getState('progression_state')) {
    return tabs.value.find(tab => tab.id === game.coreSystem.getState('progression_state'));
  }
  return undefined;
});

function selectTab(tabId: string) {
  game.coreSystem.setState('progression_state', tabId);
}

function closeProgression() {
  game.coreSystem.setState('progression_state', null);
}


</script>

<template>

  <div :id="COMPONENT_ID" class="progression-container">
    <div class="tabs">
      <div class="tab" v-for="tab of tabs" :key="tab.id" @click="selectTab(tab.id)"
        :class="{ 'active-tab': game.coreSystem.getState('progression_state') === tab.id }">
        {{ tab.title }}
      </div>
      <div class="tab" @click="closeProgression">
        <span class="tab-icon">Close</span>
      </div>
    </div>

    <div class="tab-content" v-if="activeTabPayload">
      <component
        :is="activeTabPayload.component"
        :character="activeTabPayload.id === 'character' ? game.characterSystem.selectedCharacter.value : undefined"
        v-bind="activeTabPayload.props"
      />
    </div>

    <!-- Custom components injected to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" />
  </div>


</template>

<style scoped>
.progression-container {

  padding: 20px 20px 20px 120px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  color: #f0f0f0;
  height: 100%;

  /*thick glass background*/
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  overflow: hidden;
}

.tab-content {
  height: 100%;
}

.progression-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.progression-header h1 {
  margin: 0;
  font-size: 1.8em;
}

.close-button {
  background: none;
  border: none;
  color: #f0f0f0;
  font-size: 1.5em;
  cursor: pointer;
}

.tabs {
  display: flex;
  margin-bottom: 20px;
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
</style>
