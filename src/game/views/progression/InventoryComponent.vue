<script setup lang="ts">
import { computed, ref } from 'vue';
import vTooltip from 'primevue/tooltip';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import ItemGrid from './ItemGrid.vue';
import CustomComponentContainer from '../CustomComponentContainer.vue';

const game = Game.getInstance();
const COMPONENT_ID = 'inventory';

const props = defineProps<{
  inventory_id: string;
}>();

const selectedCategory = ref('all');
const searchQuery = ref('');
const equippableOnly = ref(false);

const inventory = computed(() => {
  return game.itemSystem.inventories.value.get(props.inventory_id);
});

const categories = computed(() =>
  [...game.itemSystem.itemCategoriesMap.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
);

const allLabel = computed(() => Global.getInstance().getString('inventory.filter.all'));
const noItemsLabel = computed(() => Global.getInstance().getString('inventory.no_items'));
const equippableLabel = computed(() => Global.getInstance().getString('inventory.filter.equippable'));
const searchPlaceholder = computed(() => Global.getInstance().getString('inventory.search'));

const isFiltering = computed(() => selectedCategory.value !== 'all' || searchQuery.value.trim() !== '' || equippableOnly.value);

const filteredItems = computed(() => {
  const inv = inventory.value;
  if (!inv) return [];
  let items = inv.getUnequippedItems();
  if (selectedCategory.value !== 'all') {
    items = items.filter(item => item.category === selectedCategory.value);
  }
  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    items = items.filter(item => (item.traits?.name || '').toLowerCase().includes(query));
  }
  if (equippableOnly.value) {
    const char = game.characterSystem.selectedCharacter.value;
    items = char ? items.filter(item => char.getAvailableSlotsForItem(item).length > 0) : [];
  }
  return items;
});

const gridSlots = computed(() => {
  const inv = inventory.value;
  if (!inv) return [];
  if (isFiltering.value) return filteredItems.value;
  return inv.createGridSlots(filteredItems.value, 'simple');
});
</script>

<template>
  <div :id="COMPONENT_ID" class="inventory">
    <CustomComponentContainer slot="inventory-header" :context="{ inventory }" />

    <div class="inventory-filters">
      <div class="inventory-filter-tabs">
        <div class="inventory-filter-tab" :class="{ active: selectedCategory === 'all' }"
          v-tooltip.top="allLabel" @click="selectedCategory = 'all'">
          <span class="inventory-filter-icon inventory-filter-icon-all"></span>
        </div>
        <div v-for="cat in categories" :key="cat.id" class="inventory-filter-tab"
          :class="{ active: selectedCategory === cat.id }" v-tooltip.top="cat.name"
          @click="selectedCategory = cat.id">
          <img v-if="cat.icon" :src="cat.icon" :alt="cat.name" class="inventory-filter-icon" />
          <span v-else class="inventory-filter-chip">{{ cat.name }}</span>
        </div>
        <div class="inventory-filter-tab inventory-filter-toggle" :class="{ active: equippableOnly }"
          v-tooltip.top="equippableLabel" @click="equippableOnly = !equippableOnly">
          E
        </div>
        <div class="inventory-search-wrap">
          <input v-model="searchQuery" type="text" class="inventory-search" :placeholder="searchPlaceholder" />
          <i v-if="searchQuery" class="pi pi-times inventory-search-clear" @click="searchQuery = ''"></i>
        </div>
      </div>
    </div>

    <div class="inventory-content">
      <div v-if="filteredItems.length === 0" class="inventory-empty">{{ noItemsLabel }}</div>
      <ItemGrid v-else :items="gridSlots" />
    </div>

    <CustomComponentContainer :slot="COMPONENT_ID" :context="{ inventory }" />
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

.inventory-filters {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
}

.inventory-filter-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  padding: 5px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
}

.inventory-filter-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 13px;
  font-weight: 500;
  color: white;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid transparent;
}

.inventory-filter-tab.active {
  background: rgba(0, 0, 0, 0.7);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.inventory-filter-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0;
}

.inventory-filter-chip {
  white-space: nowrap;
  font-size: 13px;
  line-height: 18px;
}

.inventory-filter-toggle {
  margin-left: auto;
  min-width: 28px;
  justify-content: center;
  font-weight: 700;
}

.inventory-filter-toggle.active {
  background: #42b983;
  border-color: #5fd6a6;
  color: #fff;
  box-shadow: 0 0 8px rgba(66, 185, 131, 0.6);
}

.inventory-search-wrap {
  position: relative;
  width: 180px;
  display: flex;
  align-items: center;
}

.inventory-search {
  width: 100%;
  padding: 6px 28px 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.4);
  color: white;
  font-size: 13px;
  outline: none;
}

.inventory-search::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.inventory-search-clear {
  position: absolute;
  right: 8px;
  font-size: 12px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
}

.inventory-search-clear:hover {
  color: white;
}

.inventory-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
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
