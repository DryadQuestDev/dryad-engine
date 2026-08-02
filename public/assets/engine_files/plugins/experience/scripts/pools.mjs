/// <reference path="./dtypes.d.ts" />

const { game } = window.engine;

import { getMc, getDungeonLevel, dungeonScale, setGenerationLevel, inSpawnWindow } from './reward.mjs';

// ═══════════════════════ Pooled inventories (DQ9 generics port) ═══════════════════════
// Two authoring forms:
// - Inline: a `!` choice with {loot: "^pool_entry"} / {trade: "^pool_entry"}. The engine redirects
//   the choice's value to a placement-unique id and records each redirect on the dungeon object
//   (getCurrentDungeon().pooledInventories); this module fills those instances on dungeon enter.
//   Comma lists draw several entries.
// - Declared hybrid: an inventory template with `dungeon` + `pool` traits (and optionally
//   `restock`). Authored items are stamped stock_authored so restocks preserve exactly the
//   surviving ones — a bought signature item stays gone.
// Loot instances lock at the dungeon-level snapshot forever (scum-proof, like `dungeon`-bound
// chests). Trade instances re-roll their unstamped stock whenever the MC's level changed since
// the last roll, checked on open (before the overlay renders and trade prices init).

// { [instanceId]: { pool: string, level: number, restock: boolean } }
game.registerState('pooled_stock', {});

function getConfig() {
    return game.getData('plugins_data/experience/config_experience');
}

function autoScalingOn() {
    return !!getConfig()?.auto_scaling;
}

function mcLevel() {
    return Math.max(1, getMc()?.getTrait('level') || 1);
}

/** Draw a pool ref (comma-separated pool_entries ids, chance mode) into an inventory. Items are
 *  created at `level` (equipment scales via the item_create listener); drawn currency quantities
 *  scale by the same level — the trader-gold analog of DQ9's wealth scaling. */
function drawPoolInto(/** @type {Inventory} */ inventory, /** @type {string} */ poolRef, /** @type {number} */ level) {
    // Spawn windows: the pool draws from a level-filtered copy of the templates, so tiered items
    // (spawn_min/spawn_max) only appear inside their band. Entity filters still apply on top.
    const source = [...(game.getData('item_templates', true)?.values() || [])]
        .filter(t => inSpawnWindow(t, level));
    setGenerationLevel(level);
    try {
        for (const entryId of poolRef.split(',').map(s => s.trim()).filter(Boolean)) {
            for (const draw of game.drawFromPool(entryId, { type: 'chance', customData: source })) {
                const item = game.createItem(draw.id);
                if (!item) continue;
                const quantity = item.is_currency
                    ? Math.max(1, Math.round(draw.quantity * dungeonScale(level)))
                    : draw.quantity;
                inventory.addItem(item, quantity);
            }
        }
    } finally {
        setGenerationLevel(null);
    }
}

/** Build a hybrid instance from a template with a `pool` trait: template fields carry over,
 *  authored items are stamped stock_authored, pooled stock is drawn unstamped. */
function createHybridInventory(/** @type {string} */ id, /** @type {any} */ template, /** @type {number} */ level) {
    const inventory = game.createInventory(id, { ...template, items: [] });
    setGenerationLevel(level);
    try {
        for (const entry of template.items || []) {
            if (!entry?.item_id) continue;
            const item = game.createItem(entry.item_id);
            if (!item) continue;
            item.traits = { ...item.traits, stock_authored: true }; // clone — traits are template refs
            inventory.addItem(item, entry.quantity || 1);
        }
    } finally {
        setGenerationLevel(null);
    }
    drawPoolInto(inventory, template.traits.pool, level);
    return inventory;
}

// ── Instantiation on dungeon enter ──
// Runs after reward.mjs's dungeon_enter listener (module import order), so the level snapshot for
// this dungeon is already taken when loot instances roll.

game.on('dungeon_enter', (/** @type {string} */ dungeonId) => {
    if (!autoScalingOn()) return;
    const dungeon = game.getCurrentDungeon();
    const group = dungeon?.traits?.level_group || dungeonId;
    const stock = { ...(game.getState('pooled_stock') || {}) };
    let changed = false;

    const record = (/** @type {string} */ id, /** @type {string} */ pool, /** @type {number} */ level, /** @type {boolean} */ restock) => {
        stock[id] = { pool, level, restock };
        changed = true;
    };

    // Declared hybrids bound to this dungeon (reward.mjs's plain dungeon-trait loop skips these)
    for (const [id, template] of game.getData('item_inventories', true) || []) {
        const traits = template?.traits;
        if (!traits?.pool || !traits.dungeon) continue;
        if (traits.dungeon !== dungeonId && traits.dungeon !== group) continue;
        if (game.getInventory(id)) continue;
        const restock = !!traits.restock;
        const level = restock ? mcLevel() : getDungeonLevel();
        createHybridInventory(id, template, level);
        record(id, traits.pool, level, restock);
    }

    // Inline ^refs, collected by the engine's choice redirect during the dungeon build
    for (const entry of dungeon?.pooledInventories || []) {
        if (game.getInventory(entry.id)) continue;
        const restock = entry.type === 'trade';
        const level = restock ? mcLevel() : getDungeonLevel();
        const inventory = game.createInventory(entry.id);
        drawPoolInto(inventory, entry.pool, level);
        record(entry.id, entry.pool, level, restock);
    }

    if (changed) game.setState('pooled_stock', stock);
});

// ── Trade restock on open ──
// inventory_open fires before the overlay renders and before trade prices init, so a re-rolled
// stock is priced and displayed like any other.

game.on('inventory_open', (/** @type {Inventory} */ inventory) => {
    if (!autoScalingOn() || !inventory) return;
    const stock = game.getState('pooled_stock') || {};
    const entry = stock[inventory.id];
    if (!entry?.restock) return;
    const level = mcLevel();
    if (entry.level === level) return;

    for (const item of [...inventory.items]) {
        if (!item.traits?.stock_authored) inventory.removeItem(item);
    }
    drawPoolInto(inventory, entry.pool, level);
    game.setState('pooled_stock', { ...stock, [inventory.id]: { ...entry, level } });
});
