<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import { Game } from '../game';
import type { AmbientKind, SceneAmbientState } from '../systems/dungeonSystem';

// Ambient particles over the scene BACKGROUNDS ({ambient: "fireflies"} / "motes" / "embers"), on one
// 2D canvas inside #backgrounds-wrapper: above the plates and their light, below the actors.
// Each particle is a pre-rendered glow sprite drawn additively ('lighter'), so overlapping lights
// brighten like light does. The loop only runs while something is up or fading out.

const game = Game.getInstance();

type Motion = 'wander' | 'drift' | 'rise';
type KindConfig = {
  count: number;
  color: [number, number, number];
  /** Core radius range, in px at a 1080px-tall canvas (scaled to the real height). */
  size: [number, number];
  /** Speed range in px/s at 1080px. */
  speed: [number, number];
  motion: Motion;
  /** Peak opacity range. */
  alpha: [number, number];
  /** Pulse rate range in rad/s; 0 = steady. */
  pulse: [number, number];
  /** Spawn band as fractions of the height, top → bottom. */
  band: [number, number];
  /** Lifetime range in seconds; 0 = lives forever, wraps at the edges. */
  life: [number, number];
};

const KINDS: Record<AmbientKind, KindConfig> = {
  // Low over the grass, slow and wandering, each blinking on its own rhythm.
  fireflies: {
    count: 26, color: [214, 255, 128], size: [1.6, 3.2], speed: [6, 18], motion: 'wander',
    alpha: [0.6, 1], pulse: [0.6, 1.5], band: [0.35, 1], life: [0, 0],
  },
  // Dust in a light shaft: tiny, faint, drifting up and across.
  motes: {
    count: 44, color: [255, 238, 205], size: [0.7, 1.5], speed: [3, 9], motion: 'drift',
    alpha: [0.18, 0.45], pulse: [0.2, 0.5], band: [0, 1], life: [0, 0],
  },
  // Sparks off a fire: rising, swaying, burning out.
  embers: {
    count: 30, color: [255, 136, 54], size: [1, 2.2], speed: [22, 48], motion: 'rise',
    alpha: [0.6, 1], pulse: [3, 6], band: [0.7, 1], life: [4, 8],
  },
};

type Particle = {
  x: number; y: number; vx: number; vy: number;
  size: number; alpha: number; phase: number; pulse: number; speed: number;
  heading: number; age: number; life: number;
};

const canvasRef = ref<HTMLCanvasElement | null>(null);
const hasArt = computed(() => game.dungeonSystem.assets.value.length > 0);

let ctx: CanvasRenderingContext2D | null = null;
let particles: Particle[] = [];
let kind: AmbientKind | null = null;
let sprite: HTMLCanvasElement | null = null;
// Layer opacity: eases toward `fadeTarget`, so switching kinds fades out, swaps, fades in.
let fade = 0;
let fadeTarget = 0;
let pending: SceneAmbientState | null = null;
let raf = 0;
let last = 0;
let resizeObserver: ResizeObserver | null = null;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function makeSprite(color: [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const [r, gg, b] = color;
  grad.addColorStop(0, `rgba(255, 255, 240, 1)`);
  grad.addColorStop(0.12, `rgba(${r}, ${gg}, ${b}, 0.95)`);
  grad.addColorStop(0.35, `rgba(${r}, ${gg}, ${b}, 0.35)`);
  grad.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function spawn(cfg: KindConfig, w: number, h: number, fresh: boolean): Particle {
  const scale = h / 1080;
  const [b0, b1] = cfg.band;
  const life = cfg.life[1] > 0 ? rand(cfg.life[0], cfg.life[1]) : 0;
  return {
    x: rand(0, w),
    // A respawned riser starts below its band; the initial fill is spread through it.
    y: cfg.motion === 'rise' && !fresh ? h + 10 * scale : rand(b0 * h, b1 * h),
    vx: 0, vy: 0,
    size: rand(cfg.size[0], cfg.size[1]) * scale,
    alpha: rand(cfg.alpha[0], cfg.alpha[1]),
    phase: rand(0, Math.PI * 2),
    pulse: rand(cfg.pulse[0], cfg.pulse[1]),
    speed: rand(cfg.speed[0], cfg.speed[1]) * scale,
    heading: rand(0, Math.PI * 2),
    age: fresh && life ? rand(0, life) : 0,
    life,
  };
}

function populate(state: SceneAmbientState) {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const cfg = KINDS[state.kind];
  kind = state.kind;
  sprite = makeSprite(cfg.color);
  const count = Math.round(cfg.count * state.density);
  particles = Array.from({ length: count }, () => spawn(cfg, canvas.width, canvas.height, true));
}

function step(dt: number, w: number, h: number) {
  if (!kind) return;
  const cfg = KINDS[kind];
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.phase += p.pulse * dt;
    p.age += dt;
    if (cfg.motion === 'wander') {
      p.heading += rand(-1.6, 1.6) * dt;
      p.vx = Math.cos(p.heading) * p.speed;
      p.vy = Math.sin(p.heading) * p.speed * 0.6;
    } else if (cfg.motion === 'drift') {
      p.vx = p.speed * 0.6 + Math.sin(p.phase) * p.speed * 0.4;
      p.vy = -p.speed * 0.5;
    } else {
      p.vx = Math.sin(p.phase * 0.35) * p.speed * 0.25;
      p.vy = -p.speed;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const margin = 20 * (h / 1080);
    const expired = p.life > 0 && p.age >= p.life;
    if (expired || p.y < -margin) {
      particles[i] = spawn(cfg, w, h, false);
      continue;
    }
    if (p.x < -margin) p.x = w + margin;
    else if (p.x > w + margin) p.x = -margin;
    if (p.y > h + margin) p.y = -margin;
    // Wanderers keep to their band, turning back rather than drifting into the sky.
    if (cfg.motion === 'wander' && p.y < cfg.band[0] * h) p.heading = Math.abs(p.heading) % Math.PI;
  }
}

function draw(w: number, h: number) {
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  if (!kind || !sprite || fade <= 0) return;
  const cfg = KINDS[kind];
  ctx.globalCompositeOperation = 'lighter';
  for (const p of particles) {
    let a = p.alpha * fade;
    if (cfg.pulse[1] > 0) {
      const s = Math.sin(p.phase);
      a *= cfg.motion === 'wander' ? 0.08 + 0.92 * Math.max(0, s) ** 2 : 0.6 + 0.4 * s;
    }
    if (p.life > 0) a *= Math.min(1, p.age / 0.6) * Math.max(0, 1 - p.age / p.life);
    if (a <= 0.01) continue;
    ctx.globalAlpha = a;
    const r = p.size * 6; // the sprite's core is ~1/6 of its radius
    ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function frame(now: number) {
  const canvas = canvasRef.value;
  if (!canvas) { raf = 0; return; }
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
  last = now;

  // Ease the layer toward its target; a pending kind swaps in once the old one has faded out.
  const rate = dt / 0.8;
  fade = fadeTarget > fade ? Math.min(fadeTarget, fade + rate) : Math.max(fadeTarget, fade - rate);
  if (fade === 0 && pending) {
    populate(pending);
    pending = null;
    fadeTarget = 1;
  }

  step(dt, canvas.width, canvas.height);
  draw(canvas.width, canvas.height);

  if (fade === 0 && fadeTarget === 0 && !pending) {
    kind = null;
    particles = [];
    raf = 0;
    last = 0;
    return;
  }
  raf = requestAnimationFrame(frame);
}

function run() {
  if (!raf) raf = requestAnimationFrame(frame);
}

function applyAmbient(state: SceneAmbientState | null, instant = false) {
  if (!state || state.density <= 0) {
    pending = null;
    fadeTarget = 0;
    if (instant) fade = 0;
    run();
    return;
  }
  if (kind === state.kind && fade > 0) {
    // Same kind, new density: refill in place rather than fading through nothing.
    populate(state);
    fadeTarget = 1;
  } else if (instant || fade === 0) {
    populate(state);
    fade = instant ? 1 : 0;
    fadeTarget = 1;
  } else {
    pending = state;
    fadeTarget = 0;
  }
  run();
}

function resize() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width === w && canvas.height === h) return;
  canvas.width = w;
  canvas.height = h;
  // New proportions: respawn so the band and sizes match the new frame.
  if (kind) populate({ kind, density: game.dungeonSystem.sceneAmbient.value?.density ?? 1 });
}

onMounted(() => {
  const canvas = canvasRef.value;
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();
  applyAmbient(game.dungeonSystem.sceneAmbient.value, true);
});
watch(() => game.dungeonSystem.sceneAmbient.value, (state) => applyAmbient(state));
onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  resizeObserver?.disconnect();
});
</script>

<template>
  <canvas v-show="hasArt" ref="canvasRef" class="scene-ambient" aria-hidden="true"></canvas>
</template>

<style scoped>
/* Above the plates and SceneLight's layers (9000–9002), below the actors' wrapper. */
.scene-ambient {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 9100;
  pointer-events: none;
}
</style>
