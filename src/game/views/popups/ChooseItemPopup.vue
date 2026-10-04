<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import vTooltip from 'primevue/tooltip';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import { PARTY_INVENTORY_ID } from '../../systems/itemSystem';
import ItemSlot from '../progression/ItemSlot.vue';
import type { Item } from '../../core/character/item';

// Item picker for the choose_item scene action (DQ9's chooseItem popup). Filter, remove flag,
// follow-up scene and title come from the choose_item_pending state — the popup slot passes no
// props. Picking an item stores it (active_item uid + chosen_item_id template id, the latter
// surviving removal), optionally removes one, and resumes the story; Cancel just closes the popup.
const game = Game.getInstance();
const global = Global.getInstance();

/** Sentinel category id for the built-in quest filter — matches no game-defined category. */
const QUEST_FILTER = '__quest';
/** Rarity tier the built-in quest filter collects. */
const QUEST_RARITY = 'quest';

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

const selectedCategory = ref('all');

// Each opening starts on "All" — a tab left over from the previous pick would silently hide
// items the new filter does allow.
watch(pending, () => { selectedCategory.value = 'all'; });

const toArray = (value?: string | string[]) => value == null ? null : (Array.isArray(value) ? value : [value]);

// Everything the scene's own filter allows, before the category tabs narrow it further.
const pickableItems = computed<Item[]>(() => {
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

// Only the categories actually on offer get a tab. The inventory and exchange bars dim empty
// categories instead, because both sides there have to show the same tab set; a picker's pool is
// already cut down by the scene's filter, so an always-empty tab would be pure noise.
const categories = computed(() => {
    const present = new Set(pickableItems.value.map(item => item.category));
    return [...game.itemSystem.itemCategoriesMap.values()]
        .filter(cat => present.has(cat.id))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
});

const hasQuestItems = computed(() => pickableItems.value.some(item => item.getRarity() === QUEST_RARITY));

// One tab plus "All" is no choice at all — the bar only earns its row when it can sort something.
const showFilterBar = computed(() => categories.value.length + (hasQuestItems.value ? 1 : 0) > 1);

const items = computed<Item[]>(() => {
    if (!showFilterBar.value || selectedCategory.value === 'all') return pickableItems.value;
    if (selectedCategory.value === QUEST_FILTER) {
        return pickableItems.value.filter(item => item.getRarity() === QUEST_RARITY);
    }
    return pickableItems.value.filter(item => item.category === selectedCategory.value);
});

const allLabel = computed(() => global.getString('inventory.filter.all'));
const questLabel = computed(() => global.getString('inventory.filter.quest'));
// Two empty states: nothing the scene asked for is carried at all, versus a tab that happens to
// be empty while other tabs still hold picks.
const emptyLabel = computed(() => pickableItems.value.length
    ? global.getString('inventory.no_items')
    : global.getString('choose_item.empty'));

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

// Cancel closes the picker and leaves the story where it stood — the `>`/`~`/`!` choice that
// opened the picker is still on screen, so the player can try again or take another route.
// A paragraph-level {choose_item} has no such choice: it parks the scene on the synthetic
// `delayed_action` continue, which is spent the moment it fires, so a plain close would leave a
// dead click. Drop the delayed action and rebuild the paragraph's own choices to put the normal
// "click to continue" back.
function cancel() {
    game.setState('chosen_item_id', '');
    game.closePopup('choose_item_popup');
    game.setState('choose_item_pending', null);
    const dungeon = game.dungeonSystem;
    const parked = dungeon.eventChoices.value;
    if (parked && !Array.isArray(parked) && parked.id === 'delayed_action') {
        dungeon.delayedActionObject = {};
        dungeon.eventChoices.value = dungeon.createChoices(dungeon.currentSceneId.value);
    }
}
</script>

<template>
    <div class="choose-item-popup">
        <div class="choose-item-title">{{ title }}</div>

        <div v-if="showFilterBar" class="choose-item-filter-tabs" role="tablist">
            <button type="button" role="tab" class="choose-item-filter-tab"
                :class="{ active: selectedCategory === 'all' }" :aria-selected="selectedCategory === 'all'"
                :aria-label="allLabel" v-tooltip.top="allLabel" @click="selectedCategory = 'all'">
                <span class="choose-item-filter-icon inventory-filter-icon-all"></span>
            </button>

            <button v-for="cat in categories" :key="cat.id" type="button" role="tab" class="choose-item-filter-tab"
                :class="{ active: selectedCategory === cat.id }" :aria-selected="selectedCategory === cat.id"
                :aria-label="cat.name || cat.id" v-tooltip.top="cat.name || cat.id"
                @click="selectedCategory = cat.id">
                <img v-if="cat.icon" :src="cat.icon" :alt="cat.name || cat.id" class="choose-item-filter-icon" />
                <span v-else class="choose-item-filter-chip">{{ cat.name || cat.id }}</span>
            </button>

            <button v-if="hasQuestItems" type="button" role="tab" class="choose-item-filter-tab"
                :class="{ active: selectedCategory === QUEST_FILTER }"
                :aria-selected="selectedCategory === QUEST_FILTER" :aria-label="questLabel"
                v-tooltip.top="questLabel" @click="selectedCategory = QUEST_FILTER">
                <span class="choose-item-filter-icon inventory-filter-icon-quest"></span>
            </button>
        </div>

        <div v-if="items.length" class="choose-item-grid">
            <div v-for="item in items" :key="item.uid" class="choose-item-brick">
                <ItemSlot :item="item" :popup-no-choices="true" :popup-dismiss-on-click="true"
                    @click="pick(item)" />
            </div>
        </div>
        <div v-else class="choose-item-empty">{{ emptyLabel }}</div>
        <button class="choose-item-cancel" @click="cancel">{{ global.getString('choose_item.cancel') }}</button>
    </div>
</template>

<style scoped>
.choose-item-popup {
    background: rgba(22, 20, 18, 0.97);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    padding: 18px 20px;
    /* An explicit width, not a max-width: the grid's auto-fill tracks give the flex column no
       width of their own to grow to, so without this the popup sits at a couple of columns
       however much room the screen has. */
    box-sizing: border-box;
    width: min(760px, 92vw);
    width: min(760px, 92dvw);
    max-height: 80vh;
    max-height: 80dvh;
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.choose-item-title {
    font-size: 16px;
    font-weight: 700;
    color: #e4dbc8;
}

.choose-item-filter-tabs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
}

.choose-item-filter-tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 7px;
    border-radius: 5px;
    cursor: pointer;
    transition: background 0.2s, border-color 0.2s;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    color: #fff;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid transparent;
}

.choose-item-filter-tab:hover {
    background: rgba(0, 0, 0, 0.6);
    border-color: rgba(255, 255, 255, 0.15);
}

.choose-item-filter-tab.active {
    background: rgba(0, 0, 0, 0.75);
    border-color: rgba(255, 255, 255, 0.3);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

/* The engine's built-in .inventory-filter-icon-all / -quest classes supply only a
   background-image, so the box itself has to be declared here. */
.choose-item-filter-icon {
    width: 18px;
    height: 18px;
    object-fit: contain;
    background-size: contain;
    background-repeat: no-repeat;
    background-position: center;
    flex-shrink: 0;
}

/* Fallback label for a category the game gave no icon. */
.choose-item-filter-chip {
    white-space: nowrap;
    line-height: 18px;
}

.choose-item-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, 64px);
    grid-auto-rows: 64px;
    gap: 8px;
    overflow-y: auto;
    padding: 2px;
}

/* Flex, not the default block: ItemSlot's root is an inline-block, and the line box it would sit
   in adds the font's descender space below the 64px brick — enough overflow to give a single row
   a scrollbar with nothing to scroll. */
.choose-item-brick {
    display: flex;
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
