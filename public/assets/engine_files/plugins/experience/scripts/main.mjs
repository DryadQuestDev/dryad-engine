/// <reference path="./dtypes.d.ts" />

const { game } = window.engine;

import './components/XpBar.mjs';

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

game.on('character_resource_change', (/** @type {Character} */ character, /** @type {string} */ statId, /** @type {number} */ oldValue, /** @type {number} */ newValue) => {
    if (statId !== 'xp') return;
    let level = character.getTrait('level');
    if (!level) return;

    const config = getConfig();
    const maxLevel = config?.max_level || 99;
    let threshold = character.getStat('xp');
    let xp = newValue;

    // Flash XP gain
    const gained = newValue - oldValue;
    if (gained > 0) {
        game.addFlash(game.getLine('xp_flash', { name: character.getTrait('name') || character.id, amount: gained }));
    }

    if (xp < threshold || level >= maxLevel) return;

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

    character.setTrait('level', level);
    character.setStat('xp', threshold);
    character.setResource('xp', xp);

    game.addFlash(game.getLine('xp_level_up', { name: character.getTrait('name') || character.id, level }));
});

// ── Service ──

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

// ── Condition ──

game.registerCondition('_level', (/** @type {string} */ characterId) => {
    const char = game.getCharacter(characterId);
    return char?.getTrait('level') || 0;
});

// ── Action ──

function applyXp(/** @type {Character} */ char, /** @type {number} */ amount) {
    char.addResource('xp', Math.round(amount * getXpModifier(char)));
}

game.registerAction('xp', (/** @type {number|string} */ value) => {
    if (typeof value === 'number') {
        for (const char of game.getParty()) {
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
});
