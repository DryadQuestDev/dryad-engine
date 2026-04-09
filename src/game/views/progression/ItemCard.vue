<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import StatusObjectDisplay from './StatusObjectDisplay.vue';
import { Item } from '../../core/character/item';

// for displaying item's info on hover like name, description, stats, etc.

const game = Game.getInstance();

const COMPONENT_ID = 'item-card';

const props = defineProps<{
  item: Item;
  characterId?: string;
}>();

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

// Consume effects for tooltip display
const consumeEffects = computed(() => {
  if (!props.item.is_consumable) return [];
  const effects: Array<{ text: string; isPositive: boolean }> = [];
  const global = Global.getInstance();

  for (const statId in props.item.consume_percentage) {
    const pct = props.item.consume_percentage[statId];
    if (!pct) continue;
    const stat = game.characterSystem.statsMap.get(statId);
    const name = stat?.name || statId;
    const key = pct > 0 ? 'item_consume_restore' : 'item_consume_reduce';
    const isGood = stat?.reduction_is_good ? pct < 0 : pct > 0;
    effects.push({ text: global.getString(key, { amount: Math.abs(pct) + '%', resource: name }), isPositive: isGood });
  }

  for (const statId in props.item.consume_absolute) {
    const amt = props.item.consume_absolute[statId];
    if (!amt) continue;
    const stat = game.characterSystem.statsMap.get(statId);
    const name = stat?.name || statId;
    const key = amt > 0 ? 'item_consume_restore' : 'item_consume_reduce';
    const isGood = stat?.reduction_is_good ? amt < 0 : amt > 0;
    effects.push({ text: global.getString(key, { amount: String(Math.abs(amt)), resource: name }), isPositive: isGood });
  }
  return effects;
});

// Consume max stacks display (only if not unlimited)
const consumeMaxStacksText = computed(() => {
  if (!props.item.is_consumable) return null;
  const so = props.item.statusObject;
  if (!so || Object.keys(so).length === 0) return null;
  const ms = props.item.consume_max_stacks;
  if (ms === -1 || ms === undefined) return null;
  return Global.getInstance().getString('item_consume_max_stacks', { stacks: String(ms) });
});

// Consume duration display (only if item has a status to apply)
const consumeDurationText = computed(() => {
  if (!props.item.is_consumable) return null;
  const so = props.item.statusObject;
  if (!so || Object.keys(so).length === 0) return null;
  const d = props.item.consume_duration;
  const global = Global.getInstance();
  return (d === -1 || d === undefined)
    ? global.getString('item_consume_duration_permanent')
    : global.getString('item_consume_duration', { duration: String(d) });
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
            <img v-if="game.itemSystem.itemTemplatesMap.get(currencyId)?.traits"
              :src="(game.itemSystem.itemTemplatesMap.get(currencyId)?.traits as any)?.image" :alt="currencyId"
              class="cost-currency-icon" />
            <span class="cost-amount">{{ amount }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card-body">
      <div class="item-description" v-html="item.getTrait('description') || ''">
      </div>

      <!-- Consume effects display -->
      <div v-if="consumeEffects.length > 0 || consumeMaxStacksText || consumeDurationText" class="consume-effects">
        <div v-for="(effect, i) in consumeEffects" :key="i" class="consume-effect"
          :class="effect.isPositive ? 'positive' : 'negative'">
          {{ effect.text }}
        </div>
        <div v-if="consumeMaxStacksText" class="consume-duration">{{ consumeMaxStacksText }}</div>
        <div v-if="consumeDurationText" class="consume-duration">{{ consumeDurationText }}</div>
      </div>

      <StatusObjectDisplay :data="item.statusObject" :character-id="characterId" />

      <!-- Weight display (for single item) -->
      <div v-if="itemWeight !== null" class="item-weight-info">
        <span class="weight-label">Weight:</span>
        <span class="weight-value">{{ itemWeight }}</span>
      </div>
    </div>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" :context="{ item }" />
  </div>
</template>

<style scoped>
.item-card {
  background: rgba(26, 26, 26, 0.95);
  border: 2px solid #444;
  border-radius: 8px;
  padding: 12px;
  width: 350px;
  /* max-width: 300px; */
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

.consume-effects {
  margin: 0 0 8px 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  border-left: 3px solid #42b983;
}

.consume-effect {
  font-size: 13px;
  line-height: 1.5;
}

.consume-effect.positive {
  color: #42b983;
}

.consume-effect.negative {
  color: #e06c75;
}

.consume-duration {
  font-size: 12px;
  color: #999;
  margin-top: 4px;
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
</style>
