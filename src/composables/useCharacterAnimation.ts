import { ref, computed, onBeforeUnmount, type Ref } from 'vue';
import gsap from 'gsap';
import { PowerGlitch } from 'powerglitch';
import type { CharacterSceneSlotObject } from '../schemas/characterSceneSlotSchema';

export interface CharacterAnimationConfig {
  slot: Partial<CharacterSceneSlotObject>;
  skipAutoPlay?: boolean; // If true, don't auto-play enter/idle on mount
}

export interface CharacterAnimationControls {
  // Element refs that must be set by the component
  elementRef: Ref<HTMLElement | null>;
  // Wraps the art (scale wrapper → rotation wrapper → content) and nothing else.
  // Idle loops animate THIS, never the slot root: the root also holds the overlay
  // (name/HP/tokens), the item slots and the hit mask, which are UI and must stay
  // put while the body bobs. Optional — unset falls back to the slot root.
  artWrapperRef: Ref<HTMLElement | null>;
  // Sits between the art wrapper and the scale wrapper; one-shot animations (lunge, recoil…) play
  // here and nowhere else, so they stack on top of whatever idle loop is running.
  actionWrapperRef: Ref<HTMLElement | null>;
  scaleWrapperRef: Ref<HTMLElement | null>;
  rotationWrapperRef: Ref<HTMLElement | null>;
  contentRef: Ref<HTMLElement | null>;

  // Position refs for animated positioning
  animatedX: Ref<number>;
  animatedY: Ref<number>;
  animatedScale: Ref<number>;

  // Animation control methods
  playEnter: () => void;
  playExit: () => void;
  resetToVisible: () => void;
  playMove: (from: { x?: number; y?: number; scale?: number }, to: { x?: number; y?: number; scale?: number }) => void;
  startIdle: () => void;
  stopIdle: () => void;
  /** Ease out of the current idle back to rest, then start the slot's (new) idle. */
  switchIdle: () => void;
  /** Play a one-shot animation once. `side` is -1 when the actor stands left of center, 1 right of it. */
  playOneShot: (anim: string, opts: { duration?: number; intensity?: number; side: number }) => void;

  // State tracking
  isAnimating: Ref<boolean>;
  currentAnimation: Ref<string | null>;

  // Cleanup method
  cleanup: () => void;
}

export function useCharacterAnimation(
  config: CharacterAnimationConfig
): CharacterAnimationControls {
  const { slot, skipAutoPlay = false } = config;

  // Element refs - will be set by component
  const elementRef = ref<HTMLElement | null>(null);
  const artWrapperRef = ref<HTMLElement | null>(null);
  const actionWrapperRef = ref<HTMLElement | null>(null);
  const scaleWrapperRef = ref<HTMLElement | null>(null);
  const rotationWrapperRef = ref<HTMLElement | null>(null);
  const contentRef = ref<HTMLElement | null>(null);

  // Animation state
  const loopAnimation = ref<gsap.core.Tween | gsap.core.Timeline | null>(null);
  // The breathing half of the `slumped` idle — started once the sink has finished.
  let slumpBreath: gsap.core.Tween | null = null;
  let idleSwitch: gsap.core.Tween | null = null;
  let oneShot: gsap.core.Timeline | null = null;
  const isAnimating = ref(false);
  const currentAnimation = ref<string | null>(null);

  // Animated position refs
  const animatedX = ref(slot.x ?? 50);
  const animatedY = ref(slot.y ?? 50);
  // Animate scale on the same GSAP timeline as x/y so transitions don't desync
  // Without this, scale used a CSS transition with a slightly
  // different easing curve and could lift the body briefly mid-zoom, exposing
  // legs that should stay below viewport bottom.
  const animatedScale = ref(slot.scale ?? 1);

  // Compute transform origin from anchors for GSAP rotation animations
  const transformOrigin = computed(() => {
    const x = slot.xanchor ?? 50;
    const y = slot.yanchor ?? 50;
    return `${x}% ${y}%`;
  });

  // Computed animation properties
  const enterTransition = computed(() => slot.enter);
  const enterDuration = computed(() => slot.enter_duration ?? 0.5);
  const enterDelay = computed(() => slot.enter_delay ?? 0);
  const enterEase = computed(() => slot.enter_ease ?? 'power2');

  const exitTransition = computed(() => slot.exit);
  const exitDuration = computed(() => slot.exit_duration ?? 0.5);
  const exitEase = computed(() => slot.exit_ease ?? 'power2');

  const idleAnimation = computed(() => slot.idle);
  const idleDuration = computed(() => slot.idle_duration ?? 3);
  const idleIntensity = computed(() => slot.idle_intensity ?? 0.5);

  // Filter properties for move animations
  const blur = computed(() => slot.blur ?? 0);
  const brightness = computed(() => slot.brightness ?? 1);
  const contrast = computed(() => slot.contrast ?? 1);
  const saturate = computed(() => slot.saturate ?? 1);
  const sepia = computed(() => slot.sepia ?? 0);
  const hue = computed(() => slot.hue ?? 0);

  /**
   * Play enter transition animation
   */
  const playEnter = () => {
    if (!elementRef.value || !contentRef.value) return;

    const element = elementRef.value;
    const content = contentRef.value;
    const type = enterTransition.value;
    if (!type || type === 'none') return;

    isAnimating.value = true;
    currentAnimation.value = `enter:${type}`;

    const duration = enterDuration.value;
    const delay = enterDelay.value;
    const ease = `${enterEase.value}.out`;

    // Define initial states for different transitions
    const transitions: Record<string, any> = {
      none: null,
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
      const initialState = transitions[type];

      // Split properties: rotation properties go to content, others to element
      const rotationProps: any = {};
      const elementProps: any = {};

      Object.keys(initialState).forEach(key => {
        if (key === 'rotation' || key === 'rotationX' || key === 'rotationY') {
          rotationProps[key] = initialState[key];
        } else {
          elementProps[key] = initialState[key];
        }
      });

      // Set initial states
      if (Object.keys(rotationProps).length > 0) {
        gsap.set(content, { ...rotationProps, transformOrigin: transformOrigin.value });
      }
      gsap.set(element, { ...elementProps, transformOrigin: transformOrigin.value });

      // Determine special easing
      let finalEase = ease;
      if (type === 'elastic') finalEase = 'elastic.out(1, 0.5)';
      else if (type === 'bounce') finalEase = 'bounce.out';
      else if (type === 'pop') finalEase = 'back.out(1.7)';

      // Build animation properties for element
      const elementAnimProps: any = {
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        transformOrigin: transformOrigin.value,
        duration,
        delay,
        ease: finalEase,
        onComplete: () => {
          isAnimating.value = false;
          currentAnimation.value = null;
        }
      };

      // Only reset filter if the transition used it (blurIn)
      if (type === 'blurIn') {
        elementAnimProps.filter = 'blur(0px)';
      }

      // Build animation properties for content (rotation reset)
      const contentAnimProps: any = {
        rotation: 0,
        rotationX: 0,
        rotationY: 0,
        transformOrigin: transformOrigin.value,
        duration,
        delay,
        ease: finalEase
      };

      // Animate both elements
      gsap.to(element, elementAnimProps);
      if (Object.keys(rotationProps).length > 0) {
        gsap.to(content, contentAnimProps);
      }
    }
  };

  /**
   * Play exit transition animation
   */
  const playExit = () => {
    if (!elementRef.value || !contentRef.value) return;

    // Stop idle animations before exit
    stopIdle();

    const element = elementRef.value;
    const content = contentRef.value;
    const type = exitTransition.value;
    if (!type || type === 'none') return;

    isAnimating.value = true;
    currentAnimation.value = `exit:${type}`;

    const duration = exitDuration.value;
    const ease = `${exitEase.value}.in`;

    // Define exit states
    const transitions: Record<string, any> = {
      none: null,
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
      const exitState = transitions[type];

      // Split properties: rotation properties go to content, others to element
      const rotationProps: any = {};
      const elementProps: any = {};

      Object.keys(exitState).forEach(key => {
        if (key === 'rotation' || key === 'rotationX' || key === 'rotationY') {
          rotationProps[key] = exitState[key];
        } else {
          elementProps[key] = exitState[key];
        }
      });

      // Determine easing
      const finalEase = type === 'elastic' ? 'elastic.in(1, 0.5)' : type === 'bounce' ? 'bounce.in' : ease;

      // Animate element
      gsap.to(element, {
        ...elementProps,
        transformOrigin: transformOrigin.value,
        duration,
        ease: finalEase,
        onComplete: () => {
          isAnimating.value = false;
          currentAnimation.value = null;
        }
      });

      // Animate rotation on content if needed
      if (Object.keys(rotationProps).length > 0) {
        gsap.to(content, {
          ...rotationProps,
          transformOrigin: transformOrigin.value,
          duration,
          ease: finalEase
        });
      }
    }
  };

  /**
   * Snap the element back to a clean, fully-visible resting state.
   * Used when a reused element (same v-for key) is re-entered after an exit
   * left it stranded at opacity:0 — the keyed element is not remounted, so
   * onMounted/playEnter never re-runs to restore visibility.
   */
  const resetToVisible = () => {
    const element = elementRef.value;
    const content = contentRef.value;
    if (!element || !content) return;

    if (loopAnimation.value) {
      loopAnimation.value.kill();
      loopAnimation.value = null;
    }
    gsap.killTweensOf(element);
    gsap.killTweensOf(content);

    gsap.set(element, { opacity: 1, x: 0, y: 0, scale: 1, filter: 'none', transformOrigin: transformOrigin.value });
    gsap.set(content, { rotation: 0, rotationX: 0, rotationY: 0, transformOrigin: transformOrigin.value });

    isAnimating.value = false;
    currentAnimation.value = null;
  };

  /**
   * Play move transition animation with simple ease
   */
  const playMove = (
    from: { x?: number; y?: number; scale?: number },
    to: { x?: number; y?: number; scale?: number }
  ) => {
    if (!elementRef.value) return;

    const element = elementRef.value;

    isAnimating.value = true;
    currentAnimation.value = `move:ease`;

    const duration = 0.5;
    const ease = 'power2.out';

    // Temporarily pause idle animations during move
    if (loopAnimation.value) {
      loopAnimation.value.pause();
    }

    // Set current position if provided
    if (from.x !== undefined) animatedX.value = from.x;
    if (from.y !== undefined) animatedY.value = from.y;
    if (from.scale !== undefined) animatedScale.value = from.scale;

    const targetX = to.x ?? animatedX.value;
    const targetY = to.y ?? animatedY.value;
    const targetScale = to.scale ?? animatedScale.value;

    const onComplete = () => {
      if (loopAnimation.value) loopAnimation.value.resume();
      isAnimating.value = false;
      currentAnimation.value = null;
    };

    // Animate x/y/scale on the same timeline so they stay in lockstep — body_bottom
    // = slot.y + 50 + slot.scale × 50 then interpolates monotonically between the
    // two endpoints (no mid-flight dip that would expose cropped legs).
    const timeline = gsap.timeline({ onComplete });

    timeline.to(animatedX, {
      value: targetX,
      duration,
      ease
    }, 0);

    timeline.to(animatedY, {
      value: targetY,
      duration,
      ease
    }, 0);

    timeline.to(animatedScale, {
      value: targetScale,
      duration,
      ease
    }, 0);
  };

  /**
   * Start idle loop animation
   */
  const startIdle = () => {
    if (!elementRef.value) return;

    // Clear existing loop animation
    if (loopAnimation.value) {
      loopAnimation.value.kill();
      loopAnimation.value = null;
    }

    // The art wrapper, not the slot root — see artWrapperRef above.
    const element = artWrapperRef.value ?? elementRef.value;
    const type = idleAnimation.value;
    if (!type || type === 'none') return;

    currentAnimation.value = `idle:${type}`;

    const duration = idleDuration.value;
    const intensity = idleIntensity.value;

    // Define idle animations
    switch (type) {
      case 'float':
        loopAnimation.value = gsap.to(element, {
          y: `${-15 * intensity}px`,
          transformOrigin: transformOrigin.value,
          duration,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
        break;

      case 'sway':
        loopAnimation.value = gsap.to(contentRef.value, {
          rotation: 2 * intensity,
          transformOrigin: transformOrigin.value,
          duration,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
        break;

      case 'pulse':
        loopAnimation.value = gsap.to(element, {
          scale: 1 + (0.08 * intensity),
          transformOrigin: transformOrigin.value,
          duration,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
        break;

      case 'rotate':
        loopAnimation.value = gsap.to(contentRef.value, {
          rotation: '+=360',
          transformOrigin: transformOrigin.value,
          duration: duration * 2,
          repeat: -1,
          ease: 'none',
        });
        break;

      case 'breathe':
        // A chest rise, not a balloon: Y grows, X gives a little, so the body
        // reads as inhaling around its anchor instead of inflating from it.
        // (pulse is the uniform one.)
        loopAnimation.value = gsap.to(element, {
          scaleY: 1 + (0.04 * intensity),
          scaleX: 1 - (0.015 * intensity),
          transformOrigin: transformOrigin.value,
          duration,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
        break;

      case 'ghost':
        loopAnimation.value = gsap.to(element, {
          opacity: 1 - (0.4 * intensity),
          scale: 1 + (0.04 * intensity),
          transformOrigin: transformOrigin.value,
          duration: duration * 1.5,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
        break;

      case 'shake':
        loopAnimation.value = gsap.to(element, {
          x: `${3 * intensity}px`,
          transformOrigin: transformOrigin.value,
          duration: 0.08,
          yoyo: true,
          repeat: -1,
          ease: 'power1.inOut',
        });
        break;

      case 'pan':
        loopAnimation.value = gsap.to(element, {
          x: `${20 * intensity}px`,
          transformOrigin: transformOrigin.value,
          duration,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
        break;

      case 'bounce':
        loopAnimation.value = gsap.to(element, {
          y: `${-10 * intensity}px`,
          transformOrigin: transformOrigin.value,
          duration: duration / 2,
          yoyo: true,
          repeat: -1,
          ease: 'power1.out',
        });
        break;

      case 'hop':
        loopAnimation.value = gsap.timeline({ repeat: -1, repeatDelay: duration / 2 })
          .to(element, {
            y: `${-20 * intensity}px`,
            transformOrigin: transformOrigin.value,
            duration: duration / 4,
            ease: 'power2.out',
          })
          .to(element, {
            y: 0,
            transformOrigin: transformOrigin.value,
            duration: duration / 4,
            ease: 'power2.in',
          });
        break;

      case 'rock':
        loopAnimation.value = gsap.to(contentRef.value, {
          rotation: 5 * intensity,
          transformOrigin: transformOrigin.value,
          duration: duration / 2,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
        break;

      case 'nod':
        loopAnimation.value = gsap.to(contentRef.value, {
          rotationX: 8 * intensity,
          transformOrigin: transformOrigin.value,
          duration: duration / 2,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
        break;

      case 'lean':
        loopAnimation.value = gsap.to(contentRef.value, {
          x: `${10 * intensity}px`,
          rotation: 3 * intensity,
          transformOrigin: transformOrigin.value,
          duration,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
        break;

      case 'shimmy':
        loopAnimation.value = gsap.to(element, {
          x: `${5 * intensity}px`,
          transformOrigin: transformOrigin.value,
          duration: 0.15,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
        break;

      case 'wave':
        loopAnimation.value = gsap.timeline({ repeat: -1 })
          .to(contentRef.value, {
            y: `${-10 * intensity}px`,
            rotation: 3 * intensity,
            transformOrigin: transformOrigin.value,
            duration: duration / 3,
            ease: 'sine.inOut',
          })
          .to(contentRef.value, {
            y: `${10 * intensity}px`,
            rotation: -3 * intensity,
            transformOrigin: transformOrigin.value,
            duration: duration / 3,
            ease: 'sine.inOut',
          })
          .to(contentRef.value, {
            y: 0,
            rotation: 0,
            transformOrigin: transformOrigin.value,
            duration: duration / 3,
            ease: 'sine.inOut',
          });
        break;

      case 'slumped': {
        // A pose, not just a motion: sink down and sag forward, then breathe heavily from there.
        // Eases in from wherever the body is, so switching to it reads as collapsing, not popping.
        const sink = gsap.timeline()
          .to(element, {
            yPercent: 5 * intensity,
            rotation: 3 * intensity,
            transformOrigin: '50% 100%',
            duration: 0.9,
            ease: 'power2.inOut',
          });
        const breath = gsap.to(element, {
          scaleY: 1 + (0.025 * intensity),
          transformOrigin: '50% 100%',
          duration,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
          paused: true,
        });
        sink.eventCallback('onComplete', () => { breath.play(); });
        // Held as the loop so stopIdle/cleanup kill both halves.
        loopAnimation.value = gsap.timeline({ onInterrupt: () => breath.kill() }).add(sink);
        slumpBreath = breath;
        break;
      }

      case 'jitter':
        // Use CSS animation for jitter - runs on compositor thread for stability
        element.style.setProperty('--jitter-intensity', `${2 * intensity}px`);
        element.style.setProperty('--jitter-duration', `0.15s`);
        // Negative delay starts the CSS loop mid-cycle — same reason as the GSAP
        // phase offset below, since jitter never becomes a tween we can seek.
        element.style.setProperty('--jitter-delay', `${(-Math.random() * 0.15).toFixed(3)}s`);
        element.classList.add('idle-jitter');
        break;

      case 'blink':
        loopAnimation.value = gsap.timeline({ repeat: -1, repeatDelay: duration })
          .to(element, {
            opacity: 0.3,
            transformOrigin: transformOrigin.value,
            duration: 0.1,
          })
          .to(element, {
            opacity: 1,
            transformOrigin: transformOrigin.value,
            duration: 0.1,
          });
        break;

      case 'glow':
        loopAnimation.value = gsap.to(element, {
          filter: `brightness(${1 + (0.3 * intensity)})`,
          transformOrigin: transformOrigin.value,
          duration,
          yoyo: true,
          repeat: -1,
          ease: 'sine.inOut',
        });
        break;

      case 'wiggle':
        loopAnimation.value = gsap.timeline({ repeat: -1 })
          .to(contentRef.value, {
            rotation: 5 * intensity,
            transformOrigin: transformOrigin.value,
            duration: 0.1,
            ease: 'sine.inOut',
          })
          .to(contentRef.value, {
            rotation: -5 * intensity,
            transformOrigin: transformOrigin.value,
            duration: 0.1,
            ease: 'sine.inOut',
          })
          .to(contentRef.value, {
            rotation: 0,
            transformOrigin: transformOrigin.value,
            duration: 0.1,
            ease: 'sine.inOut',
          })
          .to(contentRef.value, {}, duration - 0.3); // Pause
        break;

      case 'glitch':
        loopAnimation.value = gsap.timeline({ repeat: -1, repeatDelay: duration * 0.5 })
          .call(() => {
            if (!rotationWrapperRef.value) return;
            // Trigger glitch effect on rotation wrapper (inherits scale from parent)
            const glitchDuration = 0.3 + (intensity * 0.4); // 0.3s to 0.7s based on intensity
            const glitch = PowerGlitch.glitch(rotationWrapperRef.value, {
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

            // Stop glitch after duration
            setTimeout(() => {
              glitch.stopGlitch();
            }, glitchDuration * 1000);
          })
          .to({}, { duration: 0.1 }); // Small delay for the glitch to complete
        break;
    }

    // Every idle starts at a random point of its own loop. Without this, two
    // characters sharing an idle bob in perfect lockstep and read as one sprite
    // pasted twice. seek() takes TOTAL time, so it wraps through repeats and the
    // yoyo return leg; suppressEvents keeps timeline .call()s (glitch) from firing
    // on the way there.
    if (loopAnimation.value && type !== 'slumped') {
      const anim = loopAnimation.value;
      const cycle = (anim.duration() + anim.repeatDelay()) * (anim.yoyo() ? 2 : 1);
      if (cycle > 0) anim.seek(Math.random() * cycle, true);
    }
  };

  /**
   * Stop idle loop animation
   */
  const stopIdle = () => {
    if (loopAnimation.value) {
      loopAnimation.value.kill();
      loopAnimation.value = null;
    }
    slumpBreath?.kill();
    slumpBreath = null;
    if (currentAnimation.value?.startsWith('idle:')) {
      currentAnimation.value = null;
    }

    // Reset any inline styles that idle animations may have applied
    const idleTarget = artWrapperRef.value ?? elementRef.value;
    if (idleTarget) {
      // Remove CSS animation class for jitter
      idleTarget.classList.remove('idle-jitter');
      // Clear all properties that idle animations may have modified on element
      gsap.set(idleTarget, {
        clearProps: 'x,y,xPercent,yPercent,rotation,scale,scaleX,scaleY,opacity,filter,transform'
      });
    }
    if (scaleWrapperRef.value) {
      gsap.set(scaleWrapperRef.value, {
        clearProps: 'scale,transform'
      });
    }
    if (rotationWrapperRef.value) {
      gsap.set(rotationWrapperRef.value, {
        clearProps: 'x,y,rotation,rotationX,rotationY,transform'
      });
    }
    if (contentRef.value) {
      gsap.set(contentRef.value, {
        clearProps: 'x,y,rotation,rotationX,rotationY,transform'
      });
    }
  };

  /**
   * Switch idles without a pop: ease the art out of the old loop's pose (a float mid-bob, a
   * slump) back to rest, then start the slot's current idle — which eases into its own pose.
   */
  const switchIdle = () => {
    const target = artWrapperRef.value ?? elementRef.value;
    if (!target) return;
    if (loopAnimation.value) { loopAnimation.value.kill(); loopAnimation.value = null; }
    slumpBreath?.kill(); slumpBreath = null;
    idleSwitch?.kill();
    target.classList.remove('idle-jitter');
    const parts = [target, contentRef.value, rotationWrapperRef.value].filter(Boolean) as HTMLElement[];
    idleSwitch = gsap.to(parts, {
      x: 0, y: 0, xPercent: 0, yPercent: 0, rotation: 0, rotationX: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1,
      duration: 0.35,
      ease: 'sine.inOut',
      onComplete: () => {
        idleSwitch = null;
        stopIdle();   // clears the inline props the tween left at rest values
        startIdle();
      },
    });
  };

  /**
   * One-shot animations: play once on the action wrapper and return to rest. `side` makes the
   * directional ones point the right way — a lunge goes toward the stage center, a recoil away.
   */
  const playOneShot = (anim: string, opts: { duration?: number; intensity?: number; side: number }) => {
    const el = actionWrapperRef.value;
    if (!el) return;
    oneShot?.kill();
    gsap.set(el, { clearProps: 'all' });
    const k = opts.intensity ?? 1;
    const d = opts.duration ?? ({ lunge: 0.55, recoil: 0.6, hop: 0.45, shake: 0.45, shiver: 0.6, nod: 0.5, bounce: 0.5, flash: 0.45 } as Record<string, number>)[anim] ?? 0.5;
    const inward = -opts.side;    // toward the center
    const tl = gsap.timeline({ onComplete: () => { gsap.set(el, { clearProps: 'all' }); oneShot = null; } });
    switch (anim) {
      case 'lunge':
        tl.to(el, { xPercent: 14 * k * inward, rotation: 3 * k * inward, transformOrigin: '50% 100%', duration: d * 0.3, ease: 'power3.out' })
          .to(el, { xPercent: 0, rotation: 0, duration: d * 0.7, ease: 'power2.inOut' }, `+=${d * 0.05}`);
        break;
      case 'recoil':
        tl.to(el, { xPercent: -10 * k * inward, rotation: -4 * k * inward, transformOrigin: '50% 100%', duration: d * 0.2, ease: 'power4.out' })
          .to(el, { xPercent: 0, rotation: 0, duration: d * 0.8, ease: 'power2.inOut' });
        break;
      case 'hop':
        tl.to(el, { yPercent: -7 * k, duration: d * 0.45, ease: 'power2.out' })
          .to(el, { yPercent: 0, duration: d * 0.55, ease: 'bounce.out' });
        break;
      case 'shake': {
        const steps = 8;
        for (let i = 0; i < steps; i++) {
          tl.to(el, { xPercent: (i % 2 ? -1 : 1) * 2.2 * k * (1 - i / steps), duration: d / (steps + 1), ease: 'sine.inOut' });
        }
        tl.to(el, { xPercent: 0, duration: d / (steps + 1) });
        break;
      }
      case 'shiver': {
        const steps = 16;
        for (let i = 0; i < steps; i++) {
          tl.to(el, { xPercent: (i % 2 ? -1 : 1) * 0.6 * k, yPercent: (i % 3 - 1) * 0.3 * k, duration: d / (steps + 1), ease: 'none' });
        }
        tl.to(el, { xPercent: 0, yPercent: 0, duration: d / (steps + 1) });
        break;
      }
      case 'nod':
        tl.to(el, { yPercent: 1.8 * k, rotation: 1.5 * k * inward, transformOrigin: '50% 100%', duration: d * 0.25, ease: 'sine.out' })
          .to(el, { yPercent: 0, rotation: 0, duration: d * 0.25, ease: 'sine.in' })
          .to(el, { yPercent: 1.2 * k, duration: d * 0.25, ease: 'sine.out' })
          .to(el, { yPercent: 0, duration: d * 0.25, ease: 'sine.in' });
        break;
      case 'bounce':
        tl.to(el, { scaleY: 1 - 0.08 * k, scaleX: 1 + 0.05 * k, transformOrigin: '50% 100%', duration: d * 0.2, ease: 'power2.out' })
          .to(el, { scaleY: 1 + 0.06 * k, scaleX: 1 - 0.03 * k, duration: d * 0.3, ease: 'power2.out' })
          .to(el, { scaleY: 1, scaleX: 1, duration: d * 0.5, ease: 'elastic.out(1, 0.5)' });
        break;
      case 'flash':
        // A hit flash on this actor only: a quick red wash that drains away.
        tl.fromTo(el, { filter: 'sepia(0) saturate(1) hue-rotate(0deg) brightness(1)' },
          { filter: `sepia(${0.9 * k}) saturate(${1 + 5 * k}) hue-rotate(-40deg) brightness(${1 + 0.15 * k})`, duration: d * 0.2, ease: 'power2.out' })
          .to(el, { filter: 'sepia(0) saturate(1) hue-rotate(0deg) brightness(1)', duration: d * 0.8, ease: 'power2.in' });
        break;
      default:
        tl.kill();
        return;
    }
    oneShot = tl;
  };

  /**
   * Cleanup all animations
   */
  const cleanup = () => {
    stopIdle();
    idleSwitch?.kill();
    oneShot?.kill();
    if (actionWrapperRef.value) gsap.killTweensOf(actionWrapperRef.value);
    if (elementRef.value) {
      gsap.killTweensOf(elementRef.value);
    }
    if (scaleWrapperRef.value) {
      gsap.killTweensOf(scaleWrapperRef.value);
    }
    if (rotationWrapperRef.value) {
      gsap.killTweensOf(rotationWrapperRef.value);
    }
    if (contentRef.value) {
      gsap.killTweensOf(contentRef.value);
    }
    gsap.killTweensOf(animatedX);
    gsap.killTweensOf(animatedY);
    gsap.killTweensOf(animatedScale);
    isAnimating.value = false;
    currentAnimation.value = null;
  };

  // Auto-cleanup on unmount
  onBeforeUnmount(() => {
    cleanup();
  });

  return {
    elementRef,
    artWrapperRef,
    actionWrapperRef,
    scaleWrapperRef,
    rotationWrapperRef,
    contentRef,
    animatedX,
    animatedY,
    animatedScale,
    playEnter,
    playExit,
    resetToVisible,
    playMove,
    startIdle,
    stopIdle,
    switchIdle,
    playOneShot,
    isAnimating,
    currentAnimation,
    cleanup,
  };
}
