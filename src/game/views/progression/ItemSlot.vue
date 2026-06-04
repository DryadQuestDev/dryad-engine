<script setup lang="ts">
import { computed, markRaw, ref } from 'vue';
import type { Placement } from '@floating-ui/vue';
import { Item } from '../../core/character/item';
import ItemPopupCard from '../popups/cards/ItemPopupCard.vue';
import { isPinned, getPinned } from '../popups/popupStore';
import { popover as vPopover } from '../../directives/popoverDirective';

const props = defineProps<{
  item: Item;
  characterId?: string;
  disabled?: boolean; // Disable click/drag while keeping hover tooltips
  popupPlacement?: Placement; // Where the item popup should anchor. Default: right-start.
  pinnable?: boolean; // Whether clicking the slot pins its popup. Default: false (hover-only).
}>();

const emit = defineEmits<{
  click: [item: Item];
  dragstart: [event: DragEvent, item: Item];
}>();

const itemSlotRef = ref<HTMLElement | null>(null);

const popupKey = computed(() => `item:${props.item.uid}`);

const ItemPopupCardComp = markRaw(ItemPopupCard);

const popoverBinding = computed(() => ({
  component: ItemPopupCardComp,
  props: { item: props.item, characterId: props.characterId, disabled: props.disabled },
  sticky: props.pinnable === true && !props.disabled,
  placement: props.popupPlacement ?? ('right-start' as const),
  key: popupKey.value,
}));

// Drives the .sticky class. Reactive against the pinned list via getPinned().
const pinned = getPinned();
const isSticky = computed(() => {
  void pinned.value;
  return isPinned(popupKey.value);
});

// ── Card data ──
const icon = computed(() => props.item.getTrait('image'));
const name = computed(() => props.item.getTrait('name') || props.item.id);

const durability = computed(() => {
  const durabilityProp = props.item.properties['durability'];
  if (durabilityProp && durabilityProp.currentValue !== undefined) {
    return Math.round(durabilityProp.currentValue as number);
  }
  return null;
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

const attributeClasses = computed(() => props.item.getAttributeClasses());

function handleClick() {
  if (props.disabled) return;
  emit('click', props.item);
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
      'sticky': isSticky,
      'disabled': disabled
    }" :draggable="!disabled" @click="handleClick" @dragstart="handleDragStart"
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

.item-slot {
  position: relative;
  width: 100%;
  height: 100%;
  border: 2px solid #444;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2a2a2a;
  transition: all 0.2s ease;
}

.item-slot:hover {
  border-color: #666;
  background: #333;
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
