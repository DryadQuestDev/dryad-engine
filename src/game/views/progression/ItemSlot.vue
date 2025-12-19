<script setup lang="ts">
import { computed, ref, inject } from 'vue';
import { Item } from '../../core/character/item';
import { STICKY_ITEM_UID_KEY, HOVER_ITEM_UID_KEY } from './useItemPopup';
import type { Ref } from 'vue';

const props = defineProps<{
  item: Item;
}>();

const emit = defineEmits<{
  click: [item: Item];
  dragstart: [event: DragEvent, item: Item];
  hover: [item: Item | null, element: HTMLElement | null];
}>();

// Inject sticky and hover state from parent (provided by useItemPopup)
const stickyItemUid = inject<Ref<string | null>>(STICKY_ITEM_UID_KEY, ref(null));
const hoverItemUid = inject<Ref<string | null>>(HOVER_ITEM_UID_KEY, ref(null));

// State for hover behavior
const isHovered = ref(false);
const wasJustUnstickied = ref(false);
const itemSlotRef = ref<HTMLElement | null>(null);

// Computed property to check if this item is the sticky one
const isSticky = computed(() => {
  return stickyItemUid.value === props.item.uid;
});

// Computed properties - cached and only re-evaluated when dependencies change
const icon = computed(() => {
  return props.item.getTrait('image');
});

const name = computed(() => {
  return props.item.getTrait('name') || props.item.id;
});

const durability = computed(() => {
  const durabilityProp = props.item.properties['durability'];
  if (durabilityProp && durabilityProp.currentValue !== undefined) {
    return Math.round(durabilityProp.currentValue as number);
  }
  return null;
});

const quantity = computed(() => {
  const maxStack = props.item.maxStack();
  // Show quantity if item is stackable (max_stack > 1 or -1)
  if (maxStack && (maxStack > 1 || maxStack === -1)) {
    return props.item.quantity;
  }
  return null;
});

const weight = computed(() => {

  if (props.item.isEquipped) {
    return null;
  }

  const itemWeight = props.item.getTrait('weight');
  if (itemWeight && itemWeight > 0) {
    const totalWeight = itemWeight * props.item.quantity;
    return totalWeight.toFixed(1);
  }
  return null;
});

// Get CSS classes from item attributes
const attributeClasses = computed(() => {
  return props.item.getAttributeClasses();
});

// Event handlers
function handleMouseEnter() {
  isHovered.value = true;
  // Set this item as the globally hovered item
  hoverItemUid.value = props.item.uid;
  // Reset the unstickied flag when mouse re-enters
  wasJustUnstickied.value = false;
  // Emit hover event with item and element reference
  emit('hover', props.item, itemSlotRef.value);
}

function handleMouseLeave() {
  isHovered.value = false;
  // Only clear global hover if this was the hovered item and not just unstickied
  if (hoverItemUid.value === props.item.uid && !wasJustUnstickied.value) {
    hoverItemUid.value = null;
    // Clear hover
    emit('hover', null, null);
  }
}

function handleClick() {
  // If this item is already sticky, remove sticky state
  if (isSticky.value) {
    stickyItemUid.value = null;
    // Set flag to prevent showing popups until mouse leaves and re-enters
    wasJustUnstickied.value = true;
    emit('hover', null, null);
  } else {
    // Make this item sticky (this will automatically unstick any other item in the same category)
    stickyItemUid.value = props.item.uid;
    // Clear the flag when making item sticky
    wasJustUnstickied.value = false;
    emit('hover', props.item, itemSlotRef.value);
  }
  emit('click', props.item);
}

function handleDragStart(event: DragEvent) {
  emit('dragstart', event, props.item);
}
</script>

<template>
  <div class="item-slot-wrapper" :class="attributeClasses">
    <div ref="itemSlotRef" class="item-slot" :class="{
      'equipped': item.isEquipped,
      'sticky': isSticky,
      'just-unstickied': wasJustUnstickied
    }" draggable="true" @click="handleClick" @dragstart="handleDragStart" @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave">
      <img v-if="icon" :src="icon" :alt="name" class="item-icon" />

      <!-- Durability indicator on the left side -->
      <span v-if="durability !== null" class="item-durability">
        {{ durability }}
      </span>

      <!-- Weight indicator (bottom-left) -->
      <span v-if="weight !== null" class="item-weight">
        {{ weight }}
      </span>

      <!-- Quantity indicator for stackable items -->
      <span v-if="quantity !== null" class="item-quantity">
        {{ quantity }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.item-slot-wrapper {
  display: inline-block;
  width: 100%;
  height: 100%;
}

.item-slot {
  position: relative;
  width: 100%;
  height: 100%;
  border: 2px solid #444;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2a2a2a;
  transition: all 0.2s ease;
}

.item-slot:hover {
  border-color: #666;
  background: #333;
}

.item-icon {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.item-quantity {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 2px 4px;
  font-size: 10px;
  border-radius: 2px;
  font-weight: bold;
}

.item-weight {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background: rgba(0, 0, 0, 0.7);
  color: #999;
  padding: 2px 4px;
  font-size: 9px;
  border-radius: 2px;
  font-weight: normal;
}
</style>
