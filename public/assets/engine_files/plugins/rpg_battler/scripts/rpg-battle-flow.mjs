/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle, addFloatingText, getBattleDisplayName, parseFloatingText } from './rpg-battle-state.mjs';
import {
  resolveAbility, processTokenEffects, getTokenStacks,
  removeTokenStacks, getTokenDefinitions, isCharAlive,
  getSide, isAIControlled,
} from './rpg-battle-effects.mjs';
import { setIdleState } from './rpg-battle-anims.mjs';

const { game } = window.engine;

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

  const allChars = [...battle.playerParty, ...battle.enemyParty];
  for (const charId of allChars) {
    const char = game.getCharacter(charId);
    if (!char) continue;
    const cs = battle.charState[charId];

    // Init ability states
    const abilities = char.getAbilities();
    for (const abId in abilities) {
      const meta = abilities[abId].meta;
      cs.abilities[abId] = {
        cooldown: meta.cd_on_battle_start || 0,
        charges: meta.charges || -1,
      };
    }

    // Init tokens from source stats
    const defs = getTokenDefinitions();
    if (defs) {
      for (const [tokenId, def] of defs) {
        if (!def.source) continue;
        const stacks = char.getStat(def.source) || 0;
        if (stacks > 0) {
          cs.tokens[tokenId] = [{ stacks, source: charId }];
        }
      }
    }

    // Set initial battle_state based on health
    setIdleState(charId);
  }

  // Start turn 1 through normal flow
  advanceToNextTurn();
}

// ── Ability usability ──

/**
 * Check if a character can use an ability.
 * @param {string} characterId
 * @param {string} abilityId
 * @returns {boolean}
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

  // Cooldown check
  if (state.cooldown > 0) return false;

  // Charges check
  if (state.charges === 0) return false;

  // Cost check
  const meta = ability.meta;
  if (meta.costs) {
    for (const statId in meta.costs) {
      if (char.getResource(statId) < meta.costs[statId]) return false;
    }
  }

  // Preparation check
  if (meta.preparation) {
    if (getTokenStacks(characterId, 'preparation') <= 0) return false;
  }

  // Caster health condition
  if (meta.caster_min_health) {
    if (char.getResourceRatio('health') * 100 < meta.caster_min_health) return false;
  }
  if (meta.caster_max_health) {
    if (char.getResourceRatio('health') * 100 > meta.caster_max_health) return false;
  }

  // Stun check
  if (getTokenStacks(characterId, 'stun') > 0) return false;

  // Bonus action limit
  if (meta.bonus_action && battle.charState[characterId].bonusUsed >= 1) return false;

  return true;
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
 * Start a character's turn: tick cooldowns, drain tokens/statuses, process DoT/HoT, check stun.
 * @param {string} charId
 * @returns {{ canAct: boolean, dotResults: RpgEffectResult[] }}
 */
function startCharacterTurn(charId) {
  const battle = currentRpgBattle.value;
  battle.activeCharId = charId;
  battle.activeSide = getSide(charId);
  battle.charState[charId].bonusUsed = 0;
  battle.log.push({ turn: battle.turn, actorId: charId, type: 'char_turn_start' });

  // 1. Tick cooldowns for this character
  tickCooldowns(charId);

  // 2. Process DoT/HoT for this character (before draining so last-turn effects still apply)
  const dotResults = processTokenEffects(charId);

  // 3. Drain token durations for this character
  drainCharTokenDurations(charId);

  // 4. Drain battle-tagged status durations for this character
  drainCharStatusDurations(charId);
  for (const r of dotResults) {
    parseFloatingText(r);
    battle.log.push({ turn: battle.turn, actorId: charId, effect: r });
  }

  // 5. Check if character died from DoT — defer to processDeaths for animations
  if (!isCharAlive(charId)) {
    return { canAct: false, dotResults };
  }

  // 6. Check stun — skip turn
  if (getTokenStacks(charId, 'stun') > 0) {
    removeTokenStacks(charId, 'stun', 1);
    battle.log.push({ turn: battle.turn, actorId: charId, text: game.getLine('log_stunned', { name: getBattleDisplayName(charId) }) });
    return { canAct: false, dotResults };
  }
  return { canAct: true, dotResults };
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
 * Advance to the next character's turn.
 * @returns {{ charId: string | null, dotResults: RpgEffectResult[] }}
 */
export function advanceToNextTurn() {
  const battle = currentRpgBattle.value;
  if (!battle || isFinished(battle)) return { charId: null, dotResults: [] };

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
      if (isFinished(battle)) return { charId: null, dotResults: [] };
    }

    const charId = battle.turnOrder[battle.actorTurn];
    if (isCharAlive(charId)) {
      const { canAct, dotResults } = startCharacterTurn(charId);
      if (!canAct) {
        // Collect dotResults from skipped turns (DoT death, stun)
        const next = advanceToNextTurn();
        return { charId: next.charId, dotResults: [...dotResults, ...next.dotResults] };
      }
      return { charId, dotResults };
    }
  }

  return { charId: null, dotResults: [] };
}

/**
 * Process round start: log cleanup + turn header only.
 * All ticking moved to per-character startCharacterTurn().
 */
function processRoundStart() {
  const battle = currentRpgBattle.value;
  if (!battle) return;

  // Keep previous turn's entries, remove older
  const prevTurn = battle.turn - 1;
  const kept = battle.log.filter(e => e.turn >= prevTurn);
  battle.log.length = 0;
  for (const e of kept) battle.log.push(e);
  battle.log.push({ turn: battle.turn, type: 'turn_start', text: game.getLine('log_turn_start', { turn: battle.turn }) });
  game.trigger('battle_turn_start', battle, battle.turn);
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

/** Tick token durations for a single character, remove expired. @param {string} charId */
function drainCharTokenDurations(charId) {
  const battle = currentRpgBattle.value;
  const charTokens = battle.charState[charId]?.tokens;
  if (!charTokens) return;
  for (const tokenId in charTokens) {
    const instances = charTokens[tokenId];
    for (let i = instances.length - 1; i >= 0; i--) {
      if (instances[i].duration > 0) {
        instances[i].duration--;
        if (instances[i].duration <= 0) instances.splice(i, 1);
      }
    }
    if (instances.length === 0) delete charTokens[tokenId];
  }
}

/** Tick battle-tagged status durations for a single character, remove expired. @param {string} charId */
function drainCharStatusDurations(charId) {
  const char = game.getCharacter(charId);
  if (!char) return;
  for (const status of char.getStatuses()) {
    if (status.tags?.includes('battle') && status.duration > 0) {
      status.duration--;
      if (status.duration <= 0) char.removeStatus(status.id);
    }
  }
}

// ── Action execution ──

/**
 * Execute a player's ability action.
 * @param {string} abilityId
 * @param {string} [targetId]
 * @returns {RpgEffectResult[]}
 */
export function executeAction(abilityId, targetId) {
  const battle = currentRpgBattle.value;
  if (!battle) return [];

  const casterId = battle.activeCharId;
  if (!casterId) return [];

  const caster = game.getCharacter(casterId);
  const ability = caster?.getAbility(abilityId);
  if (!ability) return [];

  // Build mutable action event — listeners can modify abilityId, targetId, power
  const actionEvent = { abilityId, targetId, power: caster.getStat('power') };
  if (!game.trigger('battle_action_start', battle, caster, actionEvent)) {
    return [];
  }

  // Log the action (use potentially mutated abilityId)
  battle.log.push({ turn: battle.turn, actorId: casterId, abilityId: actionEvent.abilityId });

  // Flash ability name on caster (AI-controlled characters only)
  if (isAIControlled(casterId)) {
    const ab = caster.getAbility(actionEvent.abilityId);
    addFloatingText({ characterId: casterId, text: ab?.meta?.name || actionEvent.abilityId, cssClass: 'ability-use' });
  }

  // Resolve effects (results are logged inside resolveAbility, before battle_action_applied)
  const results = resolveAbility(casterId, actionEvent.abilityId, actionEvent.targetId, actionEvent.power);

  game.trigger('battle_action_end', battle, caster, actionEvent.abilityId, results);

  return results;
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
  const ddStacks = getTokenStacks(characterId, 'death_defiance');
  if (ddStacks > 0) {
    removeTokenStacks(characterId, 'death_defiance', 1);
    const char = game.getCharacter(characterId);
    if (char) char.setResource('health', 1);
    addFloatingText({ characterId, text: game.getLine('float_death_defiance'), cssClass: 'death-defiance' });
    return;
  }

  const cs = battle.charState[characterId];
  cs.defeated = true;

  game.trigger('battle_character_defeated', battle, characterId, cs.side);
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

