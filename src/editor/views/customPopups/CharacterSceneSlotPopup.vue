<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import { Editor } from '../../editor';
import gsap from 'gsap';
import type { EditorCustomPopupProps } from '../../editor';
import { useCharacterAnimation } from '../../../composables/useCharacterAnimation';
import { loadCharacterImages } from '../../../shared/utils/characterImageLoader';
import type { CharacterSceneSlotObject } from '../../../schemas/characterSceneSlotSchema';
import { CharacterSceneSlotSchema } from '../../../schemas/characterSceneSlotSchema';
import Button from 'primevue/button';
import Dropdown from 'primevue/dropdown';
import Slider from 'primevue/slider';
import Checkbox from 'primevue/checkbox';
import TriStateSwitch from '../../views/dform/TriStateSwitch.vue';

const props = defineProps<EditorCustomPopupProps>();
const emit = defineEmits<{ 'update:item': [item: any] }>();

const editor = Editor.getInstance();

// Local copy for editing
const localItem = ref<CharacterSceneSlotObject>(props.item);

// Core item reference (from parent)
const coreItem = ref(props.coreItem);

// Character selection with persistent storage
const characterTemplates = ref<any[]>([]);
const selectedCharacterId = useStorage<string | null>('character-scene-slot-editor:last-character', null);
const skinLayersData = ref<any[]>([]);
const useCharacterArtOffset = useStorage('character-scene-slot-editor:use-art-offset', true);

// Preview canvas
const canvasRef = ref<HTMLElement | null>(null);
const characterElementRef = ref<HTMLElement | null>(null);
const scaleWrapperRef = ref<HTMLElement | null>(null);
const rotationWrapperRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);
const characterImagesRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const isDraggingAnchor = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);

// Animation composable
const animationControls = useCharacterAnimation({
  slot: localItem.value,
  skipAutoPlay: true
});

// Connect element refs to composable
watch(characterElementRef, (el) => {
  animationControls.elementRef.value = el;
});
watch(scaleWrapperRef, (el) => {
  animationControls.scaleWrapperRef.value = el;
});
watch(rotationWrapperRef, (el) => {
  animationControls.rotationWrapperRef.value = el;
});
watch(contentRef, (el) => {
  animationControls.contentRef.value = el;
});

// Computed character images
const characterImages = computed(() => {
  if (!selectedCharacterId.value) return [];
  const character = characterTemplates.value.find(c => c.id === selectedCharacterId.value);
  if (!character) return [];
  return loadCharacterImages(character, skinLayersData.value);
});

// Get selected character
const selectedCharacter = computed(() => {
  if (!selectedCharacterId.value) return null;
  return characterTemplates.value.find(c => c.id === selectedCharacterId.value);
});

// Character art offset from traits
const characterArtOffset = computed(() => {
  if (!useCharacterArtOffset.value || !selectedCharacter.value?.traits) {
    return { dx: 0, dy: 0, scale: 1 };
  }
  return {
    dx: selectedCharacter.value.traits.art_dx || 0,
    dy: selectedCharacter.value.traits.art_dy || 0,
    scale: selectedCharacter.value.traits.art_scale || 1
  };
});

// Computed styles for character slot (outer container - gets GSAP animated)
const characterSlotStyle = computed(() => {
  const x = animationControls.animatedX.value ?? 50;
  const y = animationControls.animatedY.value ?? 50;
  const alpha = localItem.value.alpha ?? 1;
  const blur = localItem.value.blur ?? 0;
  const brightness = localItem.value.brightness ?? 1;
  const contrast = localItem.value.contrast ?? 1;
  const saturate = localItem.value.saturate ?? 1;
  const sepia = localItem.value.sepia ?? 0;
  const hue = localItem.value.hue ?? 0;

  return {
    left: `${x}%`,
    top: `${y}%`,
    opacity: alpha,
    zIndex: localItem.value.z ?? 0
  };
});

// Separate CSS filter computed (to use with v-bind in CSS, not inline style)
const cssFilter = computed(() => {
  const blur = localItem.value.blur ?? 0;
  const brightness = localItem.value.brightness ?? 1;
  const contrast = localItem.value.contrast ?? 1;
  const saturate = localItem.value.saturate ?? 1;
  const sepia = localItem.value.sepia ?? 0;
  const hue = localItem.value.hue ?? 0;

  const filters = [];
  if (blur > 0) filters.push(`blur(${blur}px)`);
  if (brightness !== 1) filters.push(`brightness(${brightness})`);
  if (contrast !== 1) filters.push(`contrast(${contrast})`);
  if (saturate !== 1) filters.push(`saturate(${saturate})`);
  if (sepia > 0) filters.push(`sepia(${sepia})`);
  if (hue !== 0) filters.push(`hue-rotate(${hue}deg)`);

  return filters.length > 0 ? filters.join(' ') : 'none';
});

// Scale wrapper: scale + art offset, always centered
const scaleWrapperStyle = computed(() => {
  const scale = localItem.value.scale ?? 1;
  const artOffset = characterArtOffset.value;
  const finalScale = scale * artOffset.scale;

  const transforms = [];
  transforms.push(`scale(${finalScale})`);

  // Apply character art offset (for sprite padding compensation)
  if (artOffset.dx !== 0 || artOffset.dy !== 0) {
    transforms.push(`translate(${artOffset.dx}%, ${artOffset.dy}%)`);
  }

  return {
    transform: transforms.join(' '),
    transformOrigin: '50% 50%',
  };
});

// Rotation wrapper: no transform (removed - now applied to content)
const rotationWrapperStyle = computed(() => {
  const xanchor = localItem.value.xanchor ?? 50;
  const yanchor = localItem.value.yanchor ?? 50;

  return {
    transform: 'none',
    transformOrigin: `${xanchor}% ${yanchor}%`,
  };
});

// Content wrapper: rotation only, uses anchor as pivot
const contentStyle = computed(() => {
  const xanchor = localItem.value.xanchor ?? 50;
  const yanchor = localItem.value.yanchor ?? 50;
  const rotation = localItem.value.rotation ?? 0;

  if (rotation !== 0) {
    return {
      transform: `rotate(${rotation}deg)`,
      transformOrigin: `${xanchor}% ${yanchor}%`,
    };
  }

  return {
    transform: 'none',
    transformOrigin: `${xanchor}% ${yanchor}%`,
  };
});

// Anchor marker position (with counter-rotation to stay upright)
const anchorMarkerStyle = computed(() => {
  const xanchor = localItem.value.xanchor ?? 50;
  const yanchor = localItem.value.yanchor ?? 50;
  const rotation = localItem.value.rotation ?? 0;

  return {
    left: `${xanchor}%`,
    top: `${yanchor}%`,
    transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
  };
});

// Computed styles for character images (applies mirror transform to assets only)
const characterImagesStyle = computed(() => {
  const mirror = localItem.value.mirror ?? false;

  if (mirror) {
    return {
      transform: 'scaleX(-1)'
    };
  }

  return {};
});

// Load character templates and skin layers
onMounted(async () => {
  try {
    // Load character templates using loadFullData for proper mod support
    const templates = await editor.loadFullData('character_templates');
    if (templates && Array.isArray(templates)) {
      characterTemplates.value = templates;

      // Try to restore last selected character, or select first character by default
      if (templates.length > 0) {
        const storedId = selectedCharacterId.value;
        const storedCharacterExists = storedId && templates.some(t => t.id === storedId);

        if (!storedCharacterExists) {
          // If stored character doesn't exist or is null, select first character
          selectedCharacterId.value = templates[0].id;
        }
        // Otherwise keep the stored character ID
      }
    }

    // Load skin layers data using loadFullData for proper mod support
    const layers = await editor.loadFullData('character_skin_layers');
    if (layers && Array.isArray(layers)) {
      skinLayersData.value = layers;
    }

    // Initialize all properties with core defaults if undefined
    animationControls.animatedX.value = localItem.value.x ?? coreItem.value?.x ?? 50;
    animationControls.animatedY.value = localItem.value.y ?? coreItem.value?.y ?? 50;

    // Initialize transform properties with core defaults
    if (localItem.value.scale === undefined && coreItem.value?.scale !== undefined) {
      localItem.value.scale = coreItem.value.scale;
    }
    if (localItem.value.rotation === undefined && coreItem.value?.rotation !== undefined) {
      localItem.value.rotation = coreItem.value.rotation;
    }
    if (localItem.value.alpha === undefined && coreItem.value?.alpha !== undefined) {
      localItem.value.alpha = coreItem.value.alpha;
    }
    if (localItem.value.xanchor === undefined) {
      localItem.value.xanchor = coreItem.value?.xanchor ?? 50;
    }
    if (localItem.value.yanchor === undefined) {
      localItem.value.yanchor = coreItem.value?.yanchor ?? 50;
    }

    // Initialize filter properties with core defaults
    if (localItem.value.brightness === undefined && coreItem.value?.brightness !== undefined) {
      localItem.value.brightness = coreItem.value.brightness;
    }
    if (localItem.value.contrast === undefined && coreItem.value?.contrast !== undefined) {
      localItem.value.contrast = coreItem.value.contrast;
    }
    if (localItem.value.saturate === undefined && coreItem.value?.saturate !== undefined) {
      localItem.value.saturate = coreItem.value.saturate;
    }
    if (localItem.value.sepia === undefined && coreItem.value?.sepia !== undefined) {
      localItem.value.sepia = coreItem.value.sepia;
    }
    if (localItem.value.hue === undefined && coreItem.value?.hue !== undefined) {
      localItem.value.hue = coreItem.value.hue;
    }
    if (localItem.value.blur === undefined && coreItem.value?.blur !== undefined) {
      localItem.value.blur = coreItem.value.blur;
    }

    // Initialize animation properties with core defaults
    if (localItem.value.enter_duration === undefined && coreItem.value?.enter_duration !== undefined) {
      localItem.value.enter_duration = coreItem.value.enter_duration;
    }
    if (localItem.value.enter_delay === undefined && coreItem.value?.enter_delay !== undefined) {
      localItem.value.enter_delay = coreItem.value.enter_delay;
    }
    if (localItem.value.exit_duration === undefined && coreItem.value?.exit_duration !== undefined) {
      localItem.value.exit_duration = coreItem.value.exit_duration;
    }
    if (localItem.value.idle_duration === undefined && coreItem.value?.idle_duration !== undefined) {
      localItem.value.idle_duration = coreItem.value.idle_duration;
    }
    if (localItem.value.idle_intensity === undefined && coreItem.value?.idle_intensity !== undefined) {
      localItem.value.idle_intensity = coreItem.value.idle_intensity;
    }
  } catch (error) {
    console.error('Failed to load character data:', error);
  }
});

// Character dropdown options
const characterOptions = computed(() => {
  return characterTemplates.value.map(c => ({
    label: c.traits?.name || c.id,
    value: c.id
  }));
});

// Animation options from schema
const enterTransitionOptions = CharacterSceneSlotSchema.enter.options;
const exitTransitionOptions = CharacterSceneSlotSchema.exit.options;
const idleAnimationOptions = CharacterSceneSlotSchema.idle.options;
const easeOptions = CharacterSceneSlotSchema.enter_ease.options;

// Animation button handlers
function handlePlayEnter() {
  // Stop any running animations before playing enter
  animationControls.stopIdle();
  if (characterElementRef.value) {
    gsap.killTweensOf(characterElementRef.value);
  }
  if (contentRef.value) {
    gsap.killTweensOf(contentRef.value);
  }

  animationControls.playEnter();

  // Reset to default state after animation completes
  const duration = (localItem.value.enter_duration ?? 0.5) + (localItem.value.enter_delay ?? 0);
  gsap.delayedCall(duration, () => {
    if (characterElementRef.value && contentRef.value) {
      // Reset element to default state
      gsap.set(characterElementRef.value, {
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        rotation: 0,
        rotationX: 0,
        rotationY: 0,
        filter: 'none'
      });
      // Reset content to default rotation
      gsap.set(contentRef.value, {
        x: 0,
        y: 0,
        rotation: 0,
        rotationX: 0,
        rotationY: 0
      });
    }
  });
}

function handlePlayExit() {
  // Stop any running animations before playing exit
  animationControls.stopIdle();
  if (characterElementRef.value) {
    gsap.killTweensOf(characterElementRef.value);
  }
  if (contentRef.value) {
    gsap.killTweensOf(contentRef.value);
  }

  animationControls.playExit();

  // Reset to default state after animation completes
  const duration = localItem.value.exit_duration ?? 0.5;
  gsap.delayedCall(duration, () => {
    if (characterElementRef.value && contentRef.value) {
      // Reset element to default state
      gsap.set(characterElementRef.value, {
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        rotation: 0,
        rotationX: 0,
        rotationY: 0,
        filter: 'none'
      });
      // Reset content to default rotation
      gsap.set(contentRef.value, {
        x: 0,
        y: 0,
        rotation: 0,
        rotationX: 0,
        rotationY: 0
      });
    }
  });
}

function handleStartIdle() {
  // Stop previous idle before starting new one
  animationControls.stopIdle();
  animationControls.startIdle();
}

function handleStopIdle() {
  animationControls.stopIdle();
}

// Dragging handlers
function handleMouseDown(event: MouseEvent) {
  if (!canvasRef.value) return;
  isDragging.value = true;

  const rect = canvasRef.value.getBoundingClientRect();
  const x = animationControls.animatedX.value;
  const y = animationControls.animatedY.value;

  // Calculate offset from character position
  dragStartX.value = (event.clientX - rect.left) - (x / 100) * rect.width;
  dragStartY.value = (event.clientY - rect.top) - (y / 100) * rect.height;

  event.preventDefault();
}

function handleAnchorMouseDown(event: MouseEvent) {
  isDraggingAnchor.value = true;
  event.stopPropagation(); // Prevent character drag
  event.preventDefault();
}

function handleMouseMove(event: MouseEvent) {
  if (isDragging.value && canvasRef.value) {
    // Character position dragging
    const rect = canvasRef.value.getBoundingClientRect();
    const newX = ((event.clientX - rect.left - dragStartX.value) / rect.width) * 100;
    const newY = ((event.clientY - rect.top - dragStartY.value) / rect.height) * 100;

    // Allow negative and values beyond 100 for off-screen positioning
    animationControls.animatedX.value = newX;
    animationControls.animatedY.value = newY;

    localItem.value.x = newX;
    localItem.value.y = newY;
    emit('update:item', localItem.value);
  } else if (isDraggingAnchor.value && characterImagesRef.value) {
    // Anchor point dragging - use character-images element for correct dimensions
    const imagesRect = characterImagesRef.value.getBoundingClientRect();

    // Ensure valid dimensions
    if (imagesRect.width > 0 && imagesRect.height > 0) {
      // Calculate mouse position relative to character images element
      const relativeX = event.clientX - imagesRect.left;
      const relativeY = event.clientY - imagesRect.top;

      // Convert to percentage with bounds checking
      const newXAnchor = Math.round((relativeX / imagesRect.width) * 100);
      const newYAnchor = Math.round((relativeY / imagesRect.height) * 100);

      // Only update if values are reasonable (prevent extreme values)
      if (isFinite(newXAnchor) && isFinite(newYAnchor)) {
        localItem.value.xanchor = newXAnchor;
        localItem.value.yanchor = newYAnchor;
        emit('update:item', localItem.value);
      }
    }
  }
}

function handleMouseUp() {
  isDragging.value = false;
  isDraggingAnchor.value = false;
}

// Update local item when position changes
function updateLocalItem() {
  localItem.value.x = animationControls.animatedX.value;
  localItem.value.y = animationControls.animatedY.value;
  emit('update:item', localItem.value);
}

// Watch for prop changes
watch(() => props.item, (newItem) => {
  localItem.value = newItem;
  animationControls.animatedX.value = newItem.x ?? coreItem.value?.x ?? 50;
  animationControls.animatedY.value = newItem.y ?? coreItem.value?.y ?? 50;
}, { deep: true });

// Watch for local item changes and emit
watch(localItem, (newValue) => {
  emit('update:item', newValue);
}, { deep: true });

// Global mouse event listeners
onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
  animationControls.cleanup();
});
</script>

<template>
  <div class="character-scene-slot-popup">
    <!-- Main Content -->
    <div class="popup-content">
      <!-- Left: Preview Canvas -->
      <div class="preview-section">
        <div class="preview-header">
          <h3>Preview Canvas (16:9)</h3>
          <div class="animation-status">
            <span class="status-label">Animation:</span>
            <span class="status-value">{{ animationControls.currentAnimation.value || 'None' }}</span>
            <span class="status-indicator" :class="{ active: animationControls.isAnimating.value }"></span>
          </div>
        </div>

        <div class="preview-canvas-container">
          <div ref="canvasRef" class="preview-canvas">
            <!-- Character Preview -->
            <div v-if="characterImages.length > 0" ref="characterElementRef" class="character-slot"
              :style="characterSlotStyle" @mousedown="handleMouseDown">
              <div class="character-slot-positioner">
                <div ref="scaleWrapperRef" class="character-slot-scale-wrapper" :style="scaleWrapperStyle">
                  <div ref="rotationWrapperRef" class="character-slot-rotation-wrapper" :style="rotationWrapperStyle">
                    <div ref="contentRef" class="character-content" :style="contentStyle">
                      <!-- Anchor Point Visualization (positioned relative to content, not rotated) -->
                      <div class="anchor-point-marker" :style="anchorMarkerStyle" @mousedown="handleAnchorMouseDown">
                        <div class="anchor-dot"></div>
                        <div class="anchor-crosshair horizontal"></div>
                        <div class="anchor-crosshair vertical"></div>
                      </div>
                      <div ref="characterImagesRef" class="character-images" :style="characterImagesStyle">
                        <img v-for="(image, index) in characterImages" :key="index" :src="image" class="character-image"
                          @error="($event.target as HTMLImageElement).style.display = 'none'" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- No Character Message -->
            <div v-else class="no-character-message">
              <p>Select a character to preview</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Controls Panel -->
      <div class="controls-section">
        <!-- Character Selection -->
        <div class="control-group">
          <h4>Character Selection</h4>
          <Dropdown v-model="selectedCharacterId" :options="characterOptions" optionLabel="label" optionValue="value"
            placeholder="Select a character" class="control-dropdown" />

          <div class="checkbox-control">
            <Checkbox v-model="useCharacterArtOffset" inputId="artOffset" binary />
            <label for="artOffset" class="checkbox-label">
              Preview Character Art Offset
              <span v-if="useCharacterArtOffset && selectedCharacter" class="offset-info">
                (dx: {{ characterArtOffset.dx }}%, dy: {{ characterArtOffset.dy }}%, scale: {{ characterArtOffset.scale
                }})
              </span>
            </label>
          </div>
        </div>

        <!-- Animation Controls -->
        <div class="control-group">
          <h4>Animation Preview</h4>
          <div class="animation-selects">
            <!-- Enter Animation -->
            <div class="animation-group">
              <div class="animation-select-item">
                <label><strong>Enter:</strong></label>
                <Dropdown v-model="localItem.enter" :options="enterTransitionOptions"
                  placeholder="Select enter transition" class="animation-dropdown" />
              </div>
              <Button label="Play Enter" @click="handlePlayEnter" size="small"
                :disabled="!localItem.enter || localItem.enter === 'none'" />
              <div v-if="localItem.enter && localItem.enter !== 'none'" class="animation-properties">
                <div class="control-item-with-core">
                  <div class="control-label-row">
                    <label>Duration: {{ (localItem.enter_duration ?? 0.5).toFixed(2) }}s</label>
                    <span v-if="coreItem && localItem.enter_duration === undefined" class="core-value-indicator">
                      (core: {{ (coreItem.enter_duration ?? 0.5).toFixed(2) }}s)
                    </span>
                  </div>
                  <Slider :modelValue="localItem.enter_duration ?? 0.5"
                    @update:modelValue="(v) => localItem.enter_duration = Array.isArray(v) ? v[0] : v" :min="0.1"
                    :max="3" :step="0.1" />
                </div>
                <div class="control-item-with-core">
                  <div class="control-label-row">
                    <label>Delay: {{ (localItem.enter_delay ?? 0).toFixed(2) }}s</label>
                    <span v-if="coreItem && localItem.enter_delay === undefined" class="core-value-indicator">
                      (core: {{ (coreItem.enter_delay ?? 0).toFixed(2) }}s)
                    </span>
                  </div>
                  <Slider :modelValue="localItem.enter_delay ?? 0"
                    @update:modelValue="(v) => localItem.enter_delay = Array.isArray(v) ? v[0] : v" :min="0" :max="2"
                    :step="0.1" />
                </div>
                <div class="control-item">
                  <label>Ease:
                    <span v-if="coreItem && localItem.enter_ease === undefined" class="core-value-indicator">
                      (core: {{ coreItem.enter_ease ?? 'power2' }})
                    </span>
                  </label>
                  <Dropdown v-model="localItem.enter_ease" :options="easeOptions" placeholder="Select ease"
                    class="animation-dropdown" />
                </div>
              </div>
            </div>

            <!-- Exit Animation -->
            <div class="animation-group">
              <div class="animation-select-item">
                <label><strong>Exit:</strong></label>
                <Dropdown v-model="localItem.exit" :options="exitTransitionOptions" placeholder="Select exit transition"
                  class="animation-dropdown" />
              </div>
              <Button label="Play Exit" @click="handlePlayExit" size="small"
                :disabled="!localItem.exit || localItem.exit === 'none'" />
              <div v-if="localItem.exit && localItem.exit !== 'none'" class="animation-properties">
                <div class="control-item-with-core">
                  <div class="control-label-row">
                    <label>Duration: {{ (localItem.exit_duration ?? 0.5).toFixed(2) }}s</label>
                    <span v-if="coreItem && localItem.exit_duration === undefined" class="core-value-indicator">
                      (core: {{ (coreItem.exit_duration ?? 0).toFixed(2) }}s)
                    </span>
                  </div>
                  <Slider :modelValue="localItem.exit_duration ?? 0.5"
                    @update:modelValue="(v) => localItem.exit_duration = Array.isArray(v) ? v[0] : v" :min="0.1"
                    :max="3" :step="0.1" />
                </div>
                <div class="control-item">
                  <label>Ease:
                    <span v-if="coreItem && localItem.exit_ease === undefined" class="core-value-indicator">
                      (core: {{ coreItem.exit_ease ?? 'power2' }})
                    </span>
                  </label>
                  <Dropdown v-model="localItem.exit_ease" :options="easeOptions" placeholder="Select ease"
                    class="animation-dropdown" />
                </div>
              </div>
            </div>

            <!-- Idle Animation -->
            <div class="animation-group">
              <div class="animation-select-item">
                <label><strong>Idle:</strong></label>
                <Dropdown v-model="localItem.idle" :options="idleAnimationOptions" placeholder="Select idle animation"
                  class="animation-dropdown" />
              </div>
              <div class="idle-buttons">
                <Button label="Start Idle" @click="handleStartIdle" size="small"
                  :disabled="!localItem.idle || localItem.idle === 'none'" />
                <Button label="Stop Idle" @click="handleStopIdle" size="small" />
              </div>
              <div v-if="localItem.idle && localItem.idle !== 'none'" class="animation-properties">
                <div class="control-item-with-core">
                  <div class="control-label-row">
                    <label>Duration: {{ (localItem.idle_duration ?? 2).toFixed(2) }}s</label>
                    <span v-if="coreItem && localItem.idle_duration === undefined" class="core-value-indicator">
                      (core: {{ (coreItem.idle_duration ?? 0).toFixed(2) }}s)
                    </span>
                  </div>
                  <Slider :modelValue="localItem.idle_duration ?? 2"
                    @update:modelValue="(v) => localItem.idle_duration = Array.isArray(v) ? v[0] : v" :min="0.5"
                    :max="10" :step="0.1" />
                </div>
                <div class="control-item-with-core">
                  <div class="control-label-row">
                    <label>Intensity: {{ (localItem.idle_intensity ?? 0.5).toFixed(2) }}</label>
                    <span v-if="coreItem && localItem.idle_intensity === undefined" class="core-value-indicator">
                      (core: {{ (coreItem.idle_intensity ?? 0).toFixed(2) }})
                    </span>
                  </div>
                  <Slider :modelValue="localItem.idle_intensity ?? 0.5"
                    @update:modelValue="(v) => localItem.idle_intensity = Array.isArray(v) ? v[0] : v" :min="0" :max="1"
                    :step="0.05" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Position Controls -->
        <div class="control-group">
          <h4>Position</h4>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>X: {{ animationControls.animatedX.value.toFixed(1) }}%</label>
              <span v-if="coreItem && localItem.x === undefined" class="core-value-indicator">
                (core: {{ (coreItem.x ?? 50).toFixed(1) }}%)
              </span>
            </div>
            <Slider :modelValue="animationControls.animatedX.value"
              @update:modelValue="(v) => { animationControls.animatedX.value = Array.isArray(v) ? v[0] : v; updateLocalItem(); }"
              :min="-200" :max="200" :step="0.1" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Y: {{ animationControls.animatedY.value.toFixed(1) }}%</label>
              <span v-if="coreItem && localItem.y === undefined" class="core-value-indicator">
                (core: {{ (coreItem.y ?? 50).toFixed(1) }}%)
              </span>
            </div>
            <Slider :modelValue="animationControls.animatedY.value"
              @update:modelValue="(v) => { animationControls.animatedY.value = Array.isArray(v) ? v[0] : v; updateLocalItem(); }"
              :min="-200" :max="200" :step="0.1" />
          </div>
        </div>

        <!-- Transform Controls -->
        <div class="control-group">
          <h4>Transform</h4>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Scale: {{ localItem.scale?.toFixed(2) ?? 1 }}</label>
              <span v-if="coreItem && localItem.scale === undefined" class="core-value-indicator">
                (core: {{ (coreItem.scale ?? 1).toFixed(2) }})
              </span>
            </div>
            <Slider :modelValue="localItem.scale"
              @update:modelValue="(v) => localItem.scale = Array.isArray(v) ? v[0] : v" :min="0.1" :max="3"
              :step="0.01" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Rotation: {{ localItem.rotation ?? 0 }}°</label>
              <span v-if="coreItem && localItem.rotation === undefined" class="core-value-indicator">
                (core: {{ coreItem.rotation ?? 0 }}°)
              </span>
            </div>
            <Slider :modelValue="localItem.rotation"
              @update:modelValue="(v) => localItem.rotation = Array.isArray(v) ? v[0] : v" :min="-180" :max="180"
              :step="1" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Alpha: {{ localItem.alpha?.toFixed(2) ?? 1 }}</label>
              <span v-if="coreItem && localItem.alpha === undefined" class="core-value-indicator">
                (core: {{ (coreItem.alpha ?? 1).toFixed(2) }})
              </span>
            </div>
            <Slider :modelValue="localItem.alpha"
              @update:modelValue="(v) => localItem.alpha = Array.isArray(v) ? v[0] : v" :min="0" :max="1"
              :step="0.01" />
          </div>
          <div class="control-item control-item-horizontal">
            <div style="display: flex; align-items: center; gap: 0.5rem;">
              <label>Mirror (Flip Horizontal):</label>
              <span v-if="coreItem && localItem.mirror === undefined" class="core-value-indicator">
                (core: {{ coreItem.mirror ? 'true' : 'false' }})
              </span>
            </div>
            <TriStateSwitch v-model="localItem.mirror" inputId="mirror" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>X Anchor: {{ localItem.xanchor ?? 0 }}%</label>
              <span v-if="coreItem && localItem.xanchor === undefined" class="core-value-indicator">
                (core: {{ coreItem.xanchor ?? 0 }}%)
              </span>
            </div>
            <Slider :modelValue="localItem.xanchor"
              @update:modelValue="(v) => localItem.xanchor = Array.isArray(v) ? v[0] : v" :min="-100" :max="100"
              :step="1" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Y Anchor: {{ localItem.yanchor ?? 0 }}%</label>
              <span v-if="coreItem && localItem.yanchor === undefined" class="core-value-indicator">
                (core: {{ coreItem.yanchor ?? 0 }}%)
              </span>
            </div>
            <Slider :modelValue="localItem.yanchor"
              @update:modelValue="(v) => localItem.yanchor = Array.isArray(v) ? v[0] : v" :min="-100" :max="100"
              :step="1" />
          </div>
        </div>

        <!-- Filter Controls -->
        <div class="control-group">
          <h4>Filters</h4>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Brightness: {{ localItem.brightness?.toFixed(2) ?? 1 }}</label>
              <span v-if="coreItem && localItem.brightness === undefined" class="core-value-indicator">
                (core: {{ (coreItem.brightness ?? 1).toFixed(2) }})
              </span>
            </div>
            <Slider :modelValue="localItem.brightness"
              @update:modelValue="(v) => localItem.brightness = Array.isArray(v) ? v[0] : v" :min="0" :max="2"
              :step="0.01" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Contrast: {{ localItem.contrast?.toFixed(2) ?? 1 }}</label>
              <span v-if="coreItem && localItem.contrast === undefined" class="core-value-indicator">
                (core: {{ (coreItem.contrast ?? 1).toFixed(2) }})
              </span>
            </div>
            <Slider :modelValue="localItem.contrast"
              @update:modelValue="(v) => localItem.contrast = Array.isArray(v) ? v[0] : v" :min="0" :max="2"
              :step="0.01" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Saturate: {{ localItem.saturate?.toFixed(2) ?? 1 }}</label>
              <span v-if="coreItem && localItem.saturate === undefined" class="core-value-indicator">
                (core: {{ (coreItem.saturate ?? 1).toFixed(2) }})
              </span>
            </div>
            <Slider :modelValue="localItem.saturate"
              @update:modelValue="(v) => localItem.saturate = Array.isArray(v) ? v[0] : v" :min="0" :max="2"
              :step="0.01" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Sepia: {{ localItem.sepia?.toFixed(2) ?? 0 }}</label>
              <span v-if="coreItem && localItem.sepia === undefined" class="core-value-indicator">
                (core: {{ (coreItem.sepia ?? 0).toFixed(2) }})
              </span>
            </div>
            <Slider :modelValue="localItem.sepia"
              @update:modelValue="(v) => localItem.sepia = Array.isArray(v) ? v[0] : v" :min="0" :max="1"
              :step="0.01" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Hue: {{ localItem.hue ?? 0 }}°</label>
              <span v-if="coreItem && localItem.hue === undefined" class="core-value-indicator">
                (core: {{ coreItem.hue ?? 0 }}°)
              </span>
            </div>
            <Slider :modelValue="localItem.hue" @update:modelValue="(v) => localItem.hue = Array.isArray(v) ? v[0] : v"
              :min="-180" :max="180" :step="1" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Blur: {{ localItem.blur ?? 0 }}px</label>
              <span v-if="coreItem && localItem.blur === undefined" class="core-value-indicator">
                (core: {{ coreItem.blur ?? 0 }}px)
              </span>
            </div>
            <Slider :modelValue="localItem.blur"
              @update:modelValue="(v) => localItem.blur = Array.isArray(v) ? v[0] : v" :min="0" :max="20" :step="1" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-scene-slot-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.popup-content {
  display: flex;
  gap: 1.5rem;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* Preview Section */
.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background-color: #f5f5f5;
  border-radius: 4px 4px 0 0;
  border: 1px solid #ddd;
  border-bottom: none;
}

.preview-header h3 {
  margin: 0;
  font-size: 1rem;
  color: #333;
}

.animation-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
}

.status-label {
  color: #666;
}

.status-value {
  font-family: var(--font-family-mono);
  color: #333;
  font-weight: 500;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #ccc;
}

.status-indicator.active {
  background-color: #4CAF50;
  animation: pulse 1s infinite;
}

@keyframes pulse {

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
}

.preview-canvas-container {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background-color: #2a2a2a;
  border: 1px solid #ddd;
  border-radius: 0 0 4px 4px;
  container-type: size;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-canvas {
  position: relative;
  aspect-ratio: 16 / 9;
  background: linear-gradient(45deg, #1a1a1a 25%, #2a2a2a 25%, #2a2a2a 50%, #1a1a1a 50%, #1a1a1a 75%, #2a2a2a 75%, #2a2a2a);
  background-size: 40px 40px;
  overflow: hidden;

  /* Default: width-constrained */
  width: 100%;
  height: auto;
  max-height: 100%;
}

/* When container is wider than 16:9, height-constrained */
@container (min-aspect-ratio: 16/9) {
  .preview-canvas {
    width: auto;
    height: 100%;
    max-width: 100%;
  }
}

.character-slot {
  position: absolute;
  height: 100%;
  width: 100%;
  pointer-events: auto;
  cursor: grab;
  filter: v-bind("cssFilter");
}

.character-slot:active {
  cursor: grabbing;
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
}

.character-slot-rotation-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.character-content {
  position: relative;
  display: inline-block;
  height: 100%;
}

.character-images {
  position: relative;
  width: auto;
  height: 100%;
  display: inline-block;
}

.character-image {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: auto;
  object-fit: contain;
  pointer-events: none;
}

.character-image:first-child {
  position: relative;
}

/* Anchor Point Visualization */
.anchor-point-marker {
  position: absolute;
  width: 30px;
  height: 30px;
  z-index: 9999;
  pointer-events: auto;
  cursor: move;
}

.anchor-dot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 12px;
  height: 12px;
  background: rgba(255, 0, 0, 0.8);
  border: 2px solid white;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  box-shadow: 0 0 8px rgba(255, 0, 0, 0.6);
  pointer-events: none;
}

.anchor-crosshair {
  position: absolute;
  background: rgba(255, 0, 0, 0.5);
  pointer-events: none;
}

.anchor-crosshair.horizontal {
  width: 40px;
  height: 1px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.anchor-crosshair.vertical {
  width: 1px;
  height: 40px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}

.no-character-message {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: #999;
  font-size: 1rem;
}

/* Controls Section */
.controls-section {
  width: 320px;
  max-height: 100%;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow-y: auto;
  overflow-x: hidden;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.control-group h4 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #333;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #ddd;
}

.control-dropdown {
  width: 100%;
}

.checkbox-control {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin-top: 0.75rem;
  padding: 0.75rem;
  background-color: #f0f8ff;
  border: 1px solid #b0d4f1;
  border-radius: 4px;
}

.checkbox-label {
  font-size: 0.85rem;
  font-weight: 500;
  color: #333;
  cursor: pointer;
  line-height: 1.4;
}

.offset-info {
  display: block;
  font-size: 0.75rem;
  color: #ff6b6b;
  font-weight: 600;
  margin-top: 0.25rem;
  font-family: var(--font-family-mono);
}

.idle-buttons {
  display: flex;
  gap: 0.5rem;
}

.idle-buttons Button {
  flex: 1;
}

.animation-selects {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.animation-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.animation-group Button {
  width: 100%;
}

.animation-select-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.animation-select-item label {
  font-size: 0.85rem;
  color: #555;
}

.animation-dropdown {
  width: 100%;
}

.animation-properties {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid #ddd;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.control-item-horizontal {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.control-item label {
  font-size: 0.85rem;
  font-weight: 500;
  color: #555;
}

/* Core value indicators for mod support */
.core-value-indicator {
  color: var(--p-surface-500, #6b7280);
  font-size: 0.8rem;
  font-style: italic;
  margin-left: 0.5rem;
}

.control-item-with-core {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.control-item-with-core .control-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
