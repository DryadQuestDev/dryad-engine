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
  scaleWrapperRef: Ref<HTMLElement | null>;
  rotationWrapperRef: Ref<HTMLElement | null>;
  contentRef: Ref<HTMLElement | null>;

  // Position refs for animated positioning
  animatedX: Ref<number>;
  animatedY: Ref<number>;

  // Animation control methods
  playEnter: () => void;
  playExit: () => void;
  playMove: (from: { x?: number; y?: number }, to: { x?: number; y?: number }) => void;
  startIdle: () => void;
  stopIdle: () => void;

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
  const scaleWrapperRef = ref<HTMLElement | null>(null);
  const rotationWrapperRef = ref<HTMLElement | null>(null);
  const contentRef = ref<HTMLElement | null>(null);

  // Animation state
  const loopAnimation = ref<gsap.core.Tween | gsap.core.Timeline | null>(null);
  const isAnimating = ref(false);
  const currentAnimation = ref<string | null>(null);

  // Animated position refs
  const animatedX = ref(slot.x ?? 50);
  const animatedY = ref(slot.y ?? 50);

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
   * Play move transition animation with simple ease
   */
  const playMove = (
    from: { x?: number; y?: number },
    to: { x?: number; y?: number }
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

    const targetX = to.x ?? animatedX.value;
    const targetY = to.y ?? animatedY.value;

    const onComplete = () => {
      if (loopAnimation.value) loopAnimation.value.resume();
      isAnimating.value = false;
      currentAnimation.value = null;
    };

    // Simple ease animation: scale down slightly during move
    const timeline = gsap.timeline({ onComplete });

    // Animate to mid-state with slight scale
    timeline.to(element, {
      scale: 0.95,
      transformOrigin: transformOrigin.value,
      duration: duration / 2,
      ease
    });

    // Simultaneously animate position (animate each ref separately)
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

    // Animate back to normal scale
    timeline.to(element, {
      scale: 1,
      transformOrigin: transformOrigin.value,
      duration: duration / 2,
      ease
    }, duration / 2);
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

    const element = elementRef.value;
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
        loopAnimation.value = gsap.to(element, {
          scale: 1 + (0.04 * intensity),
          opacity: 1 - (0.15 * intensity),
          transformOrigin: transformOrigin.value,
          duration,
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

      case 'jitter':
        // Use CSS animation for jitter - runs on compositor thread for stability
        element.style.setProperty('--jitter-intensity', `${2 * intensity}px`);
        element.style.setProperty('--jitter-duration', `0.15s`);
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
  };

  /**
   * Stop idle loop animation
   */
  const stopIdle = () => {
    if (loopAnimation.value) {
      loopAnimation.value.kill();
      loopAnimation.value = null;
    }
    if (currentAnimation.value?.startsWith('idle:')) {
      currentAnimation.value = null;
    }

    // Reset any inline styles that idle animations may have applied
    if (elementRef.value) {
      // Remove CSS animation class for jitter
      elementRef.value.classList.remove('idle-jitter');
      // Clear all properties that idle animations may have modified on element
      gsap.set(elementRef.value, {
        clearProps: 'x,y,scale,opacity,filter,transform'
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
   * Cleanup all animations
   */
  const cleanup = () => {
    stopIdle();
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
    isAnimating.value = false;
    currentAnimation.value = null;
  };

  // Auto-cleanup on unmount
  onBeforeUnmount(() => {
    cleanup();
  });

  return {
    elementRef,
    scaleWrapperRef,
    rotationWrapperRef,
    contentRef,
    animatedX,
    animatedY,
    playEnter,
    playExit,
    playMove,
    startIdle,
    stopIdle,
    isAnimating,
    currentAnimation,
    cleanup,
  };
}
