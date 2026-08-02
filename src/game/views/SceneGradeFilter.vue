<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import gsap from 'gsap';
import { Game } from '../game';
import {
  IDENTITY_GRADE, GRADE_FADE_DURATION, GRADE_FILTER_ID, GRADE_FILTER_TALL_ID, gradeMatrix, isIdentityGrade,
  type SceneGrade, type SceneGradeState,
} from '../systems/dungeonSystem';

// Holds the one colour-matrix def every graded art element references as filter: url(#scene-grade).
// Nothing is overlaid: a CSS filter only touches the element it sits on, so UI drawn next to the art
// (in-battle health bars, panels, map markers) is excluded by construction rather than by z-index.
const game = Game.getInstance();
const matrixRef = ref<SVGFEColorMatrixElement | null>(null);
const matrixTallRef = ref<SVGFEColorMatrixElement | null>(null);

// GSAP mutates this in place and rewrites the matrix from onUpdate. Deliberately not a Vue ref, and
// deliberately not a CSS custom property either: a variable on a shared ancestor would invalidate
// every descendant's style each frame, whereas one attribute write invalidates one node.
const current: SceneGrade = { ...IDENTITY_GRADE };
let tween: gsap.core.Tween | null = null;

const paint = () => {
  const values = gradeMatrix(current).map(n => n.toFixed(5)).join(' ');
  matrixRef.value?.setAttribute('values', values);
  matrixTallRef.value?.setAttribute('values', values);
};

const applyGrade = async (payload: SceneGradeState | null, instant = false) => {
  tween?.kill();
  tween = null;

  const target = payload?.grade ?? IDENTITY_GRADE;
  // Clearing stores null, which carries no duration of its own — fall back to the default fade
  // rather than snapping. {grade: {duration: N}} still gives an explicit fade-out length.
  const duration = instant ? 0 : (payload?.duration ?? GRADE_FADE_DURATION);

  // Already at daylight and asked for daylight: nothing to mount, nothing to tween.
  if (isIdentityGrade(target) && !game.dungeonSystem.gradeActive.value) {
    Object.assign(current, target);
    return;
  }

  if (duration <= 0) {
    Object.assign(current, target);
    game.dungeonSystem.gradeActive.value = !isIdentityGrade(current);
    if (game.dungeonSystem.gradeActive.value) {
      await nextTick(); // the <filter> only exists once art elements reference it
      paint();
    }
    return;
  }

  // Fading up from daylight: the def has to exist before the first frame writes into it.
  if (!game.dungeonSystem.gradeActive.value) {
    game.dungeonSystem.gradeActive.value = true;
    await nextTick();
  }

  tween = gsap.to(current, {
    ...target,
    duration,
    ease: 'sine.inOut',
    onUpdate: paint,
    onComplete: () => { game.dungeonSystem.gradeActive.value = !isIdentityGrade(current); },
  });
};

// Restore on mount rather than from game_initiated: that emitter is for plugins and games, and it
// fires before Vue has flushed the DOM, so this node would not exist yet.
onMounted(() => applyGrade(game.dungeonSystem.sceneGrade.value, true));
watch(() => game.dungeonSystem.sceneGrade.value, (payload) => applyGrade(payload));
onUnmounted(() => {
  tween?.kill();
  // Leaving the flag up after this def is gone would leave art elements pointing at a filter id
  // that no longer resolves, and an unresolvable filter reference makes an element render as
  // nothing. Cleared here so leaving the game screen can't blank art elsewhere.
  game.dungeonSystem.gradeActive.value = false;
});
</script>

<template>
  <!-- Rendered only while a grade is up, so daylight costs no filter passes at all. -->
  <svg v-if="game.dungeonSystem.gradeActive.value" class="scene-grade-def" aria-hidden="true" focusable="false">
    <filter :id="GRADE_FILTER_ID" color-interpolation-filters="sRGB" x="-25%" y="-25%" width="150%"
      height="150%">
      <!-- Alpha row stays 0 0 0 1 0: feColorMatrix works on non-premultiplied colour, so a doll's
           transparent corners keep alpha 0 and the tint cannot bleed into them. -->
      <feColorMatrix ref="matrixRef" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
    </filter>

    <!-- Same matrix, taller region, for character slots. A character's spine canvas paints well
         outside its slot box vertically (slot.scale up to 1.9, plus the viewport pad), and a
         filter region clips — at ±25% the grade would crop heads and feet harder than the canvas
         itself. Full-screen backgrounds keep the cheaper region above. -->
    <filter :id="GRADE_FILTER_TALL_ID" color-interpolation-filters="sRGB" x="-25%" y="-60%" width="150%"
      height="220%">
      <feColorMatrix ref="matrixTallRef" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" />
    </filter>
  </svg>
</template>

<style scoped>
/* Defs only — never painted. Kept in flow-free space so it can't affect layout. */
.scene-grade-def {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
  pointer-events: none;
}
</style>
