/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle, addFloatingText } from './rpg-battle-state.mjs';
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

  battle.abilitiesState = {};
  battle.tokens = {};
  battle.defeatedPlayer = [];
  battle.defeatedEnemy = [];

  const allChars = [...battle.playerParty, ...battle.enemyParty];
  for (const charId of allChars) {
    const char = game.getCharacter(charId);
    if (!char) continue;

    // Init ability states
    battle.abilitiesState[charId] = {};
    const abilities = char.getAbilities();
    for (const abId in abilities) {
      const meta = abilities[abId].meta;
      battle.abilitiesState[charId][abId] = {
        cooldown: meta.cd_on_battle_start || 0,
        charges: meta.charges || -1,
      };
    }

    // Init tokens from source stats
    battle.tokens[charId] = {};
    const defs = getTokenDefinitions();
    if (defs) {
      for (const [tokenId, def] of defs) {
        if (!def.source) continue;
        const stacks = char.getStat(def.source) || 0;
        if (stacks > 0) {
          battle.tokens[charId][tokenId] = [{ stacks, source: charId }];
        }
      }
    }

    // Set initial battle_state based on health
    setIdleState(charId);
  }

  // Process turn 1 start through normal flow
  processRoundStart();
  if (battle.activeCharId) {
    startCharacterTurn(battle.activeCharId);
  }
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

  const state = battle.abilitiesState[characterId]?.[abilityId];
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
 * @returns {boolean} true if character can act, false if stunned/skipped/dead
 */
function startCharacterTurn(charId) {
  const battle = currentRpgBattle.value;
  battle.activeCharId = charId;
  battle.activeSide = getSide(charId);
  battle.log.push({ turn: battle.turn, actorId: charId, type: 'char_turn_start' });

  // 1. Tick cooldowns for this character
  tickCooldowns(charId);

  // 2. Drain token durations for this character
  drainCharTokenDurations(charId);

  // 3. Drain battle-tagged status durations for this character
  drainCharStatusDurations(charId);

  // 4. Process DoT/HoT for this character
  const results = processTokenEffects(charId);
  for (const r of results) {
    parseFloatingText(r);
    battle.log.push({ turn: battle.turn, actorId: charId, effect: r });
  }

  // 5. Check if character died from DoT
  if (!isCharAlive(charId)) {
    handleDeath(charId);
    checkBattleEnd();
    return false;
  }

  // 6. Check stun — skip turn
  if (getTokenStacks(charId, 'stun') > 0) {
    removeTokenStacks(charId, 'stun', 1);
    const char = game.getCharacter(charId);
    battle.log.push({ turn: battle.turn, actorId: charId, text: game.getLine('log_stunned', { name: char?.getTrait('name') || charId }) });
    return false;
  }
  return true;
}

/**
 * Advance to the next character's turn.
 * Returns the character ID of the new active character, or null if battle ended.
 * @returns {string | null}
 */
export function advanceToNextTurn() {
  const battle = currentRpgBattle.value;
  if (!battle || isFinished(battle)) return null;

  const total = battle.turnOrder.length;
  for (let i = 0; i < total; i++) {
    battle.turnIndex = (battle.turnIndex + 1) % total;

    // New round when we wrap around
    if (battle.turnIndex === 0) {
      battle.turn++;
      processRoundStart();
      if (isFinished(battle)) return null;
    }

    const charId = battle.turnOrder[battle.turnIndex];
    if (isCharAlive(charId)) {
      if (!startCharacterTurn(charId)) {
        return advanceToNextTurn();
      }
      return charId;
    }
  }

  return null;
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
  const charState = battle.abilitiesState[charId];
  if (!charState) return;
  for (const abId in charState) {
    if (charState[abId].cooldown > 0) charState[abId].cooldown--;
  }
}

/** Tick token durations for a single character, remove expired. @param {string} charId */
function drainCharTokenDurations(charId) {
  const battle = currentRpgBattle.value;
  const charTokens = battle.tokens[charId];
  if (!charTokens) return;
  for (const tokenId in charTokens) {
    const instances = charTokens[tokenId];
    for (let i = instances.length - 1; i >= 0; i--) {
      if (instances[i].duration != null) {
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

  // Check if action is allowed
  if (!game.trigger('battle_action_start', battle, caster, abilityId, targetId)) {
    return [];
  }

  // Log the action
  battle.log.push({ turn: battle.turn, actorId: casterId, abilityId });

  // Flash ability name on caster (AI-controlled characters only)
  if (isAIControlled(casterId)) {
    addFloatingText(casterId, ability.meta?.name || abilityId, 'ability-use', null);
  }

  // Resolve effects
  const results = resolveAbility(casterId, abilityId, targetId);

  // Floating texts
  for (const r of results) {
    parseFloatingText(r);
    battle.log.push({ turn: battle.turn, actorId: casterId, effect: r });
  }

  game.trigger('battle_action_end', battle, caster, abilityId);

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
    if (!isCharAlive(charId) && !battle.defeatedPlayer.includes(charId) && !battle.defeatedEnemy.includes(charId)) {
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
    addFloatingText(characterId, game.getLine('float_death_defiance'), 'death-defiance', null);
    return;
  }

  const side = getSide(characterId);
  if (side === 'player') {
    battle.defeatedPlayer.push(characterId);
  } else {
    battle.defeatedEnemy.push(characterId);
  }

  game.trigger('battle_character_defeated', battle, characterId, side);
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

// ── Floating text helper ──

const NEGATIVE_TYPES = new Set(['damage', 'token_dot', 'thorns']);

/**
 * Convert a single effect result to a floating text entry.
 * @param {RpgEffectResult} effect
 */
function parseFloatingText(effect) {
  if (!effect.targetId) return;

  const e = effect;

  // Shield absorb: show separately
  if (e.type === 'damage' && e.shieldAbsorbed > 0) {
    addFloatingText(e.targetId, game.getLine('float_shield', { amount: e.shieldAbsorbed }), 'shield-absorb', null);
  }

  // Token apply uses token def for icon/color
  if (e.type === 'token_apply') {
    const def = getTokenDefinitions().get(e.tokenId);
    addFloatingText(e.targetId, `+${e.stacks}`, 'token-apply', def?.icon || null, def?.color);
    return;
  }

  const sign = (e.amount != null && e.amount > 0) ? (NEGATIVE_TYPES.has(e.type) ? '-' : '+') : '';
  const text = e.amount != null ? `${sign}${e.amount}`
    : e.statusName || e.statusId || game.getLine(`float_${e.type}`);

  // CSS class determines both styling and icon (via ::before in rpg-battle.css)
  const css = {
    damage: e.isCrit ? `${e.damageType || 'physical'} crit` : (e.damageType || 'physical'),
    token_dot: e.damageType || 'physical', thorns: 'physical',
    heal: 'heal', steal: 'heal', token_hot: 'heal',
    dodge: 'dodge', cleanse: 'cleanse', status_apply: 'status-apply', status_remove: 'status-remove', death_defiance: 'death-defiance',
  }[e.type] || e.type;

  // Status apply/remove: look up icon from status definitions
  let icon = null;
  if ((e.type === 'status_apply' || e.type === 'status_remove') && e.statusId) {
    const statusDefs = game.getData('character_statuses', true);
    icon = statusDefs?.get(e.statusId)?.image || null;
  }

  addFloatingText(e.targetId, text, css, icon);
}
