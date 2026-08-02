<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import CharacterSlot from '../progression/CharacterSlot.vue';

const game = Game.getInstance();

const COMPONENT_ID = 'events-container';

// Shared with the engine's removal path (an actor that can't be seen skips its exit
// animation), so the visibility rule can't drift. Assets already fading out don't hide:
// the moment a hide_actors CG starts its exit — e.g. cleared by staging an actor — the
// actor layer becomes visible again, so the newly staged doll's enter animation plays
// visibly (crossfading over the fading CG) instead of running behind display:none.
const hideActors = computed(() => game.dungeonSystem.areActorsHidden());

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
