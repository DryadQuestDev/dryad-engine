<script setup lang="ts">
import { computed, markRaw, ref } from 'vue';
import type { Placement } from '@floating-ui/vue';
import { Item } from '../../core/character/item';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import ItemPopupCard from '../popups/cards/ItemPopupCard.vue';
import { isPinned, getPinned } from '../popups/popupStore';
import { popover as vPopover } from '../../directives/popoverDirective';

const props = defineProps<{
  item: Item;
  characterId?: string;
  disabled?: boolean; // Disable click/drag while keeping hover tooltips
  popupPlacement?: Placement; // Where the item popup should anchor. Default: right-start.
  popupNoChoices?: boolean; // Hide the choice buttons (equip/drop/use) on the item card, and disable double-click equip with them.
  popupDismissOnClick?: boolean; // Clicking the slot closes its hover card instead of pinning it — for contexts where the click opens its own UI (detail view, confirm modal).
  noPopup?: boolean; // Suppress the hover card entirely — for click-to-choose pickers where a floating card would cover the bricks.
}>();

const emit = defineEmits<{
  click: [item: Item];
  dragstart: [event: DragEvent, item: Item];
}>();

const game = Game.getInstance();
const itemSlotRef = ref<HTMLElement | null>(null);

const popupKey = computed(() => `item:${props.item.uid}`);

const ItemPopupCardComp = markRaw(ItemPopupCard);

const popoverBinding = computed(() => props.noPopup ? null : ({
  component: ItemPopupCardComp,
  props: { item: props.item, characterId: props.characterId, disabled: props.disabled, noChoices: props.popupNoChoices },
  dismissOnClick: props.popupDismissOnClick === true,
  disableClick: props.disabled === true,
  placement: props.popupPlacement ?? ('right-start' as const),
  key: popupKey.value,
}));

// Drives the .pinned class. Reactive against the pinned list via getPinned().
const pinned = getPinned();
const isCardPinned = computed(() => {
  void pinned.value;
  return isPinned(popupKey.value);
});

// ── Card data ──
const icon = computed(() => props.item.getTrait('image'));
const name = computed(() => props.item.getTrait('name') || props.item.id);

const durability = computed(() => {
  const value = props.item.traits?.durability;
  return typeof value === 'number' ? Math.round(value) : null;
});

const quantity = computed(() => {
  const maxStack = props.item.maxStack();
  if (maxStack && (maxStack > 1 || maxStack === -1)) return props.item.quantity;
  return null;
});

const weight = computed(() => {
  if (props.item.isEquipped) return null;
  const itemWeight = props.item.getTrait('weight');
  if (itemWeight && itemWeight > 0) {
    return (itemWeight * props.item.quantity).toFixed(1);
  }
  return null;
});

const attributeClasses = computed(() => props.item.getRarityClasses());

function handleClick() {
  if (props.disabled) return;
  emit('click', props.item);
}

// The character the card's choices act on — same resolution ItemPopupCard uses, so a double-click
// can never land on a different character than the buttons would.
const actingCharacter = computed(() =>
  props.characterId ? game.getCharacter(props.characterId) : game.characterSystem.selectedCharacter.value
);

// Double-click equips into the first free compatible slot (or unequips) via equipItem's own
// smart-slot fallback, so it goes through the same item_equip_before veto as the choice buttons.
// Equip-only on purpose: a mis-click that consumes a potion is a worse failure than a wasted
// gesture, so consumables, books and recipes stay behind their explicit choice.
function handleDblClick() {
  if (props.disabled || props.popupNoChoices) return;
  const character = actingCharacter.value;
  if (!character) return;
  if (!game.itemSystem.canUseItems()) {
    Global.getInstance().addNotificationId('items_no_use');
    return;
  }
  if (props.item.isEquipped) {
    character.unequipItem(props.item);
    return;
  }
  if (character.getAvailableSlotsForItem(props.item).length === 0) return;
  character.equipItem(props.item);
}

function handleDragStart(event: DragEvent) {
  if (props.disabled) { event.preventDefault(); return; }
  emit('dragstart', event, props.item);
}
</script>

<template>
  <div class="item-slot-wrapper" :class="attributeClasses">
    <div ref="itemSlotRef" class="item-slot" :class="{
      'equipped': item.isEquipped,
      'pinned': isCardPinned,
      'disabled': disabled
    }" :draggable="!disabled" @click="handleClick" @dblclick="handleDblClick" @dragstart="handleDragStart"
      v-popover="popoverBinding">
      <img v-if="icon" :src="icon" :alt="name" class="item-icon" v-persist />
      <span v-else class="item-name-fallback">{{ name }}</span>

      <span v-if="durability !== null" class="item-durability">{{ durability }}</span>
      <span v-if="weight !== null" class="item-weight">{{ weight }}</span>
      <span v-if="quantity !== null" class="item-quantity">{{ quantity }}</span>
    </div>
  </div>
</template>

<style scoped>
.item-slot-wrapper {
  display: inline-block;
  width: 100%;
  height: 100%;
}

/* Frame, gradient and grain come from the shared .item-slot rule in style.css —
   only layout lives here, so scoped specificity doesn't override the theme. */
.item-slot {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.item-slot.disabled {
  cursor: default;
}

.item-icon {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.item-name-fallback {
  padding: 2px 4px;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--rarity-color, #fff);
  text-align: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  overflow-wrap: anywhere;
  word-break: break-word;
  overflow: hidden;
  pointer-events: none;
}

.item-quantity {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  padding: 2px 4px;
  font-size: 10px;
  border-radius: 2px;
  font-weight: bold;
}

.item-weight {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background: rgba(0, 0, 0, 0.7);
  color: #999;
  padding: 2px 4px;
  font-size: 9px;
  border-radius: 2px;
  font-weight: normal;
}
</style>
