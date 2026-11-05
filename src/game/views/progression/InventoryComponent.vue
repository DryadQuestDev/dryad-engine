<script setup lang="ts">
import { computed, ref } from 'vue';
import vTooltip from 'primevue/tooltip';
import Select from 'primevue/select';
import { useStorage } from '@vueuse/core';
import { Character } from '../../core/character/character';
import { Item } from '../../core/character/item';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import ItemGrid from './ItemGrid.vue';
import CustomComponentContainer from '../CustomComponentContainer.vue';

const game = Game.getInstance();
const COMPONENT_ID = 'inventory';

const props = withDefaults(defineProps<{
  inventory_id: string;
  /** Reference character for the "equippable" filter. Defaults to the selected character. */
  character?: Character | null;
  /** CSS max-height for the item grid; 'none' lets it fill the available height instead. */
  maxHeight?: string;
}>(), {
  maxHeight: '400px',
});

/** Sentinel category id for the built-in quest filter — matches no game-defined category. */
const QUEST_FILTER = '__quest';
/** Rarity tier the built-in quest filter collects. */
const QUEST_RARITY = 'quest';

const selectedCategory = ref('all');
const searchQuery = ref('');
const equippableOnly = ref(false);

type InventorySort = 'recent' | 'name' | 'rarity' | 'level' | 'weight';
const SORTS: InventorySort[] = ['recent', 'name', 'rarity', 'level'];
// A viewing preference, not game state: kept per browser, across games and sessions.
const sortMode = useStorage<InventorySort>('inventory_sort', 'recent');

// Weight sort only exists in a game that weighs its items. Templates, not the bag, decide it, so
// the option does not come and go as the player picks things up.
const hasWeights = computed(() =>
  [...game.itemSystem.itemTemplatesMap.values()].some(template => ((template.traits as { weight?: number } | undefined)?.weight ?? 0) > 0)
);
const availableSorts = computed<InventorySort[]>(() => hasWeights.value ? [...SORTS, 'weight'] : SORTS);
// The stored choice is shared across games, so one this game does not offer reads as Recent.
const activeSort = computed<InventorySort>({
  get: () => availableSorts.value.includes(sortMode.value) ? sortMode.value : 'recent',
  set: value => { sortMode.value = value; },
});

const inventory = computed(() => {
  return game.itemSystem.inventories.value.get(props.inventory_id);
});

const categories = computed(() =>
  [...game.itemSystem.itemCategoriesMap.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
);

const allLabel = computed(() => Global.getInstance().getString('inventory.filter.all'));
const noItemsLabel = computed(() => Global.getInstance().getString('inventory.no_items'));
const equippableLabel = computed(() => Global.getInstance().getString('inventory.filter.equippable'));
// The toggle shows a single-letter glyph rather than the full label — an abbreviation is
// language-specific, so it is a key of its own and not sliced off equippableLabel.
const equippableGlyph = computed(() => Global.getInstance().getString('inventory.filter.equippable_short'));
const questLabel = computed(() => Global.getInstance().getString('inventory.filter.quest'));
const searchPlaceholder = computed(() => Global.getInstance().getString('inventory.search'));
const sortLabel = computed(() => Global.getInstance().getString('inventory.sort'));
const sortOptions = computed(() =>
  availableSorts.value.map(id => ({ id, label: Global.getInstance().getString(`inventory.sort.${id}`) }))
);

// Rank by the rarity trait's value order; quest rarity is a story marker, not a tier, so it ranks
// with the unrated items below every real tier.
const rarityOrder = computed(() =>
  ((game.itemSystem.itemTraitsMap.get('rarity') as { values?: string[] } | undefined)?.values ?? [])
    .filter(rarity => rarity !== QUEST_RARITY)
);

function sortItems(items: Item[]): Item[] {
  const order = rarityOrder.value;
  const rank = (item: Item) => order.indexOf(item.getRarity());
  const level = (item: Item) => item.traits?.item_level || 0;
  const byName = (a: Item, b: Item) => a.getName().localeCompare(b.getName());
  const entries = items.map((item, index) => ({ item, index }));
  // Newest first, highest first, rarest first, heaviest first; the next key breaks ties, and in
  // Recent the bag order breaks a tie (one Loot All stamps every stack with the same moment).
  const compare: Record<InventorySort, (a: { item: Item; index: number }, b: { item: Item; index: number }) => number> = {
    recent: (a, b) => b.item.addedAt - a.item.addedAt || b.index - a.index,
    name: (a, b) => byName(a.item, b.item) || level(b.item) - level(a.item),
    rarity: (a, b) => rank(b.item) - rank(a.item) || level(b.item) - level(a.item) || byName(a.item, b.item),
    level: (a, b) => level(b.item) - level(a.item) || rank(b.item) - rank(a.item) || byName(a.item, b.item),
    weight: (a, b) => b.item.getWeight() - a.item.getWeight() || rank(b.item) - rank(a.item) || byName(a.item, b.item),
  };
  return entries.sort(compare[activeSort.value]).map(entry => entry.item);
}

const isFiltering = computed(() => selectedCategory.value !== 'all' || searchQuery.value.trim() !== '' || equippableOnly.value);

const filteredItems = computed(() => {
  const inv = inventory.value;
  if (!inv) return [];
  let items = inv.getUnequippedItems();
  if (selectedCategory.value === QUEST_FILTER) {
    items = items.filter(item => item.getRarity() === QUEST_RARITY);
  } else if (selectedCategory.value !== 'all') {
    items = items.filter(item => item.category === selectedCategory.value);
  }
  const query = searchQuery.value.trim().toLowerCase();
  if (query) {
    items = items.filter(item => (item.traits?.name || '').toLowerCase().includes(query));
  }
  if (equippableOnly.value) {
    const char = props.character || game.characterSystem.selectedCharacter.value;
    items = char ? items.filter(item => char.getAvailableSlotsForItem(item).length > 0) : [];
  }
  return sortItems(items);
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
        <div class="inventory-filter-tab" :class="{ active: selectedCategory === QUEST_FILTER }"
          v-tooltip.top="questLabel" @click="selectedCategory = QUEST_FILTER">
          <span class="inventory-filter-icon inventory-filter-icon-quest"></span>
        </div>
        <div class="inventory-filter-tab inventory-filter-toggle" :class="{ active: equippableOnly }"
          v-tooltip.top="equippableLabel" @click="equippableOnly = !equippableOnly">
          {{ equippableGlyph }}
        </div>
        <Select v-model="activeSort" :options="sortOptions" option-label="label" option-value="id"
          class="inventory-sort" v-tooltip.top="sortLabel" :pt="{ overlay: { class: 'dark-mode-dropdown' } }" />
        <div class="inventory-search-wrap">
          <input v-model="searchQuery" type="text" class="inventory-search" :placeholder="searchPlaceholder" />
          <i v-if="searchQuery" class="pi pi-times inventory-search-clear" @click="searchQuery = ''"></i>
        </div>
      </div>
    </div>

    <div class="inventory-content">
      <div v-if="filteredItems.length === 0" class="inventory-empty">{{ noItemsLabel }}</div>
      <ItemGrid v-else :items="gridSlots" :max-height="props.maxHeight" />
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

.inventory-sort {
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.4);
  box-shadow: none;
}

.inventory-sort:hover {
  border-color: rgba(255, 255, 255, 0.3);
}

.inventory-sort :deep(.p-select-label) {
  padding: 6px 4px 6px 10px;
  color: white;
  font-size: 13px;
}

.inventory-sort :deep(.p-select-dropdown) {
  width: 26px;
  color: rgba(255, 255, 255, 0.6);
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
