<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import { PARTY_INVENTORY_ID } from '../../systems/itemSystem';

// Modal confirm for discarding an item, opened by the drop_item action (pending = { itemUid,
// characterId } in state). A stackable item gets a quantity slider; a single item is a plain
// confirm. Read from game state — the popup slot passes no props.
const game = Game.getInstance();
const global = Global.getInstance();

const pending = computed(() => game.getState('drop_item_pending') as { itemUid: string; characterId: string } | null);
const inventory = computed(() => game.itemSystem.getInventory(PARTY_INVENTORY_ID));
const item = computed(() => (pending.value ? inventory.value?.getItemByUid(pending.value.itemUid) ?? null : null));
const character = computed(() => (pending.value ? game.getCharacter(pending.value.characterId) : null));

const maxQuantity = computed(() => item.value?.quantity ?? 1);
const quantity = ref(1);
// Reset the slider to the full stack each time a new item is queued.
watch(item, (it) => { quantity.value = it?.quantity ?? 1; }, { immediate: true });

// Rarity-coloured name, run through the same resolveString pipeline as scene text.
const message = computed(() => {
  if (!item.value) return '';
  const nameHtml = game.itemSystem.getItemNameHtml(item.value);
  return game.logicSystem.resolveString(global.getString('item_drop_confirm', { item: nameHtml })).output;
});

const discardLabel = computed(() => global.getString('drop_item'));
const cancelLabel = computed(() => global.getString('dungeon_editor.cancel'));

function close() {
  game.closePopup('drop_item_popup');
  game.setState('drop_item_pending', null);
}

function confirm() {
  const it = item.value, char = character.value, inv = inventory.value;
  if (!it || !char || !inv) { close(); return; }
  const dropCount = Math.max(1, Math.min(quantity.value, it.quantity));
  const nameHtml = game.itemSystem.getItemNameHtml(it);
  // Silent on veto: a listener that blocks a drop knows why, so it owns the message (a scene, a
  // custom notification, or nothing at all). The engine only closes the popup.
  if (!game.trigger('item_drop_before', it, char)) {
    close();
    return;
  }
  inv.reduceItemQuantity(it, dropCount, char);
  game.showNotification(game.logicSystem.resolveString(
    global.getString('item_dropped', { item: dropCount > 1 ? `${nameHtml} x${dropCount}` : nameHtml })
  ).output);
  close();
}
</script>

<template>
  <div v-if="item" class="drop-item-popup">
    <div class="drop-item-message" v-html="message"></div>

    <div v-if="maxQuantity > 1" class="drop-item-quantity">
      <input type="range" v-model.number="quantity" :min="1" :max="maxQuantity" class="drop-item-slider" />
      <input type="number" v-model.number="quantity" :min="1" :max="maxQuantity" class="drop-item-number" />
      <span class="drop-item-of">/ {{ maxQuantity }}</span>
    </div>

    <div class="drop-item-buttons">
      <button class="drop-item-cancel" @click="close">{{ cancelLabel }}</button>
      <button class="drop-item-confirm" @click="confirm">{{ discardLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
.drop-item-popup {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px 20px;
  min-width: 260px;
  background: rgba(16, 20, 28, 0.96);
  border: 2px solid rgba(200, 60, 60, 0.5);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
  color: #fff;
  text-align: center;
}

.drop-item-message {
  font-size: 1.05em;
}

.drop-item-quantity {
  display: flex;
  align-items: center;
  gap: 10px;
}

.drop-item-slider {
  flex: 1;
  accent-color: #d24040;
}

.drop-item-number {
  width: 56px;
  padding: 4px 6px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  text-align: center;
}

.drop-item-of {
  color: #8fa3b5;
  font-variant-numeric: tabular-nums;
}

.drop-item-buttons {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.drop-item-cancel,
.drop-item-confirm {
  padding: 8px 22px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  font-size: 14px;
  transition: background 0.2s;
}

.drop-item-cancel {
  background: rgba(255, 255, 255, 0.12);
  color: #e6edf3;
}

.drop-item-cancel:hover {
  background: rgba(255, 255, 255, 0.2);
}

.drop-item-confirm {
  background: #c83c3c;
  color: #fff;
}

.drop-item-confirm:hover {
  background: #b13333;
}
</style>
