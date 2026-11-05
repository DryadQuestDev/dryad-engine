/// <reference path="./dtypes.d.ts" />

const { game } = window.engine;

import { getMc, inSpawnWindow } from './reward.mjs';

// ═══════════════════════ Gather spots (random collectables) ═══════════════════════
// A collectable encounter with `collect_pool: "gather"` gets its item rolled here, during dungeon
// creation, through the core collectable_resolve emitter. Eligible items are ingredient-category
// templates tagged herb or fungus, inside their spawn window at the dungeon level, and legal for
// the dungeon's `environment` trait (item trait `environments`; an ingredient with none grows
// everywhere). The roll picks a TIER first — level 1 and each distinct spawn_min among the foragable
// items open one; the dungeon level's own tier weighs 100% and every tier below it keeps
// gather_lower_tier_weight % per step down — then a uniform item of that tier. A resolved spot is locked into the
// gather_spots state, so dungeon rebuilds (re-entry, save load) keep the same item.

// { "<dungeonId>.<encounterId>": itemId }
game.registerState('gather_spots', {});

/** Which item categories a gather spot may yield. Configurable because a game's foraging category
 *  is its own choice — this game forages alchemy `reagents`, while another might forage food. */
function gatherCategories() {
    const raw = getConfig()?.gather_categories;
    return (Array.isArray(raw) && raw.length) ? raw : ['reagents', 'ingredient'];
}

function getConfig() {
    return game.getData('plugins_data/experience/config_experience');
}

/** Level 1 plus every distinct spawn_min among the foragable items, ascending. Read from ALL of them,
 *  not the spot's candidates: an environment missing a tier must not renumber the tiers above it. */
function tierFloors(/** @type {any[]} */ foragable) {
    const floors = new Set([1]);
    for (const t of foragable) if (t.traits?.spawn_min) floors.add(t.traits.spawn_min);
    return [...floors].sort((a, b) => a - b);
}

function tierOfLevel(/** @type {number[]} */ floors, /** @type {number} */ level) {
    let tier = 1;
    for (let i = 0; i < floors.length; i++) {
        if (level >= floors[i]) tier = i + 1;
    }
    return tier;
}

// The level snapshot only exists after the first dungeon_enter_after, but collectable_resolve fires
// during creation — before it. Fall back to the MC's live level, the exact value the snapshot
// is about to record.
function levelForDungeon(/** @type {string} */ dungeonId) {
    const group = game.getDungeonConfig(dungeonId)?.traits?.level_group || dungeonId;
    const snapshot = (game.getState('dungeon_levels') || {})[group];
    return snapshot || Math.max(1, getMc()?.getTrait('level') || 1);
}

function growsHere(/** @type {any} */ template, /** @type {string} */ environment) {
    const environments = template.traits?.environments;
    if (!environments || !environments.length) return true;
    return !!environment && environments.includes(environment);
}

game.on('collectable_resolve', (/** @type {{dungeonId: string, encounterId: string, pool: string, itemId: string | null}} */ request) => {
    if (request.itemId || request.pool !== 'gather') return;

    const spots = game.getState('gather_spots');
    const key = `${request.dungeonId}.${request.encounterId}`;
    if (spots[key]) {
        request.itemId = spots[key];
        return;
    }

    const level = levelForDungeon(request.dungeonId);
    const environment = game.getDungeonConfig(request.dungeonId)?.traits?.environment || '';
    const foragable = [...game.getData('item_templates', true).values()].filter(t =>
        gatherCategories().includes(t.category) &&
        !t.traits?.no_drop &&
        (t.tags?.includes('herb') || t.tags?.includes('fungus')));
    const candidates = foragable.filter(t => inSpawnWindow(t, level) && growsHere(t, environment));
    if (!candidates.length) return;

    const floors = tierFloors(foragable);
    const byTier = new Map();
    for (const t of candidates) {
        const tier = tierOfLevel(floors, t.traits?.spawn_min || 1);
        if (!byTier.has(tier)) byTier.set(tier, []);
        byTier.get(tier).push(t);
    }
    const decay = (getConfig()?.gather_lower_tier_weight ?? 40) / 100;
    const topTier = tierOfLevel(floors, level);
    const tiers = [...byTier.entries()].map(([tier, items]) => ({ items, weight: Math.pow(decay, topTier - tier) }));

    let roll = Math.random() * tiers.reduce((sum, t) => sum + t.weight, 0);
    let picked = tiers[tiers.length - 1].items;
    for (const t of tiers) {
        roll -= t.weight;
        if (roll <= 0) {
            picked = t.items;
            break;
        }
    }
    const item = picked[Math.floor(Math.random() * picked.length)];

    spots[key] = item.id;
    game.setState('gather_spots', spots);
    request.itemId = item.id;
});
