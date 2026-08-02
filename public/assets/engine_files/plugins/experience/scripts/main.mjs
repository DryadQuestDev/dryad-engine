/// <reference path="./dtypes.d.ts" />

const { game } = window.engine;

import {
    inBattle, effectiveThreat, getDungeonLevel, dungeonScale,
    pendingReward, recordCharacterXp, recordResource,
    clearPending, openRewardPopup, getMc,
} from './reward.mjs';
import './pools.mjs';
import './components/XpBar.mjs';
import './components/RewardPanel.mjs';

// ── Config ──

function getConfig() {
    return game.getData('plugins_data/experience/config_experience');
}

/**
 * Calculate XP threshold for a given level.
 * @param {number} level
 * @returns {number}
 */
function getThreshold(level) {
    const config = getConfig();
    const base = config?.xp_base || 100;
    const growth = config?.xp_growth || 50;
    const formula = config?.xp_formula || 'exponential_percent';

    switch (formula) {
        case 'linear_percent':
            return Math.round(base * (1 + growth / 100 * (level - 1)));
        case 'quadratic':
            return Math.round(base * level * level);
        case 'cubic':
            return Math.round(base * level * level * level);
        case 'custom_table': {
            const table = config?.xp_table;
            if (table?.length) return table[Math.min(level - 1, table.length - 1)];
            return base;
        }
        default: // exponential_percent
            return Math.round(base * Math.pow(1 + growth / 100, level - 1));
    }
}

/**
 * Get XP multiplier for a character. xp_modifier is a percent stat; 0 = normal.
 * @param {Character} character
 * @returns {number}
 */
function getXpModifier(character) {
    return 1 + character.getStat('xp_modifier') / 100;
}

// ── Init: set XP resource on character creation ──

game.on('character_create', (/** @type {Character} */ character) => {
    const level = character.getTrait('level');
    if (!level) return;
    const threshold = getThreshold(level);
    character.setStat('xp', threshold);
    character.setResource('xp', 0);
});

// ── Level-up: listen to XP resource changes ──

game.registerEmitter('character_level_up');

// While true, XP gains and level-ups skip the reward display — the shared-level join sync levels
// a character silently instead of polluting the next reward panel.
let silentLevelSync = false;

/** Visible stat values for the level-up before → after diff (hidden stats like xp stay out). */
function snapshotStats(/** @type {Character} */ character) {
    const snap = /** @type {Record<string, number>} */ ({});
    for (const [id, def] of game.getData('character_stats', true) || []) {
        if (def?.is_hidden) continue;
        snap[id] = character.getStat(id);
    }
    return snap;
}

game.on('character_resource_change', (/** @type {Character} */ character, /** @type {string} */ statId, /** @type {number} */ oldValue, /** @type {number} */ newValue) => {
    if (statId !== 'xp') return;
    let level = character.getTrait('level');
    if (!level) return;

    const config = getConfig();
    const maxLevel = config?.max_level || 99;
    let threshold = character.getStat('xp');
    let xp = newValue;

    const gained = newValue - oldValue;
    const levelFrom = level;
    const xpFrom = Math.max(0, Math.min(oldValue, threshold));
    const willLevel = xp >= threshold && level < maxLevel;
    const statsBefore = willLevel ? snapshotStats(character) : null;

    if (!willLevel) {
        // Plain gain, no level-up: record the partial bar fill for the reward panel.
        if (gained > 0 && !silentLevelSync) {
            recordCharacterXp({
                id: character.id, name: character.getTrait('name') || character.id,
                gained, levelFrom, levelTo: level,
                xpFrom, xpTo: Math.max(0, Math.min(xp, threshold)), stats: [],
            });
        }
        return;
    }

    // Level up loop — handle multi-level overflow
    const rewards = config?.level_up_rewards;
    while (xp >= threshold && level < maxLevel) {
        xp -= threshold;
        level++;
        threshold = getThreshold(level);

        // Apply level-up status (stacks per level)
        const statusId = character.getTrait('level_up_status');
        if (statusId) {
            if (character.hasStatus(statusId)) {
                character.addStatusStacks(statusId, 1);
            } else {
                const status = game.createStatus(statusId);
                if (status) character.addStatus(status);
            }
        }

        // Award currency items to private inventory
        if (rewards?.length) {
            const inventory = character.getPrivateInventory();
            if (inventory) {
                for (const reward of rewards) {
                    const item = game.createItem(reward.item_id);
                    if (item) inventory.addItem(item, reward.amount || 1);
                }
            }
        }

        game.trigger('character_level_up', character, level);
    }

    // Record the full progression for the reward panel: gained XP, level range for the animated
    // bar, and the visible-stat diff the level-up statuses produced.
    if (!silentLevelSync) {
        const statsAfter = snapshotStats(character);
        const stats = [];
        for (const id in statsAfter) {
            if (statsAfter[id] !== (statsBefore?.[id] ?? statsAfter[id])) {
                stats.push({ id, before: /** @type {Record<string, number>} */ (statsBefore)[id], after: statsAfter[id] });
            }
        }
        recordCharacterXp({
            id: character.id, name: character.getTrait('name') || character.id,
            gained: Math.max(0, gained), levelFrom, levelTo: level,
            xpFrom, xpTo: xp, stats,
        });
    }

    character.setTrait('level', level);
    character.setStat('xp', threshold);
    character.setResource('xp', xp);
});

// ── Shared level: sync a joining member up to the MC ──
// The XP delta routes through the level-up listener above, so every level on the way grants its
// status stack and level_up_rewards exactly as if earned. Silent: no reward-panel entries.

game.on('character_join_party', (/** @type {Character} */ character) => {
    if (!getConfig()?.shared_level) return;
    const mc = getMc();
    if (!mc || !character || character.id === mc.id) return;
    if (!(character.getTrait('level') > 0) || !(mc.getTrait('level') > 0)) return;

    const mcLevel = mc.getTrait('level');
    let level = character.getTrait('level');
    if (level >= mcLevel) return;

    let delta = mc.getResource('xp') - character.getResource('xp');
    while (level < mcLevel) {
        delta += getThreshold(level);
        level++;
    }
    if (delta <= 0) return;
    silentLevelSync = true;
    try {
        character.addResource('xp', delta);
    } finally {
        silentLevelSync = false;
    }
});

// ── Service — the public facade for games and other plugins ──

game.registerService('xp', {
    /** @param {string} characterId @param {number} amount */
    addXp(characterId, amount) {
        const char = game.getCharacter(characterId);
        if (!char) return;
        char.addResource('xp', Math.round(amount * getXpModifier(char)));
    },
    /** @param {number} level @returns {number} */
    getThreshold,
    /** @param {string} characterId @returns {number} */
    getXpToNext(characterId) {
        const char = game.getCharacter(characterId);
        if (!char) return 0;
        return char.getStat('xp') - char.getResource('xp');
    },
});

game.registerService('reward', {
    /** Reactive pending-reward accumulator the RewardPanel renders. */
    getPending() { return pendingReward; },
    /** @param {string} battleId @returns {number} battle-definition threat × dungeon-level scale */
    effectiveThreat,
    /** @returns {number} the current dungeon's (group) level snapshot */
    getDungeonLevel,
    /** @param {number} level @returns {number} reward multiplier for a dungeon level */
    dungeonScale,
    /** Record a resource gain (by the GAME's own stat id) for the reward display. */
    recordResource,
    clearPending,
    /** Open the reward popup (guarded against double-open). */
    openRewardPopup,
});

// ── Conditions ──

game.registerCondition('_level', (/** @type {string} */ characterId) => {
    const char = game.getCharacter(characterId);
    return char?.getTrait('level') || 0;
});

// ── Actions ──

function applyXp(/** @type {Character} */ char, /** @type {number} */ amount) {
    char.addResource('xp', Math.round(amount * getXpModifier(char)));
}

// Delayed: the player reads the paragraph first; the continue-click grants the XP and opens the
// reward popup (no flash — the popup + level-up fanfare replace it). Mid-battle grants skip the
// popup and surface in the battle victory panel instead.
// A numeric value grants the MC; with `shared_level` on it grants the whole (levelled) party.
game.registerAction('xp', {
    eventDelayed: true,
    action: (/** @type {number|string} */ value) => {
        if (typeof value === 'number') {
            const targets = getConfig()?.shared_level ? game.getParty() : [getMc()];
            for (const char of targets) {
                if (char?.getTrait('level') > 0) {
                    applyXp(char, value);
                }
            }
        } else if (typeof value === 'string') {
            for (const part of value.split(',')) {
                const [charId, amountStr] = part.trim().split('->');
                const char = game.getCharacter(charId.trim());
                if (!char) continue;
                applyXp(char, parseInt(amountStr) || 0);
            }
        }
        if (!inBattle()) openRewardPopup();
    }
});

// Scene-path defeat rewards need no action here: rpg_battler's delayed `{win: "<battleId>"}`
// action marks the battle defeated, and the battle_defeated listener in reward.mjs grants
// everything and opens the reward popup (closing it advances the scene).
