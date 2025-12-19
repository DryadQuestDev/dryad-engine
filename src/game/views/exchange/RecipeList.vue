<script setup lang="ts">
import { computed, ref } from 'vue';
import { Game } from '../../game';
import { Inventory } from '../../core/character/inventory';
import { ItemRecipeObject } from '../../../schemas/itemRecipeSchema';
import RecipeCard from './RecipeCard.vue';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';
import { PARTY_INVENTORY_ID } from '../../systems/itemSystem';

const game = Game.getInstance();

const props = defineProps<{
  inventory: Inventory | null;
  targetInventory: Inventory | null;
}>();

const emit = defineEmits<{
  recipeSelect: [recipeId: string];
}>();

// Hover state for recipe cards
const hoveredRecipeId = ref<string | null>(null);
const referenceElement = ref<HTMLElement | null>(null);
const floatingElement = ref<HTMLElement | null>(null);

const { floatingStyles } = useFloating(referenceElement, floatingElement, {
  placement: 'left-start',
  strategy: 'fixed',
  middleware: [
    offset(8),
    flip({ padding: 8 }),
    shift({ padding: 8 })
  ],
  whileElementsMounted: autoUpdate
});

// Get available and learned recipes
const availableRecipes = computed<ItemRecipeObject[]>(() => {
  if (!props.inventory || !props.inventory.recipes) return [];

  const recipes: ItemRecipeObject[] = [];
  const availableIds = Array.from(props.inventory.recipes);
  const learnedIds = game.itemSystem.learnedRecipes.value;



  for (const recipeId of availableIds) {
    // Only show recipes that are both available and learned
    if (!learnedIds.has(recipeId)) continue;

    const recipe = game.itemSystem.itemRecipesMap.get(recipeId);
    if (recipe) {
      recipes.push(recipe);
    }
  }

  return recipes;
});

// Check if recipe has enough ingredients (from both inventories)
function hasEnoughIngredients(recipe: ItemRecipeObject): boolean {
  if (!recipe.input_items) return true;
  if (!props.inventory || !props.targetInventory) return false;

  const partyInventory = props.targetInventory;

  for (const input of recipe.input_items) {
    const requiredQuantity = input.quantity || 1;
    const itemId = input.item_id || '';

    // Count items in both inventories
    const exchangeItems = props.inventory.getItemsById(itemId).filter(i => !i.isEquipped);
    const partyItems = partyInventory.getItemsById(itemId).filter(i => !i.isEquipped);

    const totalQuantity =
      exchangeItems.reduce((sum, item) => sum + item.quantity, 0) +
      partyItems.reduce((sum, item) => sum + item.quantity, 0);

    if (totalQuantity < requiredQuantity) {
      return false;
    }
  }

  return true;
}

// Handle recipe click
function handleRecipeClick(recipe: ItemRecipeObject) {
  if (!hasEnoughIngredients(recipe)) return;
  emit('recipeSelect', recipe.id);
}

// Handle recipe hover
function handleRecipeHover(recipe: ItemRecipeObject | null, event?: MouseEvent) {
  hoveredRecipeId.value = recipe?.id || null;

  if (recipe && event) {
    referenceElement.value = event.currentTarget as HTMLElement;
  } else {
    referenceElement.value = null;
  }
}

// Get the currently hovered recipe
const hoveredRecipe = computed(() => {
  if (!hoveredRecipeId.value) return null;
  return availableRecipes.value.find(r => r.id === hoveredRecipeId.value) || null;
});

// Computed to safely get selected recipe ID
const selectedRecipeId = computed(() => {
  if (!props.inventory) return null;
  return props.inventory.selectedRecipeId || null;
});
</script>

<template>
  <div v-if="availableRecipes.length > 0" class="recipe-list">
    <button v-for="recipe in availableRecipes" :key="recipe.id" class="recipe-button" :class="{
      disabled: !hasEnoughIngredients(recipe),
      selected: selectedRecipeId === recipe.id
    }" @click="handleRecipeClick(recipe)" @mouseenter="handleRecipeHover(recipe, $event)"
      @mouseleave="handleRecipeHover(null)">
      <span class="recipe-button-name">{{ recipe.name || recipe.id }}</span>
    </button>
  </div>

  <!-- Recipe Card popup -->
  <Teleport to="body">
    <div v-if="hoveredRecipe" ref="floatingElement" class="recipe-card-popup" :style="{
      ...floatingStyles,
      zIndex: 10000,
      pointerEvents: 'none',
      willChange: 'transform'
    }">
      <RecipeCard :recipe="hoveredRecipe" />
    </div>
  </Teleport>
</template>

<style scoped>
.recipe-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
  padding: 4px;
  margin-bottom: 12px;
  background: rgba(10, 15, 25, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.recipe-button {
  padding: 10px 12px;
  background: linear-gradient(135deg, rgba(66, 185, 131, 0.2) 0%, rgba(66, 185, 131, 0.1) 100%);
  border: 1px solid rgba(66, 185, 131, 0.4);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  color: #e6edf3;
  font-size: 0.95em;
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.recipe-button:hover:not(.disabled) {
  background: linear-gradient(135deg, rgba(66, 185, 131, 0.3) 0%, rgba(66, 185, 131, 0.2) 100%);
  border-color: rgba(66, 185, 131, 0.6);
  transform: translateX(-2px);
  box-shadow: 0 4px 8px rgba(66, 185, 131, 0.2);
}

.recipe-button.selected {
  background: linear-gradient(135deg, rgba(66, 185, 131, 0.5) 0%, rgba(66, 185, 131, 0.4) 100%);
  color: #fff;
  font-weight: 600;
  box-shadow: 0 0 16px rgba(66, 185, 131, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.3),
    0 4px 8px rgba(0, 0, 0, 0.3);
  transform: translateX(-3px);
}

.recipe-button.disabled {
  background: linear-gradient(135deg, rgba(128, 128, 128, 0.1) 0%, rgba(100, 100, 100, 0.1) 100%);
  border-color: rgba(128, 128, 128, 0.3);
  color: #6e7681;
  cursor: not-allowed;
  opacity: 0.6;
}

.recipe-button-name {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Scrollbar styling */
.recipe-list::-webkit-scrollbar {
  width: 6px;
}

.recipe-list::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.recipe-list::-webkit-scrollbar-thumb {
  background: rgba(66, 185, 131, 0.4);
  border-radius: 3px;
  transition: background 0.2s;
}

.recipe-list::-webkit-scrollbar-thumb:hover {
  background: rgba(66, 185, 131, 0.6);
}
</style>
