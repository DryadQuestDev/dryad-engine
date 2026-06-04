<script setup lang="ts">
import { computed } from 'vue';
import { markRaw } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { Status } from '../../core/character/status';
import { Item } from '../../core/character/item';
import CustomComponentContainer from '../CustomComponentContainer.vue';
import ItemCard from './ItemCard.vue';
import StatusCard from '../popups/cards/StatusCard.vue';
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
type StatusBrick = { status: Status; key: string; stacks: number; duration: number; instanceIndex?: number };

// markRaw'd so v-popover binding doesn't re-make them reactive on every render.
const StatusCardComp = markRaw(StatusCard);
const ItemCardComp = markRaw(ItemCard);

// ---- Status helpers ----
const getStatusObject = (status: Status) => {
  return game.characterSystem.statusesMap.get(status.id);
};

const getStatusName = (status: Status): string => {
  if (status.name) return status.name;
  const statusObject = getStatusObject(status);
  return statusObject?.name || status.id;
};

const getStatusImage = (status: Status): string | undefined => {
  if (status.image) return status.image;
  const statusObject = getStatusObject(status);
  return statusObject?.image;
};

const getStatusPolarity = (status: Status): string => {
  if (status.polarity) return status.polarity;
  const statusObject = getStatusObject(status);
  return statusObject?.polarity || 'positive';
};

// Filter visible statuses based on isHidden property
const visibleStatuses = computed(() => {
  if (!props.showStatuses) return [];
  if (game.coreSystem.getDebugSetting('show_hidden_stats')) {
    return props.character.getStatuses();
  }
  return props.character.getStatuses().filter(status => !status.isHidden);
});

// Flattened brick list — single-stack renders one brick; multi-stack renders one brick per instance.
const statusBricks = computed((): StatusBrick[] => {
  const out: StatusBrick[] = [];
  for (const status of visibleStatuses.value) {
    if (status.multiStack) {
      const instances = status.getInstances();
      for (let i = 0; i < instances.length; i++) {
        out.push({ status, key: status.id + '_' + i, stacks: instances[i].stacks, duration: instances[i].duration, instanceIndex: i });
      }
    } else {
      out.push({ status, key: status.id, stacks: status.currentStacks, duration: status.duration });
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
      <div v-for="brick in statusBricks" :key="'status_' + brick.key" class="status-brick"
        :class="{
          'has-image': getStatusImage(brick.status),
          'polarity-positive': getStatusPolarity(brick.status) === 'positive',
          'polarity-negative': getStatusPolarity(brick.status) === 'negative',
          'polarity-neutral': getStatusPolarity(brick.status) === 'neutral'
        }"
        v-popover="{ component: StatusCardComp, props: { statusId: brick.status.id, characterId: character.id, statusInstanceIndex: brick.instanceIndex }, placement: 'left-start' }">
        <img v-if="getStatusImage(brick.status)" :src="getStatusImage(brick.status)" :alt="getStatusName(brick.status)"
          class="status-image" />
        <span v-else class="status-name">{{ getStatusName(brick.status) }}</span>
        <span v-if="brick.status.isStackable() && brick.stacks > 1" class="stack-count">
          x{{ brick.stacks }}
        </span>
        <span v-if="brick.duration > 0" class="duration-count">
          {{ Math.ceil(brick.duration) }}
        </span>
      </div>
      <!-- Bottom slot -->
      <CustomComponentContainer slot="character-statuses-bottom" :context="{ character }" />
    </div>
  </div>
</template>

<style scoped>
.character-statuses {
  width: 100%;
  height: 100%;
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

/* Status bricks */
.status-brick {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #42b983;
  border-radius: 4px;
  padding: 0.4rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 50px;
}

.status-brick:hover {
  background: rgba(66, 185, 131, 0.15);
  border-color: #52c593;
}

.status-brick.polarity-negative {
  border-color: #e74c3c;
}

.status-brick.polarity-negative:hover {
  background: rgba(231, 76, 60, 0.15);
  border-color: #ef5f50;
}

.status-brick.polarity-neutral {
  border-color: #888;
}

.status-brick.polarity-neutral:hover {
  background: rgba(136, 136, 136, 0.15);
  border-color: #aaa;
}

.status-brick.has-image {
  padding: 1px;
  background: transparent;
}

.status-brick.has-image:hover {
  background: transparent;
}

.status-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  will-change: transform;
}

.status-name {
  font-size: 0.8rem;
  color: #ccc;
  padding: 0.2rem 0.4rem;
  white-space: nowrap;
}

.stack-count {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: #1a1a1a;
  border: 1px solid #ffd700;
  border-radius: 8px;
  padding: 0 4px;
  font-size: 0.7rem;
  font-weight: bold;
  color: #ffd700;
  line-height: 1.2;
}

.duration-count {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #1a1a1a;
  border: 1px solid #999;
  border-radius: 8px;
  padding: 0 4px;
  font-size: 0.65rem;
  color: #999;
  line-height: 1.2;
}
</style>
