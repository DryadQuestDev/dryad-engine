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
// - Loot and xp are granted on EVERY win, from rpg_battler's `battle_finished` emitter — the
//   moment victory is decided (a fought battle OR a scripted `{win:}`). A re-fought battle pays
//   again on purpose. `battle_defeated` / rpg_defeated_battles remain the once-per-battle CLEAR
//   TRACKER behind `_defeated` content gates; they no longer gate rewards.
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

// Resolve a dungeon id to its level group (the `level_group` trait, else the id itself). Uses the
// engine's by-id config lookup so it works for ANY dungeon, not just the current one. A key that
// isn't a known dungeon id (e.g. a group name passed directly) falls through unchanged.
function groupOfDungeon(/** @type {string} */ dungeonId) {
    return game.getDungeonConfig(dungeonId)?.traits?.level_group || dungeonId;
}

game.on('dungeon_enter_after', (/** @type {string} */ dungeonId) => {
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

// While set, every level read (spawn windows, scaling) answers this instead of the dungeon
// snapshot. Only the drop simulator sets it, and always inside a try/finally.
let simulatedLevel = /** @type {number | null} */ (null);
export function setSimulatedLevel(/** @type {number | null} */ level) { simulatedLevel = level; }

export function getDungeonLevel() {
    if (simulatedLevel != null) return simulatedLevel;
    const levels = game.getState('dungeon_levels') || {};
    return levels[dungeonGroup()] || 1;
}

/**
 * Enemy multiplier for a dungeon level, from the authored `enemy_scaling` pins.
 * Picks the CLOSEST PIN AT OR BELOW the level, so pins are sparse steps rather than a per-level
 * table: [{1,1},{3,2}] leaves levels 1-2 at 1 and returns 2 from level 3 upward. Returns 1 when no
 * pins are authored or none sit at or below the level, so an unconfigured game is unscaled.
 *
 * Deliberately independent of `dungeonScale` (which is a linear per-level rate driving gear and
 * rewards) — the two curves are tuned against each other, so they must be authored separately.
 * @param {number} level
 * @returns {number}
 */
export function enemyScale(level) {
    const pins = getConfig()?.enemy_scaling;
    if (!Array.isArray(pins) || !pins.length) return 1;
    const lvl = Math.max(1, level || 1);
    let best = null;
    for (const pin of pins) {
        if (typeof pin?.level !== 'number' || pin.level > lvl) continue;
        if (!best || pin.level > best.level) best = pin;
    }
    return best?.coef ?? 1;
}

export function dungeonScale(/** @type {number} */ level) {
    if (!autoScalingOn()) return 1;
    const per = getConfig()?.power_scale_per_level ?? 0.25;
    return 1 + per * (Math.max(1, level) - 1);
}

/** Price growth per level for scaled equipment, independent of the power (stat) curve. Defaults to
 *  TWICE `power_scale_per_level` when unset, so gear value climbs faster than its power (old gear sells
 *  for less relative to its replacements). Set the config field to weld it back to power (=power
 *  rate) or anything else. */
export function priceScale(/** @type {number} */ level) {
    if (!autoScalingOn()) return 1;
    const config = getConfig();
    const per = config?.price_scale_per_level ?? 2 * (config?.power_scale_per_level ?? 0.25);
    return 1 + per * (Math.max(1, level) - 1);
}

// ── Dungeon level authoring + over-leveled equip gate ──

// Action: set (or overwrite) a dungeon/dungeon-group level. Accepts:
//   number   → set the CURRENT dungeon's group to that level
//   true     → set the current group to the MC's live level
//   "key = 7"→ set an explicit key (the dungeon's level GROUP — which equals the dungeon id when it
//              has no `level_group` trait)
// Writes the level state ONLY: future battles rescale live (the win handler reads getDungeonLevel),
// and already-generated inventories are left as-is. No-op while auto_scaling is off.
game.registerAction('dungeon_level', {
    action: (/** @type {number|boolean|string} */ value) => {
        if (!autoScalingOn()) return;
        const clamp = (/** @type {number} */ n) => Math.max(1, Math.round(n));
        const levels = { ...(game.getState('dungeon_levels') || {}) };

        if (value === true) {
            const group = dungeonGroup();
            if (!group) { console.error('[dungeon_level] true: not in a dungeon'); return; }
            levels[group] = Math.max(1, getMc()?.getTrait('level') || 1);
        } else if (typeof value === 'number') {
            const group = dungeonGroup();
            if (!group) { console.error('[dungeon_level] number: not in a dungeon'); return; }
            levels[group] = clamp(value);
        } else if (typeof value === 'string') {
            const [dungeonId, rhs] = value.split('=').map(s => s.trim());
            const level = Number(rhs);
            if (!dungeonId || !Number.isFinite(level)) { console.error('[dungeon_level] expected "dungeon_id = level", got', value); return; }
            levels[groupOfDungeon(dungeonId)] = clamp(level);  // id → its level group (state is keyed by group)
        } else {
            console.error('[dungeon_level] expects a number, true, or "key = level" string; got', value);
            return;
        }

        game.setState('dungeon_levels', levels);
    },
});

// Block equipping gear stamped above the equipping character's own level — loot locks at the dungeon
// level, which the action above can push past the MC. -999 so the veto lands before any other
// item_equip_before listener. Unstamped items (item_level 0) never block; unequip is untouched.
game.on('item_equip_before', (/** @type {Item} */ item, /** @type {Character} */ character) => {
    if (!autoScalingOn()) return;
    const need = item?.getTrait?.('item_level') || 0;
    const have = character?.getTrait?.('level') || 0;
    if (need > have) {
        game.showNotification(game.getLine('equip_over_level', { level: need, item: item.getName?.() ?? item.name }));
        return false;
    }
}, -999);

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
    for (const it of entry.items || []) {
        const merged = existing.items?.find(i => i.id === it.id);
        if (merged) merged.quantity += it.quantity;
        else (existing.items ||= []).push(it);
    }
}

/** Record a resource gain for display (merged per stat id). The GAME decides which of its own
 *  resources a reward touches — the plugin only renders them off character_stats (name/color). */
export function recordResource(/** @type {string} */ statId, /** @type {number} */ amount,
                               /** @type {string} */ characterId) {
    if (!statId || !amount) return;
    // The recipient is required: a resource is always gained BY someone, and the panel draws the
    // bar against that character's own cap. Guessing an owner would silently draw the wrong bar,
    // so an omission is reported and the line degrades to plain text instead.
    if (!characterId) {
        console.error('[reward] recordResource requires a characterId:', statId, amount);
    }
    const owner = characterId || '';
    const existing = pendingReward.value.resources.find(r => r.id === statId && r.characterId === owner);
    if (existing) existing.amount += amount;
    else pendingReward.value.resources.push({ id: statId, amount, characterId: owner });
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
    pendingReward.value.items.push({ ...entry, quantity, trashed: false });
}

// ── Trash marks ──
// Loot lands in the party bag before the panel is ever built, so the panel's trash button cannot
// refuse a pickup — it marks the line and the removal happens on continue. Both continue paths end
// in clearPending (the battle overlay's Continue fires battle_closed_before; the popup's button calls it
// directly), so that is where the marks are cashed in.

/** Remove every trash-marked reward line from the party bag. Only the GRANTED quantity goes — a
 *  stack the player was already carrying keeps the rest. */
export function commitTrashedItems() {
    const marked = pendingReward.value.items.filter(entry => entry.trashed);
    if (!marked.length) return;
    const partyInventory = game.getInventory('_party_inventory');
    if (!partyInventory) return;
    for (const entry of marked) {
        let remaining = entry.quantity;
        // Newest first: addItem appends, so the tail of the array is THIS battle's drop. Matters for
        // equipment — an identical sword picked up at a lower dungeon level is a different instance
        // with different scaled stats, and the one being left behind is the one just found.
        // reduceItemQuantity drops emptied stacks out of the array, so iterate a copy of it.
        for (const item of [...partyInventory.items].reverse()) {
            if (remaining <= 0) break;
            if (item.id !== entry.id || item.isEquipped) continue;
            remaining -= partyInventory.reduceItemQuantity(item, remaining);
        }
    }
}

// ── Equipment instance scaling ──
// Universal: fires for EVERY created item (drops, chest instantiation, add_item, shops). An
// equipment-category item is authored at its level-1 baseline; the created instance scales its
// equip-status stats and price to the current dungeon level and is stamped with the item_level
// trait (the no-rescale guard and the item card's level badge).

export function equipmentCategories() {
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

/** Whether the level curve applies to an item: scaling on, an equipment category, and a status
 *  block with something to scale. `statusObject` is passed separately so a saved item can be judged
 *  by its template's baseline rather than by whatever it currently carries. */
function isScalableEquipment(/** @type {Item} */ item, /** @type {any} */ statusObject) {
    if (!autoScalingOn() || !item || !equipmentCategories().includes(item.category)) return false;
    const stats = statusObject?.stats;
    return !!((stats && Object.keys(stats).length) || statusObject?.ability_modifiers?.length);
}

/** Scaled copies of a baseline status object and price at `level`. Pure — same baseline, config and
 *  level always give the same result — which is what lets a saved item be rebuilt at its stamped
 *  level and come out identical to a fresh drop. Returns new objects, never mutates the inputs. */
function scaleBaseline(/** @type {any} */ statusObject, /** @type {Record<string, number>} */ price, /** @type {number} */ level) {
    const scale = dungeonScale(level);       // power: stats + ability aspects
    const pScale = priceScale(level);        // value: price, own curve (2× power by default)
    if (scale === 1 && pScale === 1) return { statusObject, price };
    const stats = statusObject?.stats || {};
    const modifiers = statusObject?.ability_modifiers;
    // Percentage-natured stats (reflect, dodge, crit) are already proportional — the authored
    // no_scale_stats list keeps them fixed while flat stats (power, thorns, armor) ride the curve.
    const noScale = getConfig()?.no_scale_stats || [];
    const scaledStats = /** @type {Record<string, number>} */ ({});
    for (const statId in stats) {
        scaledStats[statId] = noScale.includes(statId) ? stats[statId] : Math.round(stats[statId] * scale);
    }
    const scaledPrice = /** @type {Record<string, number>} */ ({});
    for (const currency in price || {}) {
        scaledPrice[currency] = Math.round(price[currency] * pScale);
    }
    return {
        statusObject: {
            ...statusObject,
            stats: scaledStats,
            ...(modifiers?.length ? { ability_modifiers: scaleAbilityModifiers(modifiers, scale) } : {}),
        },
        price: scaledPrice,
    };
}

game.on('item_create', (/** @type {Item} */ item) => {
    if (item?.traits?.item_level) return; // already scaled (or hand-stamped on the template)
    if (!isScalableEquipment(item, item.statusObject)) return;

    const level = generationLevel ?? getDungeonLevel();
    // createItem assigns traits/status/price by REFERENCE to the template object — replace with
    // scaled copies instead of mutating, or every future instance inherits the scaling.
    const scaled = scaleBaseline(item.statusObject, item.price, level);
    item.statusObject = scaled.statusObject;
    item.price = scaled.price;
    item.traits = { ...item.traits, item_level: level };
});

// Saved items are deserialized, so the listener above never runs for them, and the engine's save
// migration hands their status object and price back at the template's level-1 baseline. Rebuild
// from the TEMPLATE at the stamped level — never from the live item, which is already scaled when
// a game keeps the migration's `items` section off. A template that hand-stamps item_level was
// authored as-is and stays that way, exactly as item_create leaves it.
game.on('item_migrate', (/** @type {Item} */ item, /** @type {any} */ template) => {
    const level = item?.traits?.item_level;
    if (!level || template?.traits?.item_level) return;
    if (!isScalableEquipment(item, template?.status)) return;

    const scaled = scaleBaseline(template.status || {}, template.price || {}, level);
    item.statusObject = scaled.statusObject;
    item.price = scaled.price;
});

export function clearPending() {
    commitTrashedItems();
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

/** A recipe scroll for something already learned is dead weight: its Learn choice is greyed out and
 *  it only sells for scrap. Excluded from every generated loot source (battle rewards, chests, shop
 *  stock) so recipes can sit in the general loot tables without the tail of a long game filling up
 *  with duplicates. Hand-authored placements are untouched — this only filters generation. */
export function isKnownRecipe(/** @type {any} */ template) {
    const recipeId = template?.learn_recipe;
    return !!recipeId && game.getLearnedRecipes().has(recipeId);
}

/** Spend a budget on items from `candidates` (mutates nothing; calls `grant` per pick).
 *  Each roll only shops with a random 40-100% of the budget; the reserve is returned unspent, so
 *  the caller's gold payout absorbs it — the same battle sometimes drops one big item, sometimes
 *  two mid ones, sometimes mostly gold. Slot 0 picks within the top price band (>= 75% of the
 *  best affordable price) instead of pinning the exact maximum; later slots floor-fill
 *  (minPrice = remaining / slotsLeft, relaxed when nothing clears the floor). Returns the
 *  unspent budget, reserve included. */
function rollLootBudget(/** @type {number} */ budget, /** @type {any[]} */ candidates, /** @type {number} */ maxItems, /** @type {(template: any) => void} */ grant) {
    let remaining = budget * (0.4 + 0.6 * Math.random());
    let spent = 0;
    for (let slot = 0; slot < maxItems; slot++) {
        const affordable = candidates.filter(t => priceOf(t) <= remaining);
        if (!affordable.length) break;
        let pool;
        if (slot === 0) {
            const top = Math.max(...affordable.map(priceOf));
            pool = affordable.filter(t => priceOf(t) >= top * 0.75);
        } else {
            const floor = remaining / (maxItems - slot);
            const preferred = affordable.filter(t => priceOf(t) >= floor);
            pool = preferred.length ? preferred : affordable;
        }
        const pick = pool[Math.floor(Math.random() * pool.length)];
        remaining -= priceOf(pick);
        spent += priceOf(pick);
        grant(pick);
    }
    return budget - spent;
}

/** Grant a battle's defeat loot into the party inventory:
 *  1. The hand-authored drop table — the battle's loot inventory read as pure TEMPLATE data
 *     (never instantiated, so battle-loot inventories need no auto_create). Ignores threat.
 *  2. Equipment group — budget = BASE threat × loot_equipment_coef. Deliberately NOT level-scaled:
 *     candidates are priced at their level-1 baseline and the created instances scale their own
 *     stats/price to the dungeon level (item_create listener above) — a scaled budget would
 *     double-dip. The unspent remainder (price-point quantization, low spend-target rolls) flows
 *     into the income pot instead of evaporating — no battle pays less than its full budget.
 *  3. Income group — budget = EFFECTIVE threat × loot_income_coef (the only level-scaled budget;
 *     junk/currency values are static) + the equipment remainder. loot_gold_share of the pot is
 *     paid straight out as the currency item; the rest rolls items, and THAT remainder pays out
 *     1:1 as currency too.
 *  Both groups roll only whitelisted categories; currency, no_drop, test-tagged, and unpriced
 *  templates never drop. */
/** @param {{inventory?: any, record?: boolean}} [opts] target override for the drop simulator */
function grantLoot(/** @type {string} */ battleId, /** @type {number} */ baseThreat, /** @type {number} */ scaledThreat, opts = {}) {
    const debug = { equipBudget: 0, incomeBudget: 0, currencyPayout: 0 };
    const partyInventory = opts.inventory || game.getInventory('_party_inventory');
    if (!partyInventory) return debug;
    const itemTemplates = game.getData('item_templates', true);

    let phase = 'authored';   // set per section below; reported to opts.onGrant for the simulator
    const grant = (/** @type {any} */ template, /** @type {number} */ quantity = 1) => {
        const item = game.createItem(template.id);
        if (!item) return;
        partyInventory.addItem(item, quantity);
        opts.onGrant?.(template, quantity, phase);
        if (opts.record === false) return;   // dry run: no reward panel entry
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
    // `quest` rarity means never-generated, matching what pool entries already exclude — otherwise a
    // quest consumable in a whitelisted category (they usually are) becomes an ordinary enemy drop,
    // and every game has to remember to pair the rarity with no_drop by hand on every such item.
    const eligible = [...(itemTemplates?.values() || [])].filter(t =>
        priceOf(t) > 0 && !t.is_currency && !t.traits?.no_drop && !t.tags?.includes('test')
        && t.traits?.rarity !== 'quest'
        && inSpawnWindow(t, level) && !isKnownRecipe(t));

    phase = 'equipment';
    const equipBudget = Math.round(baseThreat * (config?.loot_equipment_coef || 0));
    debug.equipBudget = equipBudget;
    let equipRemainder = 0;
    if (equipBudget > 0) {
        const categories = equipmentCategories();
        equipRemainder = rollLootBudget(equipBudget, eligible.filter(t => categories.includes(t.category)), maxItems, grant);
    }

    phase = 'income';
    const incomeBudget = Math.round(scaledThreat * (config?.loot_income_coef || 0)) + equipRemainder;
    debug.incomeBudget = incomeBudget;
    if (incomeBudget > 0) {
        const goldShare = Math.min(1, Math.max(0, config?.loot_gold_share || 0));
        const goldReserve = incomeBudget * goldShare;
        const categories = config?.loot_income_categories || [];
        const remaining = rollLootBudget(incomeBudget - goldReserve, eligible.filter(t => categories.includes(t.category)), maxItems, grant);
        const currencyTemplate = config?.loot_currency_item ? itemTemplates?.get(config.loot_currency_item) : null;
        const payout = Math.round(goldReserve + remaining);
        phase = 'currency';
        if (currencyTemplate && payout > 0) {
            grant(currencyTemplate, payout);
            debug.currencyPayout = payout;
        }
    }
    return debug;
}

/**
 * Roll battle loot exactly as a victory would, into a throwaway inventory.
 * Reuses grantLoot itself, so the simulator can never drift from what the game actually grants.
 * @param {{level: number, threat: number, rolls?: number, battleId?: string}} opts
 * @returns {{level: number, threat: number, rolls: string[][], budgets: any}}
 */
export function simulateBattleLoot({ level, threat, rolls = 20, battleId = '__sim' }) {
    const out = [];
    let budgets = null;
    setSimulatedLevel(level);
    try {
        for (let n = 0; n < rolls; n++) {
            const invId = `__sim_loot_${n}`;
            if (game.getInventory(invId)) game.itemSystem.removeInventory(invId);
            const inv = game.createInventory(invId);
            const source = {};
            budgets = grantLoot(battleId, threat, threat * dungeonScale(level),
                { inventory: inv, record: false, onGrant: (t, _q, phase) => { source[t.id] ??= phase; } });
            out.push(inv.items.map(i => ({ id: i.id, quantity: i.quantity || 1,
                                           price: Object.values(i.price || {})[0] || 0,
                                           itemLevel: i.traits?.item_level,
                                           source: source[i.id] || 'rolled' })));
            game.itemSystem.removeInventory(invId);
        }
    } finally {
        setSimulatedLevel(null);
    }
    return { level, threat, rolls: out, budgets };
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
    // The single reward point: EVERY win — a fight victory (fires the moment victory is detected,
    // before the result overlay renders, so the overlay displays the pending reward) or the delayed
    // `win` scene action (then the popup presents it and gates the scene until closed).
    //
    // Deliberately NOT `battle_defeated`: that is once-per-battle-definition because it is the
    // clear TRACKER behind `_defeated` content gates. Hanging rewards off it meant a re-fought
    // battle paid nothing at all — not even xp — and left any per-win resource a game recorded
    // with no panel to show it.
    game.on('battle_finished', (/** @type {string} */ result, /** @type {string|null} */ battleId) => {
        if (result !== 'victory') return;
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
        // A fought battle shows the panel in its own result overlay; a scripted win needs the
        // popup. `battleId` is required, not a "did anything land" test: a win always pays at
        // least threat xp, but a win with no battle to price cannot pay anything at all.
        if (!inBattle() && battleId) openRewardPopup();
    });
    game.on('battle_start', () => clearPending());
    game.on('battle_closed_before', () => clearPending());
}
