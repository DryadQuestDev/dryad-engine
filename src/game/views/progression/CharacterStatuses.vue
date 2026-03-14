<script setup lang="ts">
import { computed, ref } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { Status } from '../../core/character/status';
import { Item } from '../../core/character/item';
import StatusObjectDisplay from './StatusObjectDisplay.vue';
import ItemCard from './ItemCard.vue';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';

const props = withDefaults(defineProps<{
  character: Character;
  showItems?: boolean;
  showStatuses?: boolean;
}>(), {
  showItems: true,
  showStatuses: true
});
const game = Game.getInstance();

// ---- Status popup state ----
const hoveredStatus = ref<Status | null>(null);
const statusReferenceRef = ref<HTMLElement | null>(null);
const statusPopupRef = ref<HTMLElement | null>(null);

const { floatingStyles: statusFloatingStyles } = useFloating(statusReferenceRef, statusPopupRef, {
  placement: 'left-start',
  strategy: 'fixed',
  middleware: [
    offset(10),
    flip({ padding: 8 }),
    shift({ padding: 8 })
  ],
  whileElementsMounted: autoUpdate
});

const showStatusPopup = (event: MouseEvent, status: Status) => {
  hoveredStatus.value = status;
  statusReferenceRef.value = event.currentTarget as HTMLElement;
};

const hideStatusPopup = () => {
  hoveredStatus.value = null;
  statusReferenceRef.value = null;
};

// ---- Item popup state ----
const hoveredItem = ref<Item | null>(null);
const itemReferenceRef = ref<HTMLElement | null>(null);
const itemPopupRef = ref<HTMLElement | null>(null);

const { floatingStyles: itemFloatingStyles } = useFloating(itemReferenceRef, itemPopupRef, {
  placement: 'left-start',
  strategy: 'fixed',
  middleware: [
    offset(10),
    flip({ padding: 8 }),
    shift({ padding: 8 })
  ],
  whileElementsMounted: autoUpdate
});

const showItemPopup = (event: MouseEvent, item: Item) => {
  hoveredItem.value = item;
  itemReferenceRef.value = event.currentTarget as HTMLElement;
};

const hideItemPopup = () => {
  hoveredItem.value = null;
  itemReferenceRef.value = null;
};

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

const getStatusDescription = (status: Status): string => {
  if (status.description) return status.description;
  const statusObject = getStatusObject(status);
  return statusObject?.description || '';
};

const getStatusPolarity = (status: Status): string => {
  if (status.polarity) return status.polarity;
  const statusObject = getStatusObject(status);
  return statusObject?.polarity || 'positive';
};

const getStatusRarity = (status: Status): string => {
  return status.rarity || '';
};

// Filter visible statuses based on isHidden property
const visibleStatuses = computed(() => {
  if (!props.showStatuses) return [];
  if (game.coreSystem.getDebugSetting('show_hidden_stats')) {
    return props.character.getStatuses();
  }
  return props.character.getStatuses().filter(status => !status.isHidden);
});

// Merge static stats with computed stats for the hovered status
const hoveredStatusStats = computed((): Record<string, number> => {
  const status = hoveredStatus.value;
  if (!status) return {};

  const merged: Record<string, number> = { ...status.stats };

  if (status.computedStatsKey) {
    const computer = game.characterSystem.getStatComputer(status.computedStatsKey);
    if (computer) {
      const computedValues = computer(props.character);
      for (const key in computedValues) {
        merged[key] = (merged[key] || 0) + computedValues[key];
      }
    }
  }

  return merged;
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
      <component v-for="cm in topSlot" :key="cm.id" :is="cm.component"
        :character="character" v-bind="cm.props" />

      <!-- Equipped item bricks -->
      <div v-for="item in equippedItems" :key="'item_' + item.uid" class="item-brick"
        :class="[
          { 'has-image': getItemImage(item) },
          ...item.getAttributeClasses()
        ]"
        @mouseenter="showItemPopup($event, item)"
        @mouseleave="hideItemPopup">
        <img v-if="getItemImage(item)" :src="getItemImage(item)!" :alt="getItemName(item)"
          class="item-image" />
        <span v-else class="item-name">{{ getItemName(item) }}</span>
      </div>

      <!-- Status bricks -->
      <div v-for="status in visibleStatuses" :key="'status_' + status.id" class="status-brick"
        :class="{
          'has-image': getStatusImage(status),
          'polarity-positive': getStatusPolarity(status) === 'positive',
          'polarity-negative': getStatusPolarity(status) === 'negative',
          'polarity-neutral': getStatusPolarity(status) === 'neutral'
        }" @mouseenter="showStatusPopup($event, status)"
        @mouseleave="hideStatusPopup">
        <img v-if="getStatusImage(status)" :src="getStatusImage(status)" :alt="getStatusName(status)"
          class="status-image" />
        <span v-else class="status-name">{{ getStatusName(status) }}</span>
        <span v-if="status.isStackable() && status.currentStacks > 1" class="stack-count">
          x{{ status.currentStacks }}
        </span>
        <span v-if="status.duration > 0" class="duration-count">
          {{ Math.ceil(status.duration) }}
        </span>
      </div>
      <!-- Bottom slot -->
      <component v-for="cm in bottomSlot" :key="cm.id" :is="cm.component"
        :character="character" v-bind="cm.props" />
    </div>

    <!-- Status Popup -->
    <Teleport to="body">
      <div v-if="hoveredStatus" ref="statusPopupRef" class="status-popup" :style="statusFloatingStyles">
        <div class="popup-header">
          <h4 :class="getStatusRarity(hoveredStatus) ? ['item-name', 'rarity_' + getStatusRarity(hoveredStatus)] : []">
            {{ getStatusName(hoveredStatus) }}
            <span v-if="hoveredStatus.isStackable() && hoveredStatus.currentStacks > 1" class="popup-stack-count">
              x{{ hoveredStatus.currentStacks }}
            </span>
          </h4>
        </div>
        <div class="popup-body">
          <div class="popup-description" v-if="getStatusDescription(hoveredStatus)"
            v-html="getStatusDescription(hoveredStatus)">
          </div>
          <StatusObjectDisplay
            :data="{ stats: hoveredStatusStats, abilities: [...hoveredStatus.abilities], ability_modifiers: hoveredStatus.abilityModifiers }"
            :stacks="hoveredStatus.currentStacks" />
        </div>
      </div>
    </Teleport>

    <!-- Item Popup -->
    <Teleport to="body">
      <div v-if="hoveredItem" ref="itemPopupRef" class="item-popup" :style="itemFloatingStyles">
        <ItemCard :item="hoveredItem" />
      </div>
    </Teleport>
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

.item-popup {
  position: fixed;
  z-index: 9999;
  width: 350px;
  pointer-events: none;
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

.status-popup {
  position: fixed;
  z-index: 9999;
  background: rgba(26, 26, 26, 0.98);
  border: 2px solid #444;
  border-radius: 8px;
  padding: 12px;
  width: 350px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  color: #fff;
  pointer-events: none;
}

.popup-header {
  border-bottom: 1px solid #555;
  padding-bottom: 8px;
  margin-bottom: 8px;
}

.popup-header h4 {
  margin: 0;
  font-size: 16px;
  font-weight: bold;
  color: #e2c044;
}

.popup-stack-count {
  margin-left: 0.5rem;
  font-weight: bold;
  color: #ffd700;
  font-size: 0.9em;
}

.popup-body {
  font-size: 14px;
}

.popup-description {
  margin: 0 0 6px 0;
  color: #ccc;
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
