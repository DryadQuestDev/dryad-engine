<script setup lang="ts">
import { Item } from '../../core/character/item';
import ItemSlot from './ItemSlot.vue';
import CustomComponentContainer from '../CustomComponentContainer.vue';

const COMPONENT_ID = 'item-grid';

const props = withDefaults(defineProps<{
  items: (Item | null)[];  // Array of items to display (null = empty slot)
  disabled?: boolean;      // Disable item choices (still shows item card on hover)
  maxHeight?: string;      // CSS max-height for the scrolling grid; 'none' lets it fill its container
}>(), {
  maxHeight: '400px',
});

function handleDragStart(event: DragEvent, item: Item) {
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('item-uid', item.uid);
  }
}
</script>

<template>
  <div :id="COMPONENT_ID" class="item-grid" :style="{ maxHeight: props.maxHeight }">
    <template v-for="(item, index) in items" :key="item?.uid || `empty-${index}`">
      <ItemSlot v-if="item" :item="item" :disabled="props.disabled === true"
        @dragstart="handleDragStart" />
      <div v-else class="empty-slot"></div>
    </template>

    <CustomComponentContainer :slot="COMPONENT_ID" :context="{ items }" />
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
  /* Promote the scroller to its own composited layer. Without it the slots' decoration
     (noise + blended gradients + inset shadows) re-rasterizes on every scroll frame —
     ~77ms per frame with 100 items, which is the whole of the scroll jank. */
  will-change: scroll-position;
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
