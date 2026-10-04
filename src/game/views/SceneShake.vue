<script setup lang="ts">
import { watch, onUnmounted } from 'vue';
import gsap from 'gsap';
import { Game } from '../game';

// {screen_shake}: a decaying tremor on the scene art. The art is two sibling layers — the
// backgrounds (#backgrounds-wrapper) and the actors (#events-container) — so both get the same
// offsets and zoom about the same screen point, and move as one picture. The dialogue lives in
// #overlay-wrapper and stays readable. One-shot, nothing saved.
//
// Never #events-wrapper: it is centred with a CSS translate(-50%, -50%), which GSAP reads as
// x/y pixels — tweening x/y there replaces the centring and throws the actors half a stage away.
const game = Game.getInstance();
let timeline: gsap.core.Timeline | null = null;
let shaken: HTMLElement[] = [];

const targets = () => ['backgrounds-wrapper', 'events-container']
  .map(id => document.getElementById(id))
  .filter((el): el is HTMLElement => !!el);

const reset = () => {
  timeline?.kill();
  timeline = null;
  if (shaken.length) gsap.set(shaken, { clearProps: 'transform,transformOrigin' });
  shaken = [];
};

watch(() => game.dungeonSystem.screenShakeFx.value, (fx) => {
  if (!fx) return;
  reset();
  const els = targets();
  if (!els.length) return;
  shaken = els;

  // One shared pivot (the backgrounds' centre), expressed in each element's own box, so the
  // slight zoom that hides the screen edge scales both layers identically.
  const pivot = els[0].getBoundingClientRect();
  const cx = pivot.left + pivot.width / 2;
  const cy = pivot.top + pivot.height / 2;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    gsap.set(el, { transformOrigin: `${cx - r.left}px ${cy - r.top}px`, scale: 1 + 0.03 * fx.intensity });
  }

  const amplitude = 26 * fx.intensity;   // px at full strength
  const steps = Math.max(6, Math.round(fx.duration / 0.04));
  timeline = gsap.timeline({ onComplete: reset });
  for (let i = 0; i < steps; i++) {
    const decay = 1 - i / steps;
    timeline.to(els, {
      x: (Math.random() * 2 - 1) * amplitude * decay,
      y: (Math.random() * 2 - 1) * amplitude * 0.6 * decay,
      duration: fx.duration / steps,
      ease: 'none',
    });
  }
  timeline.to(els, { x: 0, y: 0, scale: 1, duration: 0.08, ease: 'power1.out' });
});

onUnmounted(reset);
</script>

<template>
  <span style="display: none"></span>
</template>
