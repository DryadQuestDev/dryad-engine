<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { Editor } from '../../editor';
import type { EditorCustomPopupProps } from '../../editor';
import { loadCharacterImages } from '../../../shared/utils/characterImageLoader';
import { ITEM_SLOT_SIZE_PERCENT } from '../../../global/global';
import Select from 'primevue/select';

const props = defineProps<EditorCustomPopupProps>();
const emit = defineEmits<{ 'update:item': [item: any] }>();

const editor = Editor.getInstance();

// Local copy for editing
const localItem = ref(props.item);

// Core item reference (from parent)
const coreItem = ref(props.coreItem);

// State
const containerRef = ref<HTMLElement | null>(null);
const selectedSlotIndex = ref<number | null>(null);
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);

// Image dimensions
const actualImageWidth = ref(0);
const actualImageHeight = ref(0);
const renderedImageHeight = ref(0);

// Loaded skin layers
const skinLayersData = ref<Record<string, any>[]>([]);

// Available item slot types (loaded from item_slots file)
const availableSlotTypes = ref<Array<{ id: string; name: string }>>([]);
const selectedSlotType = ref<string | null>(null);

// Item slots (array of {slot, x, y})
const itemSlots = computed(() => {
  if (!localItem.value.item_slots || !Array.isArray(localItem.value.item_slots)) {
    return [];
  }
  return localItem.value.item_slots;
});

// Combined slots including core slots (greyed out)
const allSlots = computed(() => {
  const localSlots = itemSlots.value.map((slot: any, index: number) => ({
    ...slot,
    isCore: false,
    localIndex: index
  }));

  // Add core slots if they exist and we're editing a mod
  if (coreItem.value?.item_slots && Array.isArray(coreItem.value.item_slots)) {
    const coreSlots = coreItem.value.item_slots.map((slot: any) => ({
      ...slot,
      isCore: true,
      localIndex: -1 // Not editable
    }));
    return [...coreSlots, ...localSlots];
  }

  return localSlots;
});

// Dropdown options for available slot types
const slotTypeOptions = computed(() => {
  return availableSlotTypes.value.map((slotType: any) => ({
    label: slotType.id,
    value: slotType.id
  }));
});

// Compute the scaled rectangle size for visual display
// Item slots in the game use ITEM_SLOT_SIZE_PERCENT width of container, with aspect-ratio 1:1
// So we use the same percentage of the rendered height
const scaledRectSize = computed(() => {
  return renderedImageHeight.value * ITEM_SLOT_SIZE_PERCENT;
});

// Convert percentage to pixel position in preview coordinates
// For slot mode, use container height directly (percentages are relative to container)
const percentageToPreviewPixels = (percent: number): number => {
  return (percent / 100) * renderedImageHeight.value;
};

// Convert preview pixel position to percentage
// For slot mode, convert relative to container height
const previewPixelsToPercentage = (pixels: number): number => {
  return (pixels / renderedImageHeight.value) * 100;
};

// Get character image layers from skin_layers
const imageLayers = computed(() => {
  return loadCharacterImages(localItem.value, skinLayersData.value as any);
});

// Initialize
onMounted(() => {
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

  // Ensure item_slots array exists
  if (!localItem.value.item_slots) {
    localItem.value.item_slots = [];
  }

  // Select first slot by default if available
  if (itemSlots.value.length > 0) {
    selectedSlotIndex.value = 0;
  }

  loadCharacterSkinLayers();
});

// Watch for prop changes
watch(() => props.item, (newItem) => {
  localItem.value = newItem;
}, { deep: true });

// Watch for item slots changes and emit updates
watch(() => localItem.value.item_slots, () => {
  emit('update:item', localItem.value);
}, { deep: true });

// Load character skin layers and item slot types
async function loadCharacterSkinLayers() {
  try {
    // Load skin layers data using loadFullData for proper mod support
    const mergedData = await editor.loadFullData('character_skin_layers');
    if (mergedData && Array.isArray(mergedData)) {
      skinLayersData.value = mergedData;
    }

    // Load available item slot types using loadFullData for proper mod support
    const itemSlotsData = await editor.loadFullData('item_slots');
    if (itemSlotsData && Array.isArray(itemSlotsData)) {
      availableSlotTypes.value = itemSlotsData.map((slot: any) => ({
        id: slot.id,
        name: slot.name || slot.id
      }));

      // Select first slot type by default
      if (availableSlotTypes.value.length > 0) {
        selectedSlotType.value = availableSlotTypes.value[0].id;
      }
    }
  } catch (error) {
    console.error('Failed to load data:', error);
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

// Get style for a specific slot
function getSlotStyle(slot: any) {
  if (!slot) return {};

  const x = slot.x ?? 50;
  const y = slot.y ?? 50;

  return {
    left: `${percentageToPreviewPixels(x)}px`,
    top: `${percentageToPreviewPixels(y)}px`,
    width: `${scaledRectSize.value}px`,
    height: `${scaledRectSize.value}px`,
  };
}

// Mouse event handlers
function handleMouseDown(event: MouseEvent, slot: any) {
  // Don't allow dragging core slots
  if (slot.isCore) return;

  selectedSlotIndex.value = slot.localIndex;
  isDragging.value = true;
  if (!containerRef.value) return;

  const rect = containerRef.value.getBoundingClientRect();
  // Convert percentage to preview pixels for drag calculation
  const currentPreviewX = percentageToPreviewPixels(slot.x ?? 50);
  const currentPreviewY = percentageToPreviewPixels(slot.y ?? 50);

  dragStartX.value = event.clientX - rect.left - currentPreviewX;
  dragStartY.value = event.clientY - rect.top - currentPreviewY;
  event.preventDefault();
}

function handleMouseMove(event: MouseEvent) {
  if (!isDragging.value || !containerRef.value || selectedSlotIndex.value === null) return;

  const rect = containerRef.value.getBoundingClientRect();
  const previewX = event.clientX - rect.left - dragStartX.value;
  const previewY = event.clientY - rect.top - dragStartY.value;

  // Convert from preview pixel coordinates to percentages
  const xPercent = previewPixelsToPercentage(previewX);
  const yPercent = previewPixelsToPercentage(previewY);

  // Update the slot
  if (localItem.value.item_slots && localItem.value.item_slots[selectedSlotIndex.value]) {
    localItem.value.item_slots[selectedSlotIndex.value].x = xPercent;
    localItem.value.item_slots[selectedSlotIndex.value].y = yPercent;
  }
}

function handleMouseUp() {
  isDragging.value = false;
}

// Add new slot
function addSlot() {
  if (!localItem.value.item_slots) {
    localItem.value.item_slots = [];
  }

  const slotTypeId = selectedSlotType.value || 'default_slot';

  localItem.value.item_slots.push({
    slot: slotTypeId,
    x: 50,
    y: 50
  });

  selectedSlotIndex.value = localItem.value.item_slots.length - 1;
}

// Remove selected slot
function removeSlot() {
  if (selectedSlotIndex.value === null || !localItem.value.item_slots) return;

  localItem.value.item_slots.splice(selectedSlotIndex.value, 1);

  // Update selection
  if (localItem.value.item_slots.length > 0) {
    selectedSlotIndex.value = Math.min(selectedSlotIndex.value, localItem.value.item_slots.length - 1);
  } else {
    selectedSlotIndex.value = null;
  }
}

// Add global mouse event listeners
onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <div class="item-slot-picker-popup">
    <div class="picker-header">
      <h3>Item Slot Positions Picker</h3>
      <p class="hint">Drag the rectangles to position the item slots</p>
    </div>

    <div class="picker-content">
      <!-- Controls -->
      <div class="controls">
        <div class="control-group">
          <label>Slot Type to Add</label>
          <Select v-model="selectedSlotType" :options="slotTypeOptions" optionLabel="label" optionValue="value"
            placeholder="Select slot type" class="slot-dropdown" appendTo="body" />
        </div>

        <div class="control-actions">
          <button @click="addSlot" :disabled="!selectedSlotType" class="action-button add-button">
            Add New Slot
          </button>
          <button @click="removeSlot" :disabled="selectedSlotIndex === null" class="action-button remove-button">
            Remove Selected
          </button>
        </div>

        <div v-if="selectedSlotIndex !== null && itemSlots[selectedSlotIndex]" class="control-group">
          <div class="slot-info">
            <p><strong>Selected Slot:</strong></p>
            <p><strong>Slot:</strong> {{ itemSlots[selectedSlotIndex].id }}</p>
            <p><strong>X:</strong> {{ (itemSlots[selectedSlotIndex].x ?? 50).toFixed(1) }}%</p>
            <p><strong>Y:</strong> {{ (itemSlots[selectedSlotIndex].y ?? 50).toFixed(1) }}%</p>
          </div>
        </div>

        <div class="slots-list">
          <h4>All Slots ({{ itemSlots.length }})</h4>
          <div v-if="itemSlots.length === 0" class="empty-message">
            No item slots defined. Click "Add New Slot" to create one.
          </div>
          <div v-else class="slots-grid">
            <div v-for="(slot, index) in itemSlots" :key="index"
              :class="['slot-card', { selected: index === selectedSlotIndex }]" @click="selectedSlotIndex = index">
              <div class="slot-card-header">{{ slot.id }}</div>
              <div class="slot-card-body">
                <span>X: {{ (slot.x ?? 50).toFixed(1) }}%</span>
                <span>Y: {{ (slot.y ?? 50).toFixed(1) }}%</span>
              </div>
            </div>
          </div>
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

          <!-- Draggable Slot Rectangles -->
          <div v-for="(slot, index) in allSlots" :key="index"
            :class="['slot-selector-rect', { selected: slot.localIndex === selectedSlotIndex && !slot.isCore, 'core-slot': slot.isCore }]"
            :style="getSlotStyle(slot)" @mousedown="(e) => handleMouseDown(e, slot)">
            <div class="rect-label">{{ slot.id || slot.slot || `SLOT ${slot.localIndex + 1}` }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.item-slot-picker-popup {
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
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow-y: auto;
  position: relative;
  z-index: 1;
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

.slot-dropdown {
  width: 100%;
}

/* Ensure Select dropdown panel appears above dialog (which has z-index: 10000) */
:deep(.p-select-overlay) {
  z-index: 10001 !important;
}

.slot-info {
  padding: 0.75rem;
  background-color: #e3f2fd;
  border-left: 4px solid #2196F3;
  border-radius: 4px;
}

.slot-info p {
  margin: 0.25rem 0;
  font-size: 0.85rem;
  font-family: var(--font-family-mono);
}

.control-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.action-button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: background-color 0.2s ease;
}

.add-button {
  background-color: #4CAF50;
  color: white;
}

.add-button:hover:not(:disabled) {
  background-color: #45a049;
}

.add-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.remove-button {
  background-color: #f44336;
  color: white;
}

.remove-button:hover:not(:disabled) {
  background-color: #da190b;
}

.remove-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.slots-list {
  margin-top: auto;
}

.slots-list h4 {
  margin: 0 0 0.75rem 0;
  font-size: 0.95rem;
  color: #333;
}

.empty-message {
  padding: 1rem;
  text-align: center;
  color: #666;
  font-size: 0.85rem;
  font-style: italic;
  background-color: #f5f5f5;
  border-radius: 4px;
}

.slots-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 300px;
  overflow-y: auto;
}

.slot-card {
  padding: 0.75rem;
  background-color: #fff;
  border: 2px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.slot-card:hover {
  border-color: #4CAF50;
  background-color: #f1f8f1;
}

.slot-card.selected {
  border-color: #FF5722;
  background-color: #fff3e0;
}

.slot-card-header {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
  color: #333;
}

.slot-card-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.8rem;
  color: #666;
  font-family: var(--font-family-mono);
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

.slot-selector-rect {
  position: absolute;
  border: 3px solid #4CAF50;
  background-color: rgba(76, 175, 80, 0.1);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  user-select: none;
}

.slot-selector-rect.selected {
  border-color: #FF5722;
  background-color: rgba(255, 87, 34, 0.1);
  z-index: 10;
}

.slot-selector-rect:active {
  cursor: grabbing;
}

.rect-label {
  color: #4CAF50;
  font-weight: bold;
  font-size: 0.65rem;
  text-shadow: 0 0 2px white;
  pointer-events: none;
  text-align: center;
  word-break: break-all;
  padding: 2px;
}

.slot-selector-rect.selected .rect-label {
  color: #FF5722;
}

/* Core slots (non-editable, greyed out) */
.slot-selector-rect.core-slot {
  border-color: #9E9E9E;
  background-color: rgba(158, 158, 158, 0.05);
  cursor: not-allowed;
  opacity: 0.5;
}

.slot-selector-rect.core-slot .rect-label {
  color: #9E9E9E;
}

.slot-selector-rect.core-slot:hover {
  border-color: #9E9E9E;
  background-color: rgba(158, 158, 158, 0.05);
}
</style>
