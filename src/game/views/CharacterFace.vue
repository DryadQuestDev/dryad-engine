<script setup lang="ts">
import { computed } from 'vue';
import CharacterDoll from './progression/CharacterDoll.vue';
import CustomComponentContainer from './CustomComponentContainer.vue';
import { Character } from '../core/character/character';

const props = defineProps<{
  character?: Character;
  showName?: boolean;
  size?: number;
  borderRadius?: number | string;
}>();

const characterName = computed(() => props.character?.getTrait('name') || '');
const faceSize = computed(() => (props.size ?? 100) + 'px');
const faceBorderRadius = computed(() => {
  if (props.borderRadius === undefined) return '50%';
  if (typeof props.borderRadius === 'number') return props.borderRadius + 'px';
  return props.borderRadius;
});

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
  <div :id="COMPONENT_ID" class="character-face-wrapper" v-if="character">
    <div class="character-face">
      <!-- Static face image if available -->
      <img v-if="hasFaceStatic" :src="faceStaticPath" class="character-face-image" />

      <!-- Fallback to CharacterDoll if no static face -->
      <div v-else class="character-face-doll-container">
        <CharacterDoll :character="character" />
      </div>

      <!-- Custom components registered to this container -->
      <CustomComponentContainer :slot="COMPONENT_ID" />
    </div>

    <!-- Name label below face -->
    <div v-if="showName" class="character-face-name">{{ characterName }}</div>
  </div>
</template>

<style scoped>
.character-face-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.character-face {
  height: v-bind(faceSize);
  width: v-bind(faceSize);
  border-radius: v-bind(faceBorderRadius);
  overflow: clip;
  outline: 2px solid rgb(174, 174, 174)
}

.character-face-name {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) translateY(50%);
  background: rgba(0, 0, 0, 1);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: clip;
  overflow: hidden;
  max-width: 120px;
  outline: 2px solid rgba(255, 255, 255, 0.3);
  color: white;
}

.character-face-image {
  width: 100%;
  height: 100%;
}

.character-face-doll-container {
  width: v-bind(faceSize);
  height: v-bind(faceSize);
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
