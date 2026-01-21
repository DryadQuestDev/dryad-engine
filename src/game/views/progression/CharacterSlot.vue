<script setup lang="ts">
import { Character } from '../../core/character/character';
import { computed, ref, onMounted, watch } from 'vue';
import { SceneSlot } from '../../systems/dungeonSystem';
import CharacterDoll from './CharacterDoll.vue';
import ItemSlots from './ItemSlots.vue';
import { Game } from '../../game';
import { useCharacterAnimation } from '../../../composables/useCharacterAnimation';
import gsap from 'gsap';

const props = defineProps<{
  character: Character;
  slot: Partial<SceneSlot>; // Partial because 'char' is not needed when character is provided directly
  showItemSlots?: boolean;
  enableAppear?: boolean; // Enable appear animations for CharacterDoll
  disableItemInteraction?: boolean; // Disable item click/drag while keeping hover tooltips
}>();

const game = Game.getInstance();

// Use animation composable
const animationControls = useCharacterAnimation({
  slot: props.slot,
  skipAutoPlay: false // Let it auto-play in game context
});

// Element refs
const characterRef = animationControls.elementRef;
const scaleWrapperRef = animationControls.scaleWrapperRef;
const rotationWrapperRef = animationControls.rotationWrapperRef;
const contentRef = animationControls.contentRef;
const animatedX = animationControls.animatedX;
const animatedY = animationControls.animatedY;
const x = computed(() => animatedX.value);
const y = computed(() => animatedY.value);
const scale = computed(() => props.slot.scale ?? 1);
const xanchor = computed(() => props.slot.xanchor ?? 50);
const yanchor = computed(() => props.slot.yanchor ?? 50);
const zindex = computed(() => props.slot.z ?? 0);

// Transform properties
const rotation = computed(() => props.slot.rotation ?? 0);
const alpha = computed(() => props.slot.alpha ?? 1);
const blur = computed(() => props.slot.blur ?? 0);
const mirror = computed(() => props.slot.mirror ?? false);

// Filter effects
const brightness = computed(() => props.slot.brightness ?? 1);
const contrast = computed(() => props.slot.contrast ?? 1);
const saturate = computed(() => props.slot.saturate ?? 1);
const sepia = computed(() => props.slot.sepia ?? 0);
const hue = computed(() => props.slot.hue ?? 0);

// Note: Animation properties are now handled by the composable

// Character art positioning (from traits) - animated to prevent jumps
const animatedArtOffset = ref({
  dx: props.character.getTrait('art_dx') || 0,
  dy: props.character.getTrait('art_dy') || 0,
  scale: props.character.getTrait('art_scale') || 1
});

// Watch for character changes and animate the art offset
watch(() => props.character.id, () => {
  const newDx = props.character.getTrait('art_dx') || 0;
  const newDy = props.character.getTrait('art_dy') || 0;
  const newScale = props.character.getTrait('art_scale') || 1;

  gsap.to(animatedArtOffset.value, {
    dx: newDx,
    dy: newDy,
    scale: newScale,
    duration: 0.3,
    ease: 'power2.out'
  });
});

const artDx = computed(() => animatedArtOffset.value.dx + "%");
const artDy = computed(() => animatedArtOffset.value.dy + "%");
const artScale = computed(() => animatedArtOffset.value.scale);
const finalScale = computed(() => scale.value * artScale.value);

// CSS computed properties
const cssPosition = computed(() => ({
  left: x.value !== undefined ? `${x.value}%` : undefined,
  top: y.value !== undefined ? `${y.value}%` : undefined,
}));

const cssFilter = computed(() => {
  const filters = [];

  if (blur.value > 0) filters.push(`blur(${blur.value}px)`);
  if (brightness.value !== 1) filters.push(`brightness(${brightness.value})`);
  if (contrast.value !== 1) filters.push(`contrast(${contrast.value})`);
  if (saturate.value !== 1) filters.push(`saturate(${saturate.value})`);
  if (sepia.value > 0) filters.push(`sepia(${sepia.value})`);
  if (hue.value !== 0) filters.push(`hue-rotate(${hue.value}deg)`);

  return filters.length > 0 ? filters.join(' ') : 'none';
});

// Scale wrapper: scale + art offset, always centered
const scaleWrapperTransform = computed(() => {
  const transforms = [];
  transforms.push(`scale(${finalScale.value})`);

  // Apply character art offset (for sprite padding compensation)
  if (artDx.value !== '0%' || artDy.value !== '0%') {
    transforms.push(`translate(${artDx.value}, ${artDy.value})`);
  }

  return transforms.join(' ');
});

// Rotation wrapper: no transform (removed - now applied to content)
const rotationWrapperTransform = computed(() => {
  return 'none';
});

const rotationWrapperTransformOrigin = computed(() => {
  return `${xanchor.value}% ${yanchor.value}%`;
});

// Content wrapper: rotation only, uses anchor as pivot
const contentTransform = computed(() => {
  if (rotation.value !== 0) {
    return `rotate(${rotation.value}deg)`;
  }
  return 'none';
});

const contentTransformOrigin = computed(() => {
  return `${xanchor.value}% ${yanchor.value}%`;
});

// Apply animations on mount
onMounted(() => {
  if (characterRef.value) {
    // Skip enter animations if loading from save
    const shouldPlayEnter = !game.dungeonSystem.isLoadingSave.value;
    const enterType = props.slot.enter;
    const hasEnterAnimation = shouldPlayEnter && enterType && enterType !== 'none';

    if (hasEnterAnimation) {
      // Play enter animation
      animationControls.playEnter();

      // Calculate enter duration to start idle after enter completes
      const enterDuration = props.slot.enter_duration ?? 0.5;
      const enterDelay = props.slot.enter_delay ?? 0;
      const enterTime = (enterDuration + enterDelay) * 1000;

      // Start idle after enter completes
      if (props.slot.idle && props.slot.idle !== 'none') {
        setTimeout(() => {
          animationControls.startIdle();
        }, enterTime + 50);
      }
    } else {
      // No enter animation, start idle immediately
      animationControls.startIdle();
    }
  }
});

// Watch for isRemoving flag to trigger exit animation
watch(() => props.slot.isRemoving, (isRemoving) => {
  if (isRemoving && characterRef.value) {
    animationControls.playExit();
  }
});

// Track previous position for move animations
const prevX = ref<number | undefined>(props.slot.x);
const prevY = ref<number | undefined>(props.slot.y);

// Watch for position changes to trigger move animations
watch([() => props.slot.x, () => props.slot.y], ([newX, newY]) => {
  const hasXChanged = newX !== undefined && prevX.value !== undefined && newX !== prevX.value;
  const hasYChanged = newY !== undefined && prevY.value !== undefined && newY !== prevY.value;

  // Trigger move animation if position changed
  if (characterRef.value && (hasXChanged || hasYChanged)) {
    animationControls.playMove(
      { x: prevX.value, y: prevY.value },
      { x: newX, y: newY }
    );
  }

  // Update previous position
  prevX.value = newX;
  prevY.value = newY;
}, { flush: 'post' });

// Watch for idle animation changes (e.g., when moving to a new slot with different idle)
watch([() => props.slot.idle, () => props.slot.idle_duration, () => props.slot.idle_intensity],
  ([newIdle, newDuration, newIntensity], [oldIdle, oldDuration, oldIntensity]) => {
    const idleChanged = newIdle !== oldIdle;
    const durationChanged = newDuration !== oldDuration;
    const intensityChanged = newIntensity !== oldIntensity;

    // Restart idle if any idle property changed and idle is active
    if ((idleChanged || durationChanged || intensityChanged) && characterRef.value && newIdle && newIdle !== 'none') {
      animationControls.stopIdle();
      animationControls.startIdle();
    } else if (idleChanged && (!newIdle || newIdle === 'none')) {
      // Stop idle if changed to none
      animationControls.stopIdle();
    }
  }
);

// Exit transition hooks for Vue transitions
const onBeforeLeave = (_el: Element) => {
  // Trigger exit animation via composable
  if (characterRef.value) {
    animationControls.playExit();
  }
};

const onLeave = (_el: Element, done: () => void) => {
  // Wait for exit transition to complete
  const type = props.slot.exit;
  const duration = (type && type !== 'none') ? (props.slot.exit_duration ?? 0.5) * 1000 : 0;
  setTimeout(done, duration);
};

</script>

<template>
  <transition name="character-exit" @before-leave="onBeforeLeave" @leave="onLeave">
    <div ref="characterRef" class="character-slot" :style="{ zIndex: zindex }">
      <div class="character-slot-positioner">
        <div ref="scaleWrapperRef" class="character-slot-scale-wrapper">
          <div ref="rotationWrapperRef" class="character-slot-rotation-wrapper">
            <div ref="contentRef" class="character-content">
              <CharacterDoll :character="character" :mirror="mirror" :enableAppear="enableAppear" />
            </div>
          </div>
        </div>
        <div v-if="showItemSlots" class="item-slots-transform-wrapper">
          <ItemSlots :character="character" :disabled="props.disableItemInteraction === true" />
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.character-slot {
  position: absolute;
  left: v-bind("cssPosition.left");
  top: v-bind("cssPosition.top");
  height: 100%;
  width: 100%;
  pointer-events: none;
  opacity: v-bind("alpha");
  filter: v-bind("cssFilter");
}

.character-slot-positioner {
  position: relative;
  height: 100%;
  width: 100%;
}

.character-slot-scale-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform: v-bind("scaleWrapperTransform");
  transform-origin: 50% 50%; /* Always centered for scale */
}

.character-slot-rotation-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform: v-bind("rotationWrapperTransform");
  transform-origin: v-bind("rotationWrapperTransformOrigin");
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-slots-transform-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform: translate(v-bind("artDx"), v-bind("artDy")) scale(v-bind("finalScale"));
  transform-origin: 50% 50%;
  pointer-events: none;
}

.character-content {
  position: relative;
  display: inline-block;
  height: 100%;
  transform: v-bind("contentTransform");
  transform-origin: v-bind("contentTransformOrigin");
}

/* No default transition styles - handled by GSAP */

/* CSS animation for jitter - more stable than GSAP for rapid movements */
.idle-jitter {
  animation: jitter-animation var(--jitter-duration, 0.15s) infinite;
  will-change: transform;
}

@keyframes jitter-animation {
  0%, 100% {
    transform: translate3d(0, 0, 0);
  }
  25% {
    transform: translate3d(var(--jitter-intensity, 2px), var(--jitter-intensity, 2px), 0);
  }
  50% {
    transform: translate3d(calc(var(--jitter-intensity, 2px) * -1), var(--jitter-intensity, 2px), 0);
  }
  75% {
    transform: translate3d(var(--jitter-intensity, 2px), calc(var(--jitter-intensity, 2px) * -1), 0);
  }
}
</style>
