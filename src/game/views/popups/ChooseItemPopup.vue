<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import { PARTY_INVENTORY_ID } from '../../systems/itemSystem';
import ItemSlot from '../progression/ItemSlot.vue';
import type { Item } from '../../core/character/item';

// Item picker for the choose_item scene action (DQ9's chooseItem popup). Filter, remove flag,
// follow-up scene and title come from the choose_item_pending state — the popup slot passes no
// props. Picking an item stores it (active_item uid + chosen_item_id template id, the latter
// surviving removal), optionally removes one, and resumes the story; Cancel resumes empty-handed.
const game = Game.getInstance();
const global = Global.getInstance();

type ChooseItemPending = {
    id?: string | string[];
    category?: string | string[];
    tags?: string | string[];
    remove?: boolean;
    scene?: string;
    title?: string;
};

const pending = computed(() => game.getState('choose_item_pending') as ChooseItemPending | null);

const title = computed(() => pending.value?.title || global.getString('choose_item.title'));

const toArray = (value?: string | string[]) => value == null ? null : (Array.isArray(value) ? value : [value]);

const items = computed<Item[]>(() => {
    const filter = pending.value;
    const inventory = game.itemSystem.getInventory(PARTY_INVENTORY_ID);
    if (!filter || !inventory) return [];
    const ids = toArray(filter.id);
    const categories = toArray(filter.category);
    const tags = toArray(filter.tags);
    return inventory.getUnequippedItems().filter(item => {
        if (ids && !ids.includes(item.id)) return false;
        if (categories && !categories.includes(item.category)) return false;
        if (tags && !tags.some(tag => item.hasTag(tag))) return false;
        return true;
    });
});

function finish(scene?: string) {
    game.closePopup('choose_item_popup');
    game.setState('choose_item_pending', null);
    if (scene) {
        game.playScene(scene);
    } else {
        game.dungeonSystem.nextScene();
    }
}

function pick(item: Item) {
    const filter = pending.value;
    if (!filter) return;
    game.setState('active_inventory', PARTY_INVENTORY_ID);
    game.setState('active_item', item.uid);
    game.setState('chosen_item_id', item.id);
    if (filter.remove) {
        game.itemSystem.getInventory(PARTY_INVENTORY_ID)?.reduceItemQuantity(item, 1);
    }
    finish(filter.scene);
}

function cancel() {
    game.setState('chosen_item_id', '');
    finish();
}
</script>

<template>
    <div class="choose-item-popup">
        <div class="choose-item-title">{{ title }}</div>
        <div v-if="items.length" class="choose-item-grid">
            <div v-for="item in items" :key="item.uid" class="choose-item-brick">
                <ItemSlot :item="item" :no-popup="true" @click="pick(item)" />
            </div>
        </div>
        <div v-else class="choose-item-empty">{{ global.getString('choose_item.empty') }}</div>
        <button class="choose-item-cancel" @click="cancel">{{ global.getString('choose_item.cancel') }}</button>
    </div>
</template>

<style scoped>
.choose-item-popup {
    background: rgba(22, 20, 18, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    padding: 18px 20px;
    min-width: 320px;
    max-width: min(640px, 92vw);
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.choose-item-title {
    font-size: 16px;
    font-weight: 700;
    color: #e4dbc8;
}

.choose-item-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 64px);
    grid-auto-rows: 64px;
    gap: 8px;
    overflow-y: auto;
    padding: 2px;
}

.choose-item-brick {
    width: 64px;
    height: 64px;
    cursor: pointer;
}

.choose-item-empty {
    color: #8d8375;
    padding: 14px 0;
}

.choose-item-cancel {
    align-self: flex-end;
    padding: 6px 20px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.06);
    color: #b0a695;
    cursor: pointer;
    font-size: 13px;
}

.choose-item-cancel:hover {
    color: #e4dbc8;
}
</style>
