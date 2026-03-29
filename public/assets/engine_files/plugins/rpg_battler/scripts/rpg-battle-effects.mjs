/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle } from './rpg-battle-state.mjs';

const { game } = window.engine;

const ELEMENTAL_TYPES = ['fire', 'water', 'air', 'earth', 'arcane', 'poison', 'light', 'dark'];

// ── Scaling ──

/**
 * All damage/healing in RPG battler scales from power.
 * @param {Character} caster
 * @returns {number}
 */
function getScalingStat(caster) {
  return caster.getStat('power');
}

// ── Token helpers ──

/** @returns {Map<string, RpgTokenDefinition>} */
export function getTokenDefinitions() {
  return game.getData('plugins_data/rpg_battler/token_definitions', true);
}

/**
 * Apply stacks as a new independent instance (DD-style: each apply creates a separate instance).
 * @param {string} characterId
 * @param {string} tokenId
 * @param {number} stacks
 * @param {number} [duration]
 * @param {string} [source]
 * @returns {{ applied: number, tokenName: string } | null}
 */
export function applyToken(characterId, tokenId, stacks, duration, source) {
  const battle = currentRpgBattle.value;
  const def = getTokenDefinitions().get(tokenId);
  if (!def || stacks <= 0) return null;
  if (!battle.tokens[characterId]) battle.tokens[characterId] = {};
  if (!battle.tokens[characterId][tokenId]) battle.tokens[characterId][tokenId] = [];
  const instances = battle.tokens[characterId][tokenId];
  const max = def.max_stacks || Infinity;
  const total = instances.reduce((s, i) => s + i.stacks, 0);
  const allowed = Math.min(stacks, max - total);
  if (allowed <= 0) return null;
  /** @type {RpgTokenInstance} */
  const inst = { stacks: allowed, source: source || characterId };
  if (duration != null) inst.duration = duration;
  instances.push(inst);
  return { applied: allowed, tokenName: def.name };
}

/**
 * Remove stacks FIFO from oldest instances.
 * @param {string} characterId
 * @param {string} tokenId
 * @param {number} stacks
 */
export function removeTokenStacks(characterId, tokenId, stacks) {
  const battle = currentRpgBattle.value;
  const instances = battle.tokens[characterId]?.[tokenId];
  if (!instances?.length) return;
  let remaining = stacks;
  while (remaining > 0 && instances.length > 0) {
    const inst = instances[0];
    if (inst.stacks <= remaining) {
      remaining -= inst.stacks;
      instances.shift();
    } else {
      inst.stacks -= remaining;
      remaining = 0;
    }
  }
  if (instances.length === 0) delete battle.tokens[characterId][tokenId];
}

/** Get total stacks of a token on a character. */
export function getTokenStacks(characterId, tokenId) {
  const instances = currentRpgBattle.value.tokens[characterId]?.[tokenId];
  if (!instances?.length) return 0;
  return instances.reduce((sum, i) => sum + i.stacks, 0);
}

/**
 * Process DoT and HoT token effects for a character.
 * @param {string} characterId
 * @returns {RpgEffectResult[]}
 */
export function processTokenEffects(characterId) {
  const battle = currentRpgBattle.value;
  const charTokens = battle.tokens[characterId];
  if (!charTokens) return [];
  const defs = getTokenDefinitions();
  const character = game.getCharacter(characterId);
  if (!character) return [];

  /** @type {RpgEffectResult[]} */
  const results = [];

  for (const tokenId in charTokens) {
    const instances = charTokens[tokenId];
    const def = defs.get(tokenId);
    if (!def) continue;
    const totalStacks = Math.round(instances.reduce((s, i) => s + i.stacks, 0));
    if (totalStacks <= 0) continue;

    for (const eff of def.effects) {
      if (eff.type === 'dot') {
        const rawDmg = Math.round(eff.value * totalStacks);
        const dmgType = eff.damage_type || 'absolute';
        const dmg = applyDefenses(rawDmg, dmgType, character);
        if (dmg > 0) {
          character.addResource('health', -dmg);
          results.push({ type: 'token_dot', targetId: characterId, amount: dmg, rawAmount: rawDmg, damageType: dmgType, tokenId, defeated: isLethallyDefeated(characterId) });
        }
      } else if (eff.type === 'hot') {
        let heal = Math.round(eff.value * totalStacks);
        const rawHeal = heal;
        const healReceivedMult = character.getStat('heal_received_mult') || 0;
        if (healReceivedMult) {
          heal = Math.max(0, Math.round(heal * (1 + healReceivedMult / 100)));
        }
        if (heal > 0) {
          character.addResource('health', heal);
          results.push({ type: 'token_hot', targetId: characterId, amount: heal, rawAmount: rawHeal, tokenId });
        }
      }
    }
  }

  return results;
}

// ── Side helpers ──

/**
 * @param {string} characterId
 * @returns {'player' | 'enemy'}
 */
export function getSide(characterId) {
  const battle = currentRpgBattle.value;
  return battle.playerParty.includes(characterId) ? 'player' : 'enemy';
}

/** @param {string} characterId */
export function isAIControlled(characterId) {
  // Currently: all enemies are AI. Future: check for berserk/charm statuses on player chars.
  return getSide(characterId) === 'enemy';
}

/**
 * @param {string} characterId
 * @returns {string[]}
 */
export function getAliveEnemies(characterId) {
  const battle = currentRpgBattle.value;
  const side = getSide(characterId);
  const pool = side === 'player' ? battle.enemyParty : battle.playerParty;
  return pool.filter(id => isCharAlive(id));
}

/**
 * @param {string} characterId
 * @returns {string[]}
 */
export function getAliveAllies(characterId) {
  const battle = currentRpgBattle.value;
  const side = getSide(characterId);
  const pool = side === 'player' ? battle.playerParty : battle.enemyParty;
  return pool.filter(id => isCharAlive(id));
}

/**
 * @param {string} characterId
 * @returns {boolean}
 */
/** @param {string} characterId */
export function isLethallyDefeated(characterId) {
  const char = game.getCharacter(characterId);
  return char ? char.getResource('health') <= 0 && getTokenStacks(characterId, 'death_defiance') <= 0 : false;
}

export function isCharAlive(characterId) {
  const char = game.getCharacter(characterId);
  return char && char.getResource('health') > 0;
}

// ── Damage pipeline ──

/**
 * Calculate raw damage before defenses.
 * @param {Character} caster
 * @param {Record<string, any>} aspects
 * @param {Character} target
 * @returns {{ raw: number, isCrit: boolean }}
 */
export function calculateRawDamage(caster, aspects, target) {
  const battle = currentRpgBattle.value;
  const baseStat = getScalingStat(caster);
  let rawDamage = baseStat * (aspects.damage / 100);

  // Caster-side multipliers
  let dmgMult = caster.getStat('damage_dealt_mult') || 0;
  const missingHpCoef = caster.getStat('damage_per_missing_health') || 0;
  if (missingHpCoef) dmgMult += missingHpCoef * (1 - caster.getResourceRatio('health')) * 100;
  const allyCoef = caster.getStat('damage_per_ally') || 0;
  if (allyCoef) {
    const allies = getAliveAllies(caster.id).filter(id => id !== caster.id);
    dmgMult += allyCoef * allies.length;
  }

  rawDamage *= Math.max(1 + dmgMult / 100, 0.1);

  // Crit roll
  let isCrit = false;
  const critChance = caster.getStat('crit_chance') || 0;
  if (critChance > 0 && Math.random() * 100 < critChance) {
    const critMulti = caster.getStat('crit_multi') || 0;
    rawDamage *= (1 + critMulti / 100);
    isCrit = true;
  }

  return { raw: rawDamage, isCrit };
}

/**
 * Apply defenses to raw damage.
 * @param {number} raw
 * @param {string} dmgType
 * @param {Character} target
 * @returns {number}
 */
export function applyDefenses(raw, dmgType, target) {
  const dmgTakenMult = target.getStat('damage_taken_mult') || 0;
  raw *= Math.max(1 + dmgTakenMult / 100, 0.1);

  if (dmgType === 'absolute') return Math.max(0, Math.round(raw));
  if (dmgType === 'physical') return Math.max(0, Math.round(raw - (target.getStat('armor') || 0)));
  if (ELEMENTAL_TYPES.includes(dmgType)) {
    const resist = target.getStat(`resist_${dmgType}`) || 0;
    return Math.max(0, Math.round(raw * (1 - resist / 100)));
  }
  return Math.max(0, Math.round(raw));
}

/**
 * Apply damage with shield absorption and thorns reflection.
 * @param {Character} target
 * @param {number} amount
 * @param {string} [damageType]
 * @param {string} [casterId]
 * @returns {{ dealt: number, shieldAbsorbed: number, thornsReflected: number }}
 */
export function applyDamage(target, amount, damageType, casterId) {
  const battle = currentRpgBattle.value;
  let remaining = amount;
  let shieldAbsorbed = 0;
  let thornsReflected = 0;

  const defs = getTokenDefinitions();
  const charTokens = battle.tokens[target.id];
  if (charTokens && damageType !== 'absolute') {
    for (const tokenId in charTokens) {
      const def = defs.get(tokenId);
      const absorbEff = def?.effects.find(e => e.type === 'absorb');
      if (!absorbEff) continue;
      const perStack = absorbEff.value || 1;
      const totalStacks = charTokens[tokenId].reduce((s, i) => s + i.stacks, 0);
      const maxAbsorb = totalStacks * perStack;
      const absorbed = Math.min(maxAbsorb, remaining);
      const stacksUsed = Math.ceil(absorbed / perStack);
      if (stacksUsed > 0) {
        shieldAbsorbed += absorbed;
        remaining -= absorbed;
        removeTokenStacks(target.id, tokenId, stacksUsed);
      }
      if (remaining <= 0) break;
    }
  }

  if (remaining > 0) target.addResource('health', -remaining);

  // Thorns: reflect damage back to attacker
  if (casterId && charTokens && remaining > 0) {
    const caster = game.getCharacter(casterId);
    if (caster) {
      for (const tokenId in charTokens) {
        const def = defs.get(tokenId);
        const thornsEff = def?.effects.find(e => e.type === 'thorns');
        if (!thornsEff) continue;
        const totalStacks = charTokens[tokenId].reduce((s, i) => s + i.stacks, 0);
        const reflectPct = thornsEff.value * totalStacks / 100;
        const reflected = Math.round(remaining * reflectPct);
        if (reflected > 0) {
          caster.addResource('health', -reflected);
          thornsReflected += reflected;
        }
      }
    }
  }

  return { dealt: amount, shieldAbsorbed, thornsReflected };
}

/**
 * Apply healing from caster to target. Scales from power.
 * @param {Character} caster
 * @param {Character} target
 * @param {number} healPercent
 * @returns {{ healed: number, raw: number }}
 */
export function applyHealing(caster, target, healPercent) {
  const healAmp = caster.getStat('heal_amplification') || 0;
  let healing = Math.round(getScalingStat(caster) * (healPercent / 100) * ((100 + healAmp) / 100));
  const raw = healing;
  const healReceivedMult = target.getStat('heal_received_mult') || 0;
  if (healReceivedMult) {
    healing = Math.max(0, Math.round(healing * (1 + healReceivedMult / 100)));
  }
  target.addResource('health', healing);
  return { healed: healing, raw };
}

// ── Target resolution ──

/**
 * Resolve targets for an ability based on target type.
 * @param {string} casterId
 * @param {string} targetType
 * @param {string} [selectedTargetId]
 * @returns {string[]}
 */
export function resolveTargets(casterId, targetType, selectedTargetId) {
  switch (targetType) {
    case 'self': return [casterId];
    case 'enemy': return selectedTargetId ? [selectedTargetId] : [];
    case 'ally': return selectedTargetId ? [selectedTargetId] : [];
    case 'self_and_ally': return selectedTargetId ? [selectedTargetId] : [casterId];
    case 'all_enemies': return getAliveEnemies(casterId);
    case 'all_allies': return getAliveAllies(casterId);
    case 'any': return selectedTargetId ? [selectedTargetId] : [];
    default: return selectedTargetId ? [selectedTargetId] : [];
  }
}

// ── Ability resolution ──

/**
 * Resolve a full ability: deduct costs, apply all effects, set cooldown.
 * @param {string} casterId
 * @param {string} abilityId
 * @param {string} [targetId]
 * @returns {RpgEffectResult[]}
 */
export function resolveAbility(casterId, abilityId, targetId) {
  const battle = currentRpgBattle.value;
  const caster = game.getCharacter(casterId);
  const ability = caster.getAbility(abilityId);
  if (!ability) return [];

  const meta = ability.meta;

  // Deduct costs
  if (meta.costs) {
    for (const statId in meta.costs) {
      caster.addResource(statId, -meta.costs[statId]);
    }
  }

  // Consume preparation token
  if (meta.preparation) {
    removeTokenStacks(casterId, 'preparation', 1);
  }

  const targetType = meta.target || 'enemy';
  let targets = resolveTargets(casterId, targetType, targetId);

  // Filter targets by health thresholds
  if (meta.target_min_health || meta.target_max_health) {
    targets = targets.filter(tId => {
      const t = game.getCharacter(tId);
      if (!t) return false;
      const pct = t.getResourceRatio('health') * 100;
      if (meta.target_min_health && pct > meta.target_min_health) return false;
      if (meta.target_max_health && pct < meta.target_max_health) return false;
      return true;
    });
  }

  /** @type {RpgEffectResult[]} */
  const allResults = [];

  for (const effectId in ability.effects) {
    const aspects = ability.effects[effectId];

    // Roll chance
    if (aspects.chance !== undefined && Math.random() > aspects.chance) continue;

    let totalDamageDealt = 0;

    for (const tId of targets) {
      const target = game.getCharacter(tId);
      if (!target || target.getResource('health') <= 0) continue;

      // Combo gate
      if (aspects.combo) {
        const stacks = getTokenStacks(tId, 'combo');
        if (stacks <= 0) continue;
        removeTokenStacks(tId, 'combo', 1);
      }

      // Damage
      if (aspects.damage) {
        const dmgType = aspects.damage_type || 'physical';
        const { raw, isCrit } = calculateRawDamage(caster, aspects, target);

        // Dodge roll
        const dodgeChance = target.getStat('dodge') || 0;
        const isDodged = dodgeChance > 0 && Math.random() * 100 < dodgeChance;

        if (isDodged) {
          allResults.push({ type: 'dodge', targetId: tId });
          continue;
        }

        const rawEvent = { amount: raw, damageType: dmgType, ability: abilityId, isCrit };
        if (!game.trigger('battle_damage_raw', battle, caster, target, rawEvent)) continue;

        const finalDmg = applyDefenses(rawEvent.amount, dmgType, target);
        const finalEvent = { amount: finalDmg, damageType: dmgType, ability: abilityId, isCrit };
        if (!game.trigger('battle_damage_final', battle, caster, target, finalEvent)) continue;

        const result = applyDamage(target, finalEvent.amount, dmgType, casterId);
        totalDamageDealt += result.dealt;
        allResults.push({
          type: 'damage', targetId: tId, amount: result.dealt,
          rawAmount: Math.round(rawEvent.amount), damageType: dmgType,
          shieldAbsorbed: result.shieldAbsorbed, isCrit,
          defeated: isLethallyDefeated(tId),
        });
        if (result.thornsReflected > 0) {
          allResults.push({ type: 'thorns', targetId: casterId, amount: result.thornsReflected, defeated: isLethallyDefeated(casterId) });
        }
      }

      // Healing
      if (aspects.healing) {
        const healEvent = { amount: aspects.healing };
        if (game.trigger('battle_heal', battle, caster, target, healEvent)) {
          const { healed, raw } = applyHealing(caster, target, healEvent.amount);
          allResults.push({ type: 'heal', targetId: tId, amount: healed, rawAmount: raw });
        }
      }

      // Token apply to target
      if (aspects.token_apply) {
        let stacks = aspects.token_stacks || 1;
        const tokenDef = getTokenDefinitions().get(aspects.token_apply);
        if (tokenDef?.power_scaling) stacks = Math.round(getScalingStat(caster) * stacks / 100);
        const result = applyToken(tId, aspects.token_apply, stacks, aspects.token_duration, casterId);
        if (result) allResults.push({ type: 'token_apply', targetId: tId, tokenId: aspects.token_apply, stacks: result.applied, duration: aspects.token_duration || 0 });
      }

      // Cleanse
      if (aspects.cleanse) {
        const casterSide = getSide(casterId);
        const tSide = getSide(tId);
        const removePolarity = (casterSide === tSide) ? 'negative' : 'positive';
        const defs = getTokenDefinitions();
        const charTokens = battle.tokens[tId];
        if (charTokens) {
          for (const tkId in charTokens) {
            if (defs.get(tkId)?.polarity === removePolarity) {
              delete charTokens[tkId];
            }
          }
        }
        allResults.push({ type: 'cleanse', targetId: tId });
      }

      // Status apply
      if (aspects.status_apply) {
        for (const statusId of aspects.status_apply) {
          const status = game.createStatus(statusId);
          if (status) {
            target.addStatus(status);
            allResults.push({ type: 'status_apply', targetId: tId, statusId, statusName: status.name, duration: status.duration > 0 ? status.duration : 0 });
          }
        }
      }

      // Status remove
      if (aspects.status_remove) {
        for (const statusId of aspects.status_remove) {
          const statusDefs = game.getData('character_statuses', true);
          const sDef = statusDefs?.get(statusId);
          target.removeStatus(statusId);
          allResults.push({ type: 'status_remove', targetId: tId, statusId, statusName: sDef?.name || statusId });
        }
      }

      // Cooldown change on target
      if (aspects.cooldown_change && battle.abilitiesState[tId]) {
        for (const abId in battle.abilitiesState[tId]) {
          const state = battle.abilitiesState[tId][abId];
          state.cooldown = Math.max(0, state.cooldown + aspects.cooldown_change);
        }
      }

      // Charges change on target
      if (aspects.charges_change && battle.abilitiesState[tId]) {
        for (const abId in battle.abilitiesState[tId]) {
          const state = battle.abilitiesState[tId][abId];
          if (state.charges !== -1) {
            state.charges = Math.max(0, state.charges + aspects.charges_change);
          }
        }
      }
    }

    // Lifesteal
    if (aspects.lifesteal && totalDamageDealt > 0) {
      const healed = Math.round(totalDamageDealt * (aspects.lifesteal / 100));
      if (healed > 0) {
        caster.addResource('health', healed);
        allResults.push({ type: 'steal', targetId: caster.id, amount: healed });
      }
    }

    // Token apply self
    if (aspects.token_apply_self) {
      let stacks = aspects.token_stacks_self || 1;
      const tokenDef = getTokenDefinitions().get(aspects.token_apply_self);
      if (tokenDef?.power_scaling) stacks = Math.round(getScalingStat(caster) * stacks / 100);
      const result = applyToken(casterId, aspects.token_apply_self, stacks, aspects.token_duration_self, casterId);
      if (result) allResults.push({ type: 'token_apply', targetId: casterId, tokenId: aspects.token_apply_self, stacks: result.applied, duration: aspects.token_duration_self || 0 });
    }

    // Status apply self
    if (aspects.status_apply_self) {
      for (const statusId of aspects.status_apply_self) {
        const status = game.createStatus(statusId);
        if (status) {
          caster.addStatus(status);
          allResults.push({ type: 'status_apply', targetId: casterId, statusId, statusName: status.name, duration: status.duration > 0 ? status.duration : 0 });
        }
      }
    }
  }

  // Set cooldown and consume charges
  const abilityState = battle.abilitiesState[casterId]?.[abilityId];
  if (abilityState) {
    if (abilityState.charges > 0) abilityState.charges--;
    const cd = meta.cooldown || 0;
    if (cd > 0) abilityState.cooldown = cd;
  }

  return allResults;
}
