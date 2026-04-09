/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle, getBattleDisplayName } from './rpg-battle-state.mjs';
import {
  calculateRawDamage, applyDefenses, getTokenStacks, getTokenDefinitions,
  getSide, getAliveEnemies, getAliveAllies, isCharAlive, expandSplashTargets,
} from './rpg-battle-effects.mjs';
import { getUsableAbilities, canUseAbility } from './rpg-battle-flow.mjs';

const { game } = window.engine;

const WEIGHTS = {
  DAMAGE: 0.1,
  HEALING: 0.15,
  SHIELD: 0.08,
  EXECUTE_BONUS: 5,
  AOE_PER_TARGET: 2,
  TOKEN_SETUP: 8,
  CLEANSE: 4,
  CD_REFRESH: 3,
  OVERKILL_PENALTY: -2,
};

/**
 * Pick the best (ability, target) pair for a character.
 * @param {string} characterId
 * @returns {RpgAIAction | null}
 */
export function decideAction(characterId) {
  const usable = getUsableAbilities(characterId);
  if (usable.length === 0) return null;

  let bestScore = -Infinity;
  /** @type {RpgAIAction | null} */
  let bestAction = null;

  for (const abilityId of usable) {
    const targets = getValidTargets(characterId, abilityId);
    for (const targetId of targets) {
      const score = scoreAbilityTarget(characterId, abilityId, targetId);
      if (score > bestScore) {
        bestScore = score;
        bestAction = { abilityId, targetId };
      }
    }
  }

  if (game.isDevMode() && bestAction) {
    const character = game.getCharacter(characterId);
    const name = getBattleDisplayName(characterId);
    const ability = character?.getAbility(bestAction.abilityId);
    const targetName = getBattleDisplayName(bestAction.targetId);
    console.log(`[RPG AI] ${name} → ${ability?.meta?.name || bestAction.abilityId} on ${targetName} (score: ${bestScore.toFixed(1)})`);
  }

  return bestAction;
}

/**
 * Get valid target character IDs for an ability.
 * @param {string} characterId
 * @param {string} abilityId
 * @returns {string[]}
 */
export function getValidTargets(characterId, abilityId) {
  const character = game.getCharacter(characterId);
  if (!character) return [];
  const ability = character.getAbility(abilityId);
  if (!ability) return [];

  const targetType = ability.meta.target || 'enemy';

  /** @type {string[]} */
  let targets = [];

  switch (targetType) {
    case 'self':
      targets = [characterId];
      break;
    case 'enemy':
      targets = getAliveEnemies(characterId);
      break;
    case 'ally':
      targets = getAliveAllies(characterId).filter(id => id !== characterId);
      break;
    case 'self_and_ally':
      targets = getAliveAllies(characterId);
      break;
    case 'all_enemies':
      // AoE — only need one dummy target since it hits all
      targets = getAliveEnemies(characterId).slice(0, 1);
      break;
    case 'all_allies':
      targets = getAliveAllies(characterId).slice(0, 1);
      break;
    case 'any': {
      const enemies = getAliveEnemies(characterId);
      const allies = getAliveAllies(characterId);
      targets = [...enemies, ...allies];
      break;
    }
  }

  // Taunt enforcement: if any enemy has taunt, can only target taunters
  if (targetType === 'enemy' || targetType === 'any') {
    const enemies = getAliveEnemies(characterId);
    const taunters = enemies.filter(id => getTokenStacks(id, 'taunt') > 0);
    if (taunters.length > 0 && targetType === 'enemy') {
      targets = taunters;
    }
  }

  // Health threshold filtering
  const meta = ability.meta;
  if (meta.target_min_health || meta.target_max_health) {
    targets = targets.filter(id => {
      const t = game.getCharacter(id);
      if (!t) return false;
      const pct = t.getResourceRatio('health') * 100;
      if (meta.target_min_health && pct > meta.target_min_health) return false;
      if (meta.target_max_health && pct < meta.target_max_health) return false;
      return true;
    });
  }

  return targets;
}

/**
 * Score an (ability, target) pair for AI decision making.
 * @param {string} characterId
 * @param {string} abilityId
 * @param {string} targetId
 * @returns {number}
 */
function scoreAbilityTarget(characterId, abilityId, targetId) {
  const battle = currentRpgBattle.value;
  const character = game.getCharacter(characterId);
  const ability = character.getAbility(abilityId);
  const meta = ability.meta;
  const targetType = meta.target || 'enemy';

  let score = meta.base_weight || 5;

  // Resolve actual targets for scoring
  let effectTargetIds;
  if (targetType === 'all_enemies') effectTargetIds = getAliveEnemies(characterId);
  else if (targetType === 'all_allies') effectTargetIds = getAliveAllies(characterId);
  else effectTargetIds = [targetId];

  for (const effectId in ability.effects) {
    const aspects = ability.effects[effectId];

    // Expand for splash scoring
    const scoreTargets = aspects.splash
      ? expandSplashTargets(characterId, effectTargetIds, aspects.splash, aspects.splash_only)
      : effectTargetIds;

    // AoE bonus
    if (scoreTargets.length > 1) {
      score += WEIGHTS.AOE_PER_TARGET * (scoreTargets.length - 1);
    }

    // Score damage
    if (aspects.damage) {
      let totalDmg = 0;
      for (const tId of scoreTargets) {
        const target = game.getCharacter(tId);
        if (!target || !isCharAlive(tId)) continue;

        const { raw } = calculateRawDamage(character, aspects, target);
        const dmg = applyDefenses(raw, aspects.damage_type || 'physical', target);
        totalDmg += dmg;

        const targetHp = target.getResource('health');
        const shield = getTokenStacks(tId, 'shield');
        const effectiveHp = targetHp + shield;

        if (dmg >= effectiveHp) score += WEIGHTS.EXECUTE_BONUS;
        if (dmg > effectiveHp * 1.5) score += WEIGHTS.OVERKILL_PENALTY;
      }
      score += WEIGHTS.DAMAGE * totalDmg;
    }

    // Score healing
    if (aspects.healing) {
      for (const tId of scoreTargets) {
        const target = game.getCharacter(tId);
        if (!target || !isCharAlive(tId)) continue;

        const maxHp = target.getStat('health');
        const currentHp = target.getResource('health');
        const missingHp = maxHp - currentHp;
        if (missingHp <= 0) continue;

        const healAmp = character.getStat('heal_amplification') || 0;
        const healAmount = Math.round(character.getStat('power') * (aspects.healing / 100) * ((100 + healAmp) / 100));
        const effectiveHeal = Math.min(healAmount, missingHp);
        const missingRatio = missingHp / maxHp;

        score += WEIGHTS.HEALING * effectiveHeal * missingRatio;
      }
    }

    // Score token apply
    if (aspects.token_apply) {
      const stacks = aspects.token_stacks || 1;
      score += WEIGHTS.SHIELD * stacks * scoreTargets.length;
    }
    if (aspects.token_apply_self) {
      const stacks = aspects.token_stacks_self || 1;
      score += WEIGHTS.SHIELD * stacks;
    }

    // Token setup scoring
    if (aspects.token_apply_self === 'preparation') {
      const abilities = character.getAbilities();
      for (const abId in abilities) {
        if (abilities[abId].meta.preparation) { score += WEIGHTS.TOKEN_SETUP; break; }
      }
    }
    if (aspects.token_apply === 'combo') {
      const abilities = character.getAbilities();
      for (const abId in abilities) {
        const effs = abilities[abId].effects;
        for (const eId in effs) {
          if (effs[eId].combo) { score += WEIGHTS.TOKEN_SETUP; break; }
        }
      }
    }

    // Cleanse scoring
    if (aspects.cleanse) {
      const defs = getTokenDefinitions();
      const cSide = getSide(characterId);
      for (const tId of scoreTargets) {
        const tSide = getSide(tId);
        const removePolarity = (cSide === tSide) ? 'negative' : 'positive';
        const charTokens = battle.charState[tId]?.tokens;
        if (charTokens) {
          for (const tokenId in charTokens) {
            if (defs.get(tokenId)?.polarity === removePolarity && charTokens[tokenId].length > 0) {
              score += WEIGHTS.CLEANSE;
            }
          }
        }
      }
    }

    // Cooldown refresh scoring
    if (aspects.cooldown_change && aspects.cooldown_change < 0) {
      const states = battle.charState[characterId]?.abilities;
      if (states) {
        let onCd = 0;
        for (const abId in states) {
          if (states[abId].cooldown > 0) onCd++;
        }
        score += WEIGHTS.CD_REFRESH * onCd;
      }
    }
  }

  return score;
}
