<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue';
import { Global } from '../../global/global';
import { Game } from '../game';
import { SceneAsset } from '../systems/dungeonSystem';
import gsap from 'gsap';
import { PowerGlitch } from 'powerglitch';
import SpineAsset from './SpineAsset.vue';

const props = defineProps<{
  asset: SceneAsset;
}>();

const global = Global.getInstance();
const game = Game.getInstance();
const videoRef = ref<HTMLVideoElement | null>(null);
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

// Calculate CSS transform
const cssTransform = computed(() => {
  const transforms = [];

  // Translation for positioning
  transforms.push(`translate(${xpos.value}%, ${ypos.value}%)`);

  // Scale
  transforms.push(`scale(${xscale.value}, ${yscale.value})`);

  // Rotation
  if (rotation.value !== 0) {
    transforms.push(`rotate(${rotation.value}deg)`);
  }

  return transforms.join(' ');
});

// CSS filter for blur
const cssFilter = computed(() => {
  if (blur.value > 0) {
    return `blur(${blur.value}px)`;
  }
  return 'none';
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

// GSAP enter transition animations
const applyEnterTransition = (element: HTMLElement) => {
  const type = enterTransition.value;
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
    blurIn: { opacity: 0, filter: 'blur(20px)' },
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

// GSAP exit transition animations
const applyExitTransition = (element: HTMLElement) => {
  const type = exitTransition.value;
  const duration = exitDuration.value;
  const ease = `${exitEase.value}.in`;

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

    gsap.to(element, {
      opacity: 0,
      duration: duration * 0.3,
      delay: duration * 0.7,
      ease: 'power2.in',
      onComplete: () => glitch.stopGlitch(),
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
    blurOut: { opacity: 0, filter: 'blur(20px)' },
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

// Set initial volume and watch for changes
onMounted(() => {
  if (videoRef.value) {
    videoRef.value.volume = videoVolume.value;
  }

  // Get the element to animate (prefer assetElementRef for images, videoRef for videos)
  const element = assetElementRef.value || videoRef.value;
  if (!element) return;

  // Handle exit preview (when component mounts with isRemoving already true)
  if (props.asset.isRemoving) {
    applyExitTransition(element);
    return; // Skip enter/idle when previewing exit
  }

  // Skip enter animations if loading from save (same as character slots)
  const shouldPlayEnter = !game.dungeonSystem.isLoadingSave.value;
  const enterType = enterTransition.value;
  const hasEnterAnimation = shouldPlayEnter && enterType && enterType !== 'none';

  if (hasEnterAnimation) {
    // Apply enter transition first
    applyEnterTransition(element);

    // Calculate when enter transition completes to start idle
    const enterTime = (enterDuration.value + enterDelay.value) * 1000;

    // Start idle animation after enter completes
    if (idleAnimation.value && idleAnimation.value !== 'none') {
      setTimeout(() => {
        applyIdleAnimation(element);
      }, enterTime + 50); // Small buffer to ensure enter is fully complete
    }
  } else {
    // No enter animation, start idle immediately
    if (idleAnimation.value && idleAnimation.value !== 'none') {
      applyIdleAnimation(element);
    }
  }
});

// Watch for isRemoving flag to trigger exit animation
watch(() => props.asset.isRemoving, (isRemoving) => {
  if (isRemoving) {
    const element = assetElementRef.value || videoRef.value;
    if (element) {
      // Stop idle animation before exit
      stopIdleAnimation(element);
      // Play exit animation
      applyExitTransition(element);
    }
  }
});

watch(videoVolume, (newVolume) => {
  if (videoRef.value) {
    videoRef.value.volume = newVolume;
  }
});

// Helper to stop all idle animations (GSAP and CSS) and reset to original state
const stopIdleAnimation = (element: HTMLElement) => {
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

    // Get the active element (video or image)
    const element = videoRef.value || assetElementRef.value;
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
      <img v-if="isImageAsset" :src="assetPath" class="background-asset" alt="Background" />
      <video v-else-if="isVideoAsset" ref="videoRef" :src="assetPath" class="background-asset" autoplay loop
        playsinline />
    </div>
  </div>
  <SpineAsset v-else-if="isSpineAsset" :asset="asset" />
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
  opacity: v-bind("alpha");
  filter: v-bind("cssFilter");
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
