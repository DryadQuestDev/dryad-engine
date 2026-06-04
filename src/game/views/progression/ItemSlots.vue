<script setup lang="ts">
import { computed } from 'vue';
import { Character } from '../../core/character/character';
import ItemSlot from './ItemSlot.vue';
import { ITEM_SLOT_SIZE_PERCENT } from '../../../global/global';

const props = defineProps<{
  character: Character;
  disabled?: boolean; // Disable item click/drag while keeping hover tooltips
  layout?: 'doll' | 'row'; // 'doll' = positioned overlay (default), 'row' = flex row for text dungeons
}>();

// Get all item slots for this character with their equipped items
const itemSlotsWithItems = computed(() => {
  const slots = props.character.getItemSlots();
  const inventory = props.character.getPartyInventory();

  return slots.map(slot => {
    const item = slot.itemUid && inventory ? inventory.getItemByUid(slot.itemUid) : null;
    const slotObject = slot.getSlotObject();
    const emptySlotImage = slotObject?.image ?? null;
    const emptySlotName = slotObject?.name || slot.slotId;

    return {
      slot,
      item,
      emptySlotImage,
      emptySlotName,
      key: `${slot.slotId}-${slot.x}-${slot.y}-${slot.itemUid || 'empty'}`
    };
  });
});

</script>

<template>
  <div class="item-slots-overlay" :class="{ 'layout-row': layout === 'row' }">
    <div v-for="slotData in itemSlotsWithItems" :key="slotData.key" class="item-slot-cell" :style="layout === 'row' ? {} : {
      left: slotData.slot.x + 'cqh',
      top: slotData.slot.y + 'cqh'
    }">
      <ItemSlot v-if="slotData.item" :item="slotData.item" :character-id="character.id"
        :disabled="props.disabled === true" popup-placement="left-start" :pinnable="true" class="equipped-item" />
      <div v-else class="empty-slot">
        <img v-if="slotData.emptySlotImage" :src="slotData.emptySlotImage" alt="Empty slot" class="empty-slot-image" />
        <span v-else class="empty-slot-name">{{ slotData.emptySlotName }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.item-slots-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.item-slots-overlay.layout-row {
  position: static;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 8px;
  pointer-events: auto;
  width: auto;
  height: auto;
  padding: 2px;
}

/* .item-slot-cell is the layout/positioning wrapper around each ItemSlot.
   Renamed from the previous .item-slot-wrapper to avoid a class collision with
   ItemSlot.vue's own root (also .item-slot-wrapper, which handles rarity /
   sticky styling). Two different responsibilities → two distinct class names. */
.item-slot-cell {
  position: absolute;
  width: v-bind("(ITEM_SLOT_SIZE_PERCENT * 100) + 'cqh'");
  aspect-ratio: 1 / 1;
  pointer-events: auto;
}

.layout-row .item-slot-cell {
  position: static;
  width: 64px;
  /* min-height so cells can grow past 64 px when an inner ItemSlot's content
     (e.g. large-font fallback text) is taller — flex-wrap then computes row
     heights from actual content and next rows don't overlap. */
  min-height: 64px;
  /* Anchor the ItemSlot to the top of the cell so icons/text align to the
     same top baseline across neighbors with different cell heights (default
     align-items: stretch would vertically-center content in taller cells). */
  display: flex;
  align-items: flex-start;
}

.empty-slot {
  width: 100%;
  height: 100%;
  background: rgba(42, 42, 42, 0.5);
  border: 2px solid rgba(68, 68, 68, 0.8);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-slot-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 0.5;
}

.empty-slot-name {
  padding: 2px 4px;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.2;
  color: #aaa;
  text-align: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  overflow-wrap: anywhere;
  word-break: break-word;
  overflow: hidden;
  pointer-events: none;
}

/* Make the equipped item fill the slot container */
.equipped-item {
  width: 100%;
  height: 100%;
}
</style>
