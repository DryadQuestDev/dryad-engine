<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { Editor } from '../../editor';
import type { EditorCustomPopupProps } from '../../editor';
import { loadCharacterImages } from '../../../shared/utils/characterImageLoader';
import Slider from 'primevue/slider';

const props = defineProps<EditorCustomPopupProps>();
const emit = defineEmits<{ 'update:item': [item: any] }>();

const editor = Editor.getInstance();

// Local copy for editing (deep clone to avoid reactivity loops)
const localItem = ref(JSON.parse(JSON.stringify(props.item)));

// Core item reference (from parent)
const coreItem = ref(props.coreItem);

// Flag to prevent re-initialization loops
const isInitialized = ref(false);

// Configuration for face picker
const RECT_SIZE = 100; // 100x100px on actual image

// State
const containerRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);

// Image dimensions
const actualImageWidth = ref(0);
const actualImageHeight = ref(0);
const renderedImageHeight = ref(0);

// Loaded skin layers
const skinLayersData = ref<Record<string, any>[]>([]);

// Local position state (percentage 0-100)
const localX = ref(50);
const localY = ref(50);
const localScale = ref(1);

// Compute the scale factor between actual and rendered image
const imageScaleFactor = computed(() => {
  if (actualImageHeight.value === 0 || renderedImageHeight.value === 0) return 1;
  return renderedImageHeight.value / actualImageHeight.value;
});

// Compute the scaled rectangle size for visual display
// The rectangle represents a 100x100px crop on the ACTUAL full-size image
// We need to convert that to the preview's scale
// Then divide by face_shift_scale (when scale increases, the visible area decreases)
const scaledRectSize = computed(() => {
  return (RECT_SIZE * imageScaleFactor.value) / localScale.value;
});

// Convert percentage to pixel position in preview coordinates
const percentageToPreviewPixels = (percent: number, dimension: number): number => {
  return (percent / 100) * dimension * imageScaleFactor.value;
};

// Convert preview pixel position to percentage
const previewPixelsToPercentage = (pixels: number, dimension: number): number => {
  return (pixels / (dimension * imageScaleFactor.value)) * 100;
};

// Rectangle position style - convert percentages to preview pixels
const rectStyle = computed(() => ({
  left: `${percentageToPreviewPixels(localX.value, actualImageWidth.value)}px`,
  top: `${percentageToPreviewPixels(localY.value, actualImageHeight.value)}px`,
  width: `${scaledRectSize.value}px`,
  height: `${scaledRectSize.value}px`,
}));

// Get character image layers from skin_layers
const imageLayers = computed(() => {
  return loadCharacterImages(localItem.value, skinLayersData.value as any);
});

// Initialize local values from item.traits
onMounted(() => {
  initializeLocalValues();
  loadCharacterSkinLayers();
});

function initializeLocalValues() {
  // Skip if already initialized to prevent infinite loops
  if (isInitialized.value) return;

  // Merge skin_layers: combine core and mod layers
  if (coreItem.value?.skin_layers) {
    const coreLayers = coreItem.value.skin_layers || [];
    const modLayers = localItem.value.skin_layers || [];

    // Use Set to merge unique layers, preserving mod order first, then adding missing core layers
    const mergedLayers = [...new Set([...modLayers, ...coreLayers])];
    localItem.value.skin_layers = mergedLayers;
  } else if (!localItem.value.skin_layers) {
    localItem.value.skin_layers = [];
  }

  // Merge attributes: core attributes as defaults, mod attributes override
  if (coreItem.value?.attributes || localItem.value.attributes) {
    localItem.value.attributes = {
      ...(coreItem.value?.attributes || {}),
      ...(localItem.value.attributes || {})
    };
  } else if (!localItem.value.attributes) {
    localItem.value.attributes = {};
  }

  // Ensure traits object exists
  if (!localItem.value.traits) {
    localItem.value.traits = {};
  }

  localX.value = localItem.value.traits?.face_shift_x ?? coreItem.value?.traits?.face_shift_x ?? 50;
  localY.value = localItem.value.traits?.face_shift_y ?? coreItem.value?.traits?.face_shift_y ?? 50;
  localScale.value = localItem.value.traits?.face_shift_scale ?? coreItem.value?.traits?.face_shift_scale ?? 1;

  isInitialized.value = true;
}

// Watch for prop changes (deep clone to avoid reactivity loops)
watch(() => props.item, (newItem) => {
  isInitialized.value = false;
  localItem.value = JSON.parse(JSON.stringify(newItem));
  initializeLocalValues();
}, { deep: true });

// Watch for local changes and emit updates
watch([localX, localY, localScale], () => {
  updateItemTraits();
});

function updateItemTraits() {
  // Ensure traits object exists
  if (!localItem.value.traits) {
    localItem.value.traits = {};
  }

  localItem.value.traits.face_shift_x = localX.value;
  localItem.value.traits.face_shift_y = localY.value;
  localItem.value.traits.face_shift_scale = localScale.value;

  emit('update:item', localItem.value);
}

// Load character skin layers
async function loadCharacterSkinLayers() {
  try {
    // Load skin layers data using loadFullData for proper mod support
    const mergedData = await editor.loadFullData('character_skin_layers');
    if (mergedData && Array.isArray(mergedData)) {
      skinLayersData.value = mergedData;
    }
  } catch (error) {
    console.error('Failed to load character_skin_layers.json:', error);
  }
}

// Load image dimensions
function loadImageDimensions() {
  if (imageLayers.value.length === 0) return;

  const img = new Image();
  img.onload = () => {
    actualImageWidth.value = img.naturalWidth;
    actualImageHeight.value = img.naturalHeight;
  };
  img.src = imageLayers.value[0];
}

// Watch for image layers changes to load dimensions
watch(imageLayers, () => {
  if (imageLayers.value.length > 0) {
    loadImageDimensions();
    // Wait for images to render then get rendered size
    nextTick(() => {
      setTimeout(() => {
        updateRenderedHeight();
      }, 100);
    });
  }
});

// Track rendered image height when container is available
onMounted(() => {
  nextTick(() => {
    updateRenderedHeight();
  });
});

function updateRenderedHeight() {
  if (!containerRef.value) return;
  const img = containerRef.value.querySelector('.character-doll-image') as HTMLImageElement;
  if (img) {
    renderedImageHeight.value = img.offsetHeight;
  }
}

// Mouse event handlers
function handleMouseDown(event: MouseEvent) {
  isDragging.value = true;
  if (!containerRef.value) return;

  const rect = containerRef.value.getBoundingClientRect();
  // Convert percentage to preview pixels for drag calculation
  const currentPreviewX = percentageToPreviewPixels(localX.value, actualImageWidth.value);
  const currentPreviewY = percentageToPreviewPixels(localY.value, actualImageHeight.value);

  dragStartX.value = event.clientX - rect.left - currentPreviewX;
  dragStartY.value = event.clientY - rect.top - currentPreviewY;
  event.preventDefault();
}

function handleMouseMove(event: MouseEvent) {
  if (!isDragging.value || !containerRef.value) return;

  const rect = containerRef.value.getBoundingClientRect();
  const previewX = event.clientX - rect.left - dragStartX.value;
  const previewY = event.clientY - rect.top - dragStartY.value;

  // Convert from preview pixel coordinates to percentages
  localX.value = previewPixelsToPercentage(previewX, actualImageWidth.value);
  localY.value = previewPixelsToPercentage(previewY, actualImageHeight.value);
}

function handleMouseUp() {
  isDragging.value = false;
}

function handleScaleChange(value: number | number[] | undefined) {
  if (value === undefined) return;
  const scaleValue = Array.isArray(value) ? value[0] : value;
  localScale.value = scaleValue;
}

// Add global mouse event listeners
onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <div class="face-picker-popup">
    <div class="picker-header">
      <h3>Face Position Picker</h3>
      <p class="hint">Drag the rectangle to position the face indicator</p>
    </div>

    <div class="picker-content">
      <!-- Controls -->
      <div class="controls">
        <div class="control-group">
          <div class="control-label-row">
            <label>X Position: {{ localX.toFixed(1) }}%</label>
            <span v-if="coreItem && coreItem.traits && localItem.traits?.face_shift_x === undefined" class="core-value-indicator">
              (core: {{ (coreItem.traits.face_shift_x ?? 50).toFixed(1) }}%)
            </span>
          </div>
          <Slider :modelValue="localX" @update:modelValue="(v) => localX = Array.isArray(v) ? v[0] : v" :min="0"
            :max="100" :step="0.1" class="control-slider" />
        </div>

        <div class="control-group">
          <div class="control-label-row">
            <label>Y Position: {{ localY.toFixed(1) }}%</label>
            <span v-if="coreItem && coreItem.traits && localItem.traits?.face_shift_y === undefined" class="core-value-indicator">
              (core: {{ (coreItem.traits.face_shift_y ?? 50).toFixed(1) }}%)
            </span>
          </div>
          <Slider :modelValue="localY" @update:modelValue="(v) => localY = Array.isArray(v) ? v[0] : v" :min="0"
            :max="100" :step="0.1" class="control-slider" />
        </div>

        <div class="control-group">
          <div class="control-label-row">
            <label>Scale: {{ localScale.toFixed(2) }}</label>
            <span v-if="coreItem && coreItem.traits && localItem.traits?.face_shift_scale === undefined" class="core-value-indicator">
              (core: {{ (coreItem.traits.face_shift_scale ?? 1).toFixed(2) }})
            </span>
          </div>
          <Slider :modelValue="localScale" @update:modelValue="handleScaleChange" :min="0.1" :max="3" :step="0.01"
            class="control-slider" />
        </div>

      </div>

      <!-- Preview container -->
      <div class="preview-container" ref="containerRef">
        <!-- No Skin Layers Message -->
        <div v-if="imageLayers.length === 0" class="no-layers-message">
          <p class="warning-text">⚠️ Select Character Image Layers in the <strong>skin_layers</strong> field.</p>
          <p class="info-text">Note: All image layer pictures should have the same size dimensions.</p>
        </div>

        <!-- Character Doll -->
        <div v-else class="character-doll-wrapper">
          <div class="character-doll">
            <img v-for="(image, index) in imageLayers" :key="index" :src="image" class="character-doll-image"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
              @load="index === 0 ? updateRenderedHeight() : null" />
          </div>

          <!-- Draggable Purple Rectangle -->
          <div class="face-selector-rect" :style="rectStyle" @mousedown="handleMouseDown">
            <div class="rect-label">FACE</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.face-picker-popup {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
}

.picker-header {
  padding: 0.5rem;
  background-color: #f5f5f5;
  border-radius: 4px;
}

.picker-header h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
  color: #333;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: #666;
  font-style: italic;
}

.picker-content {
  display: flex;
  gap: 1.5rem;
  flex: 1;
  overflow: hidden;
}

.controls {
  width: 250px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow-y: auto;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.control-group label {
  font-size: 0.9rem;
  font-weight: 500;
  color: #333;
}

.control-slider {
  width: 100%;
}

.control-info {
  margin-top: auto;
  padding: 1rem;
  background-color: #e3f2fd;
  border-left: 4px solid #2196F3;
  border-radius: 4px;
}

.control-info p {
  margin: 0.25rem 0;
  font-size: 0.85rem;
  font-family: var(--font-family-mono);
}

.control-info strong {
  font-size: 0.9rem;
}

.preview-container {
  flex: 1;
  overflow: auto;
  background-color: #fafafa;
  border: 1px solid #ddd;
  border-radius: 4px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.no-layers-message {
  text-align: center;
  padding: 2rem;
}

.warning-text {
  color: #f44336;
  margin-bottom: 1rem;
  font-weight: 500;
}

.info-text {
  font-size: 0.875rem;
  color: #666;
}

.character-doll-wrapper {
  position: relative;
  display: inline-block;
}

.character-doll {
  position: relative;
  display: inline-block;
}

.character-doll-image {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  width: auto;
  height: auto;
}

.character-doll-image:not(:first-child) {
  position: absolute;
  top: 0;
  left: 0;
}

.face-selector-rect {
  position: absolute;
  border: 3px solid #9C27B0;
  background-color: rgba(156, 39, 176, 0.1);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  user-select: none;
}

.face-selector-rect:active {
  cursor: grabbing;
}

.rect-label {
  color: #9C27B0;
  font-weight: bold;
  font-size: 0.75rem;
  text-shadow: 0 0 2px white;
  pointer-events: none;
}

/* Core value indicators for mod support */
.core-value-indicator {
  color: var(--p-surface-500, #6b7280);
  font-size: 0.8rem;
  font-style: italic;
  margin-left: 0.5rem;
}

.control-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
