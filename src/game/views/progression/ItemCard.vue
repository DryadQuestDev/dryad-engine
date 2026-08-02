<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import StatusObjectDisplay from './StatusObjectDisplay.vue';
import StatusCard from '../popups/cards/StatusCard.vue';
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

const isQuest = computed(() => props.item.attributes['rarity'] === 'quest');
const questLabel = computed(() => Global.getInstance().getString('item_tag.quest'));

// Visual level indicator (generic `item_level` trait; stamped by whatever scales the item)
const itemLevel = computed(() => props.item.getTrait('item_level') || 0);

const itemCategory = computed(() => game.itemSystem.itemCategoriesMap.get(props.item.category));
const categoryIcon = computed(() => itemCategory.value?.icon || '');
const categoryName = computed(() => itemCategory.value?.singular || itemCategory.value?.name || '');

const itemImage = computed(() => props.item.getTrait('image') || '');

// Get weight for single item (not multiplied by quantity)
const itemWeight = computed(() => {
  const weight = props.item.getTrait('weight');
  if (weight && weight > 0) {
    return weight;
  }
  return null;
});

// Consume resource effects (restore/reduce), rendered as text.
const consumeResourceEffects = computed(() => {
  const effects: Array<{ text: string; isPositive: boolean }> = [];
  const global = Global.getInstance();
  const collect = (map: Record<string, number> | undefined, isPct: boolean) => {
    for (const statId in map) {
      const val = map[statId];
      if (!val) continue;
      const stat = game.characterSystem.statsMap.get(statId);
      const name = stat?.name || statId;
      const key = val > 0 ? 'item_consume_restore' : 'item_consume_reduce';
      const isGood = stat?.reduction_is_good ? val < 0 : val > 0;
      const amount = isPct ? Math.abs(val) + '%' : String(Math.abs(val));
      effects.push({ text: global.getString(key, { amount, resource: name }), isPositive: isGood });
    }
  };
  collect(props.item.consume_percentage, true);
  collect(props.item.consume_absolute, false);
  return effects;
});

// Statuses granted on consume — each rendered as a full StatusCard (carries its own stats/duration).
const consumeStatuses = computed(() =>
  (props.item.apply_statuses_on_consume || [])
    .filter((e): e is { status: string; stacks?: number } => !!e?.status)
    .map(e => ({ statusId: e.status, stacks: e.stacks || 1 }))
);

const hasConsume = computed(() => consumeStatuses.value.length > 0 || consumeResourceEffects.value.length > 0);
const consumeLabel = computed(() => Global.getInstance().getString('consumable_label'));
</script>

<template>
  <div :id="COMPONENT_ID" class="item-card">

    <div class="card-header">
      <img v-if="itemImage" :src="itemImage" :alt="item.getTrait('name') || ''" class="item-card-image" />
      <div class="card-header-text">
        <div class="header-top">
          <h3 class="item-name" :class="rarityClass">
            <span v-if="itemLevel > 0" class="item-level-tag">Lv {{ itemLevel }}</span>
            {{ item.getTrait('name') || 'Item Name' }}
          </h3>
          <span v-if="isQuest" class="quest-tag">{{ questLabel }}</span>
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
        <div v-if="categoryName" class="item-category-line">
          <img v-if="categoryIcon" :src="categoryIcon" :alt="categoryName" class="item-category-icon" />
          <span class="item-category-name">{{ categoryName }}</span>
        </div>
      </div>
    </div>

    <div class="card-body">
      <div v-script="item.getTrait('description') || ''" class="item-description"></div>

      <!-- Equip status (equip stats info) — shown first -->
      <StatusObjectDisplay :data="item.statusObject" :character-id="characterId" />

      <!-- Consumable: one label at the top of the green border, then resource effects + the status
           cards granted on consume (stack count lives in each card's title) -->
      <div v-if="hasConsume" class="consume-section">
        <div class="consume-label">{{ consumeLabel }}</div>
        <div v-for="(effect, i) in consumeResourceEffects" :key="'r' + i" class="consume-effect"
          :class="effect.isPositive ? 'positive' : 'negative'">{{ effect.text }}</div>
        <div v-if="consumeStatuses.length" class="consume-statuses">
          <StatusCard v-for="(cs, i) in consumeStatuses" :key="'s' + i"
            :status-id="cs.statusId" :character-id="characterId"
            :stacks-override="cs.stacks" />
        </div>
      </div>

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
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #555;
  padding-bottom: 8px;
  margin-bottom: 8px;
}

.item-card-image {
  width: 44px;
  height: 44px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.25);
}

.card-header-text {
  flex: 1;
  min-width: 0;
}

.header-top {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-name {
  margin: 0;
  font-size: 1.15em;
  font-weight: bold;
  color: #42b983;
  flex: 1;
  min-width: 0;
}

/* Inline with the title, in front of the name — flows with the text instead of reserving a
   flex slot that squeezes the name into wrapping */
.item-level-tag {
  display: inline-block;
  vertical-align: middle;
  font-size: 0.6em;
  font-weight: 700;
  color: #8ab4f8;
  background: rgba(138, 180, 248, 0.12);
  border: 1px solid rgba(138, 180, 248, 0.4);
  border-radius: 8px;
  padding: 1px 7px;
  margin-right: 2px;
  white-space: nowrap;
}

.quest-tag {
  font-size: 0.7em;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #ffd700;
  background: rgba(255, 215, 0, 0.12);
  border: 1px solid rgba(255, 215, 0, 0.4);
  border-radius: 8px;
  padding: 1px 8px;
  white-space: nowrap;
}

.item-category-line {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 3px;
}

.item-category-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  flex-shrink: 0;
}

.item-category-name {
  font-size: 0.8em;
  color: #999;
}

.item-cost {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-left: auto;
  flex-shrink: 0;
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
  font-size: 0.9em;
}

.card-body {
  font-size: 1em;
}

.item-description {
  margin: 0 0 12px 0;
  color: #ccc;
  line-height: 1.4;
}

.consume-section {
  margin: 8px 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  border-left: 3px solid #42b983;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.consume-label {
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #42b983;
}

.consume-effect {
  font-size: 0.9em;
  line-height: 1.5;
}

.consume-effect.positive {
  color: #42b983;
}

.consume-effect.negative {
  color: #e06c75;
}

.consume-statuses {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* StatusCard renders with the global popup chrome (built for hover popups). Strip it for the inline
   card list: no popup padding, and the title follows immediately after the Consume chip. */
.consume-statuses :deep(.popup-inner) {
  padding: 0;
}

.consume-statuses :deep(.popup-header) {
  justify-content: flex-start;
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
  font-size: 0.9em;
  font-weight: 600;
}

.weight-value {
  color: #ccc;
  font-size: 0.9em;
  font-weight: bold;
}
</style>
