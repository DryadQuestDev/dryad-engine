<script setup lang="ts">
import { computed } from 'vue';
import { Item } from '../../core/character/item';
import ItemSlot from './ItemSlot.vue';
import ItemCard from './ItemCard.vue';
import ItemChoices from './ItemChoices.vue';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import { useItemPopup } from './useItemPopup';

const COMPONENT_ID = 'item-grid';

// Props
const props = defineProps<{
  items: (Item | null)[];  // Array of items to display (null = empty slot)
  disabled?: boolean;      // Disable item choices (still shows item card on hover)
}>();

// Filter out null values for popup composable (it only needs actual items)
const actualItems = computed(() => props.items.filter((item): item is Item => item !== null));

// Use the shared item popup composable for inventory (unequipped) items
// clearOnItemsChange = false because inventory is shared across characters
const {
  popupContainerRef,
  floatingStyles,
  displayedItem,
  hasChoices,
  showPopup,
  handleItemHover,
  handlePopupEnter,
  handlePopupLeave,
} = useItemPopup(() => actualItems.value, true);

// Handle drag start
function handleDragStart(event: DragEvent, item: Item) {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('item-uid', item.uid);
  }
}

</script>

<template>
  <div :id="COMPONENT_ID" class="item-grid">
    <!-- Render each item using ItemSlot component, or empty slot for null -->
    <template v-for="(item, index) in items" :key="item?.uid || `empty-${index}`">
      <ItemSlot v-if="item" :item="item" @dragstart="handleDragStart" @hover="handleItemHover" />
      <div v-else class="empty-slot"></div>
    </template>

    <!-- Inventory items popup container -->
    <Teleport to="body">
      <div v-if="showPopup" ref="popupContainerRef" class="popups-container" :style="{
        ...floatingStyles,
        willChange: 'transform'
      }" @mouseenter="handlePopupEnter" @mouseleave="handlePopupLeave">
        <!-- ItemChoices at the top (only if there are choices and not disabled) -->
        <div v-if="hasChoices && props.disabled !== true" class="item-choices-wrapper">
          <ItemChoices :item="displayedItem!" />
        </div>

        <!-- ItemCard below ItemChoices -->
        <div class="item-card-wrapper">
          <ItemCard :item="displayedItem!" />
        </div>
      </div>
    </Teleport>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" />
  </div>
</template>

<style scoped>
.item-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 64px);
  grid-auto-rows: 64px;
  gap: 4px;
  padding: 8px;
  width: 100%;
  height: 100%;
  overflow: auto;
}

/* Empty slot styling */
.empty-slot {
  width: 64px;
  height: 64px;
  background: rgba(42, 42, 42, 0.3);
  border: 2px dashed #444;
  border-radius: 4px;
  cursor: default;
}

/* Scrollbar styling */
.item-grid::-webkit-scrollbar {
  width: 8px;
}

.item-grid::-webkit-scrollbar-track {
  background: #1a1a1a;
}

.item-grid::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 4px;
}

.item-grid::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>
