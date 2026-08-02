/// <reference path="./dtypes.d.ts" />

const { game, vue } = window.engine;
const { ref } = vue;

// ═══════════════════════ Reward core ═══════════════════════
// Module-internal home of the reward system: the plugin's own scripts/components import from here
// directly; the `reward` SERVICE registered in main.mjs is only the public facade for games.
//
// Design:
// - The plugin knows ONLY generic progression kinds: loot items, xp, level-ups, and a generic
//   resources list ({ stat id, amount }) rendered off the game's own character_stats definitions.
//   Game-specific economics hook in via the `reward_assemble`
//   emitter and record through the service.
// - Loot is granted exactly once per battle, from rpg_battler's `battle_defeated` emitter — the
//   moment a battle is first marked defeated (fight victory OR scripted defeat). No extra
//   bookkeeping: rpg_defeated_battles is the only tracking state.
// - `pendingReward` only accumulates what to DISPLAY; the battle victory panel and the reward
//   popup are pure views over it.

function getConfig() {
    return game.getData('plugins_data/experience/config_experience');
}

export function getMc() {
    const mcId = getConfig()?.mc_id;
    return (mcId && game.getCharacter(mcId)) || game.getParty()[0] || null;
}

// ── Dungeon level ──
// Snapshot of the MC's level, taken on FIRST entry of any dungeon in a level group and shared by
// the whole group (dungeon trait `level_group`; a dungeon without one is its own group). Order-
// independent: whichever grouped dungeon is entered first writes the snapshot.
//
// The whole scaling layer (snapshots, dungeon-bound inventories, equipment instance scaling,
// level-scaled threat) is opt-in via the `auto_scaling` config flag — games that want only XP
// and leveling (plain experience bar) keep exactly the pre-scaling behavior with it off.

game.registerState('dungeon_levels', {});

function autoScalingOn() {
    return !!getConfig()?.auto_scaling;
}

function dungeonGroup() {
    const dungeon = game.getCurrentDungeon();
    return dungeon?.traits?.level_group || dungeon?.id || '';
}

game.on('dungeon_enter', (/** @type {string} */ dungeonId) => {
    if (!autoScalingOn()) return;
    const dungeon = game.getCurrentDungeon();
    const group = dungeon?.traits?.level_group || dungeonId;

    // 1) Level snapshot first, so inventories instantiated below scale to the fresh level.
    const levels = { ...(game.getState('dungeon_levels') || {}) };
    if (!levels[group]) {
        levels[group] = Math.max(1, getMc()?.getTrait('level') || 1);
        game.setState('dungeon_levels', levels);
    }

    // 2) Instantiate this dungeon's inventories (trait `dungeon` matches the entered dungeon id
    // OR its level group; convention: group names are the main dungeon's id, so entry order
    // within a group is irrelevant). Contents are created and locked HERE, not at boot and not
    // on first open, which keeps chest contents save-scum-proof.
    for (const [id, template] of game.getData('item_inventories', true) || []) {
        const bound = template?.traits?.dungeon;
        if (!bound || (bound !== dungeonId && bound !== group)) continue;
        if (template?.traits?.pool) continue; // pooled templates are built by pools.mjs
        if (game.getInventory(id)) continue;
        game.createInventory(id, id);
    }
});

export function getDungeonLevel() {
    const levels = game.getState('dungeon_levels') || {};
    return levels[dungeonGroup()] || 1;
}

export function dungeonScale(/** @type {number} */ level) {
    if (!autoScalingOn()) return 1;
    const per = getConfig()?.scale_per_level ?? 0.25;
    return 1 + per * (Math.max(1, level) - 1);
}

/** Price growth per level for scaled equipment, independent of the power (stat) curve. Defaults to
 *  TWICE `scale_per_level` when unset, so gear value climbs faster than its power (old gear sells
 *  for less relative to its replacements). Set the config field to weld it back to power (=power
 *  rate) or anything else. */
export function priceScale(/** @type {number} */ level) {
    if (!autoScalingOn()) return 1;
    const config = getConfig();
    const per = config?.price_scale_per_level ?? 2 * (config?.scale_per_level ?? 0.25);
    return 1 + per * (Math.max(1, level) - 1);
}

// ── Pending reward (display accumulator) ──

const emptyReward = () => ({ items: [], resources: [], characters: [], debug: null });
export const pendingReward = ref(emptyReward());

function rpgBattle() {
    try { return game.getService('rpg_battle'); } catch { return null; }
}

export function inBattle() {
    return !!rpgBattle()?.isActive?.();
}

export function effectiveThreat(/** @type {string} */ battleId) {
    const base = rpgBattle()?.getThreat?.(battleId) || 0;
    return base * dungeonScale(getDungeonLevel());
}

/** Record one character's XP progress for the reward display. Merged per character: repeated
 *  grants before the panel shows extend the same row (sum gained, keep the earliest from-state,
 *  advance the to-state, merge stat diffs keeping the original before values). */
export function recordCharacterXp(/** @type {RewardCharacterEntry} */ entry) {
    const existing = pendingReward.value.characters.find(c => c.id === entry.id);
    if (!existing) {
        pendingReward.value.characters.push(entry);
        return;
    }
    existing.gained += entry.gained;
    existing.levelTo = entry.levelTo;
    existing.xpTo = entry.xpTo;
    for (const stat of entry.stats) {
        const merged = existing.stats.find(s => s.id === stat.id);
        if (merged) merged.after = stat.after;
        else existing.stats.push(stat);
    }
}

/** Record a resource gain for display (merged per stat id). The GAME decides which of its own
 *  resources a reward touches — the plugin only renders them off character_stats (name/color). */
export function recordResource(/** @type {string} */ statId, /** @type {number} */ amount) {
    if (!statId || !amount) return;
    const existing = pendingReward.value.resources.find(r => r.id === statId);
    if (existing) existing.amount += amount;
    else pendingReward.value.resources.push({ id: statId, amount });
}

function recordItem(/** @type {{id: string, name: string, image: string}} */ entry, /** @type {number} */ quantity) {
    // Stackable items (max_stack > 1 or unlimited) merge into one display line; unstackables
    // (equipment) keep a line per drop.
    const maxStack = game.getData('item_templates', true)?.get(entry.id)?.traits?.max_stack || 0;
    if (maxStack > 1 || maxStack === -1) {
        const existing = pendingReward.value.items.find(i => i.id === entry.id);
        if (existing) {
            existing.quantity += quantity;
            return;
        }
    }
    pendingReward.value.items.push({ ...entry, quantity });
}

// ── Equipment instance scaling ──
// Universal: fires for EVERY created item (drops, chest instantiation, add_item, shops). An
// equipment-category item is authored at its level-1 baseline; the created instance scales its
// equip-status stats and price to the current dungeon level and is stamped with the item_level
// trait (the no-rescale guard and the item card's level badge).

function equipmentCategories() {
    return getConfig()?.loot_equipment_categories || [];
}

// While set, item scaling uses this level instead of the dungeon snapshot — pooled TRADE stock
// rolls at the MC's live level (pools.mjs sets it around its draws).
let generationLevel = /** @type {number | null} */ (null);
export function setGenerationLevel(/** @type {number | null} */ level) {
    generationLevel = level;
}

/** Scale an equip status's ability enhancements: each ability_modifiers id resolves to a cloned
 *  template with its OPT-IN number aspects (`scales: true` on the ability definition) multiplied.
 *  The clone replaces the id on the instance — the status pipeline accepts inline modifier
 *  objects as-is, so downstream merge/battle/tooltips need no changes. */
function scaleAbilityModifiers(/** @type {any[]} */ modifierIds, /** @type {number} */ scale) {
    const templates = game.getData('ability_templates', true);
    const definitions = game.getData('ability_definitions', true);
    return modifierIds.map(mod => {
        if (typeof mod !== 'string') return mod;
        const template = templates?.get(mod);
        if (!template?.modifies) return mod;
        const clone = JSON.parse(JSON.stringify(template));
        clone.ability_id = clone.modifies;
        for (const effect of clone.effects || []) {
            const aspects = effect?.aspects || {};
            for (const aspectId in aspects) {
                if (typeof aspects[aspectId] === 'number' && definitions?.get(aspectId)?.scales) {
                    aspects[aspectId] = Math.round(aspects[aspectId] * scale);
                }
            }
        }
        return clone;
    });
}

game.on('item_create', (/** @type {Item} */ item) => {
    if (!autoScalingOn()) return;
    if (!item || !equipmentCategories().includes(item.category)) return;
    if (item.traits?.item_level) return; // already scaled (or hand-stamped)
    const stats = item.statusObject?.stats;
    const modifiers = item.statusObject?.ability_modifiers;
    if (!(stats && Object.keys(stats).length) && !modifiers?.length) return;

    const level = generationLevel ?? getDungeonLevel();
    const scale = dungeonScale(level);       // power: stats + ability aspects
    const pScale = priceScale(level);        // value: price, own curve (2× power by default)
    // createItem assigns traits/status/price by REFERENCE to the template object — replace with
    // scaled copies instead of mutating, or every future instance inherits the scaling.
    if (scale !== 1 || pScale !== 1) {
        const scaledStats = /** @type {Record<string, number>} */ ({});
        for (const statId in stats || {}) {
            scaledStats[statId] = Math.round(stats[statId] * scale);
        }
        item.statusObject = {
            ...item.statusObject,
            stats: scaledStats,
            ...(modifiers?.length ? { ability_modifiers: scaleAbilityModifiers(modifiers, scale) } : {}),
        };
        const scaledPrice = /** @type {Record<string, number>} */ ({});
        for (const currency in item.price || {}) {
            scaledPrice[currency] = Math.round(item.price[currency] * pScale);
        }
        item.price = scaledPrice;
    }
    item.traits = { ...item.traits, item_level: level };
});

export function clearPending() {
    pendingReward.value = emptyReward();
}

export function openRewardPopup() {
    if (!game.isPopupOpen('reward_popup')) game.openPopup('reward_popup');
}

// ── Loot grant — single point, on first-time defeat ──

function priceOf(/** @type {any} */ template) {
    return Object.values(template?.price || {})[0] || 0;
}

/** Whether a template may be GENERATED at `level` (spawn_min/spawn_max item traits; missing
 *  bounds are open-ended). Tiered-by-id items (small/medium/big potions) use this to gate where
 *  they appear; authored drop tables and inventories are never window-checked. */
export function inSpawnWindow(/** @type {any} */ template, /** @type {number} */ level) {
    const min = template?.traits?.spawn_min;
    const max = template?.traits?.spawn_max;
    return (!min || level >= min) && (!max || level <= max);
}

/** Spend a budget on items from `candidates` (mutates nothing; calls `grant` per pick).
 *  First pick is biased to the most expensive affordable item, then a floor-price fill keeps the
 *  remaining slots from draining the budget on trash (minPrice = remaining / slotsLeft, relaxed
 *  when nothing clears the floor). Returns the unspent budget. */
function rollLootBudget(/** @type {number} */ budget, /** @type {any[]} */ candidates, /** @type {number} */ maxItems, /** @type {(template: any) => void} */ grant) {
    let remaining = budget;
    for (let slot = 0; slot < maxItems; slot++) {
        const affordable = candidates.filter(t => priceOf(t) <= remaining);
        if (!affordable.length) break;
        let pool;
        if (slot === 0) {
            const top = Math.max(...affordable.map(priceOf));
            pool = affordable.filter(t => priceOf(t) === top);
        } else {
            const floor = remaining / (maxItems - slot);
            const preferred = affordable.filter(t => priceOf(t) >= floor);
            pool = preferred.length ? preferred : affordable;
        }
        const pick = pool[Math.floor(Math.random() * pool.length)];
        remaining -= priceOf(pick);
        grant(pick);
    }
    return remaining;
}

/** Grant a battle's defeat loot into the party inventory:
 *  1. The hand-authored drop table — the battle's loot inventory read as pure TEMPLATE data
 *     (never instantiated, so battle-loot inventories need no auto_create). Ignores threat.
 *  2. Equipment group — budget = BASE threat × loot_equipment_coef. Deliberately NOT level-scaled:
 *     candidates are priced at their level-1 baseline and the created instances scale their own
 *     stats/price to the dungeon level (item_create listener above) — a scaled budget would
 *     double-dip.
 *  3. Income group — budget = EFFECTIVE threat × loot_income_coef, the only level-scaled budget
 *     (junk/currency values are static). Unspent remainder pays out 1:1 as the currency item.
 *  Both groups roll only whitelisted categories; currency, no_drop, test-tagged, and unpriced
 *  templates never drop. */
function grantLoot(/** @type {string} */ battleId, /** @type {number} */ baseThreat, /** @type {number} */ scaledThreat) {
    const debug = { equipBudget: 0, incomeBudget: 0, currencyPayout: 0 };
    const partyInventory = game.getInventory('_party_inventory');
    if (!partyInventory) return debug;
    const itemTemplates = game.getData('item_templates', true);

    const grant = (/** @type {any} */ template, /** @type {number} */ quantity = 1) => {
        const item = game.createItem(template.id);
        if (!item) return;
        partyInventory.addItem(item, quantity);
        recordItem({ id: template.id, name: template.traits?.name || template.id, image: template.traits?.image || '' }, quantity);
    };

    const lootId = rpgBattle()?.getBattleLoot?.(battleId);
    const dropTable = lootId ? game.getData('item_inventories', true)?.get(lootId) : null;
    for (const entry of dropTable?.items || []) {
        if (!entry?.item_id) continue;
        const template = itemTemplates?.get(entry.item_id);
        if (!template) continue;
        grant(template, entry.quantity || 1);
    }

    const config = getConfig();
    const maxItems = config?.loot_max_items || 3;
    const level = getDungeonLevel();
    const eligible = [...(itemTemplates?.values() || [])].filter(t =>
        priceOf(t) > 0 && !t.is_currency && !t.traits?.no_drop && !t.tags?.includes('test')
        && inSpawnWindow(t, level));

    const equipBudget = Math.round(baseThreat * (config?.loot_equipment_coef || 0));
    debug.equipBudget = equipBudget;
    if (equipBudget > 0) {
        const categories = equipmentCategories();
        rollLootBudget(equipBudget, eligible.filter(t => categories.includes(t.category)), maxItems, grant);
    }

    const incomeBudget = Math.round(scaledThreat * (config?.loot_income_coef || 0));
    debug.incomeBudget = incomeBudget;
    if (incomeBudget > 0) {
        const categories = config?.loot_income_categories || [];
        const remaining = rollLootBudget(incomeBudget, eligible.filter(t => categories.includes(t.category)), maxItems, grant);
        const currencyTemplate = config?.loot_currency_item ? itemTemplates?.get(config.loot_currency_item) : null;
        const payout = Math.round(remaining);
        if (currencyTemplate && payout > 0) {
            grant(currencyTemplate, payout);
            debug.currencyPayout = payout;
        }
    }
    return debug;
}

// Games hook their own economics in here (e.g. refunding a resource on fight victories):
// Emitter: reward_assemble
// Fired once per battle when its defeat reward is granted. Args:
//   ({ source: 'battle'|'scene', battleId: string, threat: number })
// source is 'battle' for a fight victory, 'scene' for a scripted defeat.
// Listeners grant game-specific rewards and record them via the reward service.
game.registerEmitter('reward_assemble');

/** XP for defeating a battle: effective threat × threat_xp_coef, granted to every levelled party
 *  member (xp_modifier-aware). Recorded into the pending reward by the resource-change listener. */
function grantThreatXp(/** @type {number} */ threat) {
    const coef = getConfig()?.threat_xp_coef ?? 5;
    const amount = Math.round(threat * coef);
    if (amount <= 0) return 0;
    for (const char of game.getParty()) {
        if ((char?.getTrait('level') || 0) > 0) {
            char.addResource('xp', Math.round(amount * (1 + char.getStat('xp_modifier') / 100)));
        }
    }
    return amount;
}

// Battle wiring — only when the battle plugin is installed (game.on THROWS for unregistered
// emitters; these are rpg_battler's, which loads before this plugin — see plugin.json order).
if (game.hasPlugin('rpg_battler')) {
    // The single reward point: first-time defeat, from a fight victory (fires at the moment
    // victory is detected, before the result overlay renders — the overlay displays the pending
    // reward) or from the delayed `win` scene action (then the reward popup presents it and
    // gates the scene until closed).
    game.on('battle_defeated', (/** @type {string} */ battleId) => {
        const base = rpgBattle()?.getThreat?.(battleId) || 0;
        const level = getDungeonLevel();
        const threat = base * dungeonScale(level);
        const lootDebug = grantLoot(battleId, base, threat);
        const threatXp = grantThreatXp(threat);
        if (game.isDevMode()) {
            pendingReward.value.debug = {
                battleId, level,
                scale: Math.round(dungeonScale(level) * 100) / 100,
                base, threat: Math.round(threat * 100) / 100,
                threatXp, ...lootDebug,
            };
        }
        game.trigger('reward_assemble', { source: inBattle() ? 'battle' : 'scene', battleId, threat });
        if (!inBattle()) openRewardPopup();
    });
    game.on('battle_start', () => clearPending());
    game.on('battle_closed', () => clearPending());
}
