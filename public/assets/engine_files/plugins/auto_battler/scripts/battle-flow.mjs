/// <reference path="./dtypes.d.ts" />

import { resolveAbility, getCharacterPosition, applyStatusInstance, removeStatusStacks, getStatusStacks, getStatusDefinitions, processStatusEffects, getEffectiveRange } from './battle-effects.mjs';
import { decideAction } from './battle-ai.mjs';

export { currentBattle } from './battle-state.mjs';
import { currentBattle } from './battle-state.mjs';

const { game, gsap, vue: { ref } } = window.engine;

export const CLOCK_TURN_ACTOR = '__clock_turn__';
export const BASE_DELAY = 800;
export const ATB_THRESHOLD = 100;

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const battleDelay = (ms) => delay(ms / (game.getState('battle_speed') || 1));

/** @type {import('vue').Ref<TargetHighlight | null>} */
export const targetHighlight = ref(null);

// Floating combat text
const FLOAT_ICONS = {
  damage: 'assets/engine_assets/plugins/auto_battler/damage.svg',
  heal: 'assets/engine_assets/plugins/auto_battler/heal.svg',
  shield: 'assets/engine_assets/plugins/auto_battler/shield.svg',
};

/** @type {import('vue').Ref<FloatingText[]>} */
export const floatingTexts = ref([]);
let _floatId = 0;

export function addFloatingText(characterId, text, cssClass, icon, color) {
  floatingTexts.value.push({ id: _floatId++, characterId, text, cssClass, icon, color });
}

export function removeFloatingText(id) {
  const idx = floatingTexts.value.findIndex(f => f.id === id);
  if (idx !== -1) floatingTexts.value.splice(idx, 1);
}

/** @param {EffectResult[]} effects */
function parseFloatingTexts(effects) {
  for (const e of effects) {
    if (e.type === 'damage' && e.targetId)
      addFloatingText(e.targetId, `-${e.amount}`, e.damageType || 'physical', FLOAT_ICONS.damage);
    else if (e.type === 'heal' && e.targetId)
      addFloatingText(e.targetId, `+${e.amount}`, 'heal', FLOAT_ICONS.heal);
    else if (e.type === 'steal' && e.targetId)
      addFloatingText(e.targetId, `+${e.amount}`, 'steal', FLOAT_ICONS.heal);
    else if (e.type === 'status_apply' && e.targetId) {
      const def = getStatusDefinitions().get(e.statusId);
      addFloatingText(e.targetId, `+${e.stacks}`, 'status-apply', def?.image || null, def?.color);
    }
    else if (e.type === 'status_dot' && e.targetId)
      addFloatingText(e.targetId, `-${e.amount}`, e.damageType || 'physical', FLOAT_ICONS.damage);
    else if (e.type === 'status_hot' && e.targetId)
      addFloatingText(e.targetId, `+${e.amount}`, 'heal', FLOAT_ICONS.heal);
    else if (e.type === 'cleanse' && e.targetId)
      addFloatingText(e.targetId, 'CLEANSED', 'cleanse', null);
    else if (e.type === 'death_defiance' && e.targetId)
      addFloatingText(e.targetId, 'DEFIED!', 'death-defiance', null);
    else if (e.type === 'status_apply' && e.targetId) {
      const statusDefs = game.getData("character_statuses", true);
      const def = statusDefs?.get(e.statusId);
      addFloatingText(e.targetId, e.statusName || e.statusId, 'status-apply', def?.image || null);
    }
  }
}

// ── Attack Animations ──

function getCellCenter(cell) {
  const r = cell.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Melee lunge: grid-actor moves ~70% toward target. Returns the animated element (for return anim). */
function animateLunge(casterId, targetCharId, speed) {
  return new Promise(resolve => {
    const casterCell = document.querySelector(`[data-char-id="${casterId}"]`);
    const targetCell = document.querySelector(`[data-char-id="${targetCharId}"]`);
    if (!casterCell || !targetCell) { resolve(null); return; }
    const actor = /** @type {HTMLElement} */ (casterCell.querySelector('.grid-actor'));
    if (!actor) { resolve(null); return; }

    const c = getCellCenter(casterCell);
    const t = getCellCenter(targetCell);
    actor.style.zIndex = '10';
    gsap.to(actor, {
      x: (t.x - c.x) * 0.7,
      y: (t.y - c.y) * 0.7,
      duration: (BASE_DELAY / speed) / 1000,
      ease: 'power2.in',
      onComplete: () => resolve(actor),
    });
  });
}

/** Return from melee lunge. */
function animateLungeReturn(/** @type {HTMLElement} */ actor, speed) {
  return new Promise(resolve => {
    gsap.to(actor, {
      x: 0, y: 0,
      duration: (BASE_DELAY / speed) / 2000,
      ease: 'power2.out',
      onComplete: () => { actor.style.zIndex = ''; resolve(); },
    });
  });
}

/** Ranged projectile: colored orb flies from caster to target. Caster does a small cast bump. */
function animateProjectile(casterId, targetCharId, damageType, speed) {
  return new Promise(resolve => {
    const casterCell = document.querySelector(`[data-char-id="${casterId}"]`);
    const targetCell = document.querySelector(`[data-char-id="${targetCharId}"]`);
    if (!casterCell || !targetCell) { resolve(); return; }

    const c = getCellCenter(casterCell);
    const t = getCellCenter(targetCell);

    // Cast bump on caster
    const actor = casterCell.querySelector('.grid-actor');
    if (actor) {
      const bumpX = Math.sign(t.x - c.x) * 8;
      gsap.to(actor, { x: bumpX, duration: 0.1, yoyo: true, repeat: 1, ease: 'power1.out' });
    }

    // Create orb
    const orb = document.createElement('div');
    orb.className = `battle-projectile ${damageType}`;
    orb.style.left = `${c.x}px`;
    orb.style.top = `${c.y}px`;
    document.body.appendChild(orb);

    gsap.to(orb, {
      x: t.x - c.x,
      y: t.y - c.y,
      duration: (BASE_DELAY / speed) / 1000,
      ease: 'power1.in',
      onComplete: () => { orb.remove(); resolve(); },
    });
  });
}

/** Ally bump: grid-actor nudges toward target direction. */
function animateBump(casterId, targetCharId, speed) {
  return new Promise(resolve => {
    const casterCell = document.querySelector(`[data-char-id="${casterId}"]`);
    const targetCell = document.querySelector(`[data-char-id="${targetCharId}"]`);
    if (!casterCell || !targetCell) { resolve(); return; }
    const actor = casterCell.querySelector('.grid-actor');
    if (!actor) { resolve(); return; }

    const c = getCellCenter(casterCell);
    const t = getCellCenter(targetCell);
    const dx = t.x - c.x;
    const dy = t.y - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    const duration = Math.min((BASE_DELAY / speed) / 1000, 0.3);
    gsap.to(actor, {
      x: (dx / dist) * 10,
      y: (dy / dist) * 10,
      duration: duration / 2,
      yoyo: true, repeat: 1,
      ease: 'power1.out',
      onComplete: () => resolve(),
    });
  });
}

/** Self-cast: quick rotation wiggle on grid-actor. */
function animateSelfCast(casterId, speed) {
  return new Promise(resolve => {
    const casterCell = document.querySelector(`[data-char-id="${casterId}"]`);
    if (!casterCell) { resolve(); return; }
    const actor = casterCell.querySelector('.grid-actor');
    if (!actor) { resolve(); return; }

    const d = Math.min((BASE_DELAY / speed) / 1000, 0.3) / 3;
    const tl = gsap.timeline({ onComplete: () => resolve() });
    tl.to(actor, { rotation: 3, duration: d, ease: 'power1.inOut' })
      .to(actor, { rotation: -3, duration: d, ease: 'power1.inOut' })
      .to(actor, { rotation: 0, duration: d, ease: 'power1.inOut' });
  });
}

/** Death animation: fade out + shrink + fall. */
function animateDeath(characterId, speed) {
  return new Promise(resolve => {
    const cell = document.querySelector(`[data-char-id="${characterId}"]`);
    if (!cell) { resolve(); return; }
    const actor = cell.querySelector('.grid-actor');
    if (!actor) { resolve(); return; }

    const duration = Math.min((BASE_DELAY / speed) / 1000, 0.6);
    gsap.to(actor, {
      opacity: 0,
      scale: 0.4,
      y: 15,
      filter: 'grayscale(1) brightness(0.3)',
      duration,
      ease: 'power2.in',
      onComplete: () => resolve(),
    });
  });
}

/** Retreat animation: character slides off-screen to the left. */
function animateRetreat(characterId, speed) {
  return new Promise(resolve => {
    const cell = document.querySelector(`[data-char-id="${characterId}"]`);
    if (!cell) { resolve(); return; }
    const actor = cell.querySelector('.grid-actor');
    if (!actor) { resolve(); return; }
    const duration = Math.min((BASE_DELAY / speed) / 1000, 0.6);
    gsap.to(actor, { x: -200, opacity: 0, duration, ease: 'power2.in', onComplete: resolve });
  });
}

/**
 * Execute a retreat turn for a player character.
 * @param {BattleActor} actor
 */
async function executeRetreatTurn(actor) {
  const battle = currentBattle.value;
  const speed = game.getState('battle_speed') || 1;

  if (battle._firstAction) {
    battle._firstAction = false;
    await battleDelay(BASE_DELAY);
    if (battle.phase !== 'active') return;
  }
  const clockTurnPassed = battle._pendingTurnStart;
  flushTurnStart();
  if (clockTurnPassed && await processClockTurnEffects()) return;
  if (clockTurnPassed && await processAutocastsForTurn()) return;

  const character = game.getCharacter(actor.characterId);
  battle.log.push({
    turn: battle.turn,
    actorId: actor.characterId,
    text: game.getLine('log_retreat', { name: character?.getName() || actor.characterId }),
  });

  await animateRetreat(actor.characterId, speed);
  if (battle.phase !== 'active') return;

  const pos = getCharacterPosition(actor.characterId);
  if (pos) {
    const grid = pos.side === 'player' ? battle.playerGrid : battle.enemyGrid;
    delete grid[`${pos.row}_${pos.col}`];
  }
  battle.retreated.push(actor.characterId);

  await battleDelay(BASE_DELAY / 2);

  if (!checkBattleEnd()) {
    advanceTimeline();
  }
}

/**
 * Get the live speed of an actor (respects buffs/debuffs/stun).
 * @param {BattleActor} actor
 * @returns {number}
 */
function getActorSpeed(actor) {
  const char = game.getCharacter(actor.characterId);
  if (!char) return actor.speed;

  // Stun (id-based): if `stun` status has stacks → speed 0
  if ((char.getStatus('stun')?.currentStacks ?? 0) > 0) return 0;

  let speed = char.getStat('speed');
  const speedMult = char.getStat('speed_mult') || 0;
  const cfg = game.getData('plugins_data/auto_battler/battle_config', true);
  const floor = cfg?.mult_floor ?? 0.1;
  speed *= Math.max(1 + speedMult / 100, floor);
  return speed;
}

/**
 * Get the active actor object from the initiative list.
 * @returns {BattleActor | undefined}
 */
function getActiveActor() {
  const battle = currentBattle.value;
  return battle.initiative.find(a => a.characterId === battle.activeActorId);
}

/**
 * Initialize ability tracking for all combatants at battle start.
 */
export function initBattleTracking() {
  const battle = currentBattle.value;
  battle.abilitiesState = {};
  battle._firstAction = true;

  const allCharIds = [
    ...Object.values(battle.playerGrid),
    ...Object.values(battle.enemyGrid),
  ];

  for (const charId of allCharIds) {
    const character = game.getCharacter(charId);
    if (!character) continue;

    battle.abilitiesState[charId] = {};

    const abilities = character.getAbilities();
    for (const abilityId in abilities) {
      const meta = abilities[abilityId].meta;
      battle.abilitiesState[charId][abilityId] = {
        cooldown: meta.cd_on_battle_start || 0,
        charges: meta.charges ? meta.charges : -1,
      };
    }
  }

  // Register autocast abilities into abilitiesState (for cooldown/charges tracking)
  const autocastDefs = game.getData('plugins_data/auto_battler/autocast_definitions', true);
  const acTemplates = game.getData('ability_templates', true);
  if (autocastDefs && acTemplates) {
    for (const charId of allCharIds) {
      const c = game.getCharacter(charId);
      if (!c) continue;
      for (const [, def] of autocastDefs) {
        if (!c.getStat(def.source)) continue;
        for (const entry of (def.ability || [])) {
          const tmpl = acTemplates.get(entry.id);
          if (!tmpl || battle.abilitiesState[charId][entry.id]) continue;
          const meta = tmpl.meta || {};
          battle.abilitiesState[charId][entry.id] = {
            cooldown: meta.cd_on_battle_start || 0,
            charges: meta.charges ? meta.charges : -1,
          };
        }
      }
    }
  }

  // Initialize statuses from meta.source stats at battle start
  const defs = getStatusDefinitions();
  for (const charId of allCharIds) {
    const character = game.getCharacter(charId);
    if (!character) continue;
    for (const [statusId, def] of defs) {
      const src = def.meta?.source;
      if (!src) continue;
      const stacks = Math.floor(character.getStat(src) || 0);
      if (stacks > 0) applyStatusInstance(charId, statusId, stacks, undefined, charId);
    }
  }

  // Process battle_start autocasts for all characters
  for (const charId of allCharIds) {
    const results = processAutocasts('battle_start', charId, {});
    for (const e of results) battle.log.push({ turn: battle.turn, actorId: charId, effect: e });
  }

  // Determine the first actor via ATB (initial positioning only, not real timeline)
  advanceTimeline();
  battle.turnGauge = 0;
  battle.turn = 1;
  battle._pendingTurnStart = true;
}

/**
 * Tick meta.is_battle status instance durations continuously.
 * Called each advanceTimeline step — same rate as the turn clock.
 * @param {number} drainAmount - how much to drain (TURN_SPEED * minTime / ATB_THRESHOLD)
 */
function drainBattleDurations(drainAmount) {
  const battle = currentBattle.value;

  for (const actor of battle.initiative) {
    if (!isActive(actor.characterId)) continue;

    const char = game.getCharacter(actor.characterId);
    if (!char) continue;

    // Drain every status.meta.is_battle via engine helper (per-instance tick + drop expired)
    const battleIds = char.getStatuses().filter(s => s.meta?.is_battle).map(s => s.id);
    for (const id of battleIds) char.tickStatusDuration(id, drainAmount);
  }
}

/**
 * Process status DoT/HoT effects on clock turn for all alive characters.
 * Handles floating texts, logging, death, and battle end.
 * @returns {Promise<boolean>} true if battle ended or phase changed
 */
async function processClockTurnEffects() {
  const battle = currentBattle.value;
  const speed = game.getState('battle_speed') || 1;
  for (const a of battle.initiative) {
    if (!isActive(a.characterId)) continue;
    const dotResults = processStatusEffects(a.characterId);
    if (dotResults.length > 0) {
      for (const e of dotResults) {
        parseFloatingTexts([e]);
        battle.log.push({ turn: battle.turn, actorId: CLOCK_TURN_ACTOR, effect: e });
        await battleDelay(120);
        if (battle.phase !== 'active') return true;
      }
      const dotDeath = handleDeath(a.characterId, null, true);
      if (dotDeath && typeof dotDeath === 'object') {
        await animateDeath(a.characterId, speed);
        delete dotDeath.grid[dotDeath.key];
        if (checkBattleEnd()) return true;
      }
    }
  }
  return false;
}

/**
 * Advance the ATB timeline to find the next actor.
 * Advances all gauges by the minimum time needed for someone to reach the threshold.
 * Also advances the turn clock and ticks cooldowns when a round passes.
 */
function advanceTimeline() {
  const battle = currentBattle.value;
  battle.chosenAction = null;

  const battleConfig = game.getData('plugins_data/auto_battler/battle_config');
  const TURN_SPEED = battleConfig?.turn_speed ?? 50;

  // Filter to active actors with speed > 0 (stunned actors are frozen, retreated are gone)
  const candidates = battle.initiative.filter(
    a => isActive(a.characterId) && getActorSpeed(a) > 0
  );

  if (candidates.length === 0) return;

  // Find the minimum time for any candidate to reach the threshold
  let minTime = Infinity;
  for (const actor of candidates) {
    const speed = getActorSpeed(actor);
    const timeToAct = (ATB_THRESHOLD - actor.gauge) / speed;
    if (timeToAct < minTime) minTime = timeToAct;
  }

  // Advance ALL active actors' gauges (including zero-speed, they just add 0)
  for (const actor of battle.initiative) {
    if (!isActive(actor.characterId)) continue;
    const speed = getActorSpeed(actor);
    actor.gauge += speed * minTime;
  }

  // Tick token instance durations and status durations
  const drainAmount = TURN_SPEED * minTime / ATB_THRESHOLD;
  drainBattleDurations(drainAmount);

  // Advance the turn clock
  battle.turnGauge += TURN_SPEED * minTime;
  while (battle.turnGauge >= ATB_THRESHOLD) {
    battle.turnGauge -= ATB_THRESHOLD;
    battle.turn++;
    battle._pendingTurnStart = true;
    // Tick cooldowns for ALL alive characters
    tickAllCooldowns();
  }

  // Pick the ready actor (gauge >= threshold)
  // Tie-break: highest gauge → highest speed → player-side first
  let best = null;
  for (const actor of candidates) {
    if (actor.gauge < ATB_THRESHOLD) continue;
    if (!best
      || actor.gauge > best.gauge
      || (actor.gauge === best.gauge && getActorSpeed(actor) > getActorSpeed(best))
      || (actor.gauge === best.gauge && getActorSpeed(actor) === getActorSpeed(best) && actor.side === 'player' && best.side !== 'player')
    ) {
      best = actor;
    }
  }

  if (best) {
    best.gauge -= ATB_THRESHOLD;
    battle.activeActorId = best.characterId;
    battle.actionCount++;
  }
}

/**
 * Compute a preview of the next N actors in the ATB queue (no mutation).
 * Interleaves turn markers where the turn clock fires.
 * @param {number} count - number of actor entries to return
 * @returns {TurnPreviewEntry[]}
 */
export function computeTurnPreview(count) {
  const battle = currentBattle.value;
  const battleConfig = game.getData('plugins_data/auto_battler/battle_config');
  const TURN_SPEED = battleConfig?.turn_speed ?? 50;

  // Clone gauges
  const gauges = {};
  for (const actor of battle.initiative) {
    gauges[actor.characterId] = actor.gauge;
  }
  let simTurnGauge = battle.turnGauge;
  let simTurn = battle.turn;

  /** @type {TurnPreviewEntry[]} */
  const result = [];
  let actorCount = 0;

  while (actorCount < count) {
    // Filter active actors with speed > 0
    const candidates = battle.initiative.filter(
      a => isActive(a.characterId) && getActorSpeed(a) > 0
    );
    if (candidates.length === 0) break;

    // Find min time to threshold
    let minTime = Infinity;
    for (const actor of candidates) {
      const speed = getActorSpeed(actor);
      const timeToAct = (ATB_THRESHOLD - gauges[actor.characterId]) / speed;
      if (timeToAct < minTime) minTime = timeToAct;
    }

    // Advance all active actors
    for (const actor of battle.initiative) {
      if (!isActive(actor.characterId)) continue;
      gauges[actor.characterId] += getActorSpeed(actor) * minTime;
    }

    // Advance turn clock and emit turn markers
    simTurnGauge += TURN_SPEED * minTime;
    while (simTurnGauge >= ATB_THRESHOLD) {
      simTurnGauge -= ATB_THRESHOLD;
      simTurn++;
      result.push({ type: 'turn', turn: simTurn });
    }

    // Pick best candidate (same tie-breaking as advanceTimeline)
    let best = null;
    for (const actor of candidates) {
      if (gauges[actor.characterId] < ATB_THRESHOLD) continue;
      if (!best
        || gauges[actor.characterId] > gauges[best.characterId]
        || (gauges[actor.characterId] === gauges[best.characterId] && getActorSpeed(actor) > getActorSpeed(best))
        || (gauges[actor.characterId] === gauges[best.characterId] && getActorSpeed(actor) === getActorSpeed(best) && actor.side === 'player' && best.side !== 'player')
      ) {
        best = actor;
      }
    }

    if (best) {
      gauges[best.characterId] -= ATB_THRESHOLD;
      result.push({ type: 'actor', characterId: best.characterId, side: best.side });
      actorCount++;
    }
  }

  return result;
}

/**
 * Execute a full turn for the current actor with staged delays.
 * @param {string} abilityId
 * @param {string} targetPos - "row_col"
 */
export async function executeTurn(abilityId, targetPos) {
  const battle = currentBattle.value;
  const actor = getActiveActor();
  if (!actor) return;

  const speed = game.getState('battle_speed') || 1;

  // Initial delay only for the very first action of the battle
  if (battle._firstAction) {
    battle._firstAction = false;
    await battleDelay(BASE_DELAY);
    if (battle.phase !== 'active') return;
  }

  // Flush turn separator + process token effects (DoT/HoT) on clock turn
  const clockTurnPassed = battle._pendingTurnStart;
  flushTurnStart();

  if (clockTurnPassed && await processClockTurnEffects()) return;
  if (clockTurnPassed && await processAutocastsForTurn()) return;

  battle.log.push({
    turn: battle.turn,
    actorId: actor.characterId,
    text: '',
    abilityId,
    abilitiesSnapshot: buildAbilitySnapshot(actor.characterId, abilityId),
  });

  // Determine animation type from ability meta
  let animType = 'delay';
  let primaryTargetCharId = null;
  let effectiveSide = null;
  let isFriendly = false;
  let isTile = false;
  const casterChar = game.getCharacter(actor.characterId);
  const abilityData = casterChar?.getAbility(abilityId);
  if (abilityData) {
    const meta = abilityData.meta;
    const casterPos = getCharacterPosition(actor.characterId);
    if (casterPos) {
      const isSelf = !!meta.target?.includes('self');
      const isAlly = !isSelf && (!!meta.target?.includes('ally') || !!meta.target?.includes('tile_ally'));
      isTile = !!meta.target?.includes('tile_ally');
      effectiveSide = (isSelf || isAlly)
        ? casterPos.side
        : (casterPos.side === 'player' ? 'enemy' : 'player');
      isFriendly = effectiveSide === casterPos.side;

      const targetGrid = effectiveSide === 'player' ? battle.playerGrid : battle.enemyGrid;
      primaryTargetCharId = targetGrid[targetPos] || null;
      if (isSelf) {
        animType = 'selfCast';
      } else if (isAlly) {
        animType = 'bump';
      } else if ((getEffectiveRange(abilityData) || 1) <= 1) {
        animType = 'lunge';
      } else {
        animType = 'projectile';
      }
    }
  }

  // Pre-cast emitter (semen fuel, ability interception, etc.)
  game.trigger('battle_action_start', battle, casterChar, abilityId, targetPos);

  // Resolve ability into effect steps (costs deducted immediately)
  const steps = resolveAbility(actor.characterId, abilityId, targetPos);

  // Pre-animation for lunge / bump / self-cast (fires ONCE before all effects)
  let lungedActor = null;
  if (animType === 'lunge' && primaryTargetCharId) {
    const firstEffect = steps.find(s => s.aspects);
    if (firstEffect && effectiveSide) {
      targetHighlight.value = { side: effectiveSide, primary: targetPos, cells: firstEffect.cells, isFriendly, borderOnly: isTile };
    }
    lungedActor = await animateLunge(actor.characterId, primaryTargetCharId, speed);
  } else if (animType === 'bump' && primaryTargetCharId) {
    await animateBump(actor.characterId, primaryTargetCharId, speed);
  } else if (animType === 'selfCast') {
    await animateSelfCast(actor.characterId, speed);
  } else if (animType === 'delay') {
    await battleDelay(BASE_DELAY);
  }

  if (battle.phase !== 'active') {
    targetHighlight.value = null;
    if (lungedActor) gsap.set(lungedActor, { x: 0, y: 0, zIndex: '' });
    return;
  }

  // Per-effect loop: each effect gets its own highlight + animation (for ranged)
  for (const step of steps) {
    if (!step.aspects) { step.execute(); continue; } // cooldown step

    if (battle.phase !== 'active') {
      targetHighlight.value = null;
      if (lungedActor) gsap.set(lungedActor, { x: 0, y: 0, zIndex: '' });
      return;
    }

    // Update highlight for this effect's area
    if (effectiveSide) {
      targetHighlight.value = { side: effectiveSide, primary: targetPos, cells: step.cells, isFriendly, borderOnly: isTile };
    }

    // Per-effect projectile (ranged hostile only)
    if (animType === 'projectile' && primaryTargetCharId) {
      await animateProjectile(actor.characterId, primaryTargetCharId, step.aspects.damage_type || 'physical', speed);
      if (battle.phase !== 'active') { targetHighlight.value = null; return; }
    }

    const effects = step.execute();
    parseFloatingTexts(effects);
    for (const effect of effects) {
      battle.log.push({ turn: battle.turn, actorId: actor.characterId, effect });
    }

    // Flush deferred thorns entries (pushed during step.execute via battle_damage_final)
    if (battle._pendingThorns?.length) {
      for (const entry of battle._pendingThorns) battle.log.push(entry);
      battle._pendingThorns = [];
    }

    // Process on_damage_taken autocasts for each damaged target
    for (const effect of effects) {
      if (effect.type === 'damage' && effect.targetId && isAlive(effect.targetId)) {
        const dmgAutoResults = processAutocasts('on_damage_taken', effect.targetId, { attackerId: actor.characterId });
        if (dmgAutoResults.length > 0) {
          parseFloatingTexts(dmgAutoResults);
          for (const e of dmgAutoResults) battle.log.push({ turn: battle.turn, actorId: effect.targetId, effect: e });
        }
      }
    }

    // Check for deaths: defer grid removal so we can animate before disappearing
    const deathResults = [];
    for (const a of battle.initiative) {
      const result = handleDeath(a.characterId, actor.characterId, true);
      if (result && typeof result === 'object') {
        deathResults.push({ characterId: a.characterId, grid: result.grid, key: result.key });
      }
    }
    if (deathResults.length > 0) {
      await Promise.all(deathResults.map(d => animateDeath(d.characterId, speed)));
      for (const d of deathResults) {
        delete d.grid[d.key];
      }
    }

    if (effects.length > 0) {
      await battleDelay(BASE_DELAY);
    }
  }

  // Return from lunge after all effects resolve
  if (lungedActor) {
    await animateLungeReturn(lungedActor, speed);
  }

  targetHighlight.value = null;

  // Post-cast emitter
  game.trigger('battle_action_end', battle, casterChar, abilityId);

  // Process on_attack autocasts
  if (battle.phase === 'active') {
    const autocastResults = processAutocasts('on_attack', actor.characterId, { targetPos });
    if (autocastResults.length > 0) {
      parseFloatingTexts(autocastResults);
      for (const e of autocastResults) battle.log.push({ turn: battle.turn, actorId: actor.characterId, effect: e });
      await battleDelay(BASE_DELAY);
    }
  }

  if (!checkBattleEnd()) {
    advanceTimeline();
  }
}

/**
 * Check if battle has ended (one side wiped).
 * @returns {boolean}
 */
export function checkBattleEnd() {
  const battle = currentBattle.value;
  const playersAlive = getAliveOnSide('player');
  const enemiesAlive = getAliveOnSide('enemy');

  if (playersAlive.length === 0) {
    battle.result = (battle.retreating && battle.retreated.length > 0) ? 'retreat' : 'defeat';
    battle.phase = 'finished';
    return true;
  }

  if (enemiesAlive.length === 0) {
    battle.result = 'victory';
    battle.phase = 'finished';
    return true;
  }

  return false;
}

/**
 * Check if a character is alive.
 * @param {string} characterId
 * @returns {boolean}
 */
export function isAlive(characterId) {
  const character = game.getCharacter(characterId);
  return character && character.getResource('health') > 0;
}

/**
 * Check if a character is active in battle (alive and not retreated).
 * @param {string} characterId
 * @returns {boolean}
 */
export function isActive(characterId) {
  const battle = currentBattle.value;
  return isAlive(characterId) && !battle.retreated.includes(characterId);
}

/**
 * Handle a character's death. Fires battle_character_defeated emitter (cancellable).
 * @param {string} characterId
 * @param {string | null} killerId - characterId of the killer, if any
 * @param {boolean} deferRemoval - if true, skip grid deletion (caller will handle it after animation)
 * @returns {boolean | { grid: object, key: string }} true/object if died, false if survived
 */
export function handleDeath(characterId, killerId = null, deferRemoval = false) {
  const battle = currentBattle.value;
  if (isAlive(characterId)) return false;

  const character = game.getCharacter(characterId);
  if (!character) return false;

  const pos = getCharacterPosition(characterId);
  if (!pos) return false;

  const side = pos.side;
  const arr = side === 'player' ? battle.defeatedPlayer : battle.defeatedEnemy;

  // Already recorded — skip (AoE can trigger multiple times)
  if (arr.includes(characterId)) return false;

  // Death defiance (id-based) — survive at 1 HP, consume 1 stack
  const dd = character.getStatus('death_defiance');
  if (dd && dd.currentStacks > 0) {
    removeStatusStacks(characterId, 'death_defiance', 1);
    character.addResource('health', 1);
    battle.log.push({ turn: battle.turn, actorId: characterId, effect: /** @type {EffectResult} */ ({ type: 'death_defiance', targetId: characterId, statusId: 'death_defiance' }) });
    return false;
  }

  const killer = killerId ? game.getCharacter(killerId) : null;

  // Cancellable — return false from listener = survive with 1 HP
  if (!game.trigger('battle_character_defeated', battle, character, side, killer)) {
    character.addResource('health', 1);
    return false;
  }

  arr.push(characterId);

  // Remove from grid (unless deferred for death animation)
  const grid = side === 'player' ? battle.playerGrid : battle.enemyGrid;
  const key = `${pos.row}_${pos.col}`;
  if (!deferRemoval) {
    delete grid[key];
  }

  // Mark the last damage effect on this target as a kill
  for (let i = battle.log.length - 1; i >= 0; i--) {
    const entry = battle.log[i];
    if (entry.effect?.targetId === characterId && entry.effect.type === 'damage') {
      entry.effect.defeated = true;
      break;
    }
  }

  // Process on_kill autocasts for the killer
  if (killerId) {
    const autoResults = processAutocasts('on_kill', killerId, { killedId: characterId });
    for (const e of autoResults) battle.log.push({ turn: battle.turn, actorId: killerId, effect: e });
  }

  return deferRemoval ? { grid, key } : true;
}

/**
 * Get all alive characters on a side.
 * @param {'player' | 'enemy'} side
 * @returns {{ characterId: string, row: number, col: number }[]}
 */
export function getAliveOnSide(side) {
  const battle = currentBattle.value;
  const grid = side === 'player' ? battle.playerGrid : battle.enemyGrid;
  const results = [];
  for (const key in grid) {
    const charId = grid[key];
    if (isAlive(charId)) {
      const [r, c] = key.split('_').map(Number);
      results.push({ characterId: charId, row: r, col: c });
    }
  }
  return results;
}

export function getAllOnSide(side) {
  const battle = currentBattle.value;
  const grid = side === 'player' ? battle.playerGrid : battle.enemyGrid;
  const defeated = side === 'player' ? battle.defeatedPlayer : battle.defeatedEnemy;
  const results = [];
  for (const key in grid) {
    const charId = grid[key];
    const [r, c] = key.split('_').map(Number);
    results.push({ characterId: charId, row: r, col: c });
  }
  for (const charId of defeated) {
    results.push({ characterId: charId, row: -1, col: -1 });
  }
  if (side === 'player') {
    for (const charId of battle.retreated) {
      results.push({ characterId: charId, row: -1, col: -1 });
    }
  }
  return results;
}

export function getAll() {
  return [...getAllOnSide('player'), ...getAllOnSide('enemy')];
}

/**
 * Check if a character can use a specific ability.
 * @param {string} characterId
 * @param {string} abilityId
 * @param {Record<string, any>} [metaOverride] - Optional meta object for autocast abilities not equipped on the character
 * @returns {boolean}
 */
export function canUseAbility(characterId, abilityId, metaOverride) {
  const battle = currentBattle.value;
  const state = battle.abilitiesState[characterId]?.[abilityId];
  if (!state) return false;

  // Cooldown check
  if (state.cooldown > 0) return false;

  // Charges check (-1 = unlimited)
  if (state.charges === 0) return false;

  const character = game.getCharacter(characterId);
  if (!character) return false;

  const meta = metaOverride || character.getAbility(abilityId)?.meta;
  if (!meta) return false;

  // Cost check
  if (meta.costs) {
    for (const statId in meta.costs) {
      if (character.getResource(statId) < meta.costs[statId]) return false;
    }
  }

  // Health conditions
  const healthRatio = character.getResourceRatio('health') * 100;
  if (meta.caster_min_health && healthRatio >= meta.caster_min_health) return false;
  if (meta.caster_max_health && healthRatio <= meta.caster_max_health) return false;

  // Preparation status requirement
  if (meta.preparation) {
    if (getStatusStacks(characterId, 'preparation') <= 0) return false;
  }

  return true;
}

/**
 * Get all usable abilities for a character.
 * @param {string} characterId
 * @returns {string[]} array of ability IDs
 */
export function getUsableAbilities(characterId) {
  const character = game.getCharacter(characterId);
  if (!character) return [];

  const abilities = character.getAbilities();
  const usable = [];
  for (const abilityId in abilities) {
    if (canUseAbility(characterId, abilityId)) {
      usable.push(abilityId);
    }
  }
  return usable;
}

/**
 * Run one AI-driven turn for the current actor (async).
 * @returns {Promise<boolean>} true if battle is still active
 */
export async function runAutoTurn() {
  const battle = currentBattle.value;
  if (battle.phase !== 'active') return false;

  const actor = getActiveActor();
  if (!actor) return false;

  // Retreating player characters spend their turn retreating instead of fighting
  if (battle.retreating && actor.side === 'player') {
    await executeRetreatTurn(actor);
    return battle.phase === 'active';
  }

  const action = decideAction(actor.characterId);
  battle.chosenAction = action || null;

  if (action) {
    await executeTurn(action.abilityId, action.targetPos);
  } else {
    if (battle._firstAction) {
      battle._firstAction = false;
      await battleDelay(BASE_DELAY);
      if (battle.phase !== 'active') return false;
    }
    const clockTurnPassed = battle._pendingTurnStart;
    flushTurnStart();

    if (clockTurnPassed && await processClockTurnEffects()) return false;
    if (clockTurnPassed && await processAutocastsForTurn()) return false;

    battle.log.push({
      turn: battle.turn,
      actorId: actor.characterId,
      text: game.getLine('log_no_action'),
      abilitiesSnapshot: buildAbilitySnapshot(actor.characterId, null),
    });
    await battleDelay(BASE_DELAY);
    if (!checkBattleEnd()) {
      advanceTimeline();
    }
  }

  return battle.phase === 'active';
}

/**
 * Snapshot all ability states for a character at this moment.
 * @param {string} characterId
 * @param {string | null} chosenAbilityId
 * @returns {AbilitySnapshot[]}
 */
function buildAbilitySnapshot(characterId, chosenAbilityId) {
  const battle = currentBattle.value;
  const character = game.getCharacter(characterId);
  if (!character) return [];
  const abilities = character.getAbilities();
  const result = [];
  for (const abilityId in abilities) {
    const ability = abilities[abilityId];
    if (ability.meta.is_hidden) continue;
    const state = battle.abilitiesState[characterId]?.[abilityId];
    result.push({
      id: abilityId,
      name: ability.meta.name || abilityId,
      icon: ability.meta.icon || null,
      cooldown: state?.cooldown || 0,
      charges: state?.charges ?? -1,
      usable: canUseAbility(characterId, abilityId),
      chosen: abilityId === chosenAbilityId,
    });
  }
  return result;
}

function flushTurnStart() {
  const battle = currentBattle.value;
  if (battle._pendingTurnStart) {
    battle._pendingTurnStart = false;
    battle.log.push({ turn: battle.turn, actorId: '', text: game.getLine('log_turn', { turn: battle.turn }), type: 'turn_start' });
    game.trigger('battle_turn_start', battle, battle.turn);
  }
}

/**
 * Process turn_start autocasts for all alive characters.
 * Called alongside processClockTurnEffects when a clock turn passes.
 * @returns {Promise<boolean>} true if battle ended or phase changed
 */
async function processAutocastsForTurn() {
  const battle = currentBattle.value;
  const speed = game.getState('battle_speed') || 1;
  for (const a of battle.initiative) {
    if (!isActive(a.characterId)) continue;
    const results = processAutocasts('turn_start', a.characterId, {});
    if (results.length > 0) {
      parseFloatingTexts(results);
      for (const e of results) battle.log.push({ turn: battle.turn, actorId: CLOCK_TURN_ACTOR, effect: e });
      await battleDelay(120);
      if (battle.phase !== 'active') return true;
      // Check deaths from autocast damage
      const deathResults = [];
      for (const actor of battle.initiative) {
        const result = handleDeath(actor.characterId, null, true);
        if (result && typeof result === 'object') {
          deathResults.push({ characterId: actor.characterId, grid: result.grid, key: result.key });
        }
      }
      if (deathResults.length > 0) {
        await Promise.all(deathResults.map(d => animateDeath(d.characterId, speed)));
        for (const d of deathResults) delete d.grid[d.key];
        if (checkBattleEnd()) return true;
      }
    }
  }
  return false;
}

/**
 * Tick cooldowns for ALL alive characters (called when a turn-clock round passes).
 */
function tickAllCooldowns() {
  const battle = currentBattle.value;
  for (const actor of battle.initiative) {
    if (!isActive(actor.characterId)) continue;
    const states = battle.abilitiesState[actor.characterId];
    if (!states) continue;
    for (const abilityId in states) {
      if (states[abilityId].cooldown > 0) {
        states[abilityId].cooldown--;
      }
    }
  }
}

// ── Autocast System ──

/**
 * Resolve target positions for an autocast definition.
 * @param {string} targetType - from autocast schema target field
 * @param {string} casterId
 * @param {Record<string, any>} context - trigger-specific context
 * @returns {string[]} array of "row_col" position strings
 */
function resolveAutocastTargets(targetType, casterId, context) {
  const casterPos = getCharacterPosition(casterId);
  if (!casterPos) return [];

  switch (targetType) {
    case 'self':
      return [`${casterPos.row}_${casterPos.col}`];

    case 'all_allies': {
      const allies = getAliveOnSide(/** @type {'player'|'enemy'} */(casterPos.side));
      return allies.map(a => `${a.row}_${a.col}`);
    }

    case 'random_ally': {
      const allies = getAliveOnSide(/** @type {'player'|'enemy'} */(casterPos.side));
      if (allies.length === 0) return [];
      const pick = allies[Math.floor(Math.random() * allies.length)];
      return [`${pick.row}_${pick.col}`];
    }

    case 'lowest_hp_ally': {
      const allies = getAliveOnSide(/** @type {'player'|'enemy'} */(casterPos.side));
      if (allies.length === 0) return [];
      let lowest = null;
      let lowestRatio = Infinity;
      for (const a of allies) {
        const char = game.getCharacter(a.characterId);
        if (!char) continue;
        const ratio = char.getResourceRatio('health');
        if (ratio < lowestRatio) { lowestRatio = ratio; lowest = a; }
      }
      return lowest ? [`${lowest.row}_${lowest.col}`] : [];
    }

    case 'all_enemies': {
      const enemySide = casterPos.side === 'player' ? 'enemy' : 'player';
      const enemies = getAliveOnSide(/** @type {'player'|'enemy'} */(enemySide));
      return enemies.map(e => `${e.row}_${e.col}`);
    }

    case 'random_enemy': {
      const enemySide = casterPos.side === 'player' ? 'enemy' : 'player';
      const enemies = getAliveOnSide(/** @type {'player'|'enemy'} */(enemySide));
      if (enemies.length === 0) return [];
      const pick = enemies[Math.floor(Math.random() * enemies.length)];
      return [`${pick.row}_${pick.col}`];
    }

    case 'attacker': {
      if (!context.attackerId) return [];
      const attackerPos = getCharacterPosition(context.attackerId);
      if (!attackerPos) return [];
      return [`${attackerPos.row}_${attackerPos.col}`];
    }

    case 'attacker_target': {
      if (!context.targetPos) return [];
      return [context.targetPos];
    }

    default:
      return [];
  }
}

/**
 * Convert an ability template (from ability_templates data) to the format resolveAbility expects.
 * @param {any} template - raw template from ability_templates data
 * @returns {{ meta: any, effects: Record<string, any> }}
 */
function convertAbilityTemplate(template) {
  const effects = {};
  for (const eff of template.effects) {
    effects[eff.id] = eff.aspects;
  }
  return { meta: template.meta, effects };
}

/**
 * Process autocasts for a given trigger and caster.
 * Checks autocast definitions, rolls chance, resolves targets, executes abilities.
 * @param {string} trigger - trigger type (battle_start, turn_start, on_attack, on_kill, on_damage_taken)
 * @param {string} casterId
 * @param {Record<string, any>} context - trigger-specific context
 * @returns {EffectResult[]} collected effect logs
 */
export function processAutocasts(trigger, casterId, context) {
  const battle = currentBattle.value;
  const caster = game.getCharacter(casterId);
  if (!caster || !isAlive(casterId)) return [];

  const autocastDefs = game.getData('plugins_data/auto_battler/autocast_definitions', true);
  if (!autocastDefs) return [];

  const abilityTemplates = game.getData('ability_templates', true);

  /** @type {EffectResult[]} */
  const allResults = [];

  for (const [, def] of autocastDefs) {
    if (def.trigger !== trigger) continue;

    // Check if caster has the source stat > 0
    const statValue = caster.getStat(def.source);
    if (!statValue || statValue <= 0) continue;

    // Determine chance: stat_is_chance → stat value = %, otherwise always triggers
    const chance = def.stat_is_chance ? statValue : 100;
    if (Math.random() * 100 >= chance) continue;

    // Filter to usable abilities, then weighted pick
    if (!def.ability || def.ability.length === 0) continue;
    const usable = def.ability.filter(entry => {
      const tmpl = abilityTemplates?.get(entry.id);
      return tmpl && canUseAbility(casterId, entry.id, tmpl.meta);
    });
    if (usable.length === 0) continue;

    const [picked] = game.drawFromCollection(usable, { type: 'weight', count: 1 });
    if (!picked) continue;
    const abilityId = picked.id;

    // Load ability template
    const template = abilityTemplates?.get(abilityId);
    if (!template) continue;
    const ability = convertAbilityTemplate(template);

    // Resolve target positions
    const targetPositions = resolveAutocastTargets(def.target, casterId, context);
    if (targetPositions.length === 0) continue;

    // Log trigger
    const casterName = caster.getName();
    battle.log.push({
      turn: battle.turn,
      actorId: casterId,
      text: `${casterName} triggers ${def.name}!`,
    });

    // Execute ability for each target position
    for (const targetPos of targetPositions) {
      const steps = resolveAbility(casterId, abilityId, targetPos, ability);
      for (const step of steps) {
        const effects = step.execute();
        allResults.push(...effects);
      }
    }
  }

  return allResults;
}
