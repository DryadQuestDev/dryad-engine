<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import { Item } from '../../core/character/item';

// for displaying item's info on hover like name, description, stats, etc.

const game = Game.getInstance();

const COMPONENT_ID = 'item-card';

const props = defineProps<{
  item: Item;
}>();

// Get visible stats based on debug settings
const visibleStats = computed(() => {
  if (!props.item.statusObject.stats) return {};

  const showHidden = game.coreSystem.getDebugSetting('show_hidden_stats');
  const activeMap = showHidden
    ? game.characterSystem.statsMap
    : game.characterSystem.statsVisibleMap;

  return Object.entries(props.item.statusObject.stats)
    .filter(([statId]) => activeMap.has(statId))
    .reduce((acc, [statId, value]) => {
      if (typeof value === 'number') {
        acc[statId] = value;
      }
      return acc;
    }, {} as Record<string, number>);
});

// Get rarity CSS class
const rarityClass = computed(() => {
  const rarity = props.item.attributes['rarity'];
  return rarity ? `rarity_${rarity}` : '';
});

// Get weight for single item (not multiplied by quantity)
const itemWeight = computed(() => {
  const weight = props.item.getTrait('weight');
  if (weight && weight > 0) {
    return weight;
  }
  return null;
});
</script>

<template>
  <div :id="COMPONENT_ID" class="item-card">

    <div class="card-header">
      <div class="header-top">
        <h3 class="item-name" :class="rarityClass">{{ item.getTrait('name') || 'Item Name' }}</h3>
        <!-- Item cost display (only if item has price) -->
        <div v-if="item.isTradable()" class="item-cost">
          <div v-for="(amount, currencyId) in item.price" :key="currencyId" class="cost-item">
            <img
              v-if="game.itemSystem.itemTemplatesMap.get(currencyId)?.traits"
              :src="(game.itemSystem.itemTemplatesMap.get(currencyId)?.traits as any)?.image"
              :alt="currencyId"
              class="cost-currency-icon"
            />
            <span class="cost-amount">{{ amount }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card-body">
      <div class="item-description" v-html="item.getTrait('description') || ''">
      </div>

      <div class="item-stats" v-if="Object.keys(visibleStats).length > 0">
        <h4>Stats:</h4>
        <ul>
          <li v-for="(value, statId) in visibleStats" :key="statId">
            {{ game.characterSystem.statsMap.get(statId)?.name || statId }}: {{ value }}
          </li>
        </ul>
      </div>

      <!-- Weight display (for single item) -->
      <div v-if="itemWeight !== null" class="item-weight-info">
        <span class="weight-label">Weight:</span>
        <span class="weight-value">{{ itemWeight }}</span>
      </div>
    </div>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" />
  </div>
</template>

<style scoped>
.item-card {
  background: rgba(26, 26, 26, 0.95);
  border: 2px solid #444;
  border-radius: 8px;
  padding: 12px;
  min-width: 200px;
  max-width: 300px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  color: #fff;
}

.card-header {
  border-bottom: 1px solid #555;
  padding-bottom: 8px;
  margin-bottom: 8px;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.item-name {
  margin: 0;
  font-size: 16px;
  font-weight: bold;
  color: #42b983;
}

.item-cost {
  display: flex;
  gap: 6px;
  align-items: center;
}

.cost-item {
  display: flex;
  align-items: center;
  gap: 3px;
}

.cost-currency-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.cost-amount {
  color: #42b983;
  font-weight: bold;
  font-size: 13px;
}

.card-body {
  font-size: 14px;
}

.item-description {
  margin: 0 0 12px 0;
  color: #ccc;
  line-height: 1.4;
}

.item-weight-info {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  border-left: 3px solid #999;
}

.weight-label {
  color: #999;
  font-size: 13px;
  font-weight: 600;
}

.weight-value {
  color: #ccc;
  font-size: 13px;
  font-weight: bold;
}

.item-stats {
  background: rgba(0, 0, 0, 0.3);
  padding: 8px;
  border-radius: 4px;
}

.item-stats h4 {
  margin: 0 0 6px 0;
  font-size: 14px;
  color: #ffd700;
}

.item-stats ul {
  margin: 0;
  padding-left: 20px;
  list-style: none;
}

.item-stats li {
  margin: 4px 0;
  color: #ddd;
}

.item-stats li::before {
  content: "• ";
  color: #42b983;
  font-weight: bold;
  margin-right: 4px;
}
</style>
