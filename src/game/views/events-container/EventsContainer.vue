<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import CharacterSlot from '../progression/CharacterSlot.vue';

const game = Game.getInstance();

const COMPONENT_ID = 'events-container';

const hideActors = computed(() =>
  game.dungeonSystem.assets.value.some(a => a.hide_actors)
);

</script>

<template>
  <div :id="COMPONENT_ID" class="events-container">
    <div v-show="!hideActors" style="display: contents;">
      <CharacterSlot v-for="slot in game.dungeonSystem.sceneSlots.value" :key="slot.char"
        :character="game.characterSystem.getCharacter(slot.char)!" :slot="slot" />
    </div>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" :context="{ sceneSlots: game.dungeonSystem.sceneSlots.value }" />
  </div>
</template>

<style scoped>
.events-container {
  position: relative;
  /* Needed for absolute positioning of children */
  width: 100%;
  height: 100%;
  /*overflow: hidden;*/

}
</style>
