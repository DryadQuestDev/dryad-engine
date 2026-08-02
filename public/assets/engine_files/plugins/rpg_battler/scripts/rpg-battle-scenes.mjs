/// <reference path="./dtypes.d.ts" />

// Mid-battle scene playback: during battle, any game.playScene() call is intercepted and
// queued; scenes overlay the battle screen and the battle flow pauses until the player
// clicks through them. Devs use plain game.playScene() — no dedicated API.
//
// A content-started battle keeps the story scene that triggered it "parked" in the
// engine (the `battle` action is eventDelayed; victory resumes it via game.nextScene()).
// Playing another scene would overwrite that parked scene, and the bark's exit would
// null it — dead-ending the story after the battle. So the first scene of a session
// snapshots the parked context (game.captureSceneContext) and the session's end restores
// it synchronously from the `event_end` listener, before the engine's exitScene can
// reach triggerEvent — no room event can fire in the gap.
//
// Scenes support full DryadScript flow (multiple paragraphs, choices, branches): while a
// queued scene is on screen its internal playScene advances pass the interceptor through,
// and the session only moves on when the whole scene exits and fires `event_end`.
// Fades come from the engine: the dialogue fades in on scene start and the engine's
// graceful exit fades it out while actors play their slot exit animations.

import { currentRpgBattle } from './rpg-battle-state.mjs';

const { game } = window.engine;

/** @type {{ ref: string, dungeonId: string | null }[]} */
const sceneQueue = [];
/** @type {SceneContext | null} */
let savedCtx = null;
let sessionActive = false;
let scenePlaying = false;
let tearingDown = false;
let pumping = false;
/** @type {(() => void)[]} */
let gateResolvers = [];

/** True while queued battle scenes are pending or one is on screen — the battle flow must hold. */
export function isBattleScenePauseActive() {
    return sessionActive || sceneQueue.length > 0;
}

/**
 * Await-point for the battle flow: starts the next queued scene if needed and resolves
 * once the whole scene session has drained. Resolves immediately when nothing is queued.
 * @returns {Promise<void>}
 */
export function battleSceneGate() {
    if (!isBattleScenePauseActive()) return Promise.resolve();
    pump();
    if (!isBattleScenePauseActive()) return Promise.resolve();
    return new Promise(resolve => gateResolvers.push(resolve));
}

/**
 * Drop any stale queue/session state. Called from the service's start() BEFORE the
 * battle_start emitter fires, so scenes queued by battle_start listeners survive.
 * (A scene queued during the previous battle's teardown — e.g. from a battle_end
 * listener — has no gate left to drain it and would otherwise leak into this battle.)
 */
export function resetBattleScenes() {
    sceneQueue.length = 0;
    sessionActive = false;
    scenePlaying = false;
    savedCtx = null;
    flushGates();
}

/**
 * Abort the scene session (battle is ending): drop the queue, close any open scene
 * instantly (no fade — the whole screen is changing) and without side effects, and
 * put the parked story scene back so endRpgBattle's nextScene() resumes it.
 * Releases every pending gate.
 */
export function teardownBattleScenes() {
    sceneQueue.length = 0;
    if (scenePlaying) {
        tearingDown = true;
        game.exitScene(true, true);
        tearingDown = false;
        scenePlaying = false;
    }
    if (sessionActive) {
        if (savedCtx) game.restoreSceneContext(savedCtx);
        sessionActive = false;
        savedCtx = null;
    }
    flushGates();
}

function flushGates() {
    const resolvers = gateResolvers;
    gateResolvers = [];
    for (const resolve of resolvers) resolve();
}

// If the battle is idle at the player's input, no pause gate will run — start the
// scene on the next tick. When a gate pumps first (mid-resolution) this no-ops.
function scheduleIdlePump() {
    setTimeout(() => {
        const b = currentRpgBattle.value;
        if (!b || sessionActive || tearingDown || !sceneQueue.length) return;
        if (b.battlePhase === 'choosing_ability' || b.battlePhase === 'choosing_target') pump();
    }, 0);
}

function pump() {
    if (tearingDown || scenePlaying) return;
    const next = sceneQueue.shift();
    if (!next) return;
    if (!sessionActive) {
        savedCtx = game.captureSceneContext();
        sessionActive = true;
    }
    // Clean stage: the interrupted scene's actors/assets don't belong in the cutaway —
    // scenes queue their own cast. The snapshot restore brings them back afterward.
    // keepExiting: actors still animating out from the previous cutaway's close are
    // left alone — if this scene re-stages the same character, the engine revives
    // them in place (exit killed early); otherwise they finish fading on their own.
    game.clearActors(true);
    game.clearAssets();
    pumping = true;
    // root:false — cutaways never stage root-scene defaults (backgrounds, dungeon
    // music, scene_play default actors), even when no interrupted scene exists.
    game.playScene(next.ref, next.dungeonId, { root: false });
    pumping = false;
    // A failed playScene (bad id) logs its own error and leaves the current scene id
    // untouched — detect it so the gate never deadlocks waiting for an event_end.
    const current = game.getCurrentSceneId();
    if (!current || current === savedCtx?.sceneId) {
        console.warn(`rpg_battler: battle scene "${next.ref}" did not start - skipping`);
        if (sceneQueue.length) {
            pump();
        } else {
            // the stage was cleared above — put the interrupted scene's cast back
            if (savedCtx) game.restoreSceneContext(savedCtx);
            finishSession();
        }
        return;
    }
    scenePlaying = true;
}

function finishSession() {
    if (sessionActive) {
        sessionActive = false;
        savedCtx = null;
    }
    // The bark's playScene/exitScene flipped these; a running battle needs them back.
    if (currentRpgBattle.value) {
        game.setState('hide_events', true);
        game.setState('block_party_inventory', true);
    }
    flushGates();
}

// The interceptor. Runs FIRST (order -9999) and short-circuits the trigger: during
// battle, any scene play becomes a queued bark, and other scene_play_before listeners
// only ever see the real (queued) play — never the blocked one. Passes through while
// the queue itself is pumping and while a queued scene is on screen (its own paragraph
// advances, choice jumps, and chains route through playScene and must run normally).
game.on('scene_play_before', (sceneId, dungeonId) => {
    if (!currentRpgBattle.value || pumping || scenePlaying || tearingDown) return;
    sceneQueue.push({ ref: sceneId, dungeonId });
    // playScene's preamble already flipped this before the trigger — undo it same-tick.
    game.setState('hide_events', true);
    scheduleIdlePump();
    return false;
}, -9999);

game.on('event_end', () => {
    if (!sessionActive || tearingDown) return;
    scenePlaying = false;
    if (sceneQueue.length) {
        // Between scenes: NO restore — a wholesale slot replacement would destroy the
        // identity of actors still animating out, breaking the revive-in-place path.
        // triggerEvent stays suppressed because pump runs synchronously right here,
        // so the next scene is already current when exitScene reaches it.
        pump();
        return;
    }
    // Session over: put the interrupted story scene back. Synchronous restore:
    // exitScene's triggerEvent sees the parked scene id and bails.
    if (savedCtx) game.restoreSceneContext(savedCtx);
    finishSession();
});
