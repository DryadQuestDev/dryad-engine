/// <reference path="./dtypes.d.ts" />

const { game } = window.engine;

import { getMc, setGenerationLevel, equipmentCategories } from './reward.mjs';
import './components/SmithStation.mjs';

// ═══════════════════════ Smith Station ═══════════════════════
// A station overlay where level-stamped equipment is reforged upward — rarityCost stones per
// level (common 1, uncommon 2, … from the rarity list order), capped at the MC's level (and a
// worn piece also at its wearer's) — or, unequipped only, broken down into stones
// (floor(item_level / break_divisor) × rarityCost; the same coefficient on both sides
// keeps the refund ratio flat across rarities). The upgrade recreates the item from its template
// through the normal item_create scaling path, so the result is exactly what a fresh drop at
// that level would be; the before/after preview in the UI builds a throwaway instance through
// the same path. A worn piece is unequipped, swapped and re-equipped into the same slot.
// Opened by the `smith` action (eventDelayed — a scene paragraph would stomp overlay_state).
// The smith_stone item template is plugin-injected; games override it by id to set category/icon.

export const STONE_ID = 'smith_stone';

function getConfig() {
    return game.getData('plugins_data/experience/smith');
}

function partyInventory() {
    return game.getInventory('_party_inventory');
}

export function mcLevel() {
    return Math.max(1, getMc()?.getTrait('level') || 1);
}

export function stoneCount() {
    return partyInventory()?.getItemQuantity(STONE_ID) || 0;
}

export function breakDivisor() {
    return getConfig()?.break_divisor || 3;
}

const FALLBACK_RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// Stones per level, from the rarity ladder: common 1, uncommon 2, … Position comes from the
// rarity trait's own values order, so custom rarity sets scale without configuration.
export function rarityCost(/** @type {any} */ item) {
    const rarity = item.traits?.rarity;
    if (!rarity) return 1;
    const definition = [...(game.getData('item_traits', true)?.values() || [])].find(t => t.id === 'rarity');
    const order = definition?.values?.length ? definition.values : FALLBACK_RARITY_ORDER;
    const index = order.indexOf(rarity);
    return index >= 0 ? index + 1 : 1;
}

export function breakYield(/** @type {any} */ item) {
    return Math.floor((item.getTrait('item_level') || 0) / breakDivisor()) * rarityCost(item);
}

// Level-stamped equipment in the party bag, worn or not — the smith's working set.
export function smithableItems() {
    const inventory = partyInventory();
    if (!inventory) return [];
    const categories = equipmentCategories();
    return inventory.items.filter(item =>
        (item.getTrait('item_level') || 0) > 0 &&
        categories.includes(item.category));
}

// Equipped items leave the party bag with their wearer, so the party covers every slot that can
// hold one.
export function wearerOf(/** @type {any} */ item) {
    if (!item.isEquipped) return null;
    return game.getParty().find(c => c.getItemSlots().some(s => s.itemUid === item.uid)) || null;
}

/** The slot a worn item sits in, or null for a bag piece. */
export function wornSlotOf(/** @type {any} */ item) {
    return wearerOf(item)?.getItemSlots().find((/** @type {any} */ s) => s.itemUid === item.uid) || null;
}

// A worn piece also stops at its wearer's level: the equip gate would refuse it back into the slot.
export function levelCap(/** @type {any} */ item) {
    const wearerLevel = wearerOf(item)?.getTrait('level') || 0;
    return wearerLevel > 0 ? Math.min(mcLevel(), wearerLevel) : mcLevel();
}

// Fresh instance at an explicit level via the normal scaling path (unscaled template baseline).
export function makeItemAtLevel(/** @type {string} */ templateId, /** @type {number} */ level) {
    setGenerationLevel(level);
    try {
        return game.createItem(templateId);
    } finally {
        setGenerationLevel(null);
    }
}

export function upgradeCost(/** @type {any} */ item, /** @type {number} */ levels) {
    return levels * rarityCost(item);
}

// unequipSlot merges the piece back into the bag as a clone (or onto a matching stack), so the old
// item is whichever entry is new or grew. null when a listener refused the unequip.
function unequipToBag(/** @type {any} */ inventory, /** @type {any} */ slot, /** @type {any} */ wearer) {
    const before = new Map(inventory.items.map((/** @type {any} */ i) => [i, i.quantity]));
    if (!inventory.unequipSlot(slot, wearer)) return null;
    return inventory.items.find((/** @type {any} */ i) => !before.has(i) || i.quantity > before.get(i)) || null;
}

// A worn item is re-equipped into the same slot: its equip status is a snapshot of its stats, and
// the game's equip listeners (stat stamps, gates) need to see the new piece go on. No sound.
function reforge(/** @type {any} */ item, /** @type {number} */ levels) {
    const inventory = partyInventory();
    if (!inventory || levels < 1) return null;
    const current = item.getTrait('item_level') || 0;
    const target = current + levels;
    if (current < 1 || target > levelCap(item)) return null;
    if (!inventory.items.includes(item)) return null;
    const wearer = wearerOf(item);
    if (item.isEquipped && !wearer) return null;
    const cost = upgradeCost(item, levels);
    if (stoneCount() < cost) return null;

    if (!game.trigger('smith_upgrade', item, levels)) return null;

    const slot = wornSlotOf(item);
    const old = slot ? unequipToBag(inventory, slot, wearer) : item;
    if (!old) return null;

    const stone = inventory.getItemsById(STONE_ID)[0];
    inventory.reduceItemQuantity(stone, cost);
    inventory.reduceItemQuantity(old, 1);
    // addItem clones — the returned element is the live instance.
    const [live] = inventory.addItem(makeItemAtLevel(item.id, target), 1, true);
    if (slot) inventory.equipSlot(slot, live, wearer);

    game.trigger('smith_upgraded', live, levels);
    return live;
}

function playUpgradeSound() {
    const sound = getConfig()?.sound_upgrade;
    if (sound) game.playSounds(sound);
}

/**
 * Reforge: consume upgradeCost(item, levels) stones, recreate the item `levels` levels higher.
 * Returns the new live Item instance, or null if the upgrade is not possible.
 */
export function upgradeItem(/** @type {any} */ item, /** @type {number} */ levels) {
    const live = reforge(item, levels);
    if (live) playUpgradeSound();
    return live;
}

/**
 * Reforge a batch (e.g. a planEquippedUpgrades result), one sound for all of it.
 * Returns the live upgraded instances.
 */
export function upgradeItems(/** @type {SmithUpgradePlan[]} */ entries) {
    const upgraded = [];
    for (const { item, levels } of entries) {
        const live = reforge(item, levels);
        if (live) upgraded.push(live);
    }
    if (upgraded.length) playUpgradeSound();
    return upgraded;
}

/**
 * Spread `budget` stones over the worn pieces one level at a time, lowest level first (cheaper on a
 * tie), so a short budget lifts the weakest gear instead of maxing a single piece.
 * Only pieces that gain at least one level are returned.
 */
export function planEquippedUpgrades(/** @type {number} */ budget = stoneCount()) {
    const plan = smithableItems().filter(item => item.isEquipped).map(item => ({
        item,
        at: item.getTrait('item_level') || 0,
        cap: levelCap(item),
        coef: rarityCost(item),
        levels: 0,
        cost: 0,
    }));
    let left = budget;
    for (;;) {
        let next = null;
        for (const p of plan) {
            if (p.at >= p.cap || p.coef > left) continue;
            if (!next || p.at < next.at || (p.at === next.at && p.coef < next.coef)) next = p;
        }
        if (!next) break;
        next.at++;
        next.levels++;
        next.cost += next.coef;
        left -= next.coef;
    }
    return plan.filter(p => p.levels > 0)
        .map(p => /** @type {SmithUpgradePlan} */ ({ item: p.item, levels: p.levels, cost: p.cost }));
}

/**
 * Whether a bag piece beats what a party member wears: in some slot that takes it, it gains a
 * visible stat and loses none (stat polarity from reduction_is_good). A mixed trade is not called,
 * since there is no common scale to weigh one stat against another. Gear above the member's level
 * is skipped, as the equip gate would refuse it.
 */
export function beatsWornGear(/** @type {any} */ item) {
    if (item.isEquipped) return false;
    const defs = game.getData('character_stats', true);
    const need = item.getTrait('item_level') || 0;
    for (const character of game.getParty()) {
        const have = character.getTrait('level') || 0;
        if (have > 0 && need > have) continue;
        for (const { stats } of character.compareItem(item)) {
            let gains = false;
            let losses = false;
            for (const id in stats) {
                const def = defs?.get(id);
                if (!def || def.is_hidden) continue;
                if (def.reduction_is_good ? stats[id] < 0 : stats[id] > 0) gains = true;
                else losses = true;
            }
            if (gains && !losses) return true;
        }
    }
    return false;
}

/**
 * Break down a batch: each item is destroyed for breakYield(item) stones. Worn and stoneless
 * items are skipped, and smith_break can veto any single one. One sound for the whole batch.
 * Returns the stones granted.
 */
export function breakItems(/** @type {any[]} */ items) {
    const inventory = partyInventory();
    if (!inventory) return 0;
    let total = 0;
    for (const item of items) {
        const stones = breakYield(item);
        if (stones < 1 || item.isEquipped || !inventory.items.includes(item)) continue;
        if (!game.trigger('smith_break', item, stones)) continue;

        inventory.removeItem(item);
        inventory.addItem(game.createItem(STONE_ID), stones, true);
        total += stones;

        game.trigger('smith_broken', item, stones);
    }

    const sound = getConfig()?.sound_break;
    if (total > 0 && sound) game.playSounds(sound);
    return total;
}

/** Break down one item. Returns the stones granted, or null if the item is not breakable. */
export function breakItem(/** @type {any} */ item) {
    return breakItems([item]) || null;
}

// ── open / close (mirrors the exchange overlay contract) ──

export function openSmith() {
    if (game.getState('overlay_state') === 'smith-station') return;
    game.setState('block_party_inventory', true);
    game.setState('previous_overlay_state', game.getState('overlay_state'));
    game.setState('overlay_state', 'smith-station');
    const sound = getConfig()?.sound_open;
    if (sound) game.playSounds(sound);
}

export function closeSmith() {
    const previous = game.getState('previous_overlay_state');
    game.nextScene();
    game.setState('overlay_state', previous);
    game.setState('previous_overlay_state', null);
    game.setState('block_party_inventory', false);
}

// Emitter: smith_upgrade
// Fired before an item is reforged at the smith station.
// Args: (item: Item, levels: number)
// Return false in a listener to prevent the upgrade (stones are kept).
game.registerEmitter('smith_upgrade');

// Emitter: smith_break
// Fired before an item is broken down at the smith station.
// Args: (item: Item, stonesRefunded: number)
// Return false in a listener to prevent the break.
game.registerEmitter('smith_break');

// Emitter: smith_upgraded
// Fired after an item was reforged — stones spent, upgraded item in the inventory.
// Args: (item: Item, levels: number) — item is the live upgraded instance.
// Informational — return values are ignored.
game.registerEmitter('smith_upgraded');

// Emitter: smith_broken
// Fired after an item was broken down — item destroyed, stones granted.
// Args: (item: Item, stonesRefunded: number)
// Informational — return values are ignored.
game.registerEmitter('smith_broken');

// eventDelayed so the overlay opens after the paragraph finishes — playScene forces
// overlay-navigation and would clobber an immediate open.
// On a choice: an anvil before the label (smith-choice.css) and `smith-choice` on the row, the
// same shape as the engine's loot/trade badges.
game.registerAction('smith', {
    help: 'Open the smith station, to reforge or break down gear.',
    value: 'any',
    examples: ['{smith: true}'],
    eventDelayed: true,
    /** @param {Choice} choice */
    choiceModifier: (choice) => {
        const label = choice.nameComputed;
        choice.nameComputed = window.engine.vue.computed(() =>
            `<span class="smith-badge"><span class="smith-icon"></span></span> ${label ? label.value : choice.name}`);
        choice.className = 'smith-choice';
    },
    action: () => openSmith(),
});

game.registerService('smith', {
    open: openSmith,
    close: closeSmith,
    upgradeItem,
    upgradeItems,
    planEquippedUpgrades,
    beatsWornGear,
    breakItem,
    breakItems,
    breakYield,
    upgradeCost,
    rarityCost,
    smithableItems,
    wearerOf,
    levelCap,
    makeItemAtLevel,
    stoneCount,
    mcLevel,
});
