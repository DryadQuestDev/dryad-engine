<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import vTooltip from 'primevue/tooltip';
import { Inventory } from '../../core/character/inventory';
import { Item } from '../../core/character/item';
import { TradeContext } from '../../systems/itemSystem';
import ItemCard from '../progression/ItemCard.vue';
import ExchangeItemSlot from './ExchangeItemSlot.vue';
import RecipeList from './RecipeList.vue';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';
import gsap from 'gsap';
import { inspectMode } from './useExchangeInspect';
import { selectedCategory, QUEST_FILTER, QUEST_RARITY } from './useExchangeFilter';
import { Global } from '../../../global/global';
import { Game } from '../../game';

const game = Game.getInstance();

// Hover state for item cards (desktop hover + inspect-mode pin)
const hoveredItemUid = ref<string | null>(null);
const pinnedItemUid = ref<string | null>(null);
const referenceElement = ref<HTMLElement | null>(null);
const floatingElement = ref<HTMLElement | null>(null);

const props = defineProps<{
  inventory: Inventory | null;
  targetInventory: Inventory | null;
  title: string;
  mode: 'loot' | 'trade';
  isParty?: boolean;
}>();

const emit = defineEmits<{
  itemClick: [item: Item, source: Inventory, target: Inventory, event: MouseEvent];
  apply: [];
  lootAll: [];
  recipeSelect: [recipeId: string];
}>();

// Floating UI setup — the party panel sits on the left, so its cards open rightwards.
const isPartyInventory = computed(() => !!props.isParty);

const { floatingStyles } = useFloating(referenceElement, floatingElement, {
  placement: computed(() => isPartyInventory.value ? 'right-start' : 'left-start'),
  strategy: 'fixed',
  middleware: [
    offset(8),
    flip({ padding: 8 }),
    shift({ padding: 8 })
  ],
  whileElementsMounted: autoUpdate
});

// Everything this panel would show with no category tab selected — the trade-context
// (or loot) filter only. Slot/weight stats and the overflow marker read THIS list, so
// clicking a tab never changes what the panel reports about the inventory itself.
const modeItems = computed(() => {
  if (!props.inventory) return [];

  // In trade mode, filter by trade context
  if (props.mode === 'trade') {
    const context: TradeContext = props.isParty ? 'player' : 'trader';
    return props.inventory.getVisibleItems('trade', context);
  }

  // In loot mode, show all unequipped items
  return props.inventory.getVisibleItems('all');
});

// Category tabs, ordered as the game authored them. The map is filled once at load
// and never mutated, so this resolves to a stable list.
const categories = computed(() =>
  [...game.itemSystem.itemCategoriesMap.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
);

// The bar is a trade affordance: it exists to compare your stock against the trader's.
const showFilterBar = computed(() => props.mode === 'trade' && categories.value.length > 0);

// Gated on showFilterBar so a category left selected by a previous trade can never
// filter a loot panel that has no bar to clear it with.
const isFiltering = computed(() => showFilterBar.value && selectedCategory.value !== 'all');

// Categories holding nothing in THIS panel are dimmed rather than dropped — both panels
// share one selection, so their tab sets have to stay identical and stop reflowing as
// items move across.
const presentCategories = computed(() => new Set(modeItems.value.map(item => item.category)));
const hasQuestItems = computed(() => modeItems.value.some(item => item.getRarity() === QUEST_RARITY));

// Get visible items based on mode, narrowed by the shared category tab
const visibleItems = computed(() => {
  if (!isFiltering.value) return modeItems.value;
  if (selectedCategory.value === QUEST_FILTER) {
    return modeItems.value.filter(item => item.getRarity() === QUEST_RARITY);
  }
  return modeItems.value.filter(item => item.category === selectedCategory.value);
});

// Render grid slots for fixed-size inventories
const gridSlots = computed(() => {
  if (!props.inventory) return [];
  // A filtered list has no meaningful slot positions, so skip the empty-socket padding:
  // createGridSlots pads from the inventory's true free space and would draw a full tail
  // of sockets behind two matching items. The Slots chip still reports the real count.
  if (isFiltering.value) return visibleItems.value;
  return props.inventory.createGridSlots(visibleItems.value, props.mode);
});

const isFixedGrid = computed(() => {
  return props.inventory && props.inventory.maxSize > 0;
});

// Overflowing items are the tail of the unequipped list — a property of the item, not of
// its position in a grid that filtering reorders.
const overflowUids = computed(() => {
  const inv = props.inventory;
  if (!inv || inv.maxSize <= 0) return new Set<string>();
  return new Set(inv.getUnequippedItems().slice(inv.maxSize).map(item => item.uid));
});

// Resolve a locale key: the game's own locale first (so devs can define/override button names like
// "apply_button.enchant"), then the engine's built-in locale. Returns null if neither defines it.
function resolveLocale(key: string): string | null {
  if (game.coreSystem.localeMap?.has(key)) return game.getLine(key);
  const g = Global.getInstance();
  if (g.localeMap.has(key)) return g.getString(key);
  return null;
}

// Apply-button label, keyed by the inventory's interaction type (e.g. 'craft' → "apply_button.craft").
// Falls back to the generic "apply_button" for plain loot or an undefined interaction type.
const applyLabel = computed(() => {
  const kind = props.inventory?.getApplyButton();
  const specific = kind ? `apply_button.${kind}` : null;
  return (specific && resolveLocale(specific)) || resolveLocale('apply_button') || 'Apply';
});

// Tab labels resolve through the game's locale first, so a game renaming
// "inventory.filter.all" renames it here and on the character sheet alike.
const allLabel = computed(() => resolveLocale('inventory.filter.all') || 'All');
const questLabel = computed(() => resolveLocale('inventory.filter.quest') || 'Quest Items');
const noItemsLabel = computed(() => resolveLocale('inventory.no_items') || 'No items');

// Get inventory statistics — counted before the category tab narrows the list, so the
// Slots/Weight chips keep describing the inventory rather than the current tab.
const availableSlotsInfo = computed(() => {
  if (!props.inventory) return null;
  return props.inventory.getInventoryStats(modeItems.value.length);
});

function handleItemClick(item: Item, event: MouseEvent) {
  // In inspect mode, pin the info popup instead of buying/moving
  if (inspectMode.value) {
    if (pinnedItemUid.value === item.uid) {
      pinnedItemUid.value = null;
      referenceElement.value = null;
      return;
    }
    pinnedItemUid.value = item.uid;
    hoveredItemUid.value = null;
    const target = event.currentTarget as HTMLElement;
    const slotWrapper = target.closest('.item-slot-wrapper') as HTMLElement | null;
    referenceElement.value = slotWrapper || target;
    return;
  }

  if (!props.inventory || !props.targetInventory) return;
  emit('itemClick', item, props.inventory, props.targetInventory, event);
}

function handleItemHover(item: Item | null, event?: MouseEvent) {
  // If an item is pinned (inspect mode), hover doesn't override it
  if (pinnedItemUid.value) return;

  hoveredItemUid.value = item?.uid || null;

  if (item && event) {
    referenceElement.value = event.currentTarget as HTMLElement;
  } else {
    referenceElement.value = null;
  }
}

// When the shared inspect toggle flips OFF, each ExchangeInventory instance
// clears its own pinned popup. The toggle button itself now lives in the
// parent OverlayExchange header.
watch(inspectMode, (active) => {
  if (!active) {
    pinnedItemUid.value = null;
    referenceElement.value = null;
  }
});

function handleDocumentClick(e: MouseEvent) {
  if (!pinnedItemUid.value) return;
  const target = e.target as HTMLElement;
  // Clicking another item slot → its click handler will re-pin / toggle
  if (target.closest('.item-slot-wrapper')) return;
  // Clicking the inspect toggle → let it handle
  if (target.closest('.inspect-toggle')) return;
  // Otherwise clear the pinned popup but keep inspect mode on
  pinnedItemUid.value = null;
  referenceElement.value = null;
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick);
});
onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick);
});

// Get the currently displayed item — pinned wins over hovered.
const hoveredItem = computed(() => {
  const uid = pinnedItemUid.value || hoveredItemUid.value;
  if (!uid) return null;
  return visibleItems.value.find(item => item.uid === uid) || null;
});

// An item can leave the panel without a mouseleave — switching tab, or the other side
// buying it. Left alone, a stale pin keeps hover popups suppressed (handleItemHover
// early-returns while pinned) and leaves useFloating anchored to a detached node.
watch(visibleItems, (items) => {
  const stillShown = (uid: string | null) => !!uid && items.some(item => item.uid === uid);
  if (!stillShown(pinnedItemUid.value)) pinnedItemUid.value = null;
  if (!stillShown(hoveredItemUid.value)) hoveredItemUid.value = null;
  if (!pinnedItemUid.value && !hoveredItemUid.value) referenceElement.value = null;
});

// Watch for newly crafted items and animate them
watch(() => props.inventory?.items, (newItems, oldItems) => {
  if (!newItems || !oldItems) return;

  // Find items that were just crafted
  const craftedItems = newItems.filter((item: any) => item._justCrafted);

  if (craftedItems.length > 0) {
    nextTick(() => {
      craftedItems.forEach((item: any) => {
        // Find the DOM element for this item
        const element = document.querySelector(`[data-item-uid="${item.uid}"]`);
        if (element) {
          // Animate with a flash and scale effect
          gsap.fromTo(element,
            {
              scale: 1.5,
              opacity: 0,
            },
            {
              scale: 1,
              opacity: 1,
              duration: 0.6,
              ease: 'back.out(1.7)',
              onComplete: () => {
                // Add a glow effect
                gsap.to(element, {
                  boxShadow: '0 0 20px rgba(66, 185, 131, 0.8)',
                  duration: 0.3,
                  yoyo: true,
                  repeat: 1,
                  onComplete: () => {
                    // Clean up the flag
                    delete item._justCrafted;
                  }
                });
              }
            }
          );
        } else {
          // Clean up flag even if element not found
          delete item._justCrafted;
        }
      });
    });
  }
}, { deep: true });

</script>

<template>
  <div class="exchange-inventory-container">
    <div class="inventory-header">
      <div class="inventory-title-row">
        <h3>{{ title }}</h3>

        <!-- Inventory Stats (only show if maxSize or maxWeight is set) -->
        <div v-if="availableSlotsInfo && (availableSlotsInfo.maxSize > 0 || availableSlotsInfo.maxWeight > 0)"
          class="inventory-stats">
          <!-- Slots info -->
          <div v-if="availableSlotsInfo.maxSize > 0" class="stat-item"
            :class="{ 'overflow': availableSlotsInfo.isOverflowing }">
            <span class="stat-label">Slots:</span>
            <span class="stat-value">
              {{ availableSlotsInfo.unequippedCount }}/{{ availableSlotsInfo.maxSize }}
            </span>
          </div>

          <!-- Weight info -->
          <div v-if="availableSlotsInfo.maxWeight > 0" class="stat-item"
            :class="{ 'overflow': availableSlotsInfo.currentWeight > availableSlotsInfo.maxWeight }">
            <span class="stat-label">Weight:</span>
            <span class="stat-value">
              {{ availableSlotsInfo.currentWeight.toFixed(1) }}/{{ availableSlotsInfo.maxWeight }}
            </span>
          </div>
        </div>
      </div>

      <button v-if="mode === 'loot' && !isParty" class="loot-all-button" @click="emit('lootAll')">
        Loot All
      </button>
    </div>

    <!-- Category tabs. Both panels write the one shared `selectedCategory`, so picking a
         tab on either side filters this panel and the opposite one together. -->
    <div v-if="showFilterBar" class="exchange-filter-tabs" role="tablist">
      <button type="button" role="tab" class="exchange-filter-tab"
        :class="{ active: selectedCategory === 'all' }" :aria-selected="selectedCategory === 'all'"
        :aria-label="allLabel" v-tooltip.top="allLabel" @click="selectedCategory = 'all'">
        <span class="exchange-filter-icon inventory-filter-icon-all"></span>
      </button>

      <button v-for="cat in categories" :key="cat.id" type="button" role="tab" class="exchange-filter-tab"
        :class="{ active: selectedCategory === cat.id, vacant: !presentCategories.has(cat.id) }"
        :aria-selected="selectedCategory === cat.id" :aria-label="cat.name || cat.id"
        v-tooltip.top="cat.name || cat.id" @click="selectedCategory = cat.id">
        <img v-if="cat.icon" :src="cat.icon" :alt="cat.name || cat.id" class="exchange-filter-icon" />
        <span v-else class="exchange-filter-chip">{{ cat.name || cat.id }}</span>
      </button>

      <button type="button" role="tab" class="exchange-filter-tab"
        :class="{ active: selectedCategory === QUEST_FILTER, vacant: !hasQuestItems }"
        :aria-selected="selectedCategory === QUEST_FILTER" :aria-label="questLabel"
        v-tooltip.top="questLabel" @click="selectedCategory = QUEST_FILTER">
        <span class="exchange-filter-icon inventory-filter-icon-quest"></span>
      </button>
    </div>

    <!-- Recipe List (only show for non-party inventory in loot mode) -->
    <RecipeList v-if="!isParty && inventory && mode === 'loot'" :inventory="inventory"
      :target-inventory="targetInventory" @recipe-select="emit('recipeSelect', $event)" />

    <!-- Nothing matches the active tab -->
    <div v-if="isFiltering && visibleItems.length === 0" class="exchange-empty">{{ noItemsLabel }}</div>

    <!-- Fixed Grid Layout -->
    <div v-else-if="isFixedGrid" class="inventory-grid fixed-grid" :class="{ 'inspect-active': inspectMode }">
      <template v-for="(slot, index) in gridSlots" :key="slot ? slot.uid : `empty-${index}`">
        <ExchangeItemSlot v-if="slot" :item="slot" :target-inventory="targetInventory" :is-party="isParty" :mode="mode"
          :class="{ 'overflow-item': overflowUids.has(slot.uid) }"
          @click="handleItemClick(slot, $event)" @mouseenter="handleItemHover(slot, $event)"
          @mouseleave="handleItemHover(null)" />
        <div v-else class="item-slot empty"></div>
      </template>
    </div>

    <!-- Dynamic Grid (unlimited inventory) -->
    <div v-else class="inventory-grid dynamic-grid" :class="{ 'inspect-active': inspectMode }">
      <ExchangeItemSlot v-for="item in visibleItems" :key="item.uid" :item="item" :target-inventory="targetInventory"
        :is-party="isParty" :mode="mode" @click="handleItemClick(item, $event)"
        @mouseenter="handleItemHover(item, $event)" @mouseleave="handleItemHover(null)" />
    </div>

    <!-- Action Buttons -->
    <div v-if="inventory?.getApplyButton()" class="action-buttons">
      <button class="apply-button" :class="inventory.getApplyButton()" @click="emit('apply')">{{ applyLabel }}</button>
    </div>

  </div>

  <!-- ItemCard popup at root level (outside container) -->
  <Teleport to="body">
    <div v-if="hoveredItem" ref="floatingElement" class="item-card-popup-exchange" :style="{
      ...floatingStyles,
      zIndex: 10000,
      pointerEvents: 'none',
      willChange: 'transform'
    }">
      <ItemCard :item="hoveredItem" />
    </div>
  </Teleport>
</template>

<style scoped>
.exchange-inventory-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(10, 15, 25, 0.3);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 12px;
  overflow: visible;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.inventory-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 8px;
  flex-wrap: wrap;
}

/* Title and the slot/weight readout share the header row; the Loot All button keeps
   the far edge. min-width:0 lets a long inventory name ellipsize instead of pushing
   the chips out of the panel. */
.inventory-title-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  min-width: 0;
}

.inventory-grid.inspect-active {
  cursor: help;
}

.inventory-grid.inspect-active .item-slot {
  cursor: help;
}

.exchange-inventory-container h3 {
  margin: 0;
  font-size: 1.2em;
  color: #47bbff;
}

/* Category tabs. Namespaced away from the character sheet's `.inventory-filter-*`
   bar: games ship unscoped global stylesheets that already reach for those names,
   and the two bars sit in very different amounts of horizontal room. */
.exchange-filter-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 10px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
}

.exchange-filter-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 7px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, opacity 0.2s;
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  color: #fff;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid transparent;
}

.exchange-filter-tab:hover {
  background: rgba(0, 0, 0, 0.6);
  border-color: rgba(255, 255, 255, 0.15);
}

.exchange-filter-tab.active {
  background: rgba(0, 0, 0, 0.75);
  border-color: rgba(71, 187, 255, 0.6);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

/* A category this side has nothing in. Dimmed rather than hidden: the two panels share
   one selection, so their tab sets have to line up — and "the trader stocks no weapons"
   is worth showing. Still clickable, since the opposite panel may well have some. */
.exchange-filter-tab.vacant {
  opacity: 0.35;
}

.exchange-filter-tab.vacant.active,
.exchange-filter-tab.vacant:hover {
  opacity: 0.7;
}

/* The engine's built-in .inventory-filter-icon-all / -quest classes supply only a
   background-image, so the box itself has to be declared here. */
.exchange-filter-icon {
  width: 18px;
  height: 18px;
  object-fit: contain;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  flex-shrink: 0;
}

/* Fallback label for a category the game gave no icon. Every tab keeps a fixed width
   regardless of which one is active: the bar wraps, and a tab that grew on selection
   would reflow the rows and shift the whole bottom-anchored overlay under the cursor. */
.exchange-filter-chip {
  white-space: nowrap;
  line-height: 18px;
}

.exchange-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 80px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}

/* Bare chips beside the title — the enclosing panel look the stats used to carry made
   sense as a full-width band, but reads as a second header inline next to one. */
.inventory-stats {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(66, 185, 131, 0.1);
  border: 1px solid rgba(66, 185, 131, 0.3);
  border-radius: 4px;
  font-size: 0.8em;
  line-height: 1.5;
}

.stat-item.overflow {
  background: rgba(255, 69, 58, 0.15);
  border-color: rgba(255, 69, 58, 0.5);
}

.stat-item.stat-info {
  background: rgba(100, 150, 200, 0.1);
  border-color: rgba(100, 150, 200, 0.3);
}

.stat-label {
  color: #999;
  font-weight: 600;
}

.stat-value {
  color: #42b983;
  font-weight: bold;
}

.stat-item.overflow .stat-value {
  color: #ff453a;
}

.stat-item.stat-info .stat-value {
  color: #64a0e6;
}

.stat-available {
  color: #888;
  font-size: 0.9em;
  font-weight: normal;
}

.inventory-grid {
  flex: 1;
  overflow-y: auto;
  overflow-x: visible;
  display: grid;
  grid-template-columns: repeat(auto-fill, 64px);
  gap: 8px;
  padding: 4px;
  align-content: start;
  max-height: 40vh;
  max-height: 40dvh;
}

.inventory-grid.fixed-grid {
  /* grid-template-columns: repeat(4, 64px); */
  grid-template-columns: repeat(auto-fill, 64px);
  overflow-y: auto;
  overflow-x: visible;
}

.inventory-grid.dynamic-grid {
  grid-template-columns: repeat(auto-fill, 64px);
  overflow-y: auto;
  overflow-x: visible;
}

/* Empty sockets read as recessed against the filled, rarity-tinted bricks. */
.item-slot.empty {
  position: relative;
  width: 64px;
  height: 64px;
  background-color: rgba(16, 18, 22, 0.55);
  background-image:
    var(--slot-noise),
    linear-gradient(160deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.25));
  background-size: 140px 140px, auto;
  background-blend-mode: soft-light, normal;
  border: 1px solid rgba(120, 128, 145, 0.28);
  border-radius: 5px;
  box-shadow:
    inset 0 2px 6px rgba(0, 0, 0, 0.7),
    inset 0 -1px 0 rgba(255, 255, 255, 0.05);
  cursor: default;
}

.action-buttons {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
}

.apply-button {
  padding: 8px 16px;
  background: #42b983;
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  transition: background 0.2s;
}

.apply-button:hover {
  background: #35a372;
}

/* The button label comes from the locale (applyLabel → "apply_button" / "apply_button.<interactive>").
   The inventory's `interactive` value is still added as a class here for per-interaction styling, e.g.:
   .apply-button.enchant { background: #9b59b6; } */

.loot-all-button {
  padding: 8px 16px;
  background: linear-gradient(135deg, #ffa500 0%, #ff8c00 100%);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  box-shadow: 0 2px 4px rgba(255, 165, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}

.loot-all-button::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
  transition: left 0.5s ease;
}

.loot-all-button:hover::before {
  left: 100%;
}

.loot-all-button:hover {
  background: linear-gradient(135deg, #ff8c00 0%, #ff7700 100%);
  box-shadow: 0 4px 8px rgba(255, 165, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
  transform: translateY(-1px);
}

.loot-all-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 2px rgba(255, 165, 0, 0.3),
    inset 0 1px 2px rgba(0, 0, 0, 0.2);
}

/* Scrollbar styling */
.inventory-grid::-webkit-scrollbar {
  width: 8px;
}

.inventory-grid::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.inventory-grid::-webkit-scrollbar-thumb {
  background: rgba(66, 185, 131, 0.4);
  border-radius: 4px;
  transition: background 0.2s;
}

.inventory-grid::-webkit-scrollbar-thumb:hover {
  background: rgba(66, 185, 131, 0.6);
}

/* Overflow item styling */
.overflow-item {
  position: relative;
}

.overflow-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 2px solid rgba(255, 69, 58, 0.6);
  border-radius: 4px;
  pointer-events: none;
  z-index: 1;
  box-shadow: 0 0 8px rgba(255, 69, 58, 0.4);
}
</style>
