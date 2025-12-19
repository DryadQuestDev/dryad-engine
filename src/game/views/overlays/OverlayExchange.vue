<script setup lang="ts">
import { computed, ref } from 'vue';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import { PARTY_INVENTORY_ID, TradeContext } from '../../systems/itemSystem';
import { Item } from '../../core/character/item';
import { Inventory } from '../../core/character/inventory';
import ExchangeInventory from '../exchange/ExchangeInventory.vue';
import ItemCard from '../progression/ItemCard.vue';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';
import { gameLogger } from '../../utils/logger';

const game = Game.getInstance();
const global = Global.getInstance();
const COMPONENT_ID = 'overlay-exchange';

// Currency hover state
const hoveredCurrencyId = ref<string | null>(null);
const hoveredCurrencyIsParty = ref(false);
const currencyReferenceElement = ref<HTMLElement | null>(null);
const currencyFloatingElement = ref<HTMLElement | null>(null);

// Floating UI for currency ItemCard
const { floatingStyles: currencyFloatingStyles } = useFloating(currencyReferenceElement, currencyFloatingElement, {
  placement: computed(() => hoveredCurrencyIsParty.value ? 'top-start' : 'top-end'),
  strategy: 'fixed',
  middleware: [
    offset(8),
    shift({ padding: 8 })
  ],
  whileElementsMounted: autoUpdate
});

// Quantity popup state
const showQuantityPopup = ref(false);
const quantityPopupItem = ref<Item | null>(null);
const quantityPopupSource = ref<Inventory | null>(null);
const quantityPopupTarget = ref<Inventory | null>(null);
const selectedQuantity = ref(1);
const popupPosition = ref({ x: 0, y: 0, isParty: true });

// Max quantity computed for popup
const maxQuantity = computed(() => {
  return quantityPopupItem.value?.quantity || 1;
});

// Get inventories
const partyInventory = computed(() => {
  return game.itemSystem.getInventory(PARTY_INVENTORY_ID);
});

const exchangeInventory = computed(() => {
  const inventoryId = game.itemSystem.exchangeInventoryId.value;
  const inventory = game.itemSystem.getInventory(inventoryId);

  if (!inventory) {
    gameLogger.error(`Inventory with ID "${inventoryId}" does not exist`);
  }

  return inventory;
});

const mode = computed(() => game.itemSystem.exchangeState.value);

// Get all unique currencies used across both inventories (in consistent order)
const allCurrencyIds = computed(() => {
  if (mode.value !== 'trade') return [];

  const currencySet = new Set<string>();

  // Collect currencies from party inventory
  if (partyInventory.value) {
    const partyCurrencies = partyInventory.value.getCurrencies();
    Object.keys(partyCurrencies).forEach(id => currencySet.add(id));
  }

  // Collect currencies from exchange inventory
  if (exchangeInventory.value) {
    const exchangeCurrencies = exchangeInventory.value.getCurrencies();
    Object.keys(exchangeCurrencies).forEach(id => currencySet.add(id));
  }

  // Return sorted array for consistent ordering
  return Array.from(currencySet).sort();
});

// Helper function to get currency display for an inventory with all currencies
function getCurrencyDisplay(inventory: Inventory | null) {
  if (mode.value !== 'trade' || !inventory) {
    return [];
  }

  const currencies = inventory.getCurrencies();

  // Show all currencies that exist across both inventories, in the same order
  return allCurrencyIds.value.map(currencyId => {
    const template = game.itemSystem.itemTemplatesMap.get(currencyId);
    return {
      id: currencyId,
      name: (template?.traits as any)?.name || currencyId,
      image: (template?.traits as any)?.image || '',
      amount: currencies[currencyId] || 0
    };
  });
}

// Currency displays for both inventories
const partyCurrencyDisplay = computed(() => getCurrencyDisplay(partyInventory.value));
const exchangeCurrencyDisplay = computed(() => getCurrencyDisplay(exchangeInventory.value));

// Get the currently hovered currency as an Item
const hoveredCurrencyItem = computed(() => {
  if (!hoveredCurrencyId.value) return null;

  // Create a temporary item from the currency template for display purposes
  const template = game.itemSystem.itemTemplatesMap.get(hoveredCurrencyId.value);
  if (!template) return null;

  return game.itemSystem.createItemFromTemplate(hoveredCurrencyId.value);
});

// Currency hover handlers
function handleCurrencyHover(currencyId: string, event: MouseEvent) {
  hoveredCurrencyId.value = currencyId;
  currencyReferenceElement.value = event.currentTarget as HTMLElement;
}

function handleCurrencyLeave() {
  hoveredCurrencyId.value = null;
  currencyReferenceElement.value = null;
}

// Handle item click (called from both inventories)
function handleItemClick(item: Item, source: Inventory, target: Inventory, event: MouseEvent) {
  if (event.shiftKey) {
    // Shift+click: Move 1 item
    moveItem(item, source, target, 1);
  } else {
    // Regular click: Show quantity popup (or move directly if only 1 item)
    if (item.quantity === 1) {
      moveItem(item, source, target, 1);
    } else {
      openQuantityPopup(item, source, target, event);
    }
  }
}

// Move item with trade validation
function moveItem(item: Item, source: Inventory, target: Inventory, quantity: number): boolean {
  // In trade mode, handle currency exchange
  if (mode.value === 'trade') {
    // Determine which context based on who owns the item
    // If source is party inventory, use player context (what trader pays player)
    // If source is trader inventory, use trader context (what trader charges player)
    const isSourceParty = source.id === PARTY_INVENTORY_ID;
    const context: TradeContext = isSourceParty ? 'player' : 'trader';

    // Check if item is tradable in this context
    if (item.isTradableInContext(context)) {
      const pricePerItem = item.getTradePriceInContext(context);

      // Calculate total price for quantity
      const totalPrice: Record<string, number> = {};
      for (const [currencyId, amount] of Object.entries(pricePerItem)) {
        totalPrice[currencyId] = amount * quantity;
      }

      // Check if buyer can afford BEFORE attempting transfer
      if (!target.canAffordPrice(totalPrice)) {
        global.addNotificationId('not_enough_currency');
        return false;
      }

      // Try to transfer the item first - if this fails, no currency changes hands
      const transferSuccess = source.transferTo(target, item, quantity);
      if (!transferSuccess) {
        return false; // Transfer failed (inventory full, etc.), no currency exchanged
      }

      // Transfer succeeded - now exchange currency
      // Deduct currency from buyer (target = the inventory receiving the item)
      if (!target.deductCurrency(totalPrice)) {
        // This shouldn't happen since we checked canAfford, but handle it anyway
        // Need to reverse the item transfer
        target.transferTo(source, item, quantity);
        global.addNotificationId('not_enough_currency');
        return false;
      }

      // Add currency to seller (source = the inventory giving away the item)
      // Skip validation to allow currency payment even if inventory is over weight/size limit
      for (const [currencyId, amount] of Object.entries(totalPrice)) {
        const currencyItem = game.itemSystem.createItemFromTemplate(currencyId);
        source.addItem(currencyItem, amount, true); // true = skipValidation
      }

      return true;
    }
  }

  // Non-trade mode or non-tradable item: just transfer
  return source.transferTo(target, item, quantity);
}

// Open quantity popup
function openQuantityPopup(item: Item, source: Inventory, target: Inventory, event: MouseEvent) {
  quantityPopupItem.value = item;
  quantityPopupSource.value = source;
  quantityPopupTarget.value = target;
  selectedQuantity.value = 1;

  // Center the popup on screen
  popupPosition.value = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    isParty: true // Not used for centered popup
  };

  showQuantityPopup.value = true;
}

// Confirm quantity selection
function confirmQuantity() {
  const item = quantityPopupItem.value;
  const source = quantityPopupSource.value;
  const target = quantityPopupTarget.value;

  if (item && source && target) {
    // Clamp quantity to max available
    const quantity = Math.min(selectedQuantity.value, maxQuantity.value);
    moveItem(item, source as unknown as Inventory, target as unknown as Inventory, quantity);
  }
  closeQuantityPopup();
}

// Move all items
function moveAllQuantity() {
  const item = quantityPopupItem.value;
  const source = quantityPopupSource.value;
  const target = quantityPopupTarget.value;

  if (item && source && target) {
    moveItem(item, source as unknown as Inventory, target as unknown as Inventory, maxQuantity.value);
  }
  closeQuantityPopup();
}

// Close quantity popup
function closeQuantityPopup() {
  showQuantityPopup.value = false;
  quantityPopupItem.value = null;
  quantityPopupSource.value = null;
  quantityPopupTarget.value = null;
}

// Handle Apply button
function handleApply() {
  if (exchangeInventory.value) {
    exchangeInventory.value.apply();
  }
}

// Handle Loot All button
function handleLootAll() {
  if (!exchangeInventory.value || !partyInventory.value) return;

  // Create a shallow copy of items array to avoid mutation issues during iteration
  const items = [...exchangeInventory.value.items.filter(item => !item.isEquipped)];
  let looted = 0;
  let total = items.length;
  let failureReason: string | null = null;

  for (const item of items) {
    // In trade mode, check affordability first
    if (mode.value === 'trade') {
      const context: TradeContext = false ? 'player' : 'trader'; // Exchange inventory context is 'trader'

      if (item.isTradableInContext(context)) {
        const pricePerItem = item.getTradePriceInContext(context);
        const totalPrice: Record<string, number> = {};

        for (const [currencyId, amount] of Object.entries(pricePerItem)) {
          totalPrice[currencyId] = amount * item.quantity;
        }

        // Check if we can afford before trying to transfer
        if (!partyInventory.value.canAffordPrice(totalPrice)) {
          if (!failureReason) failureReason = 'cannot_afford';
          continue; // Skip this item, try next
        }

        // Deduct currency from buyer (party)
        if (!partyInventory.value.deductCurrency(totalPrice)) {
          if (!failureReason) failureReason = 'cannot_afford';
          continue;
        }

        // Add currency to seller (exchange)
        for (const [currencyId, amount] of Object.entries(totalPrice)) {
          const currencyItem = game.itemSystem.createItemFromTemplate(currencyId);
          exchangeInventory.value.addItem(currencyItem, amount);
        }
      }
    }

    // Transfer the item silently (suppress individual notifications)
    const success = exchangeInventory.value.transferTo(
      partyInventory.value,
      item,
      item.quantity,
      true // silentFail = true
    );

    if (success) {
      looted++;
    } else {
      // Track failure reason if not already set
      if (!failureReason) failureReason = 'inventory_full';
      // Continue trying to loot other items
    }
  }

  // Show single notification at the end
  if (looted === total) {
    // All items looted successfully
    //global.addNotificationId('loot_all_success', { count: looted });
  } else if (looted > 0) {
    // Partial success
    //global.addNotificationId('loot_all_partial', { looted: looted, total: total });
  } else {
    // Nothing looted
    if (failureReason === 'cannot_afford') {
      global.addNotificationId('not_enough_currency');
    } else if (failureReason === 'inventory_full') {
      global.addNotificationId('target_inventory_full');
    } else {
      global.addNotificationId('loot_all_failed');
    }
  }
}

// Handle recipe selection - transfer ingredients from party to exchange inventory
function handleRecipeSelect(recipeId: string) {
  if (!exchangeInventory.value || !partyInventory.value) return;

  const recipe = game.itemSystem.itemRecipesMap.get(recipeId);
  if (!recipe || !recipe.input_items) return;

  // Set the selected recipe
  exchangeInventory.value.selectedRecipeId = recipeId;

  // Track if any transfer failed to stop trying after first failure
  let anyTransferFailed = false;

  // Check current ingredients in exchange inventory
  for (const input of recipe.input_items) {
    const itemId = input.item_id || '';
    const requiredQuantity = input.quantity || 1;

    // Count existing items in exchange inventory
    const exchangeItems = exchangeInventory.value.getItemsById(itemId).filter(i => !i.isEquipped);
    const existingQuantity = exchangeItems.reduce((sum, item) => sum + item.quantity, 0);

    // Calculate how many more we need
    const neededQuantity = requiredQuantity - existingQuantity;

    if (neededQuantity > 0) {
      // Transfer the needed amount from party inventory
      const partyItems = partyInventory.value.getItemsById(itemId).filter(i => !i.isEquipped);

      let remainingToTransfer = neededQuantity;
      for (const partyItem of partyItems) {
        if (remainingToTransfer <= 0) break;
        if (anyTransferFailed) break; // Stop trying if we already failed

        const transferAmount = Math.min(partyItem.quantity, remainingToTransfer);

        const success = partyInventory.value.transferTo(
          exchangeInventory.value,
          partyItem,
          transferAmount
        );

        if (success) {
          remainingToTransfer -= transferAmount;
        } else {
          // Transfer failed (likely inventory full)
          anyTransferFailed = true;
          break;
        }
      }
    }
  }
}

// Close overlay
function close() {
  if (!exchangeInventory.value) {
    return;
  }
  game.itemSystem.closeExchangeInventory(exchangeInventory.value);
}
</script>

<template>
  <div :id="COMPONENT_ID" class="overlay-exchange">
    <div class="exchange-header">
      <h2>{{ mode === 'loot' ? 'Loot' : 'Trade' }}</h2>
      <button class="close-button" @click="close">✕</button>
    </div>

    <div class="exchange-body">
      <div class="inventory-with-currency">
        <!-- Party Currency Display (Left) -->
        <div v-if="mode === 'trade' && partyCurrencyDisplay.length > 0" class="currency-display">
          <div v-for="currency in partyCurrencyDisplay" :key="currency.id" class="currency-item"
            @mouseenter="handleCurrencyHover(currency.id, $event)" @mouseleave="handleCurrencyLeave">
            <img v-if="currency.image" :src="currency.image" :alt="currency.name" class="currency-image" />
            <span class="currency-amount">{{ currency.amount }}</span>
          </div>
        </div>

        <ExchangeInventory :inventory="partyInventory" :target-inventory="exchangeInventory"
          :title="partyInventory?.name || 'Party Inventory'" :mode="mode" :is-party="true"
          @item-click="handleItemClick" />
      </div>

      <div class="inventory-with-currency">
        <!-- Exchange Currency Display (Right) -->
        <div v-if="mode === 'trade' && exchangeCurrencyDisplay.length > 0" class="currency-display">
          <div v-for="currency in exchangeCurrencyDisplay" :key="currency.id" class="currency-item"
            @mouseenter="handleCurrencyHover(currency.id, $event)" @mouseleave="handleCurrencyLeave">
            <img v-if="currency.image" :src="currency.image" :alt="currency.name" class="currency-image" />
            <span class="currency-amount">{{ currency.amount }}</span>
          </div>
        </div>

        <ExchangeInventory :inventory="exchangeInventory" :target-inventory="partyInventory"
          :title="exchangeInventory?.name || (mode === 'loot' ? 'Container' : 'Merchant')" :mode="mode"
          :is-party="false" @item-click="handleItemClick" @apply="handleApply" @loot-all="handleLootAll"
          @recipe-select="handleRecipeSelect" />
      </div>
    </div>

    <!-- Quantity Popup -->
    <div v-if="showQuantityPopup" class="quantity-popup-overlay" @click.self="closeQuantityPopup">
      <div class="quantity-popup">
        <h3>Select Quantity</h3>
        <div class="quantity-controls">
          <input type="range" v-model.number="selectedQuantity" :min="1" :max="maxQuantity" class="quantity-slider" />
          <input type="number" v-model.number="selectedQuantity" :min="1" :max="maxQuantity" class="quantity-input" />
        </div>
        <div class="popup-buttons">
          <button @click="moveAllQuantity" class="move-all-button">Move All</button>
          <button @click="confirmQuantity" class="confirm-button">Confirm</button>
          <button @click="closeQuantityPopup" class="cancel-button">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Currency ItemCard popup -->
    <Teleport to="body">
      <div v-if="hoveredCurrencyItem" ref="currencyFloatingElement" class="currency-item-card-popup" :style="{
        ...currencyFloatingStyles,
        zIndex: 10001,
        pointerEvents: 'none',
        willChange: 'transform'
      }">
        <ItemCard :item="hoveredCurrencyItem" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.overlay-exchange {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  max-width: 1000px;
  max-height: 90%;
  background: linear-gradient(135deg,
      rgba(20, 25, 35, 0.25) 0%,
      rgba(15, 20, 30, 0.3) 50%,
      rgba(20, 25, 35, 0.25) 100%);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-top: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 12px 12px 0 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  color: white;
  font-size: v-bind("global.userSettings.value.font_size + 'px'");
  overflow: visible;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.5),
    inset 0 1px 0 rgba(255, 255, 255, 0.1),
    0 0 0 1px rgba(0, 0, 0, 0.3);
}

.exchange-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #444;
}

.exchange-header h2 {
  margin: 0;
  font-size: 1.5em;
  color: #006c72;
}

.close-button {
  background: #ff4444;
  color: white;
  border: none;
  border-radius: 4px;
  width: 32px;
  height: 32px;
  font-size: 20px;
  cursor: pointer;
  transition: background 0.2s;
}

.close-button:hover {
  background: #cc0000;
}

.exchange-body {
  display: flex;
  gap: 16px;
  flex: 1;
  overflow: visible;
}

.inventory-with-currency {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.currency-display {
  display: flex;
  gap: 8px;
  padding: 8px;
  background: rgba(10, 15, 25, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

/* Party inventory currencies align left */
.inventory-with-currency:first-child .currency-display {
  justify-content: flex-start;
}

/* Exchange inventory currencies align right */
.inventory-with-currency:last-child .currency-display {
  justify-content: flex-end;
}

.currency-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  /*background: rgba(66, 185, 131, 0.1);*/
  border: 1px solid #42b983;
  border-radius: 4px;
  min-width: 64px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.currency-item:hover {
  /*background: rgba(66, 185, 131, 0.2);*/
  border-color: #42b983;
  box-shadow: 0 0 8px rgba(66, 185, 131, 0.3);
}

.currency-image {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.currency-amount {
  font-weight: bold;
  font-size: 0.9em;
  color: #42b983;
  text-align: center;
}

.quantity-popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.quantity-popup {
  position: relative;
  background: #1a1a1a;
  border: 2px solid #42b983;
  border-radius: 8px;
  padding: 20px;
  min-width: 300px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.quantity-popup h3 {
  margin: 0 0 16px 0;
  color: #42b983;
  text-align: center;
}

.quantity-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}

.quantity-slider {
  width: 100%;
  height: 6px;
  background: #333;
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
}

.quantity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  background: #42b983;
  border-radius: 50%;
  cursor: pointer;
}

.quantity-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: #42b983;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.quantity-input {
  width: 100%;
  padding: 8px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: white;
  font-size: 16px;
  text-align: center;
}

/* Remove browser arrows from number input */
.quantity-input::-webkit-outer-spin-button,
.quantity-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.quantity-input[type=number] {
  -moz-appearance: textfield;
  appearance: textfield;
}

.popup-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.popup-buttons button {
  padding: 8px 20px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s;
}

.move-all-button {
  background: #ffa500;
  color: white;
}

.move-all-button:hover {
  background: #e69500;
}

.confirm-button {
  background: #42b983;
  color: white;
}

.confirm-button:hover {
  background: #35a372;
}

.cancel-button {
  background: #666;
  color: white;
}

.cancel-button:hover {
  background: #555;
}
</style>
