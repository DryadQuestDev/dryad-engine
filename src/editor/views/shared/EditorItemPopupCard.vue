<script setup lang="ts">
import { computed } from 'vue';
import ItemPopupCard from '../../../game/views/popups/cards/ItemPopupCard.vue';
import { createPreviewItem } from '../../gamePreviewHydration';

// The game's item hover card for an editor view, built from a template id when the popup opens.
// Needs hydrateItemPreview() to have run. The wrapper class scopes plugin editor_preview css,
// which the popup layer would otherwise miss: it renders outside the editor's DOM.
const props = defineProps<{
  itemId: string;
  quantity?: number;
}>();

const item = computed(() => {
  const created = createPreviewItem(props.itemId);
  if (created && props.quantity && props.quantity > 1) created.quantity = props.quantity;
  return created;
});
</script>

<template>
  <div class="editor-game-preview editor-item-popup">
    <ItemPopupCard v-if="item" :item="item" :no-choices="true" :no-compare="true" />
    <div v-else class="editor-item-missing">No item template has the id <code>{{ itemId }}</code>.</div>
  </div>
</template>

<style scoped>
/* An item lore link's hover builds its card through game.createItem, which runs the template's
   item_create script; editor previews never run scripts. */
.editor-item-popup :deep(.lore-link[data-lore-kind='item']) {
  pointer-events: none;
}

.editor-item-missing {
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(26, 26, 26, 0.95);
  border: 2px solid #444;
  color: #ef9a9a;
  font-size: 0.85rem;
}
</style>

<style>
/* The game's popup frame is 97% opaque, invisible over the game's dark scenes but readable
   through over the light editor. Editor item previews get a solid frame. */
/* Doubled class: outranks PopupItem's scoped `.popup[data-v-…]` rule regardless of load order. */
.popup.popup:has(.editor-item-popup),
.popup.popup:has(.editor-item-popup) .popup-inspect-hint.popup-inspect-hint {
  background: rgb(15, 15, 18);
}
</style>

