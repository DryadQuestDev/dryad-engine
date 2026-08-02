<script setup lang="ts">
import { Character } from '../../core/character/character';
import { computed, ref, onMounted, watch } from 'vue';
import { SceneSlot, GRADE_FILTER_TALL_ID } from '../../systems/dungeonSystem';
import CharacterDoll from './CharacterDoll.vue';
import ItemSlots from './ItemSlots.vue';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import { Game } from '../../game';
import { useCharacterAnimation } from '../../../composables/useCharacterAnimation';
import { OVERLAY_BASE_SCALE } from '../../utils/characterReference';

const props = withDefaults(defineProps<{
  character: Character;
  slot: Partial<SceneSlot>; // Partial because 'char' is not needed when character is provided directly
  showItemSlots?: boolean;
  enableAppear?: boolean; // Enable appear animations for CharacterDoll
  disableItemInteraction?: boolean; // Disable item click/drag while keeping hover tooltips
  view?: string; // Character view overrides (e.g. 'back')
  interactive?: boolean; // Enable pointer-events for click handling
  overlaySlot?: string; // Optional slot name for overlay injection (same pattern as CharacterFace)
  /** Dev-tuned fine-adjust offsets in cqh of slot height, measured from the slot
   * anchor — art_dx/dy already center the body's pixels on the slot, so these
   * only nudge the overlay from there (OverlayTuner or similar). Plugins read
   * their own per-character traits and pass them in; CharacterSlot stays
   * plugin-agnostic. */
  overlayOffsetX?: number;
  overlayOffsetY?: number;
  instantLayers?: boolean; // Disable fade transition on layer changes (for combat animations)
  /**
   * Whether the scene colour grade applies to this doll's art. True for world dolls (scene actors,
   * battle fighters); pass false when the doll is chrome rather than world — the character sheet,
   * the viewer popup, gallery previews.
   */
  grade?: boolean;
}>(), { grade: true });

const game = Game.getInstance();

// The grade sits on the art wrapper, never on .character-slot: that root also holds the overlay
// wrapper (in-battle name/HP/tokens) and the item slots, which are UI and must stay lit.
// Uses the TALL grade def: an SVG filter region clips, and the doll's spine canvas paints far
// outside this wrapper vertically (slot.scale plus the viewport pad), so the standard ±25%
// region would slice heads and feet the moment a grade came up.
const scaleWrapperFilter = computed(() =>
  (props.grade && game.dungeonSystem.gradeActive.value) ? `url(#${GRADE_FILTER_TALL_ID})` : 'none'
);

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
const animatedScale = animationControls.animatedScale;
const x = computed(() => animatedX.value);
const y = computed(() => animatedY.value);
// scale is sourced from animatedScale (synced on the same GSAP timeline as x/y
// in playMove) so the body's vertical bottom interpolates monotonically between
// endpoints during zoom transitions — no mid-flight lift exposing legs (FU 22).
const scale = computed(() => animatedScale.value);
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

// Wrapper transforms key off `isSpineRendering` (= spine is currently the rendered
// doll), not the per-character `isSpineCharacter()` — so when a static action overlay
// (e.g. Ane back hit/attack) replaces the spine for a spine character, the wrapper
// still applies slot.scale via CSS and the static frame doesn't pop to full size.
const hasSpineForView = computed(() => {
  if (props.view) return props.character.isSpineForView(props.view);
  return props.character.isSpineCharacter();
});

const hasActiveStaticLayer = computed(() => {
  if (props.view) return props.character.getImageLayersForView(props.view).length > 0;
  return props.character.imageLayersWithMeta.length > 0;
});

const isSpineRendering = computed(() =>
  hasSpineForView.value && !hasActiveStaticLayer.value
);


// Static placement comes from the per-view static_art entries (merged across
// statuses) — including the back action overlays that swap in for spine views
// (e.g. Ane back hit/attack/cast). Spine paths apply their own per-spine-entry
// offset via the renderer's canvas CSS, so the wrapper returns 0/0/1 there to
// avoid double-shift.
const animatedArtOffset = computed(() => {
  if (isSpineRendering.value) return { dx: 0, dy: 0, scale: 1 };
  return props.character.getStaticArtOffset(props.view);
});

const artScale = computed(() => animatedArtOffset.value.scale);
const cssSlotScale = computed(() => isSpineRendering.value ? 1 : scale.value);
const finalScale = computed(() => cssSlotScale.value * artScale.value);

// Visible character scale, regardless of how it's applied. Pass to overlay context.
const visibleScale = computed(() => scale.value * animatedArtOffset.value.scale);

// Overlay and hit mask anchor to slot geometry only. The per-view art_dx/dy
// (spine entry or traits) exist to CENTER the body's pixels on the slot — they
// are tuned against the Art Manager's center reference line — so after the
// renderer applies them the body's visible center IS the slot center and
// nothing here may track them (tracking would double-count the correction and
// drift off the body by exactly art_dx/dy). The optional overlayOffsetX/Y
// props are a dev-tuned fine-adjust from that anchor (cqh of slot height,
// mirror-aware on X). Multiply by scale.value so the shift stays "% of body's
// visible height" at any slot.scale (cqh otherwise resolves against the slot's
// full CSS height, which over-shifts at small slot.scale — see Follow-up 17).
const overlayArtDx = computed(() => `${(mirror.value ? -1 : 1) * (props.overlayOffsetX ?? 0) * scale.value}cqh`);
const overlayArtDy = computed(() => `${(props.overlayOffsetY ?? 0) * scale.value}cqh`);
// Single source of truth for overlay (HP bar / name) size: a fixed base scale, so every
// character's overlay is the SAME on-screen size regardless of slot.scale. The overlay-wrapper
// is a sibling of the body's scale-wrapper (and its sizes are cqh = viewport-relative), so
// slot.scale never scales it — only this value does. Position still tracks the head (overlayTop).
const effectiveOverlayScale = OVERLAY_BASE_SCALE;
// Body's top edge in the slot's coord frame: slot center − half body height.
// Always use the actual slot.scale (which determines body height), not the
// boosted overlay scale — otherwise a boost > 1 would lift the anchor above
// the head. The overlay's `transform-origin: 50% 0` makes its boosted size
// grow downward (over the body), so the anchor stays pinned to body top.
// Aesthetic clearance above the head is the overlay content's own concern
// (e.g. rpg_battler lifts .rpg-char-overlay via CSS translate).
const overlayTop = computed(() => `${50 - 50 * scale.value}cqh`);

// cqh resolves against the slot's container-type:size — i.e. always 1% of slot's
// CSS height, INDEPENDENT of slot.scale. Without scaling by slot.scale here, the
// same `art_dx` produces a much larger relative shift on a slot that's been zoomed
// out (since the visible body shrinks but the translate stays the same absolute
// pixels). Multiply by `scale.value` for both spine and static so art_dx/dy is
// consistently "% of body's visible height" at any slot.scale.
const artDxFactor = computed(() => scale.value);
const artDx = computed(() => {
  const v = (mirror.value ? -animatedArtOffset.value.dx : animatedArtOffset.value.dx) * artDxFactor.value;
  return `${v}cqh`;
});
const artDy = computed(() => `${animatedArtOffset.value.dy * artDxFactor.value}cqh`);

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

// Scale wrapper: `translate(t) scale(s)` — translate runs in screen coords AFTER scale,
// so the visible offset stays slot-relative (cqh) regardless of slot.scale. Matches the
// spine renderer's canvas CSS, which translates by art_dx cqh independent of slotScale.
// (The reverse order, `scale(s) translate(t)`, would magnify the translate by `s` and
// drift static characters out of alignment with spine characters in actor slots where
// slot.scale < 1.)
// For spine characters here animatedArtOffset is 0/0/1 → translate is omitted, leaving
// just `scale(1)` (a no-op); the renderer's canvas CSS handles per-spine offsets.
const scaleWrapperTransform = computed(() => {
  const t = (artDx.value !== '0cqh' || artDy.value !== '0cqh')
    ? `translate(${artDx.value}, ${artDy.value}) `
    : '';
  return `${t}scale(${finalScale.value})`;
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

// Watch isRemoving to drive the exit — and to restore visibility on re-entry.
// When a character exits then is re-staged before the removal timer fires, the
// slot is still in the scene, so the actor directive routes through
// moveActorToSlot, which cancels the removal (clears isRemoving) and mutates
// THIS slot in place — no remount, so onMounted never re-runs. Meanwhile the
// interrupted exit (force-completed by completeAllCharacterAnimations) left the
// element stranded at opacity:0. The isRemoving true->false transition is the
// reliable re-entry signal; snap the element back to a clean visible state.
watch(() => props.slot.isRemoving, (isRemoving, wasRemoving) => {
  if (!characterRef.value) return;
  if (isRemoving) {
    animationControls.playExit();
  } else if (wasRemoving) {
    animationControls.resetToVisible();
  }
});

// Track previous position+scale for move animations
const prevX = ref<number | undefined>(props.slot.x);
const prevY = ref<number | undefined>(props.slot.y);
const prevScale = ref<number | undefined>(props.slot.scale);

// Watch for position/scale changes to trigger move animations. Scale is included
// here (instead of relying on a CSS transition) so it shares the same GSAP
// timeline as x/y — keeping body_bottom interpolation monotonic between the
// endpoints (Follow-up 22).
watch([() => props.slot.x, () => props.slot.y, () => props.slot.scale], ([newX, newY, newScale]) => {
  const hasXChanged = newX !== undefined && prevX.value !== undefined && newX !== prevX.value;
  const hasYChanged = newY !== undefined && prevY.value !== undefined && newY !== prevY.value;
  const hasScaleChanged = newScale !== undefined && prevScale.value !== undefined && newScale !== prevScale.value;

  // Trigger move animation if position or scale changed
  if (characterRef.value && (hasXChanged || hasYChanged || hasScaleChanged)) {
    animationControls.playMove(
      { x: prevX.value, y: prevY.value, scale: prevScale.value },
      { x: newX, y: newY, scale: newScale }
    );
  }

  // Update previous position+scale
  prevX.value = newX;
  prevY.value = newY;
  prevScale.value = newScale;
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
              <div class="character-doll-wrapper">
                <CharacterDoll :character="character" :mirror="mirror" :enableAppear="enableAppear" :view="view"
                  :instantLayers="instantLayers" :slotScale="scale" />
              </div>
            </div>
          </div>
        </div>
        <div v-if="overlaySlot" class="character-slot-overlay-wrapper">
          <CustomComponentContainer :slot="overlaySlot" :context="{ character, slotScale: visibleScale }" />
        </div>
        <div v-if="showItemSlots" class="item-slots-transform-wrapper">
          <ItemSlots :character="character" :disabled="props.disableItemInteraction === true" />
        </div>
        <svg v-if="interactive" class="character-slot-hit-mask" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="20,0 80,0 80,100 20,100" fill="black" fill-opacity="0" pointer-events="all" />
        </svg>
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
  container-type: size;
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
  transform-origin: 50% 50%;
  /* Scene colour grade. Deliberately here and not on .character-slot — the slot root also contains
     the overlay wrapper (name/HP/tokens) and the item slots, which are UI. */
  filter: v-bind("scaleWrapperFilter");
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
  pointer-events: none;
}

.character-content {
  position: relative;
  display: inline-block;
  height: 100%;
  transform: v-bind("contentTransform");
  transform-origin: v-bind("contentTransformOrigin");
  /* pointer-events live on the rendered body element (img for static, canvas for
     spine) — see selectors below. Spine's wrapper transform is identity (slot.scale
     applied via canvas pixel size, not CSS), so pointer-events on .character-content
     would expose the unscaled 1:1 box as clickable, much bigger than the visible
     body. Routing events to img/canvas restricts the click area to the actual body. */
  pointer-events: none;
}

.character-content :deep(.character-doll-image),
.character-content :deep(.character-doll-spine canvas) {
  /* The .character-slot-hit-mask SVG owns interaction; canvas/img are inert. */
  pointer-events: none;
}

.character-slot-hit-mask {
  position: absolute;
  left: 50%;
  top: 50%;
  /* Match the body wrapper's box (aspect-ratio: 1/1, height-bound) so the
     viewBox 0 0 100 100 stretches to a square — polygon renders 60% × 100%
     of the body's square, not 60% × 100% of the slot's 16:9 box. */
  height: 100%;
  aspect-ratio: 1 / 1;
  width: auto;
  /* Centered on the slot, scaled to the body's drawn size. art_dx/dy center the
     body's pixels on the slot (Art Manager reference-line tuning), so the slot
     center is the body's visible center for both spine and static paths — no
     art-offset tracking here. */
  transform: translate(-50%, -50%) scale(v-bind("scale"));
  transform-origin: 50% 50%;
  /* SVG passes pointer events through except on the polygon (which opts in
     via pointer-events="all"), so clicks outside the polygon shape pass
     through to whatever's behind the slot. */
  pointer-events: none;
  overflow: visible;
}

.character-slot-hit-mask polygon {
  cursor: v-bind("interactive ? 'pointer' : 'default'");
}

.character-doll-wrapper {
  display: inline-block;
  height: 100%;
}

.character-slot-overlay-wrapper {
  /* Pin font-size so the overlay (healthbar text, etc.) doesn't scale with the
     engine's user-configurable font setting. The wrapper's own transform-scale
     still applies for per-slot zoom. */
  font-size: 14px;
  position: absolute;
  left: 50%;
  /* Body's top edge in slot's coord frame (= 50cqh − slot.scale × 50cqh). At
     scale=1 body fills slot, top=0; at scale=0.20 body height=20cqh, top=40cqh. */
  top: v-bind("overlayTop");
  /* Transforms apply right-to-left: scale runs first (in element-local space),
     then translate (in parent space, NOT magnified by scale), then -50% center.
     translateX(-50%): horizontal centering on the wrapper — the slot center IS
     the body's visible center, since art_dx/dy center the pixels on the slot.
     translate(overlayArtDx, overlayArtDy): the dev-tuned fine-adjust from that
     anchor (overlayOffsetX/Y props). cqh resolves against the slot
     (container-type:size), same as the canvas's own translate.
     scale(effectiveOverlayScale): fixed base scale so the overlay is a
     constant on-screen size for every character, around transform-origin (50% 0 = top-center).
     --overlay-zoom: an extra multiplier a parent can set (default 1) to enlarge the overlay so it
     visually matches characters that a sibling camera transform has magnified — e.g. the battle
     zooms enemies via a camera scale, so the un-camera'd active player sets --overlay-zoom to the
     camera factor to keep its overlay the same on-screen size. */
  transform: translateX(-50%) translate(v-bind("overlayArtDx"), v-bind("overlayArtDy")) scale(calc(var(--overlay-zoom, 1) * v-bind("effectiveOverlayScale")));
  /* Anchor the scale at top-center so the overlay shrinks toward the body's
     head, not from the slot's geometric center. */
  transform-origin: 50% 0;
  pointer-events: none;
}

/* No default transition styles - handled by GSAP */

/* CSS animation for jitter - more stable than GSAP for rapid movements */
.idle-jitter {
  animation: jitter-animation var(--jitter-duration, 0.15s) infinite;
  will-change: transform;
}

@keyframes jitter-animation {

  0%,
  100% {
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
