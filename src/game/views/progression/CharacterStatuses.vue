<script setup lang="ts">
import { computed } from 'vue';
import { markRaw } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { Status } from '../../core/character/status';
import { Item } from '../../core/character/item';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import ItemCard from './ItemCard.vue';
import StatusBrick from './StatusBrick.vue';
import { popover as vPopover } from '../../directives/popoverDirective';

const props = withDefaults(defineProps<{
  character: Character;
  showItems?: boolean;
  showStatuses?: boolean;
}>(), {
  showItems: true,
  showStatuses: true
});
const game = Game.getInstance();

// One brick per instance for multi-stack statuses; one brick per status otherwise.
type StatusBrickData = { status: Status; key: string; instanceIndex?: number };

// markRaw'd so v-popover binding doesn't re-make them reactive on every render.
const ItemCardComp = markRaw(ItemCard);

// Filter visible statuses based on isHidden property
const visibleStatuses = computed(() => {
  if (!props.showStatuses) return [];
  if (game.coreSystem.getDebugSetting('show_hidden_stats')) {
    return props.character.getStatuses();
  }
  return props.character.getStatuses().filter(status => !status.isHidden);
});

// Flattened brick list — single-stack renders one brick; multi-stack renders one brick per instance.
const statusBricks = computed((): StatusBrickData[] => {
  const out: StatusBrickData[] = [];
  for (const status of visibleStatuses.value) {
    if (status.multiStack) {
      const instances = status.getInstances();
      for (let i = 0; i < instances.length; i++) {
        out.push({ status, key: status.id + '_' + i, instanceIndex: i });
      }
    } else {
      out.push({ status, key: status.id });
    }
  }
  return out;
});

// ---- Item helpers ----
const equippedItems = computed(() => {
  if (!props.showItems) return [];
  return props.character.getEquippedItems();
});

const getItemImage = (item: Item): string | null => {
  return item.getTrait('image') || null;
};

const getItemName = (item: Item): string => {
  return item.getTrait('name') || item.id;
};

// Component slots for plugins to inject extra content
const topSlot = computed(() => game.coreSystem.getComponentsBySlot('character-statuses-top'));
const bottomSlot = computed(() => game.coreSystem.getComponentsBySlot('character-statuses-bottom'));

const hasContent = computed(() => equippedItems.value.length > 0 || visibleStatuses.value.length > 0 || topSlot.value.length > 0 || bottomSlot.value.length > 0);
</script>

<template>
  <div class="character-statuses" v-if="hasContent">
    <div class="status-list">
      <!-- Top slot -->
      <CustomComponentContainer slot="character-statuses-top" :context="{ character }" />

      <!-- Equipped item bricks -->
      <div v-for="item in equippedItems" :key="'item_' + item.uid" class="item-brick"
        :class="[
          { 'has-image': getItemImage(item) },
          ...item.getAttributeClasses()
        ]"
        v-popover="{ component: ItemCardComp, props: { item }, placement: 'left-start' }">
        <img v-if="getItemImage(item)" :src="getItemImage(item)!" :alt="getItemName(item)"
          class="item-image" />
        <span v-else class="item-name">{{ getItemName(item) }}</span>
      </div>

      <!-- Status bricks -->
      <StatusBrick v-for="brick in statusBricks" :key="'status_' + brick.key"
        :status="brick.status" :character-id="character.id" :status-instance-index="brick.instanceIndex" />
      <!-- Bottom slot -->
      <CustomComponentContainer slot="character-statuses-bottom" :context="{ character }" />
    </div>
  </div>
</template>

<style scoped>
.character-statuses {
  width: 100%;
  min-height: 68px;
  border: 1px solid #444;
  padding: 0.5rem;
  border-radius: 4px;
  background: rgba(26, 26, 26, 0.5);
  overflow-y: auto;
}

.character-statuses:has(.status-list:empty) {
  border: none;
  background: none;
  min-height: 0;
  padding: 0;
}

.status-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-content: flex-start;
}

/* Item bricks */
.item-brick {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #888;
  border-radius: 4px;
  padding: 0.4rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 50px;
}

.item-brick:hover {
  background: rgba(136, 136, 136, 0.15);
  border-color: #aaa;
}

.item-brick.has-image {
  padding: 1px;
  background: transparent;
}

.item-brick.has-image:hover {
  background: transparent;
}

.item-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  will-change: transform;
}

.item-name {
  font-size: 0.8rem;
  color: #ccc;
  padding: 0.2rem 0.4rem;
  white-space: nowrap;
}
</style>
