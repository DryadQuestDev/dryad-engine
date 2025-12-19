<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import ItemGrid from './ItemGrid.vue';
import CustomComponentContainer from '../CustomComponentContainer.vue';

const game = Game.getInstance();
const COMPONENT_ID = 'inventory';

const props = defineProps<{
  inventory_id: string;
}>();

// Get inventory by the provided inventory_id
const inventory = computed(() => {
  return game.itemSystem.inventories.value.get(props.inventory_id);
});

// Grid slots with empty slots for fixed-size inventories
const gridSlots = computed(() => {
  const inv = inventory.value;
  if (!inv) return [];

  const visibleItems = inv.getUnequippedItems();
  return inv.createGridSlots(visibleItems, 'simple');
});

</script>

<template>
  <div :id="COMPONENT_ID" class="inventory">
    <!-- Custom components registered to inventory-header slot -->
    <CustomComponentContainer slot="inventory-header" />

    <!-- Inventory content -->
    <div class="inventory-content">
      <!-- Item grid - shows unequipped items with empty slots for fixed-size inventories -->
      <ItemGrid :items="gridSlots" />
    </div>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" />
  </div>
</template>

<style scoped>
.inventory {

  /* propogate constrained height to children */
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  /**/

  width: 100%;
  background: #1e1e1e;
  border-radius: 8px;
}

.inventory-content {
  /* propogate constrained height to children */
  flex: 1;
  min-height: 0;
  /**/
  overflow: hidden;
  position: relative;
}
</style>
