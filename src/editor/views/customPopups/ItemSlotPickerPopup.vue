<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Editor } from '../../editor';
import type { EditorCustomPopupProps } from '../../editor';
import { ITEM_SLOT_SIZE_PERCENT } from '../../../global/global';
import EditorCharacterPreview from '../shared/EditorCharacterPreview.vue';
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

  loadItemSlotTypes();
});

// Watch for prop changes
watch(() => props.item, (newItem) => {
  localItem.value = newItem;
}, { deep: true });

// Watch for item slots changes and emit updates
watch(() => localItem.value.item_slots, () => {
  emit('update:item', localItem.value);
}, { deep: true });

// Load available item slot types (character rendering is delegated to EditorCharacterPreview,
// which fetches skin_layers/spine on its own).
async function loadItemSlotTypes() {
  try {
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
    console.error('Failed to load item_slots:', error);
  }
}

// Get style for a specific slot — uses cqh units matching the game
function getSlotStyle(slot: any) {
  if (!slot) return {};

  const x = slot.x ?? 50;
  const y = slot.y ?? 50;

  return {
    left: x + 'cqh',
    top: y + 'cqh',
    width: (ITEM_SLOT_SIZE_PERCENT * 100) + 'cqh',
    height: (ITEM_SLOT_SIZE_PERCENT * 100) + 'cqh',
  };
}

// Convert pixel offset to cqh value (percentage of container height)
function pxToCqh(px: number): number {
  if (!containerRef.value) return 0;
  return (px / containerRef.value.offsetHeight) * 100;
}

// Mouse event handlers
function handleMouseDown(event: MouseEvent, slot: any) {
  // Don't allow dragging core slots
  if (slot.isCore) return;

  selectedSlotIndex.value = slot.localIndex;
  isDragging.value = true;
  if (!containerRef.value) return;

  const rect = containerRef.value.getBoundingClientRect();
  const currentX = (slot.x ?? 50) / 100 * rect.height;
  const currentY = (slot.y ?? 50) / 100 * rect.height;

  dragStartX.value = event.clientX - rect.left - currentX;
  dragStartY.value = event.clientY - rect.top - currentY;
  event.preventDefault();
}

function handleMouseMove(event: MouseEvent) {
  if (!isDragging.value || !containerRef.value || selectedSlotIndex.value === null) return;

  const rect = containerRef.value.getBoundingClientRect();
  const pixelX = event.clientX - rect.left - dragStartX.value;
  const pixelY = event.clientY - rect.top - dragStartY.value;

  // Convert from pixels to cqh (percentage of container height)
  const xCqh = pxToCqh(pixelX);
  const yCqh = pxToCqh(pixelY);

  // Update the slot
  if (localItem.value.item_slots && localItem.value.item_slots[selectedSlotIndex.value]) {
    localItem.value.item_slots[selectedSlotIndex.value].x = xCqh;
    localItem.value.item_slots[selectedSlotIndex.value].y = yCqh;
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

onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <div class="item-slot-picker-popup">
    <div class="picker-header">
      <h3>Item Slot Positions Picker</h3>
      <p class="hint">Drag the rectangles to position the item slots. The outer dashed lines mark the
        character-sheet column edges; the orange middle line marks the column's center.</p>
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
        <!-- Character-sheet column boundaries (left + middle + right) -->
        <div class="sheet-boundary left"></div>
        <div class="sheet-boundary middle"></div>
        <div class="sheet-boundary right"></div>

        <!-- Character render + slot markers. The doll-frame is 50cqh wide centered, matching
             the in-game character column. .character-doll is the explicit 1:1 square sized to
             100cqh (matching FacePickerPopup), so the body sits in a known-size box even when
             the preview-container's aspect ratio varies. Slot markers sit as siblings of the
             doll so the body's internal scale doesn't affect them; their cqh resolves against
             .preview-container (container-type:size). -->
        <div class="character-doll-wrapper">
          <div class="character-doll">
            <EditorCharacterPreview :character="localItem" :coreCharacter="coreItem">
              <template #empty>
                <p class="empty-text">⚠️ Select Character Image Layers in the <strong>skin_layers</strong> field, or
                  configure <strong>spine</strong> files.</p>
              </template>
            </EditorCharacterPreview>
          </div>

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
  overflow: hidden;
  background-color: #fafafa;
  border: 1px solid #ddd;
  border-radius: 4px;
  position: relative;
  container-type: size;
}

.empty-text {
  color: #f44336;
  text-align: center;
  padding: 2rem;
  font-weight: 500;
}

/* Three dashed lines mark the in-game character-sheet column: outer two are the
   left/right edges of the 50cqh column; the middle line is the column's center
   (where the body should land for art_dx = 0). The middle uses a brighter accent
   so it reads as a different reference (centering aid) from the outer bounds. */
.sheet-boundary {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 2px dashed rgba(0, 0, 0, 0.15);
  pointer-events: none;
  z-index: 0;
}

.sheet-boundary.left {
  left: calc(50% - 25cqh);
}

.sheet-boundary.middle {
  left: 50%;
  border-left-style: dashed;
  border-left-color: rgba(255, 120, 0, 0.95);
  border-left-width: 3px;
}

.sheet-boundary.right {
  left: calc(50% + 25cqh);
}

.character-doll-wrapper {
  position: absolute;
  top: 0;
  left: calc(50% - 25cqh);
  width: 50cqh;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Inline-block 1:1 square explicitly sized to 100cqh (preview-container height).
   Matches FacePickerPopup so the spine canvas inside has a known geometric
   reference, independent of preview-container's aspect ratio. The orange border
   marks the doll bounds for the dev's positioning sanity. */
.character-doll {
  position: relative;
  display: inline-block;
  height: 100cqh;
  aspect-ratio: 1 / 1;
  border: 1px solid rgb(255, 183, 0);
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
