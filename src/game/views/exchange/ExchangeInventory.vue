<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { Inventory } from '../../core/character/inventory';
import { Item } from '../../core/character/item';
import { TradeContext } from '../../systems/itemSystem';
import ItemCard from '../progression/ItemCard.vue';
import ExchangeItemSlot from './ExchangeItemSlot.vue';
import RecipeList from './RecipeList.vue';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';
import gsap from 'gsap';
import { inspectMode } from './useExchangeInspect';

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

// Floating UI setup
const isPartyInventory = computed(() => props.title === 'Party Inventory');

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

// Get visible items based on mode
const visibleItems = computed(() => {
  if (!props.inventory) return [];

  // In trade mode, filter by trade context
  if (props.mode === 'trade') {
    const context: TradeContext = props.isParty ? 'player' : 'trader';
    return props.inventory.getVisibleItems('trade', context);
  }

  // In loot mode, show all unequipped items
  return props.inventory.getVisibleItems('all');
});

// Render grid slots for fixed-size inventories
const gridSlots = computed(() => {
  if (!props.inventory) return [];
  return props.inventory.createGridSlots(visibleItems.value, props.mode);
});

const isFixedGrid = computed(() => {
  return props.inventory && props.inventory.maxSize > 0;
});

// Get inventory statistics
const availableSlotsInfo = computed(() => {
  if (!props.inventory) return null;
  return props.inventory.getInventoryStats(visibleItems.value.length);
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
      <h3>{{ title }}</h3>
      <button v-if="mode === 'loot' && !isParty" class="loot-all-button" @click="emit('lootAll')">
        Loot All
      </button>
    </div>

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

    <!-- Recipe List (only show for non-party inventory in loot mode) -->
    <RecipeList v-if="!isParty && inventory && mode === 'loot'" :inventory="inventory"
      :target-inventory="targetInventory" @recipe-select="emit('recipeSelect', $event)" />

    <!-- Fixed Grid Layout -->
    <div v-if="isFixedGrid" class="inventory-grid fixed-grid" :class="{ 'inspect-active': inspectMode }">
      <template v-for="(slot, index) in gridSlots" :key="index">
        <ExchangeItemSlot v-if="slot" :item="slot" :target-inventory="targetInventory" :is-party="isParty" :mode="mode"
          :class="{ 'overflow-item': availableSlotsInfo && availableSlotsInfo.maxSize > 0 && index >= availableSlotsInfo.maxSize }"
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
      <button class="apply-button" :class="inventory.getApplyButton()" @click="emit('apply')"></button>
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
  margin-bottom: 12px;
  gap: 8px;
  flex-wrap: wrap;
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

.inventory-stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(66, 185, 131, 0.1);
  border: 1px solid rgba(66, 185, 131, 0.3);
  border-radius: 4px;
  font-size: 0.9em;
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

.item-slot.empty {
  position: relative;
  width: 64px;
  height: 64px;
  background: rgba(42, 42, 42, 0.3);
  border: 2px dashed #444;
  border-radius: 4px;
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

.apply-button::before {
  content: "Apply";
}

.apply-button:hover {
  background: #35a372;
}

/* Custom button text overrides - examples:
   .craft::before { content: "Craft"; }
   .cook::before { content: "Cook"; background: #ff6b6b; }
   .enchant::before { content: "Enchant"; background: #9b59b6; }
*/

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
