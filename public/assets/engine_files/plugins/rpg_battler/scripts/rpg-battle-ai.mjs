/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle, getBattleDisplayName, requiredSelfStatuses } from './rpg-battle-state.mjs';
import {
  calculateRawDamage, applyDefenses, getStatusStacks, getStatusDefinitions,
  getSide, getAliveEnemies, getAliveAllies, isCharAlive,
} from './rpg-battle-effects.mjs';
import { getUsableAbilities, canUseAbility, sideFreeSlots } from './rpg-battle-flow.mjs';

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
  SUMMON_BASE: 30,
  SUMMON_OVERFLOW: -28,
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

  // Splash spills to neighbours, summed ability-level across effects. Value it as fractional extra
  // AoE so the AI still favours splash-heavy casts. Damage and status shares are scored together —
  // an ability that only spills statuses is still worth aiming into a crowd.
  const splashCount = Object.values(ability.effects).reduce((n, a) => n + (a.splash_count || 0), 0);
  const splashPct = Object.values(ability.effects).reduce((n, a) => n + (a.splash_damage || 0), 0);
  const splashStatusPct = Object.values(ability.effects).reduce((n, a) => n + (a.splash_statuses || 0), 0);
  const splashShare = Math.max(splashPct, splashStatusPct);
  if (splashCount > 0 && splashShare > 0) score += WEIGHTS.AOE_PER_TARGET * splashCount * (splashShare / 100);

  // Flurry re-resolves the whole ability on the same target — its damage effectively multiplies.
  // Bounce hops stay unscored (they land on OTHER targets the score isn't about), but a flurry's
  // extra strikes hit the scored target, so ignoring them would undervalue multi-hit kits.
  // flurry is the TOTAL strike count (primary included) — unauthored or ≤1 means a single hit.
  const flurryHits = Math.max(1, Object.values(ability.effects).reduce((n, a) => n + (a.flurry || 0), 0));

  for (const effectId in ability.effects) {
    const aspects = ability.effects[effectId];

    // Mirror resolve-time gating: an effect with require_status_target silently skips targets
    // lacking the status, so score it only against targets it would actually touch. Without this
    // the AI casts a gated payoff (Warden's Focus) at unmarked targets — a whiffed turn that
    // still pays the cooldown.
    const scoreTargets = aspects.require_status_target
      ? effectTargetIds.filter(id => getStatusStacks(id, aspects.require_status_target) > 0)
      : effectTargetIds;

    // Summoning: reinforcements carry no damage number to score, so weight them explicitly —
    // full SUMMON_BASE when the whole clutch fits ("summoners summon"), collapsing by
    // SUMMON_OVERFLOW per unit that would fizzle at the cap, so a partial clutch waits for the
    // ranks to thin instead of wasting the cast. Zero slots never reaches scoring at all:
    // canUseAbility greys the ability first.
    if (aspects.summon) {
      const amount = Math.max(1, Math.round(aspects.summon_amount ?? 1));
      const overflow = Math.max(0, amount - sideFreeSlots(getSide(characterId)));
      score += WEIGHTS.SUMMON_BASE + WEIGHTS.SUMMON_OVERFLOW * overflow;
    }

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
        // Per-hit defenses, then the flurry multiplier — armor pays per strike, and the
        // execute/overkill reads below want the full multi-hit total.
        const dmg = applyDefenses(raw, aspects.damage_type || 'physical', target) * flurryHits;
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
        if (requiredSelfStatuses(ab.meta?.require_status_self).some((id) => selfApplied.includes(id))) { synergy = true; break; }
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
