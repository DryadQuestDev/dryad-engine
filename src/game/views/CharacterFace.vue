<script setup lang="ts">
import { Game } from '../../game/game';
import { computed } from 'vue';
import CharacterDoll from './progression/CharacterDoll.vue';
import CustomComponentContainer from './CustomComponentContainer.vue';
import { Character } from '../core/character/character';

const game = Game.getInstance();

const props = defineProps<{
  character?: Character;
}>();

const COMPONENT_ID = 'character-face';

// Debug mode: set to true to see the whole body art
const DEBUG_MODE = false;

const hasFaceStatic = computed(() => !!props.character?.getTrait('face_static'));
const faceStaticPath = computed(() => props.character?.getTrait('face_static'));

// Properties for positioning the character doll face
// face_shift_x/y are percentages (0-100) of the image dimensions
// Using CSS transform with percentages - they're relative to the element's own size
// Negate values to move the doll in the opposite direction
// Multiply by scale because the transform affects positioning
const scale = computed(() => props.character?.getTrait('face_shift_scale') || 1);
const faceShiftX = computed(() => -(props.character?.getTrait('face_shift_x') || 0) * scale.value);
const faceShiftY = computed(() => -(props.character?.getTrait('face_shift_y') || 0) * scale.value);
const faceShiftScale = computed(() => scale.value);

</script>

<template>
  <div :id="COMPONENT_ID" class="character-face" v-if="character">
    <!-- Static face image if available -->
    <img v-if="hasFaceStatic" :src="faceStaticPath" class="character-face-image" />

    <!-- Fallback to CharacterDoll if no static face -->
    <div v-else class="character-face-doll-container">
      <CharacterDoll :character="character" />
    </div>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" />
  </div>
</template>

<style scoped>
.character-face {
  height: 100px;
  width: 100px;
  border-radius: 50%;
  overflow: clip;
  outline: 2px solid rgb(174, 174, 174)
}

.character-face-image {
  width: 100%;
  height: 100%;
}

.character-face-doll-container {
  width: 100px;
  height: 100px;
  position: relative;
  overflow: v-bind("DEBUG_MODE ? 'visible' : 'hidden'");
}

.character-face-doll-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: v-bind("DEBUG_MODE ? '2px solid red' : 'none'");
  pointer-events: none;
  z-index: 1000;
}

.character-face-doll-container :deep(.character-doll) {
  position: absolute;
}

.character-face-doll-container :deep(.character-doll-image) {
  height: auto;
  width: auto;
  position: absolute;
  transform: translate(v-bind("faceShiftX + '%'"), v-bind("faceShiftY + '%'")) scale(v-bind("faceShiftScale"));
  transform-origin: top left;
}
</style>
