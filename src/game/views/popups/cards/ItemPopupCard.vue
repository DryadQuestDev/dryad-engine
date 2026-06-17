<script setup lang="ts">
import { computed } from 'vue';
import { Item } from '../../../core/character/item';
import { Game } from '../../../game';
import ItemCard from '../../progression/ItemCard.vue';
import ItemChoices from '../../progression/ItemChoices.vue';

const props = defineProps<{
    item: Item;
    characterId?: string;
    disabled?: boolean;
}>();

const game = Game.getInstance();

const choices = computed(() => {
    const char = props.characterId ? game.getCharacter(props.characterId) : game.characterSystem.selectedCharacter.value;
    return char?.getItemChoices(props.item) || [];
});

const hasChoices = computed(() => choices.value.length > 0 && !props.disabled);
</script>

<template>
    <div class="popup-inner item-popup-card">
        <div v-if="hasChoices" class="item-choices-wrapper">
            <ItemChoices :item="item" />
        </div>
        <ItemCard :item="item" :character-id="characterId" />
    </div>
</template>

<style scoped>
/* Override the global .popup-inner padding here — the nested ItemCard
   already supplies its own 12px padding, so .popup-inner's spacing would
   stack and read as a double margin. The .item-choices-wrapper that may
   sit above the card carries its own visual spacing via the parent's gap. */
.item-popup-card.popup-inner {
    padding: 0;
}

.item-popup-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.item-choices-wrapper {
    pointer-events: auto;
}
</style>
