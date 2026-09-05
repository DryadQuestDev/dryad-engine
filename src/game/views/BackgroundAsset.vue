<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { Global } from '../../global/global';
import { Game } from '../game';
import { SceneAsset, GRADE_FILTER_ID } from '../systems/dungeonSystem';
import gsap from 'gsap';
import { PowerGlitch } from 'powerglitch';
import SpineAsset from './SpineAsset.vue';
import type { SpineStats } from '../utils/spineRenderer';

const props = withDefaults(defineProps<{
  asset: SceneAsset;
  /**
   * Whether the scene colour grade applies. True for world art (scene backgrounds, battle
   * backdrops); pass false when the asset is chrome rather than world — gallery previews, the
   * landing screen, skill-tree backdrops, editor previews.
   */
  grade?: boolean;
}>(), { grade: true });

const emit = defineEmits<{
  'spine-loaded': [stats: SpineStats | null];
}>();

const global = Global.getInstance();
const game = Game.getInstance();
const videoRef = ref<HTMLVideoElement | null>(null);
// The one element every GSAP transition drives, for all three asset types — always a wrapper,
// never the inner <img>/<video>/spine canvas, whose own transform and filter are owned by the CSS
// bindings and by the spine renderer.
const assetElementRef = ref<HTMLElement | null>(null);

// Determine asset type
const assetType = computed(() => props.asset.type ?? 'image');
const isImageAsset = computed(() => assetType.value === 'image');
const isVideoAsset = computed(() => assetType.value === 'video');
const isSpineAsset = computed(() => assetType.value === 'spine');

// Get the asset file path based on type
const assetPath = computed(() => {
  if (assetType.value === 'image') {
    return props.asset.file_image ?? undefined;
  } else if (assetType.value === 'video') {
    return props.asset.file_video ?? undefined;
  }
  return undefined;
});

// How long a `fade` plate takes to bloom in or out. Short on purpose: it rides on top of a
// picture that is already on screen, so it reads as part of the beat rather than a scene change.
const PLATE_FADE_SECONDS = 0.35;
const PLATE_FADE_CSS = `${PLATE_FADE_SECONDS}s`;

/**
 * The plates to stack, bottom first. Reading the game's asset_resolve listener from inside a
 * computed is what keeps the scene, the gallery and the editor preview in agreement: the
 * listener reads live entity state synchronously, so those reads become dependencies here and
 * a plate swaps the moment the state behind it changes — no re-stage needed.
 */
const layerPlates = computed(() => game.dungeonSystem.resolveAssetLayers(props.asset));

// v-persist only hooks `mounted`, and plates are keyed by position so a variant swap changes
// `src` on a live element instead of remounting it — without this the new plate would never
// reach the image cache.
const onLayerLoad = (event: Event) => {
  const el = event.target as HTMLImageElement;
  if (el?.src) game.coreSystem.persistImage(el.src);
};

// Transform properties with defaults
const xpos = computed(() => props.asset.x ?? 0);
const ypos = computed(() => props.asset.y ?? 0);

const scale = computed(() => props.asset.scale ?? 1);
const xscale = computed(() => props.asset.xscale ?? scale.value);
const yscale = computed(() => props.asset.yscale ?? scale.value);

const rotation = computed(() => props.asset.rotation ?? 0);
const alpha = computed(() => props.asset.alpha ?? 1);
const blur = computed(() => props.asset.blur ?? 0);

const zindex = computed(() => props.asset.z ?? 0);
const fitMode = computed(() => props.asset.fit_mode ?? 'fill');

// Re-staging a visible asset ({asset: "bg_mountain(scale = 2)"}) mutates the same object in place, so
// the props change under a component that never remounts — which is why it used to snap. These refs
// hold what is actually painted and glide toward the props; same shape as CharacterSlot's playMove,
// which tweens refs rather than element styles so it can't collide with the GSAP-owned wrapper.
const shownX = ref(xpos.value);
const shownY = ref(ypos.value);
const shownXScale = ref(xscale.value);
const shownYScale = ref(yscale.value);
const shownRotation = ref(rotation.value);
const shownAlpha = ref(alpha.value);
const shownBlur = ref(blur.value);

const tweenDuration = computed(() => props.asset.tween ?? 0.5);
const tweenEase = computed(() => props.asset.tween_ease ?? 'power2.out');

let propTween: gsap.core.Timeline | null = null;

// Fires only on change, so a freshly staged asset paints its values directly and its enter
// transition owns how it appears — nothing glides up from a default.
watch(
  [xpos, ypos, xscale, yscale, rotation, alpha, blur],
  ([nx, ny, nxs, nys, nrot, nalpha, nblur]) => {
    propTween?.kill();
    propTween = null;

    const duration = tweenDuration.value;
    if (duration <= 0) {
      shownX.value = nx; shownY.value = ny;
      shownXScale.value = nxs; shownYScale.value = nys;
      shownRotation.value = nrot; shownAlpha.value = nalpha; shownBlur.value = nblur;
      return;
    }

    // One timeline, everything at position 0, so a combined move-and-zoom stays in lockstep instead
    // of drifting apart on separate tweens.
    const ease = tweenEase.value;
    propTween = gsap.timeline();
    propTween.to(shownX, { value: nx, duration, ease }, 0)
      .to(shownY, { value: ny, duration, ease }, 0)
      .to(shownXScale, { value: nxs, duration, ease }, 0)
      .to(shownYScale, { value: nys, duration, ease }, 0)
      .to(shownRotation, { value: nrot, duration, ease }, 0)
      .to(shownAlpha, { value: nalpha, duration, ease }, 0)
      .to(shownBlur, { value: nblur, duration, ease }, 0);
  },
  { flush: 'post' }
);

onUnmounted(() => {
  propTween?.kill();
  killExitEffects();
  clearHeldEnter();
  clearIdleStart();
});

// Calculate CSS transform
const cssTransform = computed(() => {
  const transforms = [];

  // Translation for positioning
  transforms.push(`translate(${shownX.value}%, ${shownY.value}%)`);

  // Scale
  transforms.push(`scale(${shownXScale.value}, ${shownYScale.value})`);

  // Rotation
  if (shownRotation.value !== 0) {
    transforms.push(`rotate(${shownRotation.value}deg)`);
  }

  return transforms.join(' ');
});

// CSS filter: the asset's own blur, plus the scene colour grade when one is up. Blur is rebuilt from
// a tweened number rather than transitioned in CSS — a CSS transition here would try to interpolate
// the grade's url(#…) term, which isn't interpolable.
const cssFilter = computed(() => {
  const parts: string[] = [];
  if (shownBlur.value > 0) parts.push(`blur(${shownBlur.value}px)`);
  if (props.grade && game.dungeonSystem.gradeActive.value) parts.push(`url(#${GRADE_FILTER_ID})`);
  return parts.length > 0 ? parts.join(' ') : 'none';
});

// Object-fit CSS property
const objectFit = computed(() => {
  return fitMode.value;
});

// Video volume control
const videoVolume = computed(() => {
  return (global.userSettings.value.sound_volume || 0) / 100;
});

// Enter transition properties
const enterTransition = computed(() => props.asset.enter ?? 'none');
const enterDuration = computed(() => props.asset.enter_duration ?? 0.5);
const enterDelay = computed(() => props.asset.enter_delay ?? 0);
const enterEase = computed(() => props.asset.enter_ease ?? 'power2');

// Exit transition properties
const exitTransition = computed(() => props.asset.exit ?? 'none');
const exitDuration = computed(() => props.asset.exit_duration ?? 0.5);
const exitEase = computed(() => props.asset.exit_ease ?? 'power2');

// Idle animation properties
const idleAnimation = computed(() => props.asset.idle ?? 'none');
const idleDuration = computed(() => props.asset.idle_duration ?? 3);
const idleIntensity = computed(() => props.asset.idle_intensity ?? 0.5);

// GSAP enter transition animations. `override` replays a transition that was decided earlier —
// a spine enter held back until the skeleton loaded, whose asset may have had `enter` reset
// underneath it in the meantime (the editor's Play Enter preview does exactly that).
const applyEnterTransition = (element: HTMLElement, override?: string) => {
  const type = override ?? enterTransition.value;
  const duration = enterDuration.value;
  const delay = enterDelay.value;
  const ease = `${enterEase.value}.out`;

  if (type === 'none') return;

  // Handle special transitions with custom animations
  if (type === 'pixelate') {
    // Pixelate effect using CSS mask - reveals image from transparent background
    const img = element;
    const gridSize = 20;

    const cells: number[] = [];
    for (let i = 0; i < gridSize * gridSize; i++) {
      cells.push(i);
    }
    cells.sort(() => Math.random() - 0.5);

    // Create canvas for mask
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const rect = img.getBoundingClientRect();
    canvas.width = rect.width || 400;
    canvas.height = rect.height || 400;

    const cellWidth = canvas.width / gridSize;
    const cellHeight = canvas.height / gridSize;

    // Start with transparent canvas (image hidden)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply canvas as mask to element
    const updateMask = () => {
      const dataUrl = canvas.toDataURL();
      img.style.maskImage = `url(${dataUrl})`;
      img.style.webkitMaskImage = `url(${dataUrl})`;
      img.style.maskSize = '100% 100%';
      img.style.webkitMaskSize = '100% 100%';
    };
    updateMask();

    const tl = gsap.timeline({
      delay,
      onComplete: () => {
        // Remove mask when done
        img.style.maskImage = '';
        img.style.webkitMaskImage = '';
      }
    });

    const totalCells = cells.length;
    const stepsPerSecond = 30;
    const steps = Math.min(totalCells, Math.ceil(duration * stepsPerSecond));
    const cellsPerStep = totalCells / steps;

    ctx.fillStyle = 'white';
    for (let i = 1; i <= steps; i++) {
      const visibleCells = Math.ceil(i * cellsPerStep);
      const stepTime = (i / steps) * duration;

      tl.call(() => {
        for (let j = Math.ceil((i - 1) * cellsPerStep); j < visibleCells; j++) {
          const cellIndex = cells[j];
          const row = Math.floor(cellIndex / gridSize);
          const col = cellIndex % gridSize;
          const x = col * cellWidth;
          const y = row * cellHeight;
          // Fill with white to reveal this cell
          ctx.fillRect(x, y, cellWidth + 1, cellHeight + 1);
        }
        updateMask();
      }, [], delay + stepTime);
    }

    return;
  }

  if (type === 'glitch') {
    // Glitch effect using PowerGlitch library
    gsap.set(element, { opacity: 0 });

    // Fade in the element first
    gsap.to(element, {
      opacity: 1,
      duration: 0.05,
      delay,
      onComplete: () => {
        // Apply PowerGlitch effect
        const glitch = PowerGlitch.glitch(element, {
          playMode: 'always',
          createContainers: true,
          hideOverflow: false,
          timing: {
            duration: Math.max(300, duration * 1000 * 0.6), // Use 60% of duration for glitching
            iterations: 1,
          },
          glitchTimeSpan: {
            start: 0,
            end: 1,
          },
          shake: {
            velocity: 15,
            amplitudeX: 0.03,
            amplitudeY: 0.03,
          },
          slice: {
            count: 8,
            velocity: 15,
            minHeight: 0.02,
            maxHeight: 0.15,
            hueRotate: true,
          },
        });

        // Stop the glitch effect after duration
        setTimeout(() => {
          glitch.stopGlitch();
        }, duration * 1000);
      }
    });
    return;
  }

  if (type === 'scanlines') {
    // Scanline effect from top to bottom
    gsap.set(element, { opacity: 0, scaleY: 0, transformOrigin: 'top center' });
    gsap.to(element, {
      opacity: 1,
      scaleY: 1,
      duration,
      delay,
      ease: 'power2.out',
    });
    return;
  }

  if (type === 'static') {
    // TV static effect
    gsap.set(element, { opacity: 0, filter: 'brightness(5) contrast(5)' });

    const tl = gsap.timeline({ delay });
    // Quick flicker
    for (let i = 0; i < 5; i++) {
      tl.to(element, { opacity: Math.random() * 0.5, duration: 0.05, ease: 'none' });
    }
    // Fade in
    tl.to(element, {
      opacity: 1,
      filter: 'brightness(1) contrast(1)',
      duration: duration * 0.6,
      ease: 'power2.out'
    });
    return;
  }

  if (type === 'shatter') {
    // Shatter/reassemble effect
    gsap.set(element, {
      opacity: 0,
      scale: 1.5,
      rotation: 15,
      filter: 'blur(10px)'
    });
    gsap.to(element, {
      opacity: 1,
      scale: 1,
      rotation: 0,
      filter: 'blur(0px)',
      duration,
      delay,
      ease: 'back.out(2)',
    });
    return;
  }

  if (type === 'vortex') {
    // Vortex/spiral in effect
    gsap.set(element, {
      opacity: 0,
      scale: 0,
      rotation: 720
    });
    gsap.to(element, {
      opacity: 1,
      scale: 1,
      rotation: 0,
      duration,
      delay,
      ease: 'power2.out',
    });
    return;
  }

  if (type === 'wipeLeft') {
    gsap.set(element, { opacity: 0, scaleX: 0, transformOrigin: 'right center' });
    gsap.to(element, {
      opacity: 1,
      scaleX: 1,
      duration,
      delay,
      ease: 'power2.out',
    });
    return;
  }

  if (type === 'wipeRight') {
    gsap.set(element, { opacity: 0, scaleX: 0, transformOrigin: 'left center' });
    gsap.to(element, {
      opacity: 1,
      scaleX: 1,
      duration,
      delay,
      ease: 'power2.out',
    });
    return;
  }

  if (type === 'wipeUp') {
    gsap.set(element, { opacity: 0, scaleY: 0, transformOrigin: 'bottom center' });
    gsap.to(element, {
      opacity: 1,
      scaleY: 1,
      duration,
      delay,
      ease: 'power2.out',
    });
    return;
  }

  if (type === 'wipeDown') {
    gsap.set(element, { opacity: 0, scaleY: 0, transformOrigin: 'top center' });
    gsap.to(element, {
      opacity: 1,
      scaleY: 1,
      duration,
      delay,
      ease: 'power2.out',
    });
    return;
  }

  if (type === 'blinds') {
    // Venetian blinds effect
    gsap.set(element, { opacity: 0, scaleY: 0.1 });

    const tl = gsap.timeline({ delay });
    // Quick expand/contract cycles
    for (let i = 0; i < 3; i++) {
      tl.to(element, {
        scaleY: (i + 1) * 0.3,
        opacity: (i + 1) * 0.3,
        duration: duration / 6,
        ease: 'none'
      })
        .to(element, {
          scaleY: (i + 1) * 0.2,
          duration: duration / 12,
          ease: 'none'
        });
    }
    // Final expand
    tl.to(element, {
      scaleY: 1,
      opacity: 1,
      duration: duration / 3,
      ease: 'power2.out'
    });
    return;
  }

  if (type === 'blurIn') {
    // Its own branch because the shared table below tweens `filter` to the keyword `none`, and GSAP
    // cannot interpolate a filter function list into a keyword — it snapped on the first tick, which
    // left blurIn rendering as a bare fade. blur(0px) gives both ends a matching structure; the
    // inline filter is dropped afterwards so the wrapper keeps no needless compositing layer.
    gsap.set(element, { opacity: 0, filter: 'blur(20px)' });
    gsap.to(element, {
      opacity: 1,
      filter: 'blur(0px)',
      duration,
      delay,
      ease,
      onComplete: () => { gsap.set(element, { clearProps: 'filter' }); },
    });
    return;
  }

  // Enter transitions (matching character slot transitions)
  const transitions: Record<string, any> = {
    fade: { opacity: 0 },
    dissolve: { opacity: 0 },
    slideLeft: { x: '100%', opacity: 0 },
    slideRight: { x: '-100%', opacity: 0 },
    slideUp: { y: '100%', opacity: 0 },
    slideDown: { y: '-100%', opacity: 0 },
    slideInLeft: { x: '100%', opacity: 0 },
    slideInRight: { x: '-100%', opacity: 0 },
    slideInTop: { y: '-100%', opacity: 0 },
    slideInBottom: { y: '100%', opacity: 0 },
    zoomIn: { scale: 0, opacity: 0 },
    zoomOut: { scale: 2, opacity: 0 },
    grow: { scale: 0.3, opacity: 0 },
    shrink: { scale: 1.5, opacity: 0 },
    fadeSlideUp: { y: '50%', opacity: 0 },
    fadeSlideDown: { y: '-50%', opacity: 0 },
    fadeSlideLeft: { x: '50%', opacity: 0 },
    fadeSlideRight: { x: '-50%', opacity: 0 },
    rotate: { rotation: -180, opacity: 0, scale: 0.5 },
    rotateIn: { rotation: -360, opacity: 0 },
    rotateOut: { rotation: 360, opacity: 0 },
    flip: { rotationY: 90, opacity: 0 },
    flipVertical: { rotationX: 90, opacity: 0 },
    elastic: { scale: 0, opacity: 0 },
    bounce: { y: '-100%', opacity: 0 },
    pop: { scale: 0, opacity: 0 },
    sweep: { x: '-100%', opacity: 0 },
    moveInLeft: { x: '-100%' },
    moveInRight: { x: '100%' },
    moveInTop: { y: '-100%' },
    moveInBottom: { y: '100%' },
    ease: { opacity: 0, scale: 0.8 },
    easeIn: { opacity: 0, scale: 0.9 },
    easeOut: { opacity: 0, scale: 1.1 },
    easeInOut: { opacity: 0, scale: 0.95 },
  };

  if (transitions[type]) {
    // Set initial state
    gsap.set(element, transitions[type]);

    // Determine the appropriate easing
    let finalEase = ease;
    if (type === 'elastic') finalEase = 'elastic.out(1, 0.5)';
    else if (type === 'bounce') finalEase = 'bounce.out';
    else if (type === 'pop') finalEase = 'back.out(2)';

    // Animate to final state with custom easing
    gsap.to(element, {
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      rotation: 0,
      rotationX: 0,
      rotationY: 0,
      filter: 'none',
      duration,
      delay,
      ease: finalEase,
    });
  }
};

// Exit effects that gsap.killTweensOf(element) cannot reach: the pixelate timeline only
// schedules callbacks (no element target), and PowerGlitch drives its own animation loop.
// Track them so an interrupted exit can be torn down completely when the asset is revived.
let exitTimeline: gsap.core.Timeline | null = null;
let exitGlitch: { stopGlitch: () => void } | null = null;

const killExitEffects = () => {
  exitTimeline?.kill();
  exitTimeline = null;
  exitGlitch?.stopGlitch();
  exitGlitch = null;
};

// GSAP exit transition animations
const applyExitTransition = (element: HTMLElement) => {
  const type = exitTransition.value;
  const duration = exitDuration.value;
  const ease = `${exitEase.value}.in`;

  killExitEffects();

  if (type === 'none') return;

  // Handle special exit transitions that need custom implementations
  if (type === 'pixelate') {
    // Pixelate exit using CSS mask - hides image to reveal content below
    const img = element;
    const gridSize = 20;

    const cells: number[] = [];
    for (let i = 0; i < gridSize * gridSize; i++) {
      cells.push(i);
    }
    cells.sort(() => Math.random() - 0.5);

    // Create canvas for mask
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const rect = img.getBoundingClientRect();
    canvas.width = rect.width || 400;
    canvas.height = rect.height || 400;

    const cellWidth = canvas.width / gridSize;
    const cellHeight = canvas.height / gridSize;

    // Start with white canvas (image fully visible)
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply canvas as mask to element
    const updateMask = () => {
      const dataUrl = canvas.toDataURL();
      img.style.maskImage = `url(${dataUrl})`;
      img.style.webkitMaskImage = `url(${dataUrl})`;
      img.style.maskSize = '100% 100%';
      img.style.webkitMaskSize = '100% 100%';
    };
    updateMask();

    const tl = gsap.timeline({
      onComplete: () => {
        // Remove mask and hide element when done
        img.style.maskImage = '';
        img.style.webkitMaskImage = '';
        img.style.opacity = '0';
      }
    });
    exitTimeline = tl;

    const totalCells = cells.length;
    const stepsPerSecond = 30;
    const steps = Math.min(totalCells, Math.ceil(duration * stepsPerSecond));
    const cellsPerStep = totalCells / steps;

    for (let i = 1; i <= steps; i++) {
      const hiddenCells = Math.ceil(i * cellsPerStep);
      const stepTime = (i / steps) * duration;

      tl.call(() => {
        for (let j = Math.ceil((i - 1) * cellsPerStep); j < hiddenCells; j++) {
          const cellIndex = cells[j];
          const row = Math.floor(cellIndex / gridSize);
          const col = cellIndex % gridSize;
          const x = col * cellWidth;
          const y = row * cellHeight;
          // Clear to transparent to hide this cell
          ctx.clearRect(x, y, cellWidth + 1, cellHeight + 1);
        }
        updateMask();
      }, [], stepTime);
    }

    return;
  }

  if (type === 'glitch') {
    // Glitch effect then fade out
    const glitch = PowerGlitch.glitch(element, {
      playMode: 'always',
      createContainers: true,
      hideOverflow: false,
      timing: {
        duration: Math.max(300, duration * 1000 * 0.7),
        iterations: 1,
      },
      glitchTimeSpan: { start: 0, end: 1 },
      shake: { velocity: 15, amplitudeX: 0.05, amplitudeY: 0.05 },
      slice: { count: 10, velocity: 20, minHeight: 0.02, maxHeight: 0.2, hueRotate: true },
    });
    exitGlitch = glitch;

    gsap.to(element, {
      opacity: 0,
      duration: duration * 0.3,
      delay: duration * 0.7,
      ease: 'power2.in',
      onComplete: () => {
        glitch.stopGlitch();
        if (exitGlitch === glitch) exitGlitch = null;
      },
    });
    return;
  }

  if (type === 'scanlines') {
    // Scale down from bottom to top
    gsap.to(element, {
      scaleY: 0,
      opacity: 0,
      transformOrigin: 'top center',
      duration,
      ease: 'power2.in',
    });
    return;
  }

  if (type === 'static') {
    // TV static flicker then fade out
    const tl = gsap.timeline();
    for (let i = 0; i < 5; i++) {
      tl.to(element, {
        opacity: Math.random() * 0.5 + 0.5,
        filter: `brightness(${1 + Math.random() * 2}) contrast(${1 + Math.random() * 2})`,
        duration: 0.05,
        ease: 'none'
      });
    }
    tl.to(element, {
      opacity: 0,
      filter: 'brightness(5) contrast(5)',
      duration: duration * 0.4,
      ease: 'power2.in'
    });
    return;
  }

  if (type === 'shatter') {
    // Shatter/explode effect
    gsap.to(element, {
      scale: 1.5,
      rotation: 15,
      filter: 'blur(10px)',
      opacity: 0,
      duration,
      ease: 'back.in(2)',
    });
    return;
  }

  if (type === 'vortex') {
    // Vortex/spiral out effect
    gsap.to(element, {
      scale: 0,
      rotation: 720,
      opacity: 0,
      duration,
      ease: 'power2.in',
    });
    return;
  }

  if (type === 'wipeLeft') {
    gsap.to(element, {
      scaleX: 0,
      opacity: 0,
      transformOrigin: 'left center',
      duration,
      ease: 'power2.in',
    });
    return;
  }

  if (type === 'wipeRight') {
    gsap.to(element, {
      scaleX: 0,
      opacity: 0,
      transformOrigin: 'right center',
      duration,
      ease: 'power2.in',
    });
    return;
  }

  if (type === 'wipeUp') {
    gsap.to(element, {
      scaleY: 0,
      opacity: 0,
      transformOrigin: 'top center',
      duration,
      ease: 'power2.in',
    });
    return;
  }

  if (type === 'wipeDown') {
    gsap.to(element, {
      scaleY: 0,
      opacity: 0,
      transformOrigin: 'bottom center',
      duration,
      ease: 'power2.in',
    });
    return;
  }

  if (type === 'blinds') {
    // Venetian blinds close effect
    const tl = gsap.timeline();
    for (let i = 3; i >= 1; i--) {
      tl.to(element, {
        scaleY: i * 0.3,
        opacity: i * 0.3,
        duration: duration / 6,
        ease: 'none'
      })
        .to(element, {
          scaleY: i * 0.2,
          duration: duration / 12,
          ease: 'none'
        });
    }
    tl.to(element, {
      scaleY: 0,
      opacity: 0,
      duration: duration / 3,
      ease: 'power2.in'
    });
    return;
  }

  if (type === 'blurOut') {
    // Mirror of blurIn: GSAP needs a filter list on BOTH ends to interpolate, and the element's
    // resting filter computes to the keyword `none`, so the blur used to appear in full on the
    // first tick. Seed an explicit blur(0px) to tween out of.
    gsap.set(element, { filter: 'blur(0px)' });
    gsap.to(element, {
      opacity: 0,
      filter: 'blur(20px)',
      duration,
      ease,
    });
    return;
  }

  // Standard exit transitions
  const transitions: Record<string, any> = {
    fade: { opacity: 0 },
    dissolve: { opacity: 0 },
    slideLeft: { x: '-100%', opacity: 0 },
    slideRight: { x: '100%', opacity: 0 },
    slideUp: { y: '-100%', opacity: 0 },
    slideDown: { y: '100%', opacity: 0 },
    slideOutLeft: { x: '-100%', opacity: 0 },
    slideOutRight: { x: '100%', opacity: 0 },
    slideOutTop: { y: '-100%', opacity: 0 },
    slideOutBottom: { y: '100%', opacity: 0 },
    zoomIn: { scale: 0, opacity: 0 },
    zoomOut: { scale: 2, opacity: 0 },
    shrink: { scale: 0, opacity: 0 },
    grow: { scale: 2, opacity: 0 },
    fadeSlideUp: { y: '-50%', opacity: 0 },
    fadeSlideDown: { y: '50%', opacity: 0 },
    fadeSlideLeft: { x: '-50%', opacity: 0 },
    fadeSlideRight: { x: '50%', opacity: 0 },
    rotate: { rotation: 180, opacity: 0, scale: 0.5 },
    rotateOut: { rotation: 360, opacity: 0 },
    flip: { rotationY: 90, opacity: 0 },
    flipVertical: { rotationX: 90, opacity: 0 },
    elastic: { scale: 0, opacity: 0 },
    bounce: { y: '100%', opacity: 0 },
  };

  if (transitions[type]) {
    // Determine the appropriate easing
    let finalEase = ease;
    if (type === 'elastic') finalEase = 'elastic.in(1, 0.5)';
    else if (type === 'bounce') finalEase = 'bounce.in';

    // Animate to exit state
    gsap.to(element, {
      ...transitions[type],
      duration,
      ease: finalEase,
    });
  }
};

// GSAP idle animations
const applyIdleAnimation = (element: HTMLElement) => {
  const type = idleAnimation.value;
  const duration = idleDuration.value;
  const intensity = idleIntensity.value;

  if (type === 'none') return;

  // Define looping animations
  switch (type) {
    case 'float':
      gsap.to(element, {
        y: `${-15 * intensity}px`,
        duration,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      break;

    case 'sway':
      gsap.to(element, {
        rotation: 2 * intensity,
        duration,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      break;

    case 'pulse':
      gsap.to(element, {
        scale: 1 + (0.08 * intensity),
        duration,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      break;

    case 'rotate':
      gsap.to(element, {
        rotation: '+=360',
        duration: duration * 2,
        repeat: -1,
        ease: 'none',
      });
      break;

    case 'breathe':
      gsap.to(element, {
        scale: 1 + (0.04 * intensity),
        opacity: 1 - (0.15 * intensity),
        duration,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      break;

    case 'shake':
      gsap.to(element, {
        x: `${3 * intensity}px`,
        duration: 0.08,
        yoyo: true,
        repeat: -1,
        ease: 'power1.inOut',
      });
      break;

    case 'pan':
      gsap.to(element, {
        x: `${20 * intensity}px`,
        duration,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      break;

    case 'bounce':
      gsap.to(element, {
        y: `${-10 * intensity}px`,
        duration: duration / 2,
        yoyo: true,
        repeat: -1,
        ease: 'power1.out',
      });
      break;

    case 'hop':
      gsap.timeline({ repeat: -1, repeatDelay: duration / 2 })
        .to(element, {
          y: `${-20 * intensity}px`,
          duration: duration / 4,
          ease: 'power2.out',
        })
        .to(element, {
          y: 0,
          duration: duration / 4,
          ease: 'power2.in',
        });
      break;

    case 'rock':
      gsap.to(element, {
        rotation: 5 * intensity,
        duration: duration / 2,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      break;

    case 'nod':
      gsap.to(element, {
        rotationX: 8 * intensity,
        duration: duration / 2,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      break;

    case 'lean':
      gsap.to(element, {
        x: `${10 * intensity}px`,
        rotation: 3 * intensity,
        duration,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      break;

    case 'shimmy':
      gsap.to(element, {
        x: `${5 * intensity}px`,
        duration: 0.15,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      break;

    case 'wave':
      gsap.timeline({ repeat: -1 })
        .to(element, {
          y: `${-10 * intensity}px`,
          rotation: 3 * intensity,
          duration: duration / 3,
          ease: 'sine.inOut',
        })
        .to(element, {
          y: `${10 * intensity}px`,
          rotation: -3 * intensity,
          duration: duration / 3,
          ease: 'sine.inOut',
        })
        .to(element, {
          y: 0,
          rotation: 0,
          duration: duration / 3,
          ease: 'sine.inOut',
        });
      break;

    case 'jitter':
      // Use CSS animation for jitter - runs on compositor thread for stability
      element.style.setProperty('--jitter-intensity', `${2 * intensity}px`);
      element.style.setProperty('--jitter-duration', `${0.15}s`);
      element.classList.add('idle-jitter');
      break;

    case 'blink':
      gsap.timeline({ repeat: -1, repeatDelay: duration })
        .to(element, {
          opacity: 0.3,
          duration: 0.1,
        })
        .to(element, {
          opacity: 1,
          duration: 0.1,
        });
      break;

    case 'glow':
      gsap.to(element, {
        filter: `brightness(${1 + (0.3 * intensity)})`,
        duration,
        yoyo: true,
        repeat: -1,
        ease: 'sine.inOut',
      });
      break;

    case 'wiggle':
      gsap.timeline({ repeat: -1, repeatDelay: duration - 0.3 })
        .to(element, {
          rotation: 5 * intensity,
          duration: 0.1,
          ease: 'sine.inOut',
        })
        .to(element, {
          rotation: -5 * intensity,
          duration: 0.1,
          ease: 'sine.inOut',
        })
        .to(element, {
          rotation: 0,
          duration: 0.1,
          ease: 'sine.inOut',
        });
      break;

    case 'glitch': {
      // Apply periodic glitch effect
      const glitchDuration = 0.3 + (intensity * 0.4);
      const applyGlitch = () => {
        const glitch = PowerGlitch.glitch(element, {
          playMode: 'always',
          createContainers: true,
          hideOverflow: true,
          timing: {
            duration: glitchDuration * 1000,
            iterations: 1,
          },
          glitchTimeSpan: {
            start: 0,
            end: 1,
          },
          shake: {
            velocity: 15,
            amplitudeX: 0.01,
            amplitudeY: 0.01,
          },
          slice: {
            count: 5 + Math.floor(intensity * 5),
            velocity: 10 + (intensity * 10),
            minHeight: 0.02,
            maxHeight: 0.1 + (intensity * 0.1),
            hueRotate: true,
          },
        });

        setTimeout(() => {
          glitch.stopGlitch();
        }, glitchDuration * 1000);
      };

      // Apply immediately then repeat
      applyGlitch();
      gsap.timeline({ repeat: -1, repeatDelay: duration })
        .call(applyGlitch);
      break;
    }
  }
};

// A spine asset registers its canvas asynchronously (atlas fetch, then one render tick) and
// background spine art is never preloaded, so on the first stage the wrapper is an empty box for a
// handful of frames. Playing the enter transition there fades in nothing and pops the skeleton on
// afterwards, so the enter is held until SpineAsset reports the skeleton in. The timeout is the
// escape hatch for a skeleton that never loads (bad path) — the transition runs anyway rather than
// stranding the element at opacity 0.
const SPINE_LOAD_TIMEOUT_MS = 5000;

let spineLoaded = false;
let spineWaitTimer: ReturnType<typeof setTimeout> | null = null;
let heldEnter: (() => void) | null = null;
let idleStartTimer: ReturnType<typeof setTimeout> | null = null;

const clearHeldEnter = () => {
  if (spineWaitTimer !== null) clearTimeout(spineWaitTimer);
  spineWaitTimer = null;
  heldEnter = null;
};

const releaseHeldEnter = () => {
  const start = heldEnter;
  clearHeldEnter();
  start?.();
};

// Cancel a queued enter→idle handoff, so an asset removed mid-enter cannot start idling on top of
// its own exit animation.
const clearIdleStart = () => {
  if (idleStartTimer !== null) clearTimeout(idleStartTimer);
  idleStartTimer = null;
};

// SpineAsset's load signal: forwarded to whoever owns this component, and the cue a held enter
// transition is waiting on.
const onSpineLoaded = (stats: SpineStats | null) => {
  emit('spine-loaded', stats);
  spineLoaded = !!stats;
  if (stats && heldEnter) releaseHeldEnter();
};

const playEnterAndIdle = (element: HTMLElement, heldType?: string) => {
  // Skip enter animations if loading from save (same as character slots)
  const shouldPlayEnter = !game.dungeonSystem.isLoadingSave.value;
  const enterType = heldType ?? enterTransition.value;
  const hasIdle = idleAnimation.value && idleAnimation.value !== 'none';

  if (shouldPlayEnter && enterType && enterType !== 'none') {
    applyEnterTransition(element, enterType);

    // Start idle once the enter transition has finished, plus a small buffer.
    if (hasIdle) {
      const enterTime = (enterDuration.value + enterDelay.value) * 1000;
      idleStartTimer = setTimeout(() => applyIdleAnimation(element), enterTime + 50);
    }
    return;
  }

  // No enter transition to reveal the asset — lift any hold taken while waiting on the skeleton.
  gsap.set(element, { opacity: 1 });
  if (hasIdle) applyIdleAnimation(element);
};

// Set initial volume and watch for changes
onMounted(() => {
  if (videoRef.value) {
    const v = videoRef.value;
    v.volume = videoVolume.value;
    v.play().catch(() => {
      // Autoplay with sound blocked (web, no user gesture yet) — play muted instead
      v.muted = true;
      v.play().catch(() => { });
    });
  }

  const element = assetElementRef.value;
  if (!element) return;

  // Handle exit preview (when component mounts with isRemoving already true)
  if (props.asset.isRemoving) {
    applyExitTransition(element);
    return; // Skip enter/idle when previewing exit
  }

  const enterType = enterTransition.value;
  const willPlayEnter = !game.dungeonSystem.isLoadingSave.value && !!enterType && enterType !== 'none';

  if (willPlayEnter && isSpineAsset.value && !spineLoaded) {
    gsap.set(element, { opacity: 0 });
    heldEnter = () => playEnterAndIdle(element, enterType);
    spineWaitTimer = setTimeout(releaseHeldEnter, SPINE_LOAD_TIMEOUT_MS);
    return;
  }

  playEnterAndIdle(element);
});

// Watch isRemoving to drive the exit — and to restore visibility on re-staging.
// When an asset exits and is re-staged before the removal timer fires, it is still in
// the scene, so addAssets cancels the removal (clears isRemoving) and mutates THIS asset
// in place. The v-for key is asset.id, so there is no remount and onMounted never re-runs
// to replay the enter — meanwhile the interrupted exit left the element at opacity:0.
// The isRemoving true->false transition is the reliable re-entry signal.
watch(() => props.asset.isRemoving, (isRemoving, wasRemoving) => {
  const element = assetElementRef.value;
  if (!element) return;

  if (isRemoving) {
    // A spine asset removed before its skeleton arrived must not un-hide itself later.
    clearHeldEnter();
    // Stop idle animation before exit
    stopIdleAnimation(element);
    // Play exit animation
    applyExitTransition(element);
  } else if (wasRemoving) {
    resetAssetToVisible(element);
  }
});

watch(videoVolume, (newVolume) => {
  if (videoRef.value) {
    videoRef.value.volume = newVolume;
  }
});

/**
 * Snap the element back to a clean, fully-visible resting state after an interrupted exit.
 * The keyed element is reused rather than remounted, so onMounted/applyEnterTransition never
 * re-runs to restore it.
 */
const resetAssetToVisible = (element: HTMLElement) => {
  killExitEffects();
  gsap.killTweensOf(element);

  gsap.set(element, {
    clearProps: 'x,y,scale,scaleX,scaleY,rotation,rotationX,rotationY,filter,transform,transformOrigin'
  });

  // The pixelate exit writes mask styles and opacity straight to element.style, bypassing
  // GSAP — clearProps does not know about them, so clear them by hand.
  element.style.maskImage = '';
  element.style.webkitMaskImage = '';
  element.style.maskSize = '';
  element.style.webkitMaskSize = '';
  gsap.set(element, { opacity: 1 });

  element.classList.remove('idle-jitter');
  if (idleAnimation.value && idleAnimation.value !== 'none') {
    applyIdleAnimation(element);
  }
};

// Helper to stop all idle animations (GSAP and CSS) and reset to original state
const stopIdleAnimation = (element: HTMLElement) => {
  clearIdleStart();
  gsap.killTweensOf(element);
  // Remove CSS animation classes
  element.classList.remove('idle-jitter');
  // Reset all properties that idle animations may have modified
  gsap.set(element, {
    clearProps: 'x,y,scale,rotation,rotationX,rotationY,opacity,filter,transform'
  });
};

// Watch for idle animation property changes
watch([idleAnimation, idleDuration, idleIntensity],
  ([newIdle, newDuration, newIntensity], [oldIdle, oldDuration, oldIntensity]) => {
    const idleChanged = newIdle !== oldIdle;
    const durationChanged = newDuration !== oldDuration;
    const intensityChanged = newIntensity !== oldIntensity;

    const element = assetElementRef.value;
    if (!element) return;

    // Restart idle if any idle property changed and idle is active
    if ((idleChanged || durationChanged || intensityChanged) && newIdle && newIdle !== 'none') {
      // Stop current idle animation
      stopIdleAnimation(element);
      // Start new idle animation
      applyIdleAnimation(element);
    } else if (idleChanged && (!newIdle || newIdle === 'none')) {
      // Stop idle if changed to none
      stopIdleAnimation(element);
    }
  }
);

</script>

<template>
  <div v-if="isImageAsset || isVideoAsset" class="background-asset-wrapper">
    <!-- Animation wrapper for GSAP - separate from CSS transforms -->
    <div ref="assetElementRef" class="background-asset-animation-wrapper">
      <!-- Stacked plates. The transform/opacity/filter live on the .background-asset-stack
           container, never per plate: at alpha 0.5 a per-plate opacity would let the plates
           below show THROUGH the ones above instead of fading the finished picture, and the
           scene grade would run once per plate and tint each translucent plate in isolation.
           It also leaves each <img>'s `filter` free for a per-layer recolor class. -->
      <!-- Two keying strategies in one list, which is the point of the ternary. A plate that is
           one of several ALTERNATIVES keeps its slot (index key), so switching it patches `src`
           on the live element and the two options are never in the stack together — fading
           between them would show whatever they cover through the pair. A plate that merely ADDS
           to the finished picture asks for `fade` and is keyed by file, so it mounts and unmounts
           and TransitionGroup can crossfade it. Numbers and paths can't collide as keys. -->
      <TransitionGroup v-if="isImageAsset && layerPlates.length > 1" tag="div" name="plate-fade"
        class="background-asset-stack">
        <img v-for="(plate, i) of layerPlates" :key="plate.fade ? plate.file : i" :src="plate.file"
          :class="plate.classes" class="background-asset-layer" alt="" v-persist @load="onLayerLoad" />
      </TransitionGroup>
      <img v-else-if="isImageAsset" :src="assetPath" class="background-asset" alt="Background" />
      <video v-else-if="isVideoAsset" ref="videoRef" :src="assetPath" class="background-asset" autoplay loop
        playsinline />
    </div>
  </div>
  <div v-else-if="isSpineAsset" class="spine-aspect-outer">
    <!-- Same role as .background-asset-animation-wrapper: GSAP owns this element's transform,
         opacity and filter, and the spine canvas rides along inside it. It must stay OUTSIDE
         .spine-aspect-wrapper, whose overflow:hidden would clip a slide or a zoom-out, and INSIDE
         .spine-aspect-outer, which is the cqh container the renderer positions the canvas against. -->
    <div ref="assetElementRef" class="spine-animation-wrapper">
      <div class="spine-aspect-wrapper">
        <SpineAsset :asset="asset" @spine-loaded="onSpineLoaded" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.background-asset-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: v-bind("zindex");
  pointer-events: none;
  /* Create isolated stacking context to prevent z-index issues during animations */
  isolation: isolate;
}

/* Animation wrapper - GSAP animates this element */
.background-asset-animation-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  /* Force GPU layer for smooth animations */
  will-change: transform, opacity;
  transform: translateZ(0);
}

/* Stacked-plate container — carries exactly what .background-asset carries, so a stacked asset
   and a single-image one behave identically. Its plates deliberately carry none of it. */
.background-asset-stack {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform: v-bind("cssTransform");
  transform-origin: center;
  opacity: v-bind("shownAlpha");
  filter: v-bind("cssFilter");
}

/* One plate. `filter` is left unset on purpose: it belongs to whatever recolor class the
   game puts on this layer, the same way the character doll leaves it free. */
.background-asset-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: v-bind("objectFit");
  user-select: none;
}

/* Only `fade` plates ever enter or leave, so only they see these. Plates are already
   absolutely positioned, so a leaving one holds its place without disturbing the others.
   Opacity only — `filter` stays free for the plate's recolor class. */
.plate-fade-enter-active,
.plate-fade-leave-active {
  transition: opacity v-bind("PLATE_FADE_CSS") ease;
}

.plate-fade-enter-from,
.plate-fade-leave-to {
  opacity: 0;
}

/* Inner asset - CSS transforms for positioning/scale/rotation */
.background-asset {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: v-bind("objectFit");
  transform: v-bind("cssTransform");
  transform-origin: center;
  opacity: v-bind("shownAlpha");
  filter: v-bind("cssFilter");
}

.spine-aspect-outer {
  position: absolute;
  inset: 0;
  container-type: size;
  z-index: v-bind("zindex");
  pointer-events: none;
}

/* Animation wrapper — GSAP animates this element. Deliberately carries no transform of its own:
   the aspect box below still centres itself against the same rect, since inset:0 matches the
   outer's box exactly. */
.spine-animation-wrapper {
  position: absolute;
  inset: 0;
  will-change: transform, opacity;
}

.spine-aspect-wrapper {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  aspect-ratio: 16 / 9;
  width: 100%;
  height: auto;
  max-height: 100%;
  overflow: hidden;
}

@container (min-aspect-ratio: 16/9) {
  .spine-aspect-wrapper {
    width: auto;
    height: 100%;
    max-width: 100%;
  }
}

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
