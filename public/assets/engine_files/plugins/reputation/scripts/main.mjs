/// <reference path="./dtypes.d.ts" />

const { game } = window.engine;

import { store, LOG_LIMIT } from './store.mjs';
import './components/ReputationNote.mjs';
import './components/DebugReputation.mjs';

const TRAIT = 'reputation';

/** @type {ValueSpec} */
const REPUTATION_OPS = { ops: { key: { ref: 'character' }, value: 'number' } };

// Reputation is save-owned. Save restoration replays the setTrait below, but a save made before the
// engine recorded writes has nothing to replay and would go back to the template, so the plugin keeps
// the trait out for every game.
game.registerSaveMigration('reputation', { traits: { skip: [TRAIT] } });

// Emitter: reputation_change
// Fired after a character's reputation changes. A change that min/max clamps to nothing never fires.
// Args: (character: Character, oldValue: number, newValue: number, delta: number)
// Informational — return values are ignored.
game.registerEmitter('reputation_change');

function config() {
    try {
        return game.getData('plugins_data/reputation/config');
    } catch (e) {
        return null;
    }
}

/** @returns {{ min: number, max: number }} */
function bounds() {
    const c = config();
    return { min: Number(c?.min ?? -10), max: Number(c?.max ?? 10) };
}

/** @param {Character | null | undefined} character */
function isTracked(character) {
    const v = character?.getTrait(TRAIT);
    return v !== undefined && v !== null && v !== '';
}

/** @param {Character | null | undefined} character @returns {number} untracked reads as 0 */
function valueOf(character) {
    return Number(character?.getTrait(TRAIT)) || 0;
}

/**
 * The character to change, created from its own template when the story has not made it yet —
 * a change made before then would otherwise be lost.
 * @param {string} id
 */
function characterFor(id) {
    const existing = game.getCharacter(id);
    if (existing) return existing;
    try {
        return game.createCharacter(id, id);
    } catch (e) {
        console.error(`[reputation] no character or template "${id}"`);
        return null;
    }
}

/** @param {Character} character @param {number} delta */
function addNote(character, delta) {
    // Two changes to one character in a paragraph fold into one line: one choice, one "will remember that".
    const note = store.notes.find((n) => n.id === character.id);
    if (note) {
        note.delta += delta;
        return;
    }
    store.notes.push({ id: character.id, delta });
}

/**
 * @param {string} id character id
 * @param {'=' | '+=' | '-='} op
 * @param {number} amount
 * @param {{ silent?: boolean }} [opts]
 * @returns {number | null} the new value, or null when the character is unknown
 */
function change(id, op, amount, opts = {}) {
    const character = characterFor(id);
    if (!character) return null;
    const before = valueOf(character);
    const target = op === '=' ? amount : op === '+=' ? before + amount : before - amount;
    const { min, max } = bounds();
    const next = Math.max(min, Math.min(max, target));
    if (isTracked(character) && next === before) return next;

    character.setTrait(TRAIT, next);
    const delta = next - before;
    store.log.unshift({
        id: character.id, name: character.getTrait('name') || character.id, before, after: next, delta,
        scene: game.getCurrentSceneId() || '', time: Date.now(),
    });
    if (store.log.length > LOG_LIMIT) store.log.length = LOG_LIMIT;

    game.trigger('reputation_change', character, before, next, delta);
    // A set is setup, not a choice the character saw – it never announces itself.
    if (!opts.silent && op !== '=' && delta !== 0) addNote(character, delta);
    return next;
}

/** @param {string} spec "rosa -= 1, tomas += 2" @param {boolean} silent */
function applySpec(spec, silent) {
    if (typeof spec !== 'string' || !spec.trim()) {
        console.error('[reputation] expects "<character> += <n>", "-= <n>" or "= <n>", got', spec);
        return;
    }
    for (const { id, op, value } of game.parseOpsSpec(spec)) {
        const amount = Number(value);
        if (!Number.isFinite(amount)) {
            console.error(`[reputation] "${value}" is not a number (for ${id})`);
            continue;
        }
        change(id, op, amount, { silent });
    }
}

// ── Actions ──
// {reputation: "rosa -= 1"} — changes it and notes "Rosa will remember that." under the dialogue
// {reputation: "rosa += 2, tomas -= 1"} — several at once
// {reputation: "rosa = 0"} — sets it, silently
// {reputation_silent: "rosa -= 1"} — a quiet nudge with no note
game.registerAction('reputation', {
    help: 'Change reputation and note it under the text; = sets it silently.',
    value: REPUTATION_OPS,
    examples: ['{reputation: "rosa -= 1"}', '{reputation: "rosa += 2, tomas -= 1"}', '{reputation: "rosa = 0"}'],
    action: (spec) => applySpec(spec, false),
});
game.registerAction('reputation_silent', {
    help: 'Change reputation with no note.',
    value: REPUTATION_OPS,
    examples: ['{reputation_silent: "rosa -= 1"}'],
    action: (spec) => applySpec(spec, true),
});

// ── Condition ──
// {if: "_reputation(rosa) >= 2"} — an untracked character reads as 0.
game.registerCondition('_reputation', (/** @type {string} */ id) => valueOf(game.getCharacter(String(id).trim())), {
    help: 'A character\'s reputation; untracked reads as 0.',
    args: [{ ref: 'character' }],
    examples: ['_reputation(rosa) >= 2'],
});

// ── Service ──
game.registerService('reputation', {
    get: (id) => valueOf(game.getCharacter(id)),
    isTracked: (id) => isTracked(game.getCharacter(id)),
    add: (id, delta, opts) => change(id, delta < 0 ? '-=' : '+=', Math.abs(delta), opts),
    set: (id, value) => change(id, '=', value, { silent: true }),
    getTracked: () => game.getAllCharacters().filter(isTracked),
    getBounds: () => bounds(),
});
