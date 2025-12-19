<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import { ItemRecipeObject } from '../../../schemas/itemRecipeSchema';

const game = Game.getInstance();

const props = defineProps<{
  recipe: ItemRecipeObject;
}>();

// Get input items with images, quantities, and rarity
const inputItems = computed(() => {
  if (!props.recipe.input_items) return [];

  return props.recipe.input_items.map(input => {
    const template = game.itemSystem.itemTemplatesMap.get(input.item_id || '');
    const traits = template?.traits as any;
    const attributes = template?.attributes as any;
    return {
      id: input.item_id,
      name: traits?.name || input.item_id,
      image: traits?.image || '',
      quantity: input.quantity || 1,
      rarity: attributes?.rarity || ''
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
</script>

<template>
  <div class="recipe-card">
    <div class="recipe-header">
      <h3 class="recipe-name">{{ recipe.name || recipe.id }}</h3>
    </div>

    <div v-if="recipe.description" class="recipe-description" v-html="recipe.description"></div>

    <!-- Input Items (Ingredients) -->
    <div v-if="inputItems.length > 0" class="recipe-section">
      <h4 class="section-title">Ingredients</h4>
      <div class="items-list">
        <div v-for="item in inputItems" :key="item.id" class="recipe-item">
          <img v-if="item.image" :src="item.image" :alt="item.name" class="item-image" />
          <span class="item-name" :class="item.rarity ? `rarity_${item.rarity}` : ''">{{ item.name }} (x{{ item.quantity
            }})</span>
        </div>
      </div>
    </div>

    <!-- Output Items (Result) -->
    <div v-if="outputItems.length > 0" class="recipe-section">
      <h4 class="section-title">Result</h4>
      <div class="items-list">
        <div v-for="item in outputItems" :key="item.id" class="recipe-item">
          <img v-if="item.image" :src="item.image" :alt="item.name" class="item-image" />
          <span class="item-name" :class="item.rarity ? `rarity_${item.rarity}` : ''">{{ item.name }} (x{{ item.quantity
            }})</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recipe-card {
  background: linear-gradient(135deg, rgba(15, 25, 40, 0.95) 0%, rgba(20, 30, 45, 0.95) 100%);
  border: 2px solid rgba(66, 185, 131, 0.4);
  border-radius: 8px;
  padding: 16px;
  min-width: 280px;
  max-width: 350px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6),
    inset 0 1px 0 rgba(255, 255, 255, 0.1);
}

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
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  transition: background 0.2s;
}

.recipe-item:hover {
  background: rgba(66, 185, 131, 0.1);
  border-color: rgba(66, 185, 131, 0.3);
}

.item-image {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.item-name {
  font-size: 0.95em;
  color: #e6edf3;
  font-weight: 500;
}
</style>
