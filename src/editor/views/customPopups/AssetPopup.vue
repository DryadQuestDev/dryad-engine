<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { Editor } from '../../editor';
import type { EditorCustomPopupProps } from '../../editor';
import type { AssetObject } from '../../../schemas/assetSchema';
import { AssetSchema } from '../../../schemas/assetSchema';
import BackgroundAsset from '../../../game/views/BackgroundAsset.vue';
import Button from 'primevue/button';
import Slider from 'primevue/slider';
import Select from 'primevue/select';

const props = defineProps<EditorCustomPopupProps>();
const emit = defineEmits<{ 'update:item': [item: any] }>();

const editor = Editor.getInstance();

// Local copy for editing
const localItem = ref<AssetObject>(props.item);

// Core item reference (from parent)
const coreItem = ref(props.coreItem);

// Preview canvas
const canvasRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);

// Animation preview state
const componentKey = ref(0);
const isPlayingEnter = ref(false);
const isPlayingExit = ref(false);
const isIdlePreview = ref(false);

// Animated position refs
const animatedX = ref(localItem.value.x ?? 0);
const animatedY = ref(localItem.value.y ?? 0);

// Get asset file path based on type
const assetPath = computed(() => {
  const type = localItem.value.type ?? 'image';
  if (type === 'image') {
    return localItem.value.file_image ?? undefined;
  } else if (type === 'video') {
    return localItem.value.file_video ?? undefined;
  }
  return undefined;
});

// Asset type checks
const isImageAsset = computed(() => (localItem.value.type ?? 'image') === 'image');
const isVideoAsset = computed(() => localItem.value.type === 'video');
const isSpineAsset = computed(() => localItem.value.type === 'spine');

// Create preview asset with controlled animation state
const previewAsset = computed<AssetObject>(() => ({
  ...localItem.value,
  // Use animated position from dragging
  x: animatedX.value,
  y: animatedY.value,
  // Control enter transition - only play when button clicked
  enter: isPlayingEnter.value ? localItem.value.enter : 'none',
  // Control exit transition - only play when button clicked
  exit: isPlayingExit.value ? localItem.value.exit : 'none',
  // Control idle - only play when preview is active
  idle: isIdlePreview.value ? localItem.value.idle : 'none',
  // Set isRemoving for exit preview (triggers exit on mount)
  isRemoving: isPlayingExit.value,
}));


// Load defaults from core on mount
onMounted(() => {
  // Initialize position with core defaults
  animatedX.value = localItem.value.x ?? coreItem.value?.x ?? 0;
  animatedY.value = localItem.value.y ?? coreItem.value?.y ?? 0;

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
  if (localItem.value.blur === undefined && coreItem.value?.blur !== undefined) {
    localItem.value.blur = coreItem.value.blur;
  }

  // Initialize enter animation properties with core defaults
  if (localItem.value.enter_duration === undefined && coreItem.value?.enter_duration !== undefined) {
    localItem.value.enter_duration = coreItem.value.enter_duration;
  }
  if (localItem.value.enter_delay === undefined && coreItem.value?.enter_delay !== undefined) {
    localItem.value.enter_delay = coreItem.value.enter_delay;
  }
  // Initialize exit animation properties with core defaults
  if (localItem.value.exit_duration === undefined && coreItem.value?.exit_duration !== undefined) {
    localItem.value.exit_duration = coreItem.value.exit_duration;
  }
  // Initialize idle animation properties with core defaults
  if (localItem.value.idle_duration === undefined && coreItem.value?.idle_duration !== undefined) {
    localItem.value.idle_duration = coreItem.value.idle_duration;
  }
  if (localItem.value.idle_intensity === undefined && coreItem.value?.idle_intensity !== undefined) {
    localItem.value.idle_intensity = coreItem.value.idle_intensity;
  }
});

// Animation options from schema
const enterOptions = AssetSchema.enter.options;
const exitOptions = AssetSchema.exit.options;
const idleOptions = AssetSchema.idle.options;
const easeOptions = AssetSchema.enter_ease.options;
const fitModeOptions = AssetSchema.fit_mode.options;

// Animation handlers - use component key to trigger remount
function handlePlayEnter() {
  if (!localItem.value.enter || localItem.value.enter === 'none') return;

  // Stop other animations
  isIdlePreview.value = false;
  isPlayingExit.value = false;

  // Enable enter transition and remount component
  isPlayingEnter.value = true;
  componentKey.value++;

  // Reset transition flag after animation completes
  const duration = (localItem.value.enter_duration ?? 0.5) * 1000;
  const delay = (localItem.value.enter_delay ?? 0) * 1000;
  setTimeout(() => {
    isPlayingEnter.value = false;
  }, duration + delay + 100);
}

function handlePlayExit() {
  if (!localItem.value.exit || localItem.value.exit === 'none') return;

  // Stop other animations
  isIdlePreview.value = false;
  isPlayingEnter.value = false;

  // Trigger exit via isRemoving change (watch will detect and play animation)
  // Don't remount - this prevents the blink
  isPlayingExit.value = true;

  // Reset and remount after animation completes to restore visibility
  const duration = (localItem.value.exit_duration ?? 0.5) * 1000;
  setTimeout(() => {
    isPlayingExit.value = false;
    componentKey.value++; // Remount to restore original state
  }, duration + 100);
}

function handleStartIdle() {
  if (!localItem.value.idle || localItem.value.idle === 'none') return;

  // Stop transitions if playing
  isPlayingEnter.value = false;
  isPlayingExit.value = false;

  // Enable idle and remount to start animation
  isIdlePreview.value = true;
  componentKey.value++;
}

function handleStopIdle() {
  // Disable idle and remount to stop animation
  isIdlePreview.value = false;
  componentKey.value++;
}

// Dragging handlers
function handleMouseDown(event: MouseEvent) {
  if (!canvasRef.value) return;
  isDragging.value = true;

  const rect = canvasRef.value.getBoundingClientRect();
  const x = animatedX.value;
  const y = animatedY.value;

  dragStartX.value = (event.clientX - rect.left) - (x / 100) * rect.width;
  dragStartY.value = (event.clientY - rect.top) - (y / 100) * rect.height;

  event.preventDefault();
}

function handleMouseMove(event: MouseEvent) {
  if (isDragging.value && canvasRef.value) {
    const rect = canvasRef.value.getBoundingClientRect();
    const newX = ((event.clientX - rect.left - dragStartX.value) / rect.width) * 100;
    const newY = ((event.clientY - rect.top - dragStartY.value) / rect.height) * 100;

    animatedX.value = newX;
    animatedY.value = newY;

    localItem.value.x = newX;
    localItem.value.y = newY;
    emit('update:item', localItem.value);
  }
}

function handleMouseUp() {
  isDragging.value = false;
}

// Update local item when position changes
function updateLocalItem() {
  localItem.value.x = animatedX.value;
  localItem.value.y = animatedY.value;
  emit('update:item', localItem.value);
}

// Watch for prop changes
watch(() => props.item, (newItem) => {
  localItem.value = newItem;
  animatedX.value = newItem.x ?? coreItem.value?.x ?? 0;
  animatedY.value = newItem.y ?? coreItem.value?.y ?? 0;
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
});
</script>

<template>
  <div class="asset-popup">
    <!-- Main Content -->
    <div class="popup-content">
      <!-- Left: Preview Canvas -->
      <div class="preview-section">
        <div class="preview-header">
          <h3>Preview Canvas (16:9)</h3>
        </div>

        <div class="preview-canvas-container">
          <div ref="canvasRef" class="preview-canvas" @mousedown="handleMouseDown">
            <!-- Asset Preview using BackgroundAsset component -->
            <div v-if="assetPath" class="asset-wrapper">
              <BackgroundAsset :key="componentKey" :asset="previewAsset" />
            </div>

            <!-- Spine asset placeholder -->
            <div v-else-if="isSpineAsset" class="asset-spine">
              <p style="color: white;">Spine preview not available in editor</p>
            </div>

            <!-- No Asset Message -->
            <div v-else class="no-asset-message">
              <p>No asset file selected</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Right: Controls Panel -->
      <div class="controls-section">
        <!-- Animation Controls -->
        <div class="control-group">
          <h4>Animation Preview</h4>
          <div class="animation-selects">
            <!-- Enter Animation -->
            <div class="animation-group">
              <div class="animation-select-item">
                <label><strong>Enter:</strong></label>
                <Select v-model="localItem.enter" :options="enterOptions" placeholder="Select enter animation"
                  class="animation-dropdown" />
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
                  <Select v-model="localItem.enter_ease" :options="easeOptions" placeholder="Select ease"
                    class="animation-dropdown" />
                </div>
              </div>
            </div>

            <!-- Exit Animation -->
            <div class="animation-group">
              <div class="animation-select-item">
                <label><strong>Exit:</strong></label>
                <Select v-model="localItem.exit" :options="exitOptions" placeholder="Select exit animation"
                  class="animation-dropdown" />
              </div>
              <Button label="Play Exit" @click="handlePlayExit" size="small"
                :disabled="!localItem.exit || localItem.exit === 'none'" />
              <div v-if="localItem.exit && localItem.exit !== 'none'" class="animation-properties">
                <div class="control-item-with-core">
                  <div class="control-label-row">
                    <label>Duration: {{ (localItem.exit_duration ?? 0.5).toFixed(2) }}s</label>
                    <span v-if="coreItem && localItem.exit_duration === undefined" class="core-value-indicator">
                      (core: {{ (coreItem.exit_duration ?? 0.5).toFixed(2) }}s)
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
                  <Select v-model="localItem.exit_ease" :options="easeOptions" placeholder="Select ease"
                    class="animation-dropdown" />
                </div>
              </div>
            </div>

            <!-- Idle Animation -->
            <div class="animation-group">
              <div class="animation-select-item">
                <label><strong>Idle:</strong></label>
                <Select v-model="localItem.idle" :options="idleOptions" placeholder="Select idle animation"
                  class="animation-dropdown" />
              </div>
              <div class="idle-buttons">
                <Button label="Start Idle" @click="handleStartIdle" size="small"
                  :disabled="!localItem.idle || localItem.idle === 'none'" />
                <Button label="Stop Idle" @click="handleStopIdle" size="small" :disabled="!isIdlePreview" />
              </div>
              <div v-if="localItem.idle && localItem.idle !== 'none'" class="animation-properties">
                <div class="control-item-with-core">
                  <div class="control-label-row">
                    <label>Duration: {{ (localItem.idle_duration ?? 3).toFixed(2) }}s</label>
                    <span v-if="coreItem && localItem.idle_duration === undefined" class="core-value-indicator">
                      (core: {{ (coreItem.idle_duration ?? 3).toFixed(2) }}s)
                    </span>
                  </div>
                  <Slider :modelValue="localItem.idle_duration ?? 3"
                    @update:modelValue="(v) => localItem.idle_duration = Array.isArray(v) ? v[0] : v" :min="0.5"
                    :max="10" :step="0.1" />
                </div>
                <div class="control-item-with-core">
                  <div class="control-label-row">
                    <label>Intensity: {{ (localItem.idle_intensity ?? 0.5).toFixed(2) }}</label>
                    <span v-if="coreItem && localItem.idle_intensity === undefined" class="core-value-indicator">
                      (core: {{ (coreItem.idle_intensity ?? 0.5).toFixed(2) }})
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
              <label>X: {{ animatedX.toFixed(1) }}%</label>
              <span v-if="coreItem && localItem.x === undefined" class="core-value-indicator">
                (core: {{ (coreItem.x ?? 0).toFixed(1) }}%)
              </span>
            </div>
            <Slider :modelValue="animatedX"
              @update:modelValue="(v) => { animatedX = Array.isArray(v) ? v[0] : v; updateLocalItem(); }" :min="-200"
              :max="200" :step="0.1" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Y: {{ animatedY.toFixed(1) }}%</label>
              <span v-if="coreItem && localItem.y === undefined" class="core-value-indicator">
                (core: {{ (coreItem.y ?? 0).toFixed(1) }}%)
              </span>
            </div>
            <Slider :modelValue="animatedY"
              @update:modelValue="(v) => { animatedY = Array.isArray(v) ? v[0] : v; updateLocalItem(); }" :min="-200"
              :max="200" :step="0.1" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Z: {{ localItem.z ?? 0 }}</label>
              <span v-if="coreItem && localItem.z === undefined" class="core-value-indicator">
                (core: {{ coreItem.z ?? 0 }})
              </span>
            </div>
            <Slider :modelValue="localItem.z ?? 0" @update:modelValue="(v) => localItem.z = Array.isArray(v) ? v[0] : v"
              :min="-10" :max="10" :step="1" />
          </div>
        </div>

        <!-- Transform Controls -->
        <div class="control-group">
          <h4>Transform</h4>
          <div class="control-item">
            <label>Fit Mode:
              <span v-if="coreItem && localItem.fit_mode === undefined" class="core-value-indicator">
                (core: {{ coreItem.fit_mode ?? 'none' }})
              </span>
            </label>
            <Select v-model="localItem.fit_mode" :options="fitModeOptions" placeholder="Select fit mode"
              class="animation-dropdown" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Scale: {{ localItem.scale?.toFixed(2) ?? 1 }}</label>
              <span v-if="coreItem && localItem.scale === undefined" class="core-value-indicator">
                (core: {{ (coreItem.scale ?? 1).toFixed(2) }})
              </span>
            </div>
            <Slider :modelValue="localItem.scale ?? 1"
              @update:modelValue="(v) => localItem.scale = Array.isArray(v) ? v[0] : v" :min="0.1" :max="3"
              :step="0.01" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>X Scale: {{ localItem.xscale?.toFixed(2) ?? (localItem.scale ?? 1) }}</label>
              <span v-if="coreItem && localItem.xscale === undefined" class="core-value-indicator">
                (core: {{ (coreItem.xscale ?? coreItem.scale ?? 1).toFixed(2) }})
              </span>
            </div>
            <Slider :modelValue="localItem.xscale ?? localItem.scale ?? 1"
              @update:modelValue="(v) => localItem.xscale = Array.isArray(v) ? v[0] : v" :min="-3" :max="3"
              :step="0.01" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Y Scale: {{ localItem.yscale?.toFixed(2) ?? (localItem.scale ?? 1) }}</label>
              <span v-if="coreItem && localItem.yscale === undefined" class="core-value-indicator">
                (core: {{ (coreItem.yscale ?? coreItem.scale ?? 1).toFixed(2) }})
              </span>
            </div>
            <Slider :modelValue="localItem.yscale ?? localItem.scale ?? 1"
              @update:modelValue="(v) => localItem.yscale = Array.isArray(v) ? v[0] : v" :min="-3" :max="3"
              :step="0.01" />
          </div>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Rotation: {{ localItem.rotation ?? 0 }}°</label>
              <span v-if="coreItem && localItem.rotation === undefined" class="core-value-indicator">
                (core: {{ coreItem.rotation ?? 0 }}°)
              </span>
            </div>
            <Slider :modelValue="localItem.rotation ?? 0"
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
            <Slider :modelValue="localItem.alpha ?? 1"
              @update:modelValue="(v) => localItem.alpha = Array.isArray(v) ? v[0] : v" :min="0" :max="1"
              :step="0.01" />
          </div>
        </div>

        <!-- Filter Controls -->
        <div class="control-group" v-if="isImageAsset || isVideoAsset">
          <h4>Filters</h4>
          <div class="control-item-with-core">
            <div class="control-label-row">
              <label>Blur: {{ localItem.blur ?? 0 }}px</label>
              <span v-if="coreItem && localItem.blur === undefined" class="core-value-indicator">
                (core: {{ coreItem.blur ?? 0 }}px)
              </span>
            </div>
            <Slider :modelValue="localItem.blur ?? 0"
              @update:modelValue="(v) => localItem.blur = Array.isArray(v) ? v[0] : v" :min="0" :max="20" :step="1" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.asset-popup {
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
  cursor: grab;

  /* Default: width-constrained */
  width: 100%;
  height: auto;
  max-height: 100%;
}

.preview-canvas:active {
  cursor: grabbing;
}

/* When container is wider than 16:9, height-constrained */
@container (min-aspect-ratio: 16/9) {
  .preview-canvas {
    width: auto;
    height: 100%;
    max-width: 100%;
  }
}

.asset-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 10;
}

/* Override BackgroundAsset's pointer-events for editor preview */
.asset-wrapper :deep(.background-asset-wrapper) {
  pointer-events: none;
}

.asset-spine {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.no-asset-message {
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

.idle-buttons {
  display: flex;
  gap: 0.5rem;
}

.idle-buttons Button {
  flex: 1;
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
</style>
