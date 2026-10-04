<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import gsap from 'gsap';
import type { Application, ColorMatrix, ColorMatrixFilter } from 'pixi.js';
import type { GodrayFilter } from 'pixi-filters/godray';
import { Game } from '../game';
import { IDENTITY_GRADE, GRADE_FADE_DURATION, type SceneGrade, type SceneGradeState } from '../systems/dungeonSystem';

// Light over the scene BACKGROUNDS, driven by the grade's sky_* / vignette / rays fields:
//  - a sky gradient (top → mid → bottom) in soft-light, so it recolours the plate instead of
//    covering it — a stop at mid-grey changes nothing, warmer stops glow, darker ones shade;
//  - a vignette in multiply;
//  - light rays: pixi-filters' GodrayFilter on its own small, transparent Pixi canvas in screen
//    blend, tinted by the grade's highlight colour. The canvas exists only while rays are up.
//
// The three layers render straight into #backgrounds-wrapper (no wrapping element): a blend mode
// mixes with what lies under it inside the nearest stacking context, and a wrapper with its own
// z-index would be that context — the layers would blend with each other, never with the plates.
// Above every plate, below the actors (a separate, higher wrapper), so actors and the map never get
// this light. Tweens its own copy of the fields, so a {screen_flash} on the colour matrix never
// flickers the sky.

const game = Game.getInstance();

const LIGHT_KEYS = [
  'sky_top_r', 'sky_top_g', 'sky_top_b', 'sky_mid_r', 'sky_mid_g', 'sky_mid_b',
  'sky_bottom_r', 'sky_bottom_g', 'sky_bottom_b', 'sky_amount', 'vignette', 'rays', 'rays_angle',
  'highlight_r', 'highlight_g', 'highlight_b',
] as const;
type LightKey = typeof LIGHT_KEYS[number];
type Light = Record<LightKey, number>;

const pick = (g: Partial<SceneGrade> | undefined): Light =>
  Object.fromEntries(LIGHT_KEYS.map(k => [k, g?.[k] ?? IDENTITY_GRADE[k]])) as Light;

const skyRef = ref<HTMLDivElement | null>(null);
const vignetteRef = ref<HTMLDivElement | null>(null);
const raysRef = ref<HTMLDivElement | null>(null);

// Plain object, not a ref: GSAP writes it every frame and paint() pushes it straight to the DOM.
const current: Light = pick(IDENTITY_GRADE);
let tween: gsap.core.Tween | null = null;

// Only over actual background art — with no plate there is nothing to blend into, and soft-light
// over an empty wrapper would show the bare gradient on top of whatever is behind it.
const hasArt = computed(() => game.dungeonSystem.assets.value.length > 0);

const rgb = (r: number, g: number, b: number) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

// ── Rays: a lazily created Pixi app, alive only while rays > 0 ──
type Rays = { app: Application; godray: GodrayFilter; tint: ColorMatrixFilter };
let rays: Rays | null = null;
let raysLoading: Promise<void> | null = null;
let raysTint = '';

async function ensureRays(): Promise<void> {
  if (rays || raysLoading) return raysLoading ?? undefined;
  raysLoading = (async () => {
    const host = raysRef.value;
    if (!host) return;
    const [{ Application, Graphics, ColorMatrixFilter }, { GodrayFilter }] =
      await Promise.all([import('pixi.js'), import('pixi-filters/godray')]);
    const app = new Application();
    // Half resolution: the rays are soft noise, and a full-screen filter pass every frame at device
    // resolution is the expensive part. The canvas is stretched back to full size by CSS.
    await app.init({ backgroundAlpha: 0, resizeTo: host, resolution: 0.5, antialias: false, autoDensity: false });
    if (!raysRef.value) { app.destroy(true); return; }
    app.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
    host.appendChild(app.canvas);

    // The filter adds its mist on top of the input, so the input is opaque black: black is neutral
    // in screen blend, and only the rays lighten the plate.
    const board = new Graphics();
    const redraw = () => board.clear().rect(0, 0, app.screen.width, app.screen.height).fill(0x000000);
    redraw();
    app.renderer.on('resize', redraw);
    const godray = new GodrayFilter({ angle: current.rays_angle, gain: 0.6, lacunarity: 2.5, parallel: true });
    const tint = new ColorMatrixFilter();
    board.filters = [godray, tint];
    app.stage.addChild(board);
    // The rays drift slowly; 30 fps is indistinguishable and halves the full-screen filter cost.
    app.ticker.maxFPS = 30;
    app.ticker.add((ticker) => { godray.time += ticker.deltaTime * 0.006; });
    rays = { app, godray, tint };
    raysTint = '';
    paint();
  })().finally(() => { raysLoading = null; });
  return raysLoading;
}

// The godray mist is soft grey noise over the whole frame; screen-blended as-is it hazes every dark
// tone. This curve crushes the haze to black and keeps only the bright streaks (out = x·k − c), tinted
// by the highlight colour. Offsets are in 0–1 units, as Pixi's own contrast() uses them.
const RAYS_GAIN = 1.7;
const RAYS_CUT = 0.4;
function raysMatrix(r: number, g: number, b: number): ColorMatrix {
  const [cr, cg, cb] = [r / 255, g / 255, b / 255];
  return [
    cr * RAYS_GAIN, 0, 0, 0, -RAYS_CUT * cr,
    0, cg * RAYS_GAIN, 0, 0, -RAYS_CUT * cg,
    0, 0, cb * RAYS_GAIN, 0, -RAYS_CUT * cb,
    0, 0, 0, 1, 0,
  ] as ColorMatrix;
}

function destroyRays() {
  if (!rays) return;
  rays.app.destroy(true, { children: true });
  rays = null;
}

function paint() {
  const sky = skyRef.value;
  if (sky) {
    sky.style.background = `linear-gradient(to bottom, ${rgb(current.sky_top_r, current.sky_top_g, current.sky_top_b)} 0%, `
      + `${rgb(current.sky_mid_r, current.sky_mid_g, current.sky_mid_b)} 45%, `
      + `${rgb(current.sky_bottom_r, current.sky_bottom_g, current.sky_bottom_b)} 100%)`;
    sky.style.opacity = String(current.sky_amount);
  }
  if (vignetteRef.value) vignetteRef.value.style.opacity = String(current.vignette);

  if (raysRef.value) raysRef.value.style.opacity = String(current.rays);
  if (current.rays > 0.001) {
    if (!rays) ensureRays();
    else {
      rays.godray.angle = current.rays_angle;
      const tint = rgb(current.highlight_r, current.highlight_g, current.highlight_b);
      if (tint !== raysTint) {
        rays.tint.matrix = raysMatrix(current.highlight_r, current.highlight_g, current.highlight_b);
        raysTint = tint;
      }
    }
  }
}

function settle() {
  tween = null;
  if (current.rays <= 0.001) destroyRays();
}

function applyLight(payload: SceneGradeState | null, instant = false) {
  tween?.kill();
  const target = pick(payload?.grade);
  const duration = instant ? 0 : (payload?.duration ?? GRADE_FADE_DURATION);
  if (duration <= 0) {
    Object.assign(current, target);
    paint();
    settle();
    return;
  }
  tween = gsap.to(current, { ...target, duration, ease: 'sine.inOut', onUpdate: paint, onComplete: settle });
}

onMounted(() => applyLight(game.dungeonSystem.sceneGrade.value, true));
watch(() => game.dungeonSystem.sceneGrade.value, (payload) => applyLight(payload));
onUnmounted(() => {
  tween?.kill();
  destroyRays();
});
</script>

<template>
  <div v-show="hasArt" ref="skyRef" class="scene-light scene-light-sky" aria-hidden="true"></div>
  <div v-show="hasArt" ref="vignetteRef" class="scene-light scene-light-vignette" aria-hidden="true"></div>
  <div v-show="hasArt" ref="raysRef" class="scene-light scene-light-rays" aria-hidden="true"></div>
</template>

<style scoped>
.scene-light {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0;
}

/* Above every background plate (asset z is small), below the actors' wrapper. */
.scene-light-sky {
  z-index: 9000;
  mix-blend-mode: soft-light;
}

.scene-light-vignette {
  z-index: 9001;
  mix-blend-mode: multiply;
  background: radial-gradient(ellipse at 50% 45%, rgba(0, 0, 0, 0) 45%, rgba(0, 0, 0, 0.85) 100%);
}

.scene-light-rays {
  z-index: 9002;
  mix-blend-mode: screen;
  overflow: hidden;
}
</style>
