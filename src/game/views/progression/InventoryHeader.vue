<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';

const game = Game.getInstance();

const props = defineProps<{
  inventory_id: string;
}>();

// Get inventory by the provided inventory_id
const inventory = computed(() => {
  return game.itemSystem.inventories.value.get(props.inventory_id);
});

// Get inventory statistics from the Inventory class
const stats = computed(() => {
  const inv = inventory.value;
  if (!inv) return null;
  return inv.getInventoryStats();
});

// Format display text
const capacityInfo = computed(() => {
  if (!stats.value) return null;

  const { unequippedCount, maxSize, currentWeight, maxWeight, isOverflowing, isOverweight } = stats.value;

  // Build slots text
  const slotsText = maxSize > 0 ? `${unequippedCount}/${maxSize}` : `${unequippedCount}`;

  // Build weight text
  const weightText = maxWeight > 0 ? `${currentWeight.toFixed(1)}/${maxWeight}` : currentWeight.toFixed(1);

  return { slotsText, weightText, isOverflowing, isOverweight };
});
</script>

<template>
  <div class="inventory-header">
    <h2>Inventory</h2>
    <div v-if="capacityInfo" class="inventory-stats">
      <span class="stat" :class="{ 'stat-overflow': capacityInfo.isOverflowing }">
        Items: {{ capacityInfo.slotsText }}
      </span>
      <span v-if="inventory?.maxWeight && inventory.maxWeight > 0" class="stat"
        :class="{ 'stat-overflow': capacityInfo.isOverweight }">
        Weight: {{ capacityInfo.weightText }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.inventory-header {
  padding: 16px;
  background: #252525;
  border-bottom: 2px solid #333;
  display: flex;
  align-items: center;
  gap: 16px;
}

.inventory-header h2 {
  margin: 0;
  color: #42b983;
  font-size: 20px;
}

.inventory-stats {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.stat {
  font-size: 14px;
  color: #aaa;
  padding: 4px 8px;
  background: #1a1a1a;
  border-radius: 4px;
  border: 1px solid #333;
  transition: all 0.3s ease;
}

.stat.stat-overflow {
  color: #ff453a;
  background: rgba(255, 69, 58, 0.15);
  border-color: rgba(255, 69, 58, 0.5);
  font-weight: bold;
}

/* Responsive adjustments */
@media (max-width: 1200px) {
  .inventory-header h2 {
    font-size: 18px;
  }

  .stat {
    font-size: 12px;
  }
}
</style>
