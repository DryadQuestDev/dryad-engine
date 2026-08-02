/// <reference path="./dtypes.d.ts" />

const { game } = window.engine;

import './components/WaitButton.mjs';

// ── State ──

// The global map-turn counter (saved).
game.registerState('turn', 0);

// ── Emitter ──

// Emitter: turn_advanced
// Fired after the turn counter advances and limited status durations have ticked.
// Args: (newTurn: number, turnsElapsed: number)
game.registerEmitter('turn_advanced');

// ── Ticking ──

/**
 * Tick every character's limited statuses (duration > 0) by `turns`. Permanent (-1)
 * and passive (0) durations are untouched by the engine's tickDuration. For party
 * members, notify about statuses that fully expired.
 * @param {number} turns
 */
function tickStatuses(turns) {
    const party = new Set(game.getParty().map((c) => c.id));
    for (const character of game.getAllCharacters()) {
        // Snapshot first — ticking can remove a status, mutating the statuses map mid-loop.
        const before = character.getStatuses().map((s) => ({ id: s.id, name: s.name || s.id }));
        for (const s of before) character.tickStatusDuration(s.id, turns);

        if (!party.has(character.id)) continue;
        const remaining = new Set(character.getStatuses().map((s) => s.id));
        for (const s of before) {
            if (!remaining.has(s.id)) {
                game.showNotification(game.getLine('turn_status_expired', { status: s.name, name: character.getName() }));
            }
        }
    }
}

/**
 * Advance the clock: increment the turn counter, tick limited status durations on all
 * characters, re-run the discover scan (a status that just expired can change what the party
 * spots), and fire `turn_advanced`.
 * @param {number} [turns]
 * @returns {number} the new turn number
 */
function advance(turns = 1) {
    const amount = Math.max(1, Math.floor(Number(turns) || 1));
    const newTurn = (game.getState('turn') || 0) + amount;
    game.setState('turn', newTurn);
    tickStatuses(amount);
    game.scanDiscoverableEncounters();
    game.trigger('turn_advanced', newTurn, amount);
    return newTurn;
}

// ── Service ──

game.registerService('turns', {
    /** @returns {number} the current global turn number */
    getTurn: () => game.getState('turn') || 0,
    advance,
});

// ── Action ──

// {turn: 1} / {turn: 5} — advance the clock from scene text (e.g. resting passes time).
game.registerAction('turn', (/** @type {number} */ value) => {
    advance(value);
});

// ── Room movement ──

// Each room entry costs one turn.
game.on('room_enter_after', () => {
    advance(1);
});

// ── Collectable regrow ──

// Collected collectables carry their own regrow countdown in dungeon data; the
// engine just needs to be told that time passed. turnsElapsed keeps {turn: 5} exact.
game.on('turn_advanced', (_newTurn, turnsElapsed) => {
    game.tickCollectables(turnsElapsed);
});
