<script setup lang="ts">
import { computed, watch } from 'vue';
import { Game } from '../../game';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import CharacterSlot from '../progression/CharacterSlot.vue';
import { preloadCharacterAssets } from '../../utils/assetPreloader';

const game = Game.getInstance();

const COMPONENT_ID = 'events-container';

// Shared with the engine's removal path (an actor that can't be seen skips its exit
// animation), so the visibility rule can't drift. Assets already fading out don't hide:
// the moment a hide_actors CG starts its exit — e.g. cleared by staging an actor — the
// actor layer becomes visible again, so the newly staged doll's enter animation plays
// visibly (crossfading over the fading CG) instead of running behind display:none.
const hideActors = computed(() => game.dungeonSystem.areActorsHidden());

// Per-character scene view (the `scene_view` trait), resolved at render time rather than stored
// on the slot: a status swapped mid-scene changes the trait, and the actor has to follow without
// the content having to re-stage it. A function, not a computed over the slots — it must re-read
// per character, and the render effect tracks the trait either way. CharacterSlot crossfades the
// doll through the swap.
const sceneView = (charId: string): string =>
  game.characterSystem.getCharacter(charId)?.getSceneView() ?? '';

// Warm a staged actor's art the moment she is on stage, views included — preloadCharacterAssets
// walks every skin layer the character carries, not just the ones the current view renders. A
// view swap patches the doll in one frame, so with the incoming view's images still cold the
// browser spends a few hundred ms fetching and decoding before either side of the crossfade can
// move, and the old view sits there through it. Keyed on the staged cast rather than the slots
// themselves: slots are mutated in place when an actor moves, and re-warming on every move
// would be noise (warmed urls are remembered, so a repeat call is free anyway).
watch(() => game.dungeonSystem.sceneSlots.value.map(slot => slot.char).join('|'), () => {
  for (const slot of game.dungeonSystem.sceneSlots.value) {
    const character = game.characterSystem.getCharacter(slot.char);
    if (character) preloadCharacterAssets(character);
  }
}, { immediate: true });

</script>

<template>
  <div :id="COMPONENT_ID" class="events-container">
    <div v-show="!hideActors" style="display: contents;">
      <CharacterSlot v-for="slot in game.dungeonSystem.sceneSlots.value" :key="slot.char"
        :character="game.characterSystem.getCharacter(slot.char)!" :slot="slot" :view="sceneView(slot.char)" />
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
