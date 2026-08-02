<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import ItemCard from '../progression/ItemCard.vue';
import { PARTY_INVENTORY_ID } from '../../systems/itemSystem';

// Renders the item card the `item_view` action pointed at, under the dialogue text
// (registered on the scene-content-bottom slot). Cleared automatically on event_end.
const game = Game.getInstance();

const item = computed(() => {
  const uid = game.coreSystem.getState('viewed_item') as string | null;
  if (!uid) return null;
  return game.itemSystem.getInventory(PARTY_INVENTORY_ID)?.getItemByUid(uid) ?? null;
});
</script>

<template>
  <div v-if="item" class="event-item-card">
    <ItemCard :item="item" />
  </div>
</template>

<style scoped>
.event-item-card {
  display: flex;
  justify-content: center;
  padding: 6px 0;
}
</style>
