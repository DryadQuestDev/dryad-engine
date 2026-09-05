/// <reference path="./dtypes.d.ts" />

const { game } = window.engine;

import { getMc, setGenerationLevel, equipmentCategories } from './reward.mjs';
import './components/SmithStation.mjs';

// ═══════════════════════ Smith Station ═══════════════════════
// A station overlay where unequipped, level-stamped equipment is reforged upward — rarityCost
// stones per level (common 1, uncommon 2, … from the rarity list order), capped at the MC's
// level — or broken down into stones (floor(item_level / smith_break_divisor) × rarityCost;
// the same coefficient on both sides keeps the refund ratio flat across rarities). The upgrade
// recreates the item from its template through the normal item_create scaling path, so the
// result is exactly what a fresh drop at that level would be; the before/after preview in the
// UI builds a throwaway instance through the same path.
// Opened by the `smith` action (eventDelayed — a scene paragraph would stomp overlay_state).
// The smith_stone item template is plugin-injected; games override it by id to set category/icon.

export const STONE_ID = 'smith_stone';

function getConfig() {
    return game.getData('plugins_data/experience/config_experience');
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
    return getConfig()?.smith_break_divisor || 3;
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

// Unequipped, level-stamped equipment in the party bag — the smith's working set.
export function smithableItems() {
    const inventory = partyInventory();
    if (!inventory) return [];
    const categories = equipmentCategories();
    return inventory.getUnequippedItems().filter(item =>
        (item.getTrait('item_level') || 0) > 0 &&
        categories.includes(item.category));
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

/**
 * Reforge: consume upgradeCost(item, levels) stones, recreate the item `levels` levels higher.
 * Returns the new live Item instance, or null if the upgrade is not possible.
 */
export function upgradeItem(/** @type {any} */ item, /** @type {number} */ levels) {
    const inventory = partyInventory();
    if (!inventory || levels < 1) return null;
    const current = item.getTrait('item_level') || 0;
    const target = current + levels;
    if (current < 1 || target > mcLevel()) return null;
    if (item.isEquipped || !inventory.items.includes(item)) return null;
    const cost = upgradeCost(item, levels);
    if (stoneCount() < cost) return null;

    if (!game.trigger('smith_upgrade', item, levels)) return null;

    const stone = inventory.getItemsById(STONE_ID)[0];
    inventory.reduceItemQuantity(stone, cost);
    inventory.removeItem(item);
    // addItem clones — the returned element is the live instance.
    const [live] = inventory.addItem(makeItemAtLevel(item.id, target), 1, true);

    game.trigger('smith_upgraded', live, levels);

    const sound = getConfig()?.smith_sound_upgrade;
    if (sound) game.playSounds(sound);
    return live;
}

/**
 * Break down: destroy the item, refund floor(item_level / divisor) stones.
 * Returns the stones granted, or null if the item is not breakable.
 */
export function breakItem(/** @type {any} */ item) {
    const inventory = partyInventory();
    if (!inventory) return null;
    const stones = breakYield(item);
    if (stones < 1 || item.isEquipped || !inventory.items.includes(item)) return null;

    if (!game.trigger('smith_break', item, stones)) return null;

    inventory.removeItem(item);
    inventory.addItem(game.createItem(STONE_ID), stones, true);

    game.trigger('smith_broken', item, stones);

    const sound = getConfig()?.smith_sound_break;
    if (sound) game.playSounds(sound);
    return stones;
}

// ── open / close (mirrors the exchange overlay contract) ──

export function openSmith() {
    if (game.getState('overlay_state') === 'smith-station') return;
    game.setState('block_party_inventory', true);
    game.setState('previous_overlay_state', game.getState('overlay_state'));
    game.setState('overlay_state', 'smith-station');
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
game.registerAction('smith', {
    eventDelayed: true,
    action: () => openSmith(),
});

game.registerService('smith', {
    open: openSmith,
    close: closeSmith,
    upgradeItem,
    breakItem,
    breakYield,
    upgradeCost,
    rarityCost,
    smithableItems,
    makeItemAtLevel,
    stoneCount,
    mcLevel,
});
