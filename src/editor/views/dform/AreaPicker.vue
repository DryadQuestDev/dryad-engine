<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import Dialog from 'primevue/dialog';
import Slider from 'primevue/slider';
import Button from 'primevue/button';
import { Editor } from '../../editor';
import { ITEM_SLOT_SIZE_PERCENT } from '../../../global/global';

const editor = Editor.getInstance();

// Configuration type for picker modes
type PickerMode = 'face' | 'slot';

interface PickerConfig {
  mode: PickerMode;
  title: string;
  xKey: string;
  yKey: string;
  scaleKey: string | null;
  defaultScale: number;
  showScaleSlider: boolean;
  rectLabel: string;
  helpText: string;
  dataPath: string; // Path to the data object (e.g., 'traits' for face, '' for slot)
}

const props = defineProps<{
  visible: boolean;
  characterData: Record<string, any>;
  mode?: PickerMode;
  // The data object that contains the x, y, scale values
  // For face mode: this would be itemData.traits
  // For slot mode: this would be the formData object
  dataObject?: Record<string, any>;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
  'confirm': [data: { x: number; y: number; scale: number }];
}>();

// Configuration objects for different picker modes
const pickerConfigs: Record<PickerMode, PickerConfig> = {
  face: {
    mode: 'face',
    title: 'Character Face Picker',
    xKey: 'face_shift_x',
    yKey: 'face_shift_y',
    scaleKey: 'face_shift_scale',
    defaultScale: 1,
    showScaleSlider: true,
    rectLabel: 'FACE',
    helpText: 'Drag the purple rectangle to select the face area',
    dataPath: 'traits'
  },
  slot: {
    mode: 'slot',
    title: 'Item Slot Picker',
    xKey: 'x',
    yKey: 'y',
    scaleKey: null,
    defaultScale: 1,
    showScaleSlider: false,
    rectLabel: 'SLOT',
    helpText: 'Drag the purple rectangle to position the item slot',
    dataPath: ''
  }
};

// Get current configuration
const currentConfig = computed(() => pickerConfigs[props.mode || 'face']);

// Get the data source based on mode
const dataSource = computed(() => {
  if (!props.dataObject) return null;
  return props.dataObject;
});

// Get current values from data source
const getCurrentValue = (key: string, defaultValue: any = 0) => {
  if (!dataSource.value) return defaultValue;
  return dataSource.value[key] ?? defaultValue;
};

// Local state for positioning (working copy)
// Values are in percentages (0-100)
const localX = ref(0);
const localY = ref(0);
const localScale = ref(1);

// Initialize local state when dialog opens
watch(() => props.visible, (isVisible) => {
  if (isVisible) {
    const config = currentConfig.value;
    localX.value = getCurrentValue(config.xKey, 0);
    localY.value = getCurrentValue(config.yKey, 0);
    localScale.value = config.scaleKey ? getCurrentValue(config.scaleKey, config.defaultScale) : config.defaultScale;
  }
});

// Container and rectangle refs
const containerRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);

// Image dimensions
const actualImageWidth = ref(0);
const actualImageHeight = ref(0);
const renderedImageHeight = ref(0);

// Rectangle size (100x100 to match the face display size)
const RECT_SIZE = 100;

// Compute the scale factor between actual and rendered image
const imageScaleFactor = computed(() => {
  if (actualImageHeight.value === 0 || renderedImageHeight.value === 0) return 1;
  return renderedImageHeight.value / actualImageHeight.value;
});

// Compute the scaled rectangle size for visual display
// The rectangle represents a 100x100px crop on the ACTUAL full-size image
// We need to convert that to the preview's scale
// Then divide by face_shift_scale (when scale increases, the visible area decreases)
// Formula: (100px on actual image) * (preview scale factor) / face_shift_scale
// For slot mode: uses ITEM_SLOT_SIZE_PERCENT of container height (matching game's item slot size)
const scaledRectSize = computed(() => {
  if (currentConfig.value.mode === 'slot') {
    // Item slots in the game use ITEM_SLOT_SIZE_PERCENT width of container, with aspect-ratio 1:1
    // So we use the same percentage of the rendered height
    return renderedImageHeight.value * ITEM_SLOT_SIZE_PERCENT;
  }
  return (RECT_SIZE * imageScaleFactor.value) / localScale.value;
});

// Convert percentage to pixel position in preview coordinates
const percentageToPreviewPixels = (percent: number, dimension: number): number => {
  // For slot mode, use container height directly (percentages are relative to container)
  // For face mode, use actual image dimensions scaled to preview
  if (currentConfig.value.mode === 'slot') {
    return (percent / 100) * renderedImageHeight.value;
  }
  return (percent / 100) * dimension * imageScaleFactor.value;
};

// Convert preview pixel position to percentage
const previewPixelsToPercentage = (pixels: number, dimension: number): number => {
  // For slot mode, convert relative to container height
  // For face mode, convert relative to actual image dimensions
  if (currentConfig.value.mode === 'slot') {
    return (pixels / renderedImageHeight.value) * 100;
  }
  return (pixels / (dimension * imageScaleFactor.value)) * 100;
};

// Load skin layer data from character_skin_layers file
const skinLayersData = ref<Record<string, any>[]>([]);

// Watch for when the dialog opens to load skin layer data
watch(() => props.visible, async (isVisible) => {
  if (isVisible) {
    try {
      const game = editor.state.selectedGame;
      const mod = editor.state.selectedMod;
      if (!game || !mod) return;

      const basePath = `games_files/${game}/${mod}`;
      const mergedData = await editor.loadAndMergeFromFileData('character_skin_layers', basePath);
      if (mergedData && Array.isArray(mergedData)) {
        skinLayersData.value = mergedData;
      }
    } catch (error) {
      console.error('Failed to load character_skin_layers.json:', error);
    }
  }
});

// Warnings for missing attributes
const attributeWarnings = ref<string[]>([]);

// Get character image layers from skin_layers
const imageLayers = computed(() => {
  const skinLayerIds = props.characterData?.skin_layers || [];
  if (!Array.isArray(skinLayerIds)) return [];
  if (skinLayersData.value.length === 0) return [];

  const attributes = props.characterData?.attributes || {};

  // Build image layers based on skin_layers and attributes
  const layersWithZIndex: { path: string; zIndex: number }[] = [];
  const warnings: string[] = [];

  for (const layerId of skinLayerIds) {
    // Find the skin layer definition
    const skinLayer = skinLayersData.value.find((layer: any) => layer.id === layerId);
    if (!skinLayer || !skinLayer.images) continue;

    // Build the image key from the layer's attributes
    // Example: for belly layer with attributes [belly_size, skin_color]
    // and character attributes {belly_size: 'normal', skin_color: 'white'}
    // we build key: "belly_normal_white"
    const attributeValues: string[] = [layerId];
    const missingAttributes: string[] = [];

    if (skinLayer.attributes && Array.isArray(skinLayer.attributes)) {
      for (const attrName of skinLayer.attributes) {
        const attrValue = attributes[attrName];
        if (attrValue) {
          attributeValues.push(attrValue);
        } else {
          missingAttributes.push(attrName);
        }
      }
    }

    // If any attributes are missing, skip this layer and add a warning
    if (missingAttributes.length > 0) {
      warnings.push(`Layer "<b>${layerId}</b>" requires attribute(s): <b>${missingAttributes.join(', ')}</b>`);
      continue;
    }

    const imageKey = attributeValues.join('_');
    const imagePath = skinLayer.images[imageKey];

    if (imagePath) {
      layersWithZIndex.push({
        path: imagePath,
        zIndex: skinLayer.z_index ?? 0
      });
    }
  }

  // Update warnings
  attributeWarnings.value = warnings;

  // Sort by z_index (lower values first, rendered behind higher values)
  layersWithZIndex.sort((a, b) => a.zIndex - b.zIndex);

  return layersWithZIndex.map(layer => layer.path);
});

// Character art positioning traits from attributes object
const attributes = computed(() => props.characterData?.attributes || {});

const artDx = computed(() => {
  const dx = attributes.value?.art_dx;
  return dx !== undefined ? dx + '%' : '0%';
});

const artDy = computed(() => {
  const dy = attributes.value?.art_dy;
  return dy !== undefined ? dy + '%' : '0%';
});

const artScale = computed(() => {
  return attributes.value?.art_scale || 1;
});

// Load the first image to get actual dimensions
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

// Watch for container size changes and visible state
watch(() => props.visible, (isVisible) => {
  if (isVisible) {
    nextTick(() => {
      updateRenderedHeight();
    });
  }
});

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

function confirmChanges() {
  // Update the data object directly based on config
  if (dataSource.value) {
    const config = currentConfig.value;
    dataSource.value[config.xKey] = localX.value;
    dataSource.value[config.yKey] = localY.value;
    if (config.scaleKey) {
      dataSource.value[config.scaleKey] = localScale.value;
    }
  }

  // Still emit for backward compatibility and to trigger reactivity
  emit('confirm', {
    x: localX.value,
    y: localY.value,
    scale: localScale.value
  });
  closeDialog();
}

function cancelChanges() {
  closeDialog();
}

// Add global mouse event listeners
onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});

// Close dialog
function closeDialog() {
  emit('update:visible', false);
}

// Rectangle position style - convert percentages to preview pixels
const rectStyle = computed(() => ({
  left: `${percentageToPreviewPixels(localX.value, actualImageWidth.value)}px`,
  top: `${percentageToPreviewPixels(localY.value, actualImageHeight.value)}px`,
  width: `${scaledRectSize.value}px`,
  height: `${scaledRectSize.value}px`,
}));
</script>

<template>
  <Dialog :visible="visible" @update:visible="emit('update:visible', $event)" modal :header="currentConfig.title"
    :style="{ width: '90vw', height: '90vh' }"
    :contentStyle="{ height: 'calc(90vh - 120px)', display: 'flex', flexDirection: 'column' }">

    <!-- Controls -->
    <div class="controls-section">
      <div v-if="currentConfig.showScaleSlider" class="scale-control">
        <label>Scale Factor: {{ localScale.toFixed(2) }}</label>
        <Slider :modelValue="localScale" @update:modelValue="handleScaleChange" :min="0.1" :max="3" :step="0.01"
          class="w-full" />
      </div>
      <div class="info-text">
        <p>Position: X={{ localX.toFixed(2) }}%, Y={{ localY.toFixed(2) }}%</p>
        <!--<p>Rectangle size: {{ scaledRectSize.toFixed(1) }}px (Actual: {{ actualImageHeight }}, Rendered: {{
          renderedImageHeight }}, Factor: {{ imageScaleFactor.toFixed(3) }})</p>-->
        <p class="help-text">{{ currentConfig.helpText }}</p>
      </div>

      <!-- Attribute Warnings -->
      <div v-if="attributeWarnings.length > 0" class="warnings-section">
        <p class="warnings-title">⚠️ Missing Attributes:</p>
        <ul class="warnings-list">
          <li v-for="(warning, index) in attributeWarnings" :key="index" v-html="warning"></li>
        </ul>
      </div>
    </div>

    <!-- Preview Container -->
    <div class="preview-container" ref="containerRef">
      <!-- No Skin Layers Message -->
      <div v-if="imageLayers.length === 0" class="no-layers-message">
        <p class="warning-text">⚠️ Please select Character Image Layers in the <strong>skin_layers</strong> field.</p>
        <p class="info-text">Note: All image layer pictures should have the same size dimensions.</p>
      </div>

      <!-- Character Doll -->
      <div v-else class="character-doll-wrapper">
        <div class="character-doll">
          <img v-for="(image, index) in imageLayers" :key="index" :src="image"
            class="character-doll-image" @error="($event.target as HTMLImageElement).style.display = 'none'"
            @load="index === 0 ? updateRenderedHeight() : null" />
        </div>

        <!-- Draggable Purple Rectangle -->
        <div class="face-selector-rect" :style="rectStyle" @mousedown="handleMouseDown">
          <div class="rect-label">{{ currentConfig.rectLabel }}</div>
        </div>
      </div>
    </div>

    <!-- Footer Buttons -->
    <template #footer>
      <div class="footer-buttons">
        <Button label="Cancel" severity="secondary" @click="cancelChanges" />
        <Button label="Confirm" @click="confirmChanges" />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.controls-section {
  padding: 1rem;
  background: var(--p-surface-50);
  border-radius: var(--p-border-radius);
  margin-bottom: 1rem;
}

.scale-control {
  margin-bottom: 1rem;
}

.scale-control label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.info-text {
  font-size: 0.875rem;
  color: var(--p-text-color-secondary);
}

.help-text {
  color: var(--p-primary-color);
  font-style: italic;
  margin-top: 0.25rem;
}

.warnings-section {
  margin-top: 1rem;
  padding: 0.75rem;
  background: var(--p-orange-50);
  border: 1px solid var(--p-orange-200);
  border-radius: var(--p-border-radius);
}

.warnings-title {
  font-weight: 600;
  color: var(--p-orange-600);
  margin-bottom: 0.5rem;
}

.warnings-list {
  margin: 0;
  padding-left: 1.5rem;
  color: var(--p-orange-700);
  font-size: 0.875rem;
}

.warnings-list li {
  margin-bottom: 0.25rem;
}

.preview-container {
  position: relative;
  flex: 1;
  background: var(--p-surface-100);
  border: 2px solid var(--p-surface-300);
  border-radius: var(--p-border-radius);
  overflow: hidden;
  min-height: 500px;
}

.no-layers-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 2rem;
  text-align: center;
}

.no-layers-message .warning-text {
  font-size: 1.125rem;
  color: var(--p-orange-500);
  margin-bottom: 1rem;
}

.no-layers-message .info-text {
  font-size: 0.875rem;
  color: var(--p-text-color-secondary);
  font-style: italic;
}

.character-doll-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
}

.character-doll {
  position: absolute;
  height: 100%;
  width: 100%;
  transform: translate(v-bind("artDx"), v-bind("artDy")) scale(v-bind("artScale"));
  transform-origin: center;
  pointer-events: none;
}

.character-doll-image {
  position: absolute;
  height: 100%;
  user-select: none;
  pointer-events: none;
}

.face-selector-rect {
  position: absolute;
  border: 3px solid rgba(147, 51, 234, 0.8);
  background: rgba(147, 51, 234, 0.2);
  cursor: move;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s;
}

.face-selector-rect:hover {
  border-color: rgba(147, 51, 234, 1);
  background: rgba(147, 51, 234, 0.3);
}

.rect-label {
  color: white;
  font-weight: bold;
  font-size: 0.75rem;
  text-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
  pointer-events: none;
  user-select: none;
}

.w-full {
  width: 100%;
}

.footer-buttons {
  display: flex;
  gap: 0.5rem;
  width: 100%;
}
</style>

<style>
.p-dialog-footer {
  justify-content: flex-start !important;
}
</style>
