/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle, getBattleDisplayName } from './rpg-battle-state.mjs';
import {
  calculateRawDamage, applyDefenses, getStatusStacks, getStatusDefinitions,
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
  CHANNEL_REDUNDANT: -1000,
  STUN_VS_CHANNEL: 8,
};

/**
 * Heuristic value of applying `baseStacks` of a status to `holderId`. Only the stacks that actually
 * land under the status's cap (`max_stacks`; 0/undefined = unlimited) are rewarded — applying 2 to a
 * holder at 9/10 scores for 1. A fully wasted apply (holder already at/over cap, e.g. re-applying a
 * single-stack status, or any stacks at max) scores negative.
 * @param {string} holderId @param {string} statusId @param {number} baseStacks
 * @returns {number}
 */
function scoreStatusApply(holderId, statusId, baseStacks) {
  const max = getStatusDefinitions().get(statusId)?.max_stacks;
  const cap = (max && max > 0) ? max : Infinity;
  const landed = Math.min(baseStacks, Math.max(cap - getStatusStacks(holderId, statusId), 0));
  return (landed <= 0 ? -baseStacks : landed) * WEIGHTS.SHIELD;
}

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
    const taunters = enemies.filter(id => getStatusStacks(id, 'taunt') > 0);
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

  // Strongly avoid starting a channel while already channelling — it would just replace the active
  // one (one channel per caster), wasting the cast.
  if (meta.channel && character.getStatuses().some(st => st.meta?.channel_snapshot)) {
    score += WEIGHTS.CHANNEL_REDUNDANT;
  }

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
        const shield = getStatusStacks(tId, 'shield');
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
        const healAmount = Math.round(character.getStat('power') * (aspects.healing / 100) * (1 + healAmp / 100));
        const effectiveHeal = Math.min(healAmount, missingHp);
        const missingRatio = missingHp / maxHp;

        score += WEIGHTS.HEALING * effectiveHeal * missingRatio;
      }
    }

    // Score self-heal (against the caster's own missing HP)
    if (aspects.healing_self) {
      const maxHp = character.getStat('health');
      const missingHp = maxHp - character.getResource('health');
      if (missingHp > 0) {
        const healAmp = character.getStat('heal_amplification') || 0;
        const healAmount = Math.round(character.getStat('power') * (aspects.healing_self / 100) * (1 + healAmp / 100));
        score += WEIGHTS.HEALING * Math.min(healAmount, missingHp) * (missingHp / maxHp);
      }
    }

    // Score status apply per scope — only stacks that land under the cap count; a fully wasted
    // apply (holder at/over cap) scores negative. See scoreStatusApply.
    const scoreApplyScope = (applyList, stacks, holders) => {
      if (!applyList?.length) return;
      for (const sid of applyList) for (const hid of holders) score += scoreStatusApply(hid, sid, stacks);
    };
    scoreApplyScope(aspects.status_apply_target, aspects.status_stacks_target || 1, scoreTargets);
    scoreApplyScope(aspects.status_apply_self, aspects.status_stacks_self || 1, [characterId]);
    scoreApplyScope(aspects.status_apply_allies, aspects.status_stacks_allies || 1, getAliveAllies(characterId));
    scoreApplyScope(aspects.status_apply_enemies, aspects.status_stacks_enemies || 1, getAliveEnemies(characterId));

    // Stagger/stun ends or pushes toward ending a channel — prioritize it against a channelling opponent.
    const channelBreak = (applyList, holders) => {
      if (!applyList?.length || (!applyList.includes('stun') && !applyList.includes('stagger'))) return;
      for (const hid of holders) {
        const t = game.getCharacter(hid);
        if (t?.getStatuses().some(st => st.meta?.is_channel)) score += WEIGHTS.STUN_VS_CHANNEL;
      }
    };
    channelBreak(aspects.status_apply_target, scoreTargets);
    channelBreak(aspects.status_apply_enemies, getAliveEnemies(characterId));

    // Score status remove per scope — reward removing a status a holder actually has (cleanse-like).
    const scoreRemoveScope = (removeList, holders) => {
      if (!removeList?.length) return;
      for (const sid of removeList) for (const hid of holders) if (getStatusStacks(hid, sid) > 0) score += WEIGHTS.CLEANSE;
    };
    scoreRemoveScope(aspects.status_remove_target, scoreTargets);
    scoreRemoveScope(aspects.status_remove_self, [characterId]);
    scoreRemoveScope(aspects.status_remove_allies, getAliveAllies(characterId));
    scoreRemoveScope(aspects.status_remove_enemies, getAliveEnemies(characterId));

    // Setup synergy: applying a status that one of the character's own abilities requires
    // (self-applied → require_status_self gate; target-applied → require_status_target gate).
    const selfApplied = aspects.status_apply_self || [];
    const targetApplied = [...(aspects.status_apply_target || []), ...(aspects.status_apply_allies || []), ...(aspects.status_apply_enemies || [])];
    if (selfApplied.length || targetApplied.length) {
      const abilities = character.getAbilities();
      let synergy = false;
      for (const abId in abilities) {
        const ab = abilities[abId];
        if (ab.meta?.require_status_self && selfApplied.includes(ab.meta.require_status_self)) { synergy = true; break; }
        for (const eId in ab.effects) {
          const req = ab.effects[eId].require_status_target;
          if (req && targetApplied.includes(req)) { synergy = true; break; }
        }
        if (synergy) break;
      }
      if (synergy) score += WEIGHTS.TOKEN_SETUP;
    }

    // Cleanse scoring (reads status.meta directly; polarity may still come from the def for display)
    if (aspects.cleanse) {
      const defs = getStatusDefinitions();
      const cSide = getSide(characterId);
      for (const tId of scoreTargets) {
        const tSide = getSide(tId);
        const removePolarity = (cSide === tSide) ? 'negative' : 'positive';
        const target = game.getCharacter(tId);
        if (!target) continue;
        for (const status of target.getStatuses()) {
          if (!status.meta?.is_battle || status.currentStacks <= 0) continue;
          const polarity = status.polarity || defs.get(status.id)?.polarity;
          if (polarity === removePolarity) score += WEIGHTS.CLEANSE;
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
