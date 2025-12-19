<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import type { EditorCustomPopupProps } from '../../editor';
import type { CharacterSkinLayerObject } from '../../../schemas/characterSkinLayerSchema';
import Select from 'primevue/select';
import Button from 'primevue/button';

const props = defineProps<EditorCustomPopupProps>();
const emit = defineEmits<{ 'update:item': [item: any] }>();

// Local copy for editing
const localItem = ref<CharacterSkinLayerObject>(props.item);

// Image selection - single select (to edit one mask at a time)
const selectedImageKey = ref<string>('');
const imageOptions = computed(() => {
  if (!localItem.value?.images) return [];
  return Object.keys(localItem.value.images).map(key => ({
    label: key,
    value: key
  }));
});

function getImagePath(key: string): string {
  const images = localItem.value?.images as Record<string, string> | undefined;
  return images?.[key] || '';
}

// Polygon points (in percentage 0-100)
const polygonPoints = ref<Array<{ x: number; y: number }>>([]);

// Canvas ref for mouse coordinate calculations
const canvasRef = ref<HTMLElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);

// Reactive trigger to force re-render when image loads
const imageLoaded = ref(0);

// Calculate image bounds fresh (accounting for object-fit: contain)
function getImageBounds(): { left: number; top: number; width: number; height: number } | null {
  // Access imageLoaded to create reactive dependency
  void imageLoaded.value;
  if (!imageRef.value || !canvasRef.value) return null;

  const img = imageRef.value;
  const container = canvasRef.value;

  // Wait for image to load
  if (!img.naturalWidth || !img.naturalHeight) return null;

  const containerRect = container.getBoundingClientRect();
  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;

  const imgAspect = img.naturalWidth / img.naturalHeight;
  const containerAspect = containerWidth / containerHeight;

  let renderedWidth: number;
  let renderedHeight: number;

  if (imgAspect > containerAspect) {
    // Image is wider than container - width is constrained
    renderedWidth = containerWidth;
    renderedHeight = containerWidth / imgAspect;
  } else {
    // Image is taller than container - height is constrained
    renderedHeight = containerHeight;
    renderedWidth = containerHeight * imgAspect;
  }

  // Center the image within the container
  const left = (containerWidth - renderedWidth) / 2;
  const top = (containerHeight - renderedHeight) / 2;

  return { left, top, width: renderedWidth, height: renderedHeight };
}

// Convert client coordinates to image-relative percentage (0-100)
function clientToImagePercent(clientX: number, clientY: number): { x: number; y: number } | null {
  const bounds = getImageBounds();
  if (!bounds || !canvasRef.value) return null;

  const containerRect = canvasRef.value.getBoundingClientRect();
  const relativeX = clientX - containerRect.left - bounds.left;
  const relativeY = clientY - containerRect.top - bounds.top;

  const x = (relativeX / bounds.width) * 100;
  const y = (relativeY / bounds.height) * 100;

  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

// Convert image percentage to container-relative position for display
function imagePercentToContainerPercent(imgX: number, imgY: number): { left: string; top: string } {
  const bounds = getImageBounds();
  if (!bounds || !canvasRef.value) {
    return { left: '0%', top: '0%' };
  }

  const containerRect = canvasRef.value.getBoundingClientRect();
  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;

  // Convert image percentage to pixel position within container
  const pixelX = bounds.left + (imgX / 100) * bounds.width;
  const pixelY = bounds.top + (imgY / 100) * bounds.height;

  // Convert to container percentage
  const containerPercentX = (pixelX / containerWidth) * 100;
  const containerPercentY = (pixelY / containerHeight) * 100;

  return {
    left: containerPercentX + '%',
    top: containerPercentY + '%'
  };
}

// Get SVG overlay style with percentage positioning
function getOverlayStyle(): Record<string, string> {
  const bounds = getImageBounds();
  if (!bounds || !canvasRef.value) {
    return { left: '0%', top: '0%', width: '100%', height: '100%' };
  }

  const containerRect = canvasRef.value.getBoundingClientRect();
  const containerWidth = containerRect.width;
  const containerHeight = containerRect.height;

  return {
    left: (bounds.left / containerWidth * 100) + '%',
    top: (bounds.top / containerHeight * 100) + '%',
    width: (bounds.width / containerWidth * 100) + '%',
    height: (bounds.height / containerHeight * 100) + '%'
  };
}

// Track if we're loading data to prevent auto-save loops
let isLoading = false;

// Load mask for currently selected image
function loadMaskForSelectedImage() {
  isLoading = true;
  const masks = localItem.value?.masks as Record<string, string> | undefined;
  const maskValue = masks?.[selectedImageKey.value];
  if (maskValue) {
    parsePolygonString(maskValue);
  } else {
    polygonPoints.value = [];
  }
  isLoading = false;
}

// Save current mask to the selected image key
function saveMaskForSelectedImage() {
  if (isLoading || !selectedImageKey.value) return;

  const masks = { ...(localItem.value?.masks as Record<string, string> || {}) };
  const polygonValue = cssPolygonString.value;

  if (polygonValue) {
    masks[selectedImageKey.value] = polygonValue;
  } else {
    delete masks[selectedImageKey.value];
  }

  localItem.value = { ...localItem.value, masks } as CharacterSkinLayerObject;
  emit('update:item', localItem.value);
}

// Initialize on mount
onMounted(() => {
  // Select first image by default
  if (imageOptions.value.length > 0) {
    selectedImageKey.value = imageOptions.value[0].value;
    loadMaskForSelectedImage();
  }
});

// When selected image changes, load its mask
watch(selectedImageKey, () => {
  loadMaskForSelectedImage();
});

// Auto-save when polygon changes (flush: 'sync' ensures isLoading check works)
watch(polygonPoints, () => {
  saveMaskForSelectedImage();
}, { deep: true, flush: 'sync' });

function parsePolygonString(str: string) {
  // Parse "polygon(x1% y1%, x2% y2%, ...)"
  const match = str.match(/polygon\(([^)]+)\)/);
  if (match) {
    const points = match[1].split(',').map(p => {
      const [x, y] = p.trim().split(/\s+/);
      return {
        x: parseFloat(x),
        y: parseFloat(y)
      };
    });
    polygonPoints.value = points;
  } else {
    polygonPoints.value = [];
  }
}

// SVG points string (no % - using viewBox 0 0 100 100)
const svgPointsString = computed(() => {
  return polygonPoints.value
    .map(p => `${p.x},${p.y}`)
    .join(' ');
});

// CSS polygon string
const cssPolygonString = computed(() => {
  if (polygonPoints.value.length < 3) return '';
  const points = polygonPoints.value
    .map(p => `${p.x}% ${p.y}%`)
    .join(', ');
  return `polygon(${points})`;
});

// Add point on click (uses image-relative coordinates)
function addPoint(event: MouseEvent) {
  const point = clientToImagePercent(event.clientX, event.clientY);
  if (point) {
    polygonPoints.value.push(point);
  }
}

// Drag handling
let dragIndex = -1;

function startDrag(index: number, event: MouseEvent) {
  event.stopPropagation();
  dragIndex = index;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
}

function onDrag(event: MouseEvent) {
  if (dragIndex < 0) return;
  const point = clientToImagePercent(event.clientX, event.clientY);
  if (point) {
    polygonPoints.value[dragIndex] = {
      x: Math.max(0, Math.min(100, point.x)),
      y: Math.max(0, Math.min(100, point.y))
    };
  }
}

function stopDrag() {
  dragIndex = -1;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
}

// Remove point (right-click)
function removePoint(index: number) {
  polygonPoints.value.splice(index, 1);
}

function clearPoints() {
  polygonPoints.value = [];
}

// Copy current mask to all image variants
function copyToAll() {
  if (!cssPolygonString.value) return;

  const masks = { ...(localItem.value?.masks as Record<string, string> || {}) };
  for (const option of imageOptions.value) {
    masks[option.value] = cssPolygonString.value;
  }

  localItem.value = { ...localItem.value, masks } as CharacterSkinLayerObject;
  emit('update:item', localItem.value);
}

// Watch for prop changes from parent (only update localItem, don't reload polygon)
// Polygon state is managed locally and saved on change
watch(() => props.item, (newItem) => {
  // Only update localItem reference, don't reload mask to avoid overwriting local edits
  localItem.value = newItem;
}, { deep: true });

// Cleanup
onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
});
</script>

<template>
  <div class="mask-editor-popup">
    <!-- Image selector -->
    <div class="image-selector">
      <label>Edit mask for:</label>
      <Select v-model="selectedImageKey" :options="imageOptions" optionLabel="label" optionValue="value"
        placeholder="Select image" class="image-select" />
      <Button label="Clear" @click="clearPoints" severity="secondary" size="small" />
      <Button label="Copy to All" @click="copyToAll" severity="secondary" size="small" :disabled="!cssPolygonString" />
    </div>

    <!-- Canvas area with image + polygon overlay -->
    <div class="editor-canvas" ref="canvasRef">
      <!-- Base image (single) -->
      <img v-if="selectedImageKey" ref="imageRef" :src="getImagePath(selectedImageKey)" class="preview-image"
        draggable="false" @load="imageLoaded++" />

      <!-- SVG polygon overlay - positioned to match actual image bounds -->
      <svg class="polygon-overlay" :style="getOverlayStyle()" viewBox="0 0 100 100" preserveAspectRatio="none"
        @click="addPoint">
        <polygon v-if="polygonPoints.length >= 3" :points="svgPointsString" fill="rgba(255, 0, 0, 0.3)" stroke="red"
          stroke-width="0.5" vector-effect="non-scaling-stroke" />
        <!-- Lines connecting points when < 3 points -->
        <polyline v-else-if="polygonPoints.length >= 2" :points="svgPointsString" fill="none" stroke="red"
          stroke-width="0.5" stroke-dasharray="1,1" vector-effect="non-scaling-stroke" />
      </svg>
      <!-- Draggable point handles - positioned relative to container but matching image coordinates -->
      <div v-for="(point, index) in polygonPoints" :key="index" class="point-handle"
        :style="imagePercentToContainerPercent(point.x, point.y)" @mousedown="startDrag(index, $event)"
        @contextmenu.prevent="removePoint(index)" />
    </div>

    <!-- Output preview -->
    <div class="output-preview">
      <code v-if="cssPolygonString">{{ cssPolygonString }}</code>
      <span v-else class="no-polygon">Click on the canvas to add polygon points (min 3)</span>
    </div>

    <!-- Instructions -->
    <div class="instructions">
      <p><strong>Click</strong> canvas to add points</p>
      <p><strong>Drag</strong> points to adjust</p>
      <p><strong>Right-click</strong> point to remove</p>
    </div>
  </div>
</template>

<style scoped>
.mask-editor-popup {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
}

.image-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.image-selector label {
  font-weight: 500;
  white-space: nowrap;
}

.image-select {
  flex: 1;
  max-width: 300px;
}

.editor-canvas {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  background: linear-gradient(45deg, #1a1a1a 25%, #2a2a2a 25%, #2a2a2a 50%, #1a1a1a 50%, #1a1a1a 75%, #2a2a2a 75%, #2a2a2a);
  background-size: 20px 20px;
  border: 1px solid #666;
  border-radius: 4px;
  overflow: hidden;
}

.preview-image {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.polygon-overlay {
  position: absolute;
  cursor: crosshair;
}

.point-handle {
  position: absolute;
  width: 16px;
  height: 16px;
  margin-left: -8px;
  margin-top: -8px;
  background: white;
  border: 2px solid red;
  border-radius: 50%;
  cursor: grab;
  transition: transform 0.1s ease;
  z-index: 10;
}

.point-handle:hover {
  transform: scale(1.25);
}

.point-handle:active {
  cursor: grabbing;
}

.output-preview {
  padding: 0.75rem;
  background: #222;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9rem;
  color: #0f0;
  word-break: break-all;
  flex-shrink: 0;
}

.no-polygon {
  color: #888;
  font-style: italic;
}

.instructions {
  display: flex;
  gap: 2rem;
  padding: 0.5rem;
  background: #f5f5f5;
  border-radius: 4px;
  font-size: 0.85rem;
  color: #666;
  flex-shrink: 0;
}

.instructions p {
  margin: 0;
}
</style>
