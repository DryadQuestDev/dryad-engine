<script setup lang="ts">
import { computed } from 'vue';
import { Item } from '../../core/character/item';
import { Inventory } from '../../core/character/inventory';
import { Game } from '../../game';
import { TradeContext } from '../../systems/itemSystem';

const game = Game.getInstance();

const props = defineProps<{
  item: Item;
  targetInventory: Inventory | null;
  isParty?: boolean;
  mode?: 'loot' | 'trade';
}>();

const emit = defineEmits<{
  click: [event: MouseEvent];
  mouseenter: [event: MouseEvent];
  mouseleave: [];
}>();

// Get CSS classes from item attributes
const attributeClasses = computed(() => {
  return props.item.getAttributeClasses();
});

// Compute affordability based on context
const isAffordable = computed(() => {
  if (props.mode !== 'trade' || !props.targetInventory) return true;

  const context: TradeContext = props.isParty ? 'player' : 'trader';
  return props.item.isAffordableInContext(context, props.targetInventory);
});

// Get the price to display based on context
const displayPrice = computed(() => {
  if (props.mode !== 'trade') return null;

  // If item is in party inventory, show player price (what trader pays)
  // If item is in trader inventory, show trader price (what player pays)
  const context: TradeContext = props.isParty ? 'player' : 'trader';
  return props.item.getTradePriceInContext(context);
});

// Format price for display (show all currencies)
const formattedPrice = computed(() => {
  const price = displayPrice.value;

  // Handle falsy values or empty objects
  if (!price || typeof price !== 'object' || Object.keys(price).length === 0) {
    return [];
  }

  return Object.entries(price).map(([currencyId, amount]) => {
    const template = game.itemSystem.itemTemplatesMap.get(currencyId);
    return {
      id: currencyId,
      image: (template?.traits as any)?.image || '',
      amount: amount
    };
  });
});

// Calculate total weight for this item (weight * quantity)
const weight = computed(() => {
  const itemWeight = props.item.getTrait('weight');
  if (itemWeight && itemWeight > 0) {
    const totalWeight = itemWeight * props.item.quantity;
    return totalWeight.toFixed(1);
  }
  return null;
});

function handleClick(event: MouseEvent) {
  emit('click', event);
}

function handleMouseEnter(event: MouseEvent) {
  emit('mouseenter', event);
}

function handleMouseLeave() {
  emit('mouseleave');
}
</script>

<template>
  <div class="item-slot-wrapper" :class="attributeClasses" v-bind="{ 'data-item-uid': item.uid }">
    <div
      class="item-slot"
      :class="{ 'not-affordable': !isAffordable }"
      @click="handleClick"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
    >
      <img
        v-if="item.getTrait('image')"
        :src="item.getTrait('image')"
        :alt="item.getTrait('name')"
        class="item-icon"
      />

      <!-- Weight indicator (bottom-left) -->
      <span v-if="weight !== null" class="item-weight">{{ weight }}</span>

      <!-- Quantity indicator (bottom-right) -->
      <span class="item-quantity" v-if="item.maxStack() !== 1">{{ item.quantity }}</span>

      <!-- Trade Price Overlay (top-left) -->
      <div v-if="formattedPrice.length > 0" class="trade-price-overlay">
        <div v-for="currency in formattedPrice" :key="currency.id" class="price-item">
          <img v-if="currency.image" :src="currency.image" class="currency-icon" />
          <span class="price-amount">{{ currency.amount }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Component-specific styles */
.item-slot-wrapper {
  width: 64px;
  height: 64px;
}

.item-slot {
  position: relative;
}

/* Trade Price Overlay */
.trade-price-overlay {
  position: absolute;
  top: 2px;
  left: 2px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  pointer-events: none;
  z-index: 10;
}

.price-item {
  display: flex;
  align-items: center;
  gap: 2px;
  background: rgba(0, 0, 0, 0.85);
  border: 1px solid rgba(66, 185, 131, 0.6);
  border-radius: 3px;
  padding: 1px 3px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.currency-icon {
  width: 12px;
  height: 12px;
  object-fit: contain;
}

.price-amount {
  font-size: 10px;
  font-weight: bold;
  color: #42b983;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  line-height: 1;
}

/* Weight indicator */
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
  pointer-events: none;
  z-index: 2;
}

/* Quantity indicator */
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
  pointer-events: none;
  z-index: 2;
}
</style>
