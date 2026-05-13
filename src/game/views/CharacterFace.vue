<script setup lang="ts">
import { computed } from 'vue';
import CharacterDoll from './progression/CharacterDoll.vue';
import CustomComponentContainer from './CustomComponentContainer.vue';
import { Character } from '../core/character/character';
import { SPINE_REFERENCE_HEIGHT, SPINE_REFERENCE_WIDTH } from '../utils/characterReference';

const SPINE_REFERENCE_HEIGHT_PX = `${SPINE_REFERENCE_HEIGHT}px`;
const SPINE_REFERENCE_WIDTH_PX = `${SPINE_REFERENCE_WIDTH}px`;

const props = defineProps<{
  character?: Character;
  showName?: boolean;
  nameStyle?: 'badge' | 'overlay';
  size?: number;
  borderRadius?: number | string;
  borderColor?: string;
  noWrapper?: boolean;
  overlaySlot?: string;
  staticFaceForce?: boolean;
}>();

const characterName = computed(() => props.character?.getTrait('name') || '');
const faceSize = computed(() => (props.size ?? 100) + 'px');
const faceBorderRadius = computed(() => {
  if (props.borderRadius === undefined) return '50%';
  if (typeof props.borderRadius === 'number') return props.borderRadius + 'px';
  return props.borderRadius;
});

const faceBorderColor = computed(() => props.borderColor || 'rgb(174, 174, 174)');

const COMPONENT_ID = 'character-face';

// Debug mode: set to true to see the whole body art
const DEBUG_MODE = false;

const hasFaceStatic = computed(() => !!props.character?.getTrait('face_static'));
const faceStaticPath = computed(() => props.character?.getTrait('face_static'));

const hasAnyArt = computed(() => !!props.character?.hasArt());

// Use static face when:
// 1. staticFaceForce + spine character: forced static to avoid expensive spine rendering (logs, sidebar)
// 2. face_static_precedence trait is true: per-character opt-in to prefer face_static over crop
// 3. Non-spine character with face_static: original behavior (face_static always wins)
const useStaticFace = computed(() => {
  if (!hasFaceStatic.value) return false;
  if (props.staticFaceForce && props.character?.isSpineCharacter()) return true;
  if (props.character?.getTrait('face_static_precedence') === true) return true;
  if (!props.character?.isSpineCharacter()) return true;
  return false;
});

// Properties for positioning the character doll face
// face_shift_x/y are percentages (0-100) of the image dimensions
// Using CSS transform with percentages - they're relative to the element's own size
// Negate values to move the doll in the opposite direction
// Multiply by scale because the transform affects positioning
const scale = computed(() => props.character?.getTrait('face_shift_scale') || 1);
const sizeRatio = computed(() => (props.size ?? 100) / 100);
const faceShiftX = computed(() => -(props.character?.getTrait('face_shift_x') || 0) * scale.value * sizeRatio.value);
const faceShiftY = computed(() => -(props.character?.getTrait('face_shift_y') || 0) * scale.value * sizeRatio.value);
const faceShiftScale = computed(() => scale.value * sizeRatio.value);

// Scale name label relative to face size (baseline: 100px)
const sizeNum = computed(() => props.size ?? 100);
const nameFontSize = computed(() => Math.max(9, sizeNum.value * 0.13) + 'px');
const nameMaxWidth = computed(() => sizeNum.value * 1.2 + 'px');
// Stable badge height so it doesn't shrink when v-fit reduces font-size
const nameMinHeight = computed(() => (Math.max(9, sizeNum.value * 0.13) * 1.6) + 'px');
// Centered no-art name scales with circle size, independent of parent font-size
const centerFontSize = computed(() => Math.max(10, sizeNum.value * 0.14) + 'px');

</script>

<template>
  <div class="character-face-wrapper" v-if="character && !noWrapper">
    <div class="character-face">
      <!-- No art: render name centered inside the circle -->
      <div v-if="!hasAnyArt" class="character-face-name-center">{{ characterName }}</div>

      <!-- Static face image if available -->
      <img v-else-if="useStaticFace" :src="faceStaticPath" class="character-face-image" />

      <!-- Fallback to CharacterDoll if no static face -->
      <div v-else class="character-face-doll-container">
        <CharacterDoll :character="character" />
      </div>

      <!-- Custom components registered to this container -->
      <CustomComponentContainer :slot="COMPONENT_ID" :context="{ character }" />
      <CustomComponentContainer v-if="overlaySlot" :slot="overlaySlot" :context="{ character }" />

      <!-- Overlay name (inside face bounds) -->
      <div v-if="hasAnyArt && showName && (nameStyle ?? 'badge') === 'overlay'" v-fit class="character-face-name-overlay">{{
        characterName }}</div>
    </div>

    <!-- Badge name (below face, default) -->
    <div v-if="hasAnyArt && showName && (nameStyle ?? 'badge') === 'badge'" v-fit class="character-face-name">{{ characterName }}
    </div>
  </div>

  <!-- No-wrapper mode: just the face, no column layout -->
  <div class="character-face" v-else-if="character && noWrapper">
    <div v-if="!hasAnyArt" v-fit class="character-face-name-center">{{ characterName }}</div>
    <img v-else-if="useStaticFace" :src="faceStaticPath" class="character-face-image" />
    <div v-else class="character-face-doll-container">
      <CharacterDoll :character="character" />
    </div>
    <CustomComponentContainer :slot="COMPONENT_ID" :context="{ character }" />
    <CustomComponentContainer v-if="overlaySlot" :slot="overlaySlot" :context="{ character }" />
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
  position: relative;
  height: v-bind(faceSize);
  width: v-bind(faceSize);
  border-radius: v-bind(faceBorderRadius);
  overflow: clip;
  outline: 2px solid v-bind(faceBorderColor)
}

.character-face-name {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) translateY(50%);
  background: rgba(0, 0, 0, 1);
  padding: 0.3em 0.9em;
  border-radius: 0.9em;
  font-size: v-bind(nameFontSize);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  max-width: v-bind(nameMaxWidth);
  height: v-bind(nameMinHeight);
  display: flex;
  align-items: center;
  justify-content: center;
  outline: 2px solid rgba(255, 255, 255, 0.3);
  color: white;
}

.character-face-name-center {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0.5em;
  font-size: v-bind(centerFontSize);
  font-weight: 500;
  color: white;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.15;
}

.character-face-name-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.5);
  font-size: v-bind(nameFontSize);
  font-weight: 500;
  padding: 0.3em 0;
  text-align: center;
  color: white;
  white-space: nowrap;
  overflow: hidden;
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

/* Face crop unified rule: face_shift_x/y are percentages of the 1:1 doll wrapper.
   Both static (.character-doll) and spine (.character-doll-spine) get the reference
   size + translate-by-shift-% + scale, so spine and static use the same coordinate
   system. The image inside (CharacterDollStatic's <img> with object-fit:contain)
   keeps its 1:1 letterbox layout — translating the wrapper carries the image with it. */
.character-face-doll-container :deep(.character-doll),
.character-face-doll-container :deep(.character-doll-spine) {
  position: absolute;
  width: v-bind("SPINE_REFERENCE_WIDTH_PX");
  height: v-bind("SPINE_REFERENCE_HEIGHT_PX");
  transform: translate(v-bind("faceShiftX + '%'"), v-bind("faceShiftY + '%'")) scale(v-bind("faceShiftScale"));
  transform-origin: top left;
}

/* Reset the spine canvas's art_dx/art_dy CSS translate (applied by the renderer) inside
   the face crop — face_shift_* is the only positioning that should apply here, otherwise
   per-spine body offsets would shift the cropped face. Centering translate(-50%, -50%) stays. */
.character-face-doll-container :deep(.character-doll-spine canvas) {
  transform: translate(-50%, -50%) !important;
}
</style>
