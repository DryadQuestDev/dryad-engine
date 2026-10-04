<script setup lang="ts">
import { computed, markRaw } from 'vue';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import { Inventory } from '../../core/character/inventory';
import { Item } from '../../core/character/item';
import { ItemRecipeObject } from '../../../schemas/itemRecipeSchema';
import ItemPopupCard from '../popups/cards/ItemPopupCard.vue';
import { popover as vPopover, type PopoverBinding } from '../../directives/popoverDirective';

const game = Game.getInstance();
const global = Global.getInstance();

const props = defineProps<{
  recipe: ItemRecipeObject;
  // The crafting inventory + the party inventory, so each ingredient can show whether it's on hand.
  inventory?: Inventory | null;
  partyInventory?: Inventory | null;
}>();

// Total unequipped quantity of an item across the crafting and party inventories.
function availableQuantity(itemId: string): number {
  return (props.inventory?.getItemQuantity(itemId) || 0)
    + (props.partyInventory?.getItemQuantity(itemId) || 0);
}

// Get input items with images, quantities, rarity, and whether enough are on hand
const inputItems = computed(() => {
  if (!props.recipe.input_items) return [];

  return props.recipe.input_items.map(input => {
    const template = game.itemSystem.itemTemplatesMap.get(input.item_id || '');
    const traits = template?.traits as any;
    const quantity = input.quantity || 1;
    return {
      id: input.item_id,
      name: traits?.name || input.item_id,
      image: traits?.image || '',
      quantity,
      rarity: traits?.rarity || '',
      available: availableQuantity(input.item_id || '') >= quantity
    };
  });
});

// Get output items with images, quantities, and rarity
const outputItems = computed(() => {
  if (!props.recipe.output_items) return [];

  return props.recipe.output_items.map(output => {
    const template = game.itemSystem.itemTemplatesMap.get(output.item_id || '');
    const traits = template?.traits as any;
    return {
      id: output.item_id,
      name: traits?.name || output.item_id,
      image: traits?.image || '',
      quantity: output.quantity || 1,
      rarity: traits?.rarity || ''
    };
  });
});

const ingredientsLabel = computed(() => global.getString('recipe.ingredients'));
const resultLabel = computed(() => global.getString('recipe.result'));

const ItemPopupCardComp = markRaw(ItemPopupCard);

// Preview items for the row cards. A recipe lists template ids, but the item card wants an Item,
// so one is instantiated per row and kept for the card's lifetime — it belongs to no inventory,
// so it can never be used, dropped or traded from here.
const previewItems = new Map<string, Item>();
function previewItem(itemId: string): Item {
  let item = previewItems.get(itemId);
  if (!item) {
    item = game.createItem(itemId);
    previewItems.set(itemId, item);
  }
  return item;
}

// The rows sit inside the recipe popup, so their cards nest one level deeper in the popup stack.
// Reachable once the recipe card is interactive (T), or by clicking a row to pin the item card.
function itemPopover(itemId: string): PopoverBinding {
  return {
    component: ItemPopupCardComp,
    props: { item: previewItem(itemId), noChoices: true },
    placement: 'left-start',
    key: `recipe-item:${props.recipe.id}:${itemId}`,
  };
}

// One key for name + multiplier: the "(x2)" wrapper is Latin punctuation that other
// locales reorder or spell differently.
function itemQuantityLabel(item: { name: string; quantity: number }): string {
  return global.getString('recipe.item_quantity', { item: item.name, quantity: item.quantity });
}
</script>

<template>
  <div class="popup-inner recipe-card">
    <div class="recipe-header">
      <h3 class="recipe-name">{{ recipe.name || recipe.id }}</h3>
    </div>

    <div v-if="recipe.description" v-script="recipe.description" class="recipe-description"></div>

    <!-- Input Items (Ingredients) -->
    <div v-if="inputItems.length > 0" class="recipe-section">
      <h4 class="section-title">{{ ingredientsLabel }}</h4>
      <div class="items-list">
        <div v-for="item in inputItems" :key="item.id" class="recipe-item" :class="{ 'ingredient-available': item.available }"
          v-popover="itemPopover(item.id || '')">
          <img v-if="item.image" :src="item.image" :alt="item.name" class="item-image" />
          <span class="item-name" :class="item.rarity ? `rarity_${item.rarity}` : ''">{{ itemQuantityLabel(item) }}</span>
        </div>
      </div>
    </div>

    <!-- Output Items (Result) -->
    <div v-if="outputItems.length > 0" class="recipe-section">
      <h4 class="section-title">{{ resultLabel }}</h4>
      <div class="items-list">
        <div v-for="item in outputItems" :key="item.id" class="recipe-item" v-popover="itemPopover(item.id || '')">
          <img v-if="item.image" :src="item.image" :alt="item.name" class="item-image" />
          <span class="item-name" :class="item.rarity ? `rarity_${item.rarity}` : ''">{{ itemQuantityLabel(item) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Chrome (background, border, shadow, width) comes from the popup shell — see PopupItem. */

.recipe-header {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(66, 185, 131, 0.3);
}

.recipe-name {
  margin: 0;
  font-size: 1.3em;
  color: #42b983;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.recipe-description {
  margin-bottom: 16px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-size: 0.9em;
  line-height: 1.5;
  color: #c9d1d9;
}

.recipe-section {
  margin-bottom: 16px;
}

.recipe-section:last-child {
  margin-bottom: 0;
}

.section-title {
  margin: 0 0 8px 0;
  font-size: 1em;
  color: #8ab4f8;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.recipe-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  cursor: help;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  transition: background 0.2s;
}

.recipe-item:hover {
  background: rgba(66, 185, 131, 0.1);
  border-color: rgba(66, 185, 131, 0.3);
}

/* Ingredient the player has enough of for this recipe */
.recipe-item.ingredient-available {
  background: rgba(66, 185, 131, 0.22);
  border-color: rgba(66, 185, 131, 0.6);
}

.recipe-item.ingredient-available:hover {
  background: rgba(66, 185, 131, 0.3);
}

.item-image {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.item-name {
  font-size: 0.95em;
  /* rarity_<x> classes set --rarity-color (style.css); fall back to the neutral text color */
  color: var(--rarity-color, #e6edf3);
  font-weight: 500;
}
</style>
