<script setup lang="ts">
import { computed, markRaw } from 'vue';
import EditorItemPopupCard from '../../shared/EditorItemPopupCard.vue';
import { popover as vPopover, type PopoverBinding } from '../../../../game/directives/popoverDirective';
import { stackLabel, type ItemInfo } from './inventoryModel';

// An item as an inventory slot: rarity-tinted square, icon, quantity badge. The rarity colors
// come from the game's global `rarity_<id>` classes, so the tile matches the in-game slot.
const props = defineProps<{
  info?: ItemInfo;
  itemId: string;
  quantity?: number;
  /** Small corner badge, e.g. how many are already in the inventory. */
  badge?: string;
  size?: 'lg' | 'md' | 'sm';
  over?: boolean;
  categoryIcon?: string;
  /**
   * The game's item hover card instead of the text tooltip (needs hydrateItemPreview):
   * 'pin' pins the card on click, 'hover' leaves the click to the tile's parent.
   */
  popover?: 'pin' | 'hover';
}>();

const cardComponent = markRaw(EditorItemPopupCard);

const popoverBinding = computed<PopoverBinding>(() => props.popover && props.info ? {
  component: cardComponent,
  props: { itemId: props.itemId, quantity: props.quantity },
  disableClick: props.popover === 'hover',
  placement: 'right-start' as const,
} : null);

const tooltip = computed(() => {
  const info = props.info;
  if (!info) return `${props.itemId}\nNo item template has this id.`;
  const parts = [stackLabel(info.maxStack)];
  if (info.weight) parts.push(`weight ${info.weight}`);
  const price = Object.entries(info.price).map(([currency, amount]) => `${amount} ${currency}`).join(', ');
  if (price) parts.push(price);
  const lines = [info.name === info.id ? info.id : `${info.name} (${info.id})`, parts.join(' · ')];
  if (info.description) lines.push(info.description.length > 220 ? `${info.description.slice(0, 220)}…` : info.description);
  return lines.join('\n');
});

const initials = computed(() => (props.info?.name || props.itemId).slice(0, 2));
</script>

<template>
  <div class="item-tile" :class="[size ?? 'md', info?.rarity ? `rarity_${info.rarity}` : '', { missing: !info, over }]"
    v-popover="popoverBinding"
    v-tooltip.top="popoverBinding ? undefined : { value: tooltip, class: 'item-tile-tooltip' }">
    <img v-if="info?.image" :src="info.image" alt="" class="it-image" draggable="false" />
    <span v-else class="it-initials">{{ initials }}</span>
    <img v-if="categoryIcon" :src="categoryIcon" alt="" class="it-category" />
    <span v-if="quantity !== undefined && quantity !== 1" class="it-quantity">{{ quantity }}</span>
    <span v-if="badge" class="it-badge">{{ badge }}</span>
  </div>
</template>

<style scoped>
.item-tile {
  --tile: 64px;
  position: relative;
  width: var(--tile);
  height: var(--tile);
  flex: 0 0 auto;
  border-radius: 6px;
  border: 2px solid var(--rarity-color, #4a4f5c);
  background:
    radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--rarity-color, #9aa0ad) 22%, transparent), transparent 70%),
    #1f2229;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.item-tile.lg {
  --tile: 76px;
}

.item-tile.sm {
  --tile: 40px;
  border-width: 1px;
}

.item-tile.missing {
  border-style: dashed;
  border-color: var(--editor-fg-danger);
}

.item-tile.over {
  outline: 2px solid var(--editor-fg-danger);
  outline-offset: 1px;
}

.it-image {
  width: 82%;
  height: 82%;
  object-fit: contain;
  user-select: none;
}

.it-initials {
  font-size: calc(var(--tile) * 0.3);
  font-weight: 700;
  color: #9aa0ad;
  text-transform: uppercase;
}

.it-category {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  object-fit: contain;
  opacity: 0.85;
}

.it-quantity {
  position: absolute;
  right: 3px;
  bottom: 1px;
  font-size: 0.75rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 0 3px #000, 0 0 2px #000;
  font-variant-numeric: tabular-nums;
}

.item-tile.sm .it-quantity {
  font-size: 0.65rem;
  right: 2px;
  bottom: 0;
}

.it-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--editor-accent, #ff5722);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  line-height: 1.2rem;
}
</style>

<style>
/* Teleported tooltip: keep the summary's line breaks. */
.item-tile-tooltip .p-tooltip-text {
  white-space: pre-line;
  max-width: 22rem;
}
</style>
