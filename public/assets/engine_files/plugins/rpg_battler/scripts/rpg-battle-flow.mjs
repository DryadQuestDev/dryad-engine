/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle, addFloatingText, requiredSelfStatuses } from './rpg-battle-state.mjs';
import {
  resolveAbility, processStatusEffects, getStatusStacks,
  removeStatusStacks, getStatusDefinitions, isCharAlive,
  getSide, isAIControlled, checkStaggerThreshold, computeEffectiveThreshold, logEffect, endChannelsBy,
} from './rpg-battle-effects.mjs';
import { setIdleState } from './rpg-battle-anims.mjs';

const { game } = window.engine;

const LOG_VISIBLE_TURNS = 3;

/** @param {RpgBattle} b */
function isFinished(b) { return b.phase === 'finished'; }

// ── Initialization ──

/**
 * Initialize battle tracking: ability states, tokens from source stats.
 * Call after battle object is created and characters are spawned.
 */
export function initBattleTracking() {
  const battle = currentRpgBattle.value;
  if (!battle) return;
  for (const charId of [...battle.playerParty, ...battle.enemyParty]) initCombatantTracking(charId);
}

/**
 * Init per-combatant battle tracking: ability cooldown/charge state, source-stat statuses
 * (e.g. wind_mantle), and initial idle pose. Used at battle start and for mid-battle summons.
 * @param {string} charId
 */
function initCombatantTracking(charId) {
  const battle = currentRpgBattle.value;
  const char = game.getCharacter(charId);
  if (!char || !battle.charState[charId]) return;
  const cs = battle.charState[charId];

  const abilities = char.getAbilities();
  for (const abId in abilities) {
    const meta = abilities[abId].meta;
    cs.abilities[abId] = {
      // +1 compensates for the pre-action tick the character gets on their first turn
      cooldown: meta.cd_on_battle_start ? meta.cd_on_battle_start + 1 : 0,
      charges: meta.charges || -1,
    };
  }

  const defs = getStatusDefinitions();
  if (defs) {
    for (const [statusId, def] of defs) {
      const src = def.meta?.source;
      if (!src) continue;
      const stacks = char.getStat(src) || 0;
      if (stacks > 0) {
        const status = game.createStatus(statusId);
        if (status) char.addStatus(status, { stacks: Math.round(stacks), source: charId });
      }
    }
  }

  setIdleState(charId);
}

/**
 * Add an already-created character to the active battle on `side` as a combatant — registers it,
 * pushes it onto that side's roster, inits its tracking, and inserts it into the turn order among
 * the not-yet-acted so it can act this round based on its speed. Does NOT touch the persistent
 * party. Returns the combatant id (or null).
 * @param {Character} character
 * @param {'player' | 'enemy'} side
 * @returns {string | null}
 */
export function summonCombatant(character, side) {
  const battle = currentRpgBattle.value;
  if (!battle || !character) return null;
  const id = character.id;
  if (battle.charState[id]) return id;

  if (!game.getCharacter(id)) game.addCharacter(character);

  const s = side === 'enemy' ? 'enemy' : 'player';
  battle[s === 'enemy' ? 'enemyParty' : 'playerParty'].push(id);
  battle.summoned.push(id);
  battle.charState[id] = { side: s, battleIndex: 0, abilities: {}, defeated: false, bonusUsed: 0 };
  initCombatantTracking(id);

  const insertAt = Math.min(Math.max(battle.actorTurn + 1, 0), battle.turnOrder.length);
  battle.turnOrder.splice(insertAt, 0, id);
  resortRemainingTurnOrder();
  return id;
}

// ── Ability usability ──

/**
 * Turn-invariant usability gates shared by `canUseAbility` (battle logic) and `previewAbilityUsable`
 * (UI) — charges, cost, self-status requirement, caster health. These don't change at turn start.
 * @param {Character} char @param {any} ability @param {{ charges: number }} state @returns {boolean}
 */
function passesStaticGates(char, ability, state) {
  if (state.charges === 0) return false;
  const meta = ability.meta;
  if (meta.costs) {
    for (const statId in meta.costs) {
      if (char.getResource(statId) < meta.costs[statId]) return false;
    }
  }
  const requiredSelf = requiredSelfStatuses(meta.require_status_self);
  if (requiredSelf.length && !requiredSelf.some((id) => getStatusStacks(char.id, id) > 0)) return false;
  if (meta.caster_min_health && char.getResourceRatio('health') * 100 < meta.caster_min_health) return false;
  if (meta.caster_max_health && char.getResourceRatio('health') * 100 > meta.caster_max_health) return false;
  return true;
}

/**
 * BATTLE LOGIC: can the **acting** character cast this ability **right now**? Strict & current —
 * drives the real cast gate (ability panel) and the AI. (Behaviour unchanged; shares passesStaticGates.)
 * @param {string} characterId @param {string} abilityId @returns {boolean}
 */
export function canUseAbility(characterId, abilityId) {
  const battle = currentRpgBattle.value;
  if (!battle) return false;
  const char = game.getCharacter(characterId);
  if (!char) return false;
  const ability = char.getAbility(abilityId);
  if (!ability) return false;
  const state = battle.charState[characterId]?.abilities[abilityId];
  if (!state) return false;

  if (state.cooldown > 0) return false;
  if (!passesStaticGates(char, ability, state)) return false;
  if (getStatusStacks(characterId, 'stun') > 0) return false;
  if (ability.meta.bonus_action && battle.charState[characterId].bonusUsed >= 1) return false;
  return true;
}

/**
 * UI PREVIEW: will this character be able to use this ability **on their turn**? For greying ability
 * cards while browsing (e.g. inspecting an enemy). Lenient vs `canUseAbility`: projects the imminent
 * turn-start cooldown tick for a non-active character, and ignores stun & bonusUsed (both clear/reset
 * at turn start). Defaults to usable (true) when not in battle or the character isn't a combatant.
 * @param {string} characterId @param {string} abilityId @returns {boolean}
 */
export function previewAbilityUsable(characterId, abilityId) {
  const battle = currentRpgBattle.value;
  if (!battle) return true;
  const char = game.getCharacter(characterId);
  if (!char) return true;
  const ability = char.getAbility(abilityId);
  if (!ability) return true;
  const state = battle.charState[characterId]?.abilities[abilityId];
  if (!state) return true;

  const isActive = characterId === battle.activeCharId;
  const cd = isActive ? state.cooldown : Math.max(0, state.cooldown - 1);
  if (cd > 0) return false;
  return passesStaticGates(char, ability, state);
}

/**
 * Get all usable abilities for a character.
 * @param {string} characterId
 * @returns {string[]}
 */
export function getUsableAbilities(characterId) {
  const char = game.getCharacter(characterId);
  if (!char) return [];
  const abilities = char.getAbilities();
  const usable = [];
  for (const abId in abilities) {
    if (abilities[abId].meta.is_hidden) continue;
    if (canUseAbility(characterId, abId)) usable.push(abId);
  }
  return usable;
}

// ── Turn management ──

/**
 * Select a character for their turn: set active, reset bonus, tick cooldowns.
 * Runs before the camera zoom so it sets who the camera focuses.
 * @param {string} charId
 */
function beginCharacterTurn(charId) {
  const battle = currentRpgBattle.value;
  battle.activeCharId = charId;
  battle.activeSide = getSide(charId);
  battle.charState[charId].bonusUsed = 0;
  battle.log.push({ turn: battle.turn, actorId: charId, type: 'char_turn_start' });
  tickCooldowns(charId);
}

/**
 * Consume one `stun` stack if present (pure — no messaging). Returns true if the character was
 * stunned. A stun stack costs exactly one action: consume it at the point it forfeits an action
 * (turn start, or a mid-turn self-stun) so it never double-skips.
 * @param {string} charId @returns {boolean}
 */
export function consumeStun(charId) {
  if (getStatusStacks(charId, 'stun') <= 0) return false;
  removeStatusStacks(charId, 'stun', 1);
  return true;
}

/**
 * Tick the active character's turn-start effects (DoT/HoT, status drain, stagger, stun).
 * Run after the camera has zoomed in, so the flash and any death read clearly.
 * @param {string} charId
 * @returns {{ canAct: boolean, dotResults: RpgEffectResult[] }}
 */
export function tickActiveCharacter(charId) {
  const battle = currentRpgBattle.value;

  // Process DoT/HoT for this character (before draining so last-turn effects still apply)
  const dotResults = processStatusEffects(charId);

  // Snapshot effective stagger threshold BEFORE status drain (for bonus-loss bookkeeping)
  const prevStaggerThreshold = computeEffectiveThreshold(charId);

  // 4. Drain battle-tagged status durations for this character
  drainCharStatusDurations(charId);
  for (const r of dotResults) logEffect(battle, charId, r);

  // 4.5. Bonus-loss bookkeeping: when a threshold-bonus status (Braced) expires,
  //      remove the stagger that was accumulated in the bonus zone.
  const newStaggerThreshold = computeEffectiveThreshold(charId);
  if (newStaggerThreshold < prevStaggerThreshold) {
    const currentStagger = getStatusStacks(charId, 'stagger');
    if (currentStagger > 0) {
      const bonusLost = prevStaggerThreshold - newStaggerThreshold;
      const removeAmount = Math.min(currentStagger, bonusLost);
      if (removeAmount > 0) removeStatusStacks(charId, 'stagger', removeAmount);
    }
  }

  // 4.6. Stagger threshold check (defense-in-depth; should not fire after bonus-loss math)
  checkStaggerThreshold(charId);

  // 4.7. Public per-character turn-tick emitter (for game/plugin consumers)
  game.trigger('character_turn_post_tick', charId);

  // 5. Check if character died from DoT — defer to processDeaths for animations
  if (!isCharAlive(charId)) {
    return { canAct: false, dotResults };
  }

  // 6. Check stun — skip turn (turn-start consume shows the "recover" float)
  if (consumeStun(charId)) {
    const stunDef = getStatusDefinitions().get('stun');
    addFloatingText({
      characterId: charId,
      text: game.getLine('float_recover'),
      cssClass: 'status-apply',
      icon: stunDef?.image || null,
      color: stunDef?.color,
    });
    battle.log.push({ turn: battle.turn, actorId: charId, targetId: charId, text: game.getLine('log_stunned') });
    return { canAct: false, dotResults };
  }

  return { canAct: true, dotResults };
}

/**
 * Re-fire the character's active channels from their frozen cast-time snapshots. Logs a cast entry
 * and flashes the ability name (a distinct `ability-channel` colour vs a normal cast), then resolves
 * each at its snapshotted power + effects. Returns the combined results so the caller can animate +
 * await them; effects are still floated/logged inside resolveAbility.
 * @param {string} charId @returns {RpgEffectResult[]}
 */
export function refireChannels(charId) {
  const battle = currentRpgBattle.value;
  const c = game.getCharacter(charId);
  if (!battle || !c) return [];
  /** @type {RpgEffectResult[]} */
  const results = [];
  for (const st of [...c.getStatuses()]) {
    const snap = st.meta?.channel_snapshot;
    if (!snap) continue;
    battle.log.push({ turn: battle.turn, actorId: charId, abilityId: snap.abilityId });
    addFloatingText({ characterId: charId, text: snap.ability?.meta?.name || snap.abilityId, cssClass: 'ability-channel' });
    results.push(...resolveAbility(charId, snap.abilityId, undefined, { isBounce: true, actionPower: snap.power, ability: snap.ability }));
  }
  return results;
}

/**
 * Re-sort remaining characters (after actorTurn) by current speed.
 * Characters who already acted this round keep their positions.
 */
function resortRemainingTurnOrder() {
  const battle = currentRpgBattle.value;
  if (!battle) return;
  const startIdx = battle.actorTurn + 1;
  if (startIdx >= battle.turnOrder.length) return;
  const remaining = battle.turnOrder.slice(startIdx);
  const playerSet = new Set(battle.playerParty);
  remaining.sort((a, b) => {
    const speedA = game.getCharacter(a)?.getStat('speed') || 0;
    const speedB = game.getCharacter(b)?.getStat('speed') || 0;
    if (speedB !== speedA) return speedB - speedA;
    if (playerSet.has(a) && !playerSet.has(b)) return -1;
    if (!playerSet.has(a) && playerSet.has(b)) return 1;
    return 0;
  });
  battle.turnOrder.splice(startIdx, remaining.length, ...remaining);
}

/**
 * Full re-sort of turn order by current speed. Called at round start.
 */
export function resortFullTurnOrder() {
  const battle = currentRpgBattle.value;
  if (!battle) return;
  const playerSet = new Set(battle.playerParty);
  battle.turnOrder.sort((a, b) => {
    const speedA = game.getCharacter(a)?.getStat('speed') || 0;
    const speedB = game.getCharacter(b)?.getStat('speed') || 0;
    if (speedB !== speedA) return speedB - speedA;
    if (playerSet.has(a) && !playerSet.has(b)) return -1;
    if (!playerSet.has(a) && playerSet.has(b)) return 1;
    return 0;
  });
}

/**
 * Advance to the next alive character and select them (no DoT/stun tick — the screen pipeline
 * calls tickActiveCharacter after the zoom). Skipping of DoT-dead / stunned characters happens
 * in the pipeline, one character at a time.
 * @returns {string | null} the selected character id, or null if none / battle finished
 */
export function advanceToNextTurn() {
  const battle = currentRpgBattle.value;
  if (!battle || isFinished(battle)) return null;

  // Re-sort remaining characters by current speed after each turn
  resortRemainingTurnOrder();

  const total = battle.turnOrder.length;
  for (let i = 0; i < total; i++) {
    battle.actorTurn = (battle.actorTurn + 1) % total;

    // New round when we wrap around
    if (battle.actorTurn === 0) {
      battle.turn++;
      resortFullTurnOrder();
      processRoundStart();
      if (isFinished(battle)) return null;
    }

    const charId = battle.turnOrder[battle.actorTurn];
    if (isCharAlive(charId)) {
      beginCharacterTurn(charId);
      return charId;
    }
  }

  return null;
}

/**
 * Process round start: log cleanup + turn header only.
 * All ticking moved to per-character tickActiveCharacter().
 */
function processRoundStart() {
  const battle = currentRpgBattle.value;
  if (!battle) return;

  const oldestKept = battle.turn - (LOG_VISIBLE_TURNS - 1);
  const kept = battle.log.filter(e => e.turn >= oldestKept);
  battle.log.length = 0;
  for (const e of kept) battle.log.push(e);
  battle.log.push({ turn: battle.turn, type: 'turn_start', text: game.getLine('log_turn_start', { turn: battle.turn }) });
  game.trigger('battle_turn_start', battle.turn);
}

/** Decrement cooldowns for a single character. @param {string} charId */
function tickCooldowns(charId) {
  const battle = currentRpgBattle.value;
  const abilities = battle.charState[charId]?.abilities;
  if (!abilities) return;
  for (const abId in abilities) {
    if (abilities[abId].cooldown > 0) abilities[abId].cooldown--;
  }
}

/** Tick meta.is_battle status durations for a single character, remove expired. @param {string} charId */
function drainCharStatusDurations(charId) {
  const char = game.getCharacter(charId);
  if (!char) return;
  // Snapshot statuses with their meta — tickStatusDuration may remove the status, mutating getStatuses
  const battleIds = char.getStatuses().filter(s => s.meta?.is_battle).map(s => s.id);
  for (const id of battleIds) char.tickStatusDuration(id, 1);
}

// ── Action execution ──

/**
 * When an equipped item with the `battle_consumable` trait grants the cast ability, reduce one
 * dose (item.quantity) from it. Walks getEquippedItems() in slot order so the leftmost stack
 * drains first; reduceItemQuantity auto-removes the Item (and therefore unequips it and drops the
 * status that granted the ability) when quantity hits 0.
 * @param {Character} caster
 * @param {string} abilityId
 */
export function consumeBattleConsumable(caster, abilityId) {
  if (!caster) return;
  for (const item of caster.getEquippedItems()) {
    if (!item?.traits?.battle_consumable) continue;
    const grantedAbilities = item.statusObject?.abilities || [];
    if (!grantedAbilities.includes(abilityId)) continue;
    const inv = caster.getPartyInventory();
    if (inv) inv.reduceItemQuantity(item, 1, caster);
    return; // one dose per cast
  }
}

/**
 * Execute a player's ability action.
 * Returns null when the cast didn't happen (no battle, no caster, no ability, or
 * `battle_action_start` veto) so callers can skip consume / animations. Returns the
 * results array (possibly empty) when the cast resolved.
 * @param {string} abilityId
 * @param {string} [targetId]
 * @returns {RpgEffectResult[] | null}
 */
export function executeAction(abilityId, targetId) {
  const battle = currentRpgBattle.value;
  if (!battle) return null;

  const casterId = battle.activeCharId;
  if (!casterId) return null;

  const caster = game.getCharacter(casterId);
  const ability = caster?.getAbility(abilityId);
  if (!ability) return null;

  // Build mutable action event — listeners can redirect abilityId/targetId or cancel
  const actionEvent = { abilityId, targetId };
  if (!game.trigger('battle_action_start', caster, actionEvent)) {
    return null;
  }

  // Log the action (use potentially mutated abilityId)
  battle.log.push({ turn: battle.turn, actorId: casterId, abilityId: actionEvent.abilityId });

  // Resolve effects (results are logged inside resolveAbility, before battle_action_applied)
  const results = resolveAbility(casterId, actionEvent.abilityId, actionEvent.targetId);

  game.trigger('battle_action_end', caster, actionEvent.abilityId, results);

  return results;
}

/**
 * Float the ability's name on an AI-controlled caster (the "ability-use" cast flash). Timed by the
 * cast animation (`animateCast`'s `onCast`) so it shows at the lunge peak / projectile launch.
 * @param {string} casterId @param {string} abilityId
 */
export function flashAbilityName(casterId, abilityId) {
  if (!isAIControlled(casterId)) return;
  const ab = game.getCharacter(casterId)?.getAbility(abilityId);
  addFloatingText({ characterId: casterId, text: ab?.meta?.name || abilityId, cssClass: 'ability-use' });
}

/**
 * Process deaths and check battle end. Call AFTER animateEffects so death animations play first.
 */
export function processDeaths() {
  const battle = currentRpgBattle.value;
  if (!battle) return;

  const allChars = [...battle.playerParty, ...battle.enemyParty];
  for (const charId of allChars) {
    if (!isCharAlive(charId) && !battle.charState[charId]?.defeated) {
      handleDeath(charId);
    }
  }

  checkBattleEnd();
}

// ── Death handling ──

/**
 * Handle character death.
 * @param {string} characterId
 */
export function handleDeath(characterId) {
  const battle = currentRpgBattle.value;
  if (!battle) return;

  // Check death defiance
  const ddStacks = getStatusStacks(characterId, 'death_defiance');
  if (ddStacks > 0) {
    removeStatusStacks(characterId, 'death_defiance', 1);
    const char = game.getCharacter(characterId);
    if (char) char.setResource('health', 1);
    addFloatingText({ characterId, text: game.getLine('float_death_defiance'), cssClass: 'death-defiance' });
    return;
  }

  const cs = battle.charState[characterId];
  cs.defeated = true;

  // A defeated caster's channels end, same as on stun.
  endChannelsBy(characterId);

  game.trigger('battle_character_defeated', characterId, cs.side);
}

/**
 * Check if battle should end.
 * @returns {boolean}
 */
export function checkBattleEnd() {
  const battle = currentRpgBattle.value;
  if (!battle || isFinished(battle)) return true;

  const playersAlive = battle.playerParty.some(id => isCharAlive(id));
  const enemiesAlive = battle.enemyParty.some(id => isCharAlive(id));

  if (!enemiesAlive) {
    battle.result = 'victory';
    battle.phase = 'finished';
    // Mark defeated at the moment of victory (not at teardown) so battle_defeated listeners
    // (defeat rewards) run before the result overlay renders.
    if (battle.battleId) game.getService('rpg_battle').addDefeated(battle.battleId);
    game.setMusic('victory');
    return true;
  }
  if (!playersAlive) {
    battle.result = 'defeat';
    battle.phase = 'finished';
    return true;
  }
  return false;
}

