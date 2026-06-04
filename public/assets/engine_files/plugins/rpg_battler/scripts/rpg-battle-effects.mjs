/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle, parseFloatingText, addFloatingText } from './rpg-battle-state.mjs';
import { summonCombatant } from './rpg-battle-flow.mjs';

const { game } = window.engine;

// Burst (ability-hit) channels use flat armor; DoT channels use % resist.
const FLAT_ARMOR = { physical: 'physical_armor', magic: 'magical_armor' };
const DOT_RESIST = { burn: 'resist_burn', poison: 'resist_poison', bleeding: 'resist_bleed' };

// ── Scaling ──

/** @type {number|null} Per-action cache of effective power; set at the top of resolveAbility. */
let _actionPower = null;

/**
 * Compute the effective scaling stat for an ability: `power * (1 + power_amplifier/100)`,
 * unless the ability opts out via `meta.unamplified`. `power_amplifier` is a percentage
 * (100 = +100% = doubles power). Used by both runtime (resolveAbility) and tooltip
 * (powerScaledRenderer). Games drive `power_amplifier` through normal stat channels — typically
 * a stat computer or a buff status.
 * @param {Character} character
 * @param {{ meta?: any } | undefined} ability
 * @returns {number}
 */
export function getEffectivePower(character, ability) {
  const base = character.getStat('power');
  if (ability?.meta?.unamplified) return base;
  const amp = character.getStat('power_amplifier') || 0;
  return base * (1 + amp / 100);
}

/**
 * All damage/healing in RPG battler scales from power.
 * Inside an action resolution, reads the cached _actionPower; otherwise falls back to raw power.
 * @param {Character} caster
 * @returns {number}
 */
function getScalingStat(caster) {
  return _actionPower ?? caster.getStat('power');
}

// ── Status helpers ──

/** @returns {Map<string, any>} */
export function getStatusDefinitions() {
  return game.getData('character_statuses', true);
}

/** Get total stacks of a status on a character. */
export function getStatusStacks(characterId, statusId) {
  const char = game.getCharacter(characterId);
  return char?.getStatus(statusId)?.currentStacks ?? 0;
}

/**
 * Apply a status instance via the engine's addStatus API.
 * For multi_stack statuses: appends a new instance.
 * For single-stack: refreshes existing or creates fresh.
 * @returns {{ applied: number, name: string } | null}
 */
export function applyStatusInstance(characterId, statusId, stacks, duration, source) {
  if (stacks <= 0) return null;
  const char = game.getCharacter(characterId);
  if (!char) return null;
  const def = getStatusDefinitions().get(statusId);
  if (!def) return null;
  const status = game.createStatus(statusId);
  if (!status) return null;
  // Report the count that actually LANDED (capped by max_stacks) for multi-stack statuses, via a
  // before/after delta. Single-stack is a 1-marker — keep the requested count (its flash shows
  // duration, and a refresh should still read its requested stack rather than a 0 delta).
  const before = def.multi_stack ? (char.getStatus(statusId)?.currentStacks ?? 0) : 0;
  char.addStatus(status, { stacks, duration, source });
  const applied = def.multi_stack ? (char.getStatus(statusId)?.currentStacks ?? 0) - before : stacks;
  return { applied, name: def.name };
}

/**
 * Remove stacks from a status. Removes the status entirely if it drops to 0.
 * @returns {number} stacks actually removed
 */
export function removeStatusStacks(characterId, statusId, stacks) {
  return game.getCharacter(characterId)?.removeStatusStacks(statusId, stacks) ?? 0;
}

/**
 * Compute the effective stagger threshold for a character (base × pct multiplier).
 * Returns 0 if the character is missing or has no base threshold (= not staggerable).
 * @param {string} charId
 * @returns {number}
 */
export function computeEffectiveThreshold(charId) {
  const char = game.getCharacter(charId);
  if (!char) return 0;
  const base = char.getStat('stagger_threshold') || 0;
  if (base <= 0) return 0;
  const pct = char.getStat('stagger_threshold_pct') || 0;
  return Math.ceil(base * (1 + pct / 100));
}

/**
 * Remove every `is_channel` status cast by `charId` (live instance `source`), wherever it is held.
 * Called when `charId`'s channels should end — when the caster is stunned or defeated.
 * @param {string} charId
 */
export function endChannelsBy(charId) {
  const battle = currentRpgBattle.value;
  if (!battle) return;
  for (const id of [...battle.playerParty, ...battle.enemyParty]) {
    const c = game.getCharacter(id);
    if (!c) continue;
    for (const st of c.getStatuses()) {
      if (st.meta?.is_channel && st.getInstances().some(i => i.source === charId)) c.removeStatus(st.id);
    }
  }
}

/**
 * Check stagger threshold for a character; if exceeded, strip all stagger,
 * apply stun, and refresh the braced status. Called inline after any
 * stagger application, and from tickActiveCharacter after status
 * durations tick.
 * @param {string} charId
 */
export function checkStaggerThreshold(charId) {
  const battle = currentRpgBattle.value;
  if (!battle) return;
  const char = game.getCharacter(charId);
  if (!char || char.getResource('health') <= 0) return;

  const stacks = getStatusStacks(charId, 'stagger');
  if (stacks <= 0) return;

  const threshold = computeEffectiveThreshold(charId);
  if (threshold <= 0 || stacks < threshold) return;

  // Strip all stagger
  char.removeStatus('stagger');
  // Apply stun + braced
  applyStatusInstance(charId, 'stun', 1);
  endChannelsBy(charId);
  const braced = game.createStatus('braced');
  if (braced) char.addStatus(braced);

  const stunDef = getStatusDefinitions().get('stun');
  addFloatingText({
    characterId: charId,
    text: game.getLine('float_stunned'),
    cssClass: 'status-apply',
    icon: stunDef?.image || null,
    color: stunDef?.color,
  });
  battle.log.push({ turn: battle.turn, actorId: charId, targetId: charId, text: game.getLine('log_stun_applied') });
}

/**
 * Process DoT and HoT effects for a character. Reads status meta.dot_damage_type / meta.hot.
 * @param {string} characterId
 * @returns {RpgEffectResult[]}
 */
export function processStatusEffects(characterId) {
  const character = game.getCharacter(characterId);
  if (!character) return [];
  const defs = getStatusDefinitions();

  /** @type {RpgEffectResult[]} */
  const results = [];

  for (const status of character.getStatuses()) {
    const meta = status.meta || {};
    const totalStacks = Math.round(status.currentStacks);
    if (totalStacks <= 0) continue;
    const isDot = !!meta.dot_damage_type;
    const isRegen = status.id === 'regen';
    if (!isDot && !isRegen) continue;
    const statusName = status.name || defs.get(status.id)?.name || status.id;

    if (isDot) {
      const rawDmg = totalStacks;
      const dmgType = meta.dot_damage_type;
      const dmg = applyDefenses(rawDmg, dmgType, character);
      if (dmg > 0) {
        character.addResource('health', -dmg);
        results.push({ type: 'status_dot', targetId: characterId, amount: dmg, rawAmount: rawDmg, damageType: dmgType, statusId: status.id, statusName, defeated: isLethallyDefeated(characterId) });
      } else if (dmg < 0) {
        // Resist above 100% turned the tick into healing.
        character.addResource('health', -dmg);
        results.push({ type: 'status_dot_heal', targetId: characterId, amount: -dmg, rawAmount: rawDmg, damageType: dmgType, statusId: status.id, statusName });
      }
    } else if (isRegen) {
      let heal = totalStacks;
      const rawHeal = heal;
      const healReceivedMult = character.getStat('heal_received_mult') || 0;
      if (healReceivedMult) heal = Math.max(0, Math.round(heal * (1 + healReceivedMult / 100)));
      if (heal > 0) {
        character.addResource('health', heal);
        results.push({ type: 'status_hot', targetId: characterId, amount: heal, rawAmount: rawHeal, statusId: status.id, statusName });
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

/** @param {string} characterId */
export function isLethallyDefeated(characterId) {
  const char = game.getCharacter(characterId);
  if (!char) return false;
  if (char.getResource('health') > 0) return false;
  // death_defiance status saves from lethal
  return getStatusStacks(characterId, 'death_defiance') <= 0;
}

export function isCharAlive(characterId) {
  const char = game.getCharacter(characterId);
  return char && char.getResource('health') > 0;
}

// ── Splash (neighbor expansion) ──

/**
 * Expand a target list to include neighbors in the same party.
 * @param {string} casterId
 * @param {string[]} primaryTargets
 * @param {number} maxNeighbors - Max neighbors to add per primary target
 * @param {boolean} [splashOnly] - If true, exclude primary targets from result
 * @returns {string[]}
 */
export function expandSplashTargets(casterId, primaryTargets, maxNeighbors, splashOnly) {
  if (!primaryTargets.length) return primaryTargets;
  const targetSide = getSide(primaryTargets[0]);
  const casterSide = getSide(casterId);
  const pool = targetSide === casterSide
    ? getAliveAllies(casterId)
    : getAliveEnemies(casterId);

  const expanded = [...primaryTargets];
  for (const tId of primaryTargets) {
    const idx = pool.indexOf(tId);
    if (idx === -1) continue;
    let added = 0;
    if (idx > 0 && !expanded.includes(pool[idx - 1]) && added < maxNeighbors) {
      expanded.push(pool[idx - 1]); added++;
    }
    if (idx < pool.length - 1 && !expanded.includes(pool[idx + 1]) && added < maxNeighbors) {
      expanded.push(pool[idx + 1]); added++;
    }
  }
  if (splashOnly) return expanded.filter(id => !primaryTargets.includes(id));
  return expanded;
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

  // Bonus damage during the stagger window: while stunned, and through the braced recovery after.
  if (getStatusStacks(target.id, 'stun') > 0 || getStatusStacks(target.id, 'braced') > 0) {
    const bonus = caster.getStat('bonus_stun_damage') || 0;
    if (bonus > 0) rawDamage *= (1 + bonus / 100);
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

  // Burst hits: flat armor, floored at 1 dmg, negative armor amplifies.
  const armorStat = FLAT_ARMOR[dmgType];
  if (armorStat) {
    return Math.max(1, Math.round(raw - (target.getStat(armorStat) || 0)));
  }

  // DoT ticks: percentage resist. No clamp — resist above 100 yields a
  // negative number, i.e. the tick heals the target instead of damaging.
  const resistStat = DOT_RESIST[dmgType];
  if (resistStat) {
    const resist = target.getStat(resistStat) || 0;
    return Math.round(raw * (1 - resist / 100));
  }

  return Math.max(0, Math.round(raw));
}

/**
 * Drain `amount` shield stacks from a target, prioritizing instances with the
 * shortest remaining duration first (permanent -1 instances last). This way
 * about-to-expire stacks get used before they're wasted. Drops emptied instances
 * and removes the status if no instances remain.
 * @param {Character} target
 * @param {number} amount
 */
function consumeShieldStacks(target, amount) {
  const status = target.getStatus('shield');
  if (!status || amount <= 0) return;
  const instances = status.getInstances();
  // Sort indices by duration ascending; treat -1 (permanent) as last.
  const order = instances
    .map((inst, idx) => ({ idx, dur: inst.duration < 0 ? Infinity : inst.duration }))
    .sort((a, b) => a.dur - b.dur)
    .map(o => o.idx);
  let remaining = amount;
  for (const idx of order) {
    if (remaining <= 0) break;
    const inst = instances[idx];
    const take = Math.min(inst.stacks, remaining);
    inst.stacks -= take;
    remaining -= take;
  }
  // Drop emptied instances; remove status if empty
  /** @type {any} */ (status)._instances = instances.filter(i => i.stacks > 0);
  if (status.currentStacks <= 0) target.removeStatus('shield');
}

/**
 * Apply damage with shield absorption and thorns reflection.
 * Absorbs via `shield` status (1 damage per stack, drained shortest-duration first).
 * Reflects via `thorns` status (1 flat per stack per hit, not consumed).
 * @param {Character} target
 * @param {number} amount
 * @param {string} [damageType]
 * @param {string} [casterId]
 * @returns {{ dealt: number, shieldAbsorbed: number, thornsReflected: number }}
 */
export function applyDamage(target, amount, damageType, casterId) {
  let remaining = amount;
  let shieldAbsorbed = 0;
  let thornsReflected = 0;

  // Absorb (shield-only) — each stack absorbs 1 damage, consumed from shortest-duration
  // instance first so soon-to-expire stacks get used before they're wasted.
  if (damageType !== 'absolute') {
    const shield = target.getStatus('shield');
    if (shield && shield.currentStacks > 0) {
      const absorbed = Math.min(shield.currentStacks, remaining);
      if (absorbed > 0) {
        shieldAbsorbed += absorbed;
        remaining -= absorbed;
        consumeShieldStacks(target, absorbed);
      }
    }
  }

  if (remaining > 0) target.addResource('health', -remaining);

  // Thorns (thorns-only): 1 flat damage per stack per hit. Not consumed.
  if (casterId && remaining > 0) {
    const thorns = target.getStatus('thorns');
    if (thorns && thorns.currentStacks > 0) {
      const caster = game.getCharacter(casterId);
      if (caster) {
        thornsReflected = thorns.currentStacks;
        caster.addResource('health', -thornsReflected);
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
  let healing = Math.round(getScalingStat(caster) * (healPercent / 100) * (1 + healAmp / 100));
  const raw = healing;
  const healReceivedMult = target.getStat('heal_received_mult') || 0;
  if (healReceivedMult) {
    healing = Math.max(0, Math.round(healing * (1 + healReceivedMult / 100)));
  }
  target.addResource('health', healing);
  return { healed: healing, raw };
}

// ── Shared effect application (used by resolveAbility AND the rpg_battle service) ──

/**
 * Apply a damage instance (shield/HP/thorns) and return the result objects. Does NOT emit
 * floating text / log — callers do that via logEffect so they control ordering.
 * @returns {{ results: RpgEffectResult[], dealt: number }}
 */
export function applyDamageInstance(casterId, targetId, finalDamage, rawDamage, damageType, isCrit) {
  const target = game.getCharacter(targetId);
  if (!target) return { results: [], dealt: 0 };
  const r = applyDamage(target, finalDamage, damageType, casterId);
  /** @type {RpgEffectResult[]} */
  const results = [{
    type: 'damage', targetId, amount: r.dealt, rawAmount: Math.round(rawDamage),
    damageType, shieldAbsorbed: r.shieldAbsorbed, isCrit: !!isCrit, defeated: isLethallyDefeated(targetId),
  }];
  if (r.thornsReflected > 0) {
    results.push({ type: 'thorns', targetId: casterId, amount: r.thornsReflected, defeated: isLethallyDefeated(casterId) });
  }
  return { results, dealt: r.dealt };
}

/**
 * Apply ONE status with the FINAL stack count (caller does any power-scaling). Handles the
 * stagger guard + threshold check. Returns the result object, or null if nothing applied.
 * @returns {RpgEffectResult|null}
 */
export function applyStatusEffect(casterId, targetId, statusId, stacks, duration) {
  if (!(stacks > 0)) return null;
  if (statusId === 'stagger' && getStatusStacks(targetId, 'stun') > 0) return null;
  const r = applyStatusInstance(targetId, statusId, stacks, duration, casterId);
  if (!r || r.applied <= 0) return null;
  // NB: the stagger→stun threshold check runs in the CALLER, after the stagger result is logged,
  // so the "is stunned" log follows "gains Stagger" (cause before consequence).
  return { type: 'status_apply', targetId, statusId, statusName: r.name, stacks: r.applied, duration: duration ?? 0 };
}

/** Emit a single effect result: floating text + battle log. */
export function logEffect(battle, casterId, effect) {
  parseFloatingText(effect);
  battle.log.push({ turn: battle.turn, actorId: casterId, effect });
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

// ── Channels ──

/**
 * Begin a channel: mint a token from the casting ability (its icon + name) carrying a frozen
 * snapshot of the resolved ability + effective power in `meta.channel_snapshot`, tagged
 * `is_channel` so a stun sweeps it. Replaces any channel the caster already has (one per caster).
 * The token re-fires inline from `tickActiveCharacter` on the caster's turns.
 * @param {string} casterId @param {string} abilityId @param {any} ability @param {number} power
 */
function startChannel(casterId, abilityId, ability, power) {
  const caster = game.getCharacter(casterId);
  if (!caster) return;
  for (const st of [...caster.getStatuses()]) {
    if (st.meta?.channel_snapshot) caster.removeStatus(st.id);
  }
  const meta = ability.meta || {};
  const token = game.createStatus({
    id: `channel_${abilityId}`,
    name: meta.name || 'Channel',
    description: meta.description || '',
    image: meta.icon || '',
    polarity: 'positive',
    max_stacks: 1,
    meta: {
      is_battle: true,
      is_channel: true,
      channel_snapshot: { abilityId, power, ability: JSON.parse(JSON.stringify(ability)) },
    },
  });
  caster.addStatus(token, { source: casterId });
}

// ── Ability resolution ──

/**
 * Resolve a full ability: deduct costs, apply all effects, set cooldown.
 * On a bounce (`isBounce`), the effects re-resolve on the target but cost and
 * cooldown/charges are skipped (the primary cast already paid them).
 * @param {string} casterId
 * @param {string} abilityId
 * @param {string} [targetId]
 * @param {{ isBounce?: boolean, actionPower?: number, ability?: any }} [opts] `actionPower`/`ability` freeze
 *   a re-fired cast (channels): replay the snapshotted effects at the snapshotted power.
 * @returns {RpgEffectResult[]}
 */
export function resolveAbility(casterId, abilityId, targetId, { isBounce = false, actionPower, ability: abilityOverride } = {}) {
  const battle = currentRpgBattle.value;
  const caster = game.getCharacter(casterId);
  const ability = abilityOverride ?? caster.getAbility(abilityId);
  if (!ability) { _actionPower = null; return []; }
  const meta = ability.meta;
  _actionPower = actionPower ?? (meta?.flat ? 100 : getEffectivePower(caster, ability));

  // Deduct costs (skipped on bounces — primary cast already paid)
  if (!isBounce && meta.costs) {
    for (const statId in meta.costs) {
      caster.addResource(statId, -meta.costs[statId]);
    }
  }

  // Consume the self status requirement on cast (skipped on bounces)
  if (!isBounce && meta.require_status_self && meta.require_status_self_consume) {
    removeStatusStacks(casterId, meta.require_status_self, 1);
  }

  game.trigger('battle_action_cast', caster, abilityId);

  const targetType = meta.target || 'enemy';
  let targets = resolveTargets(casterId, targetType, targetId);

  /** @type {RpgEffectResult[]} */
  const allResults = [];

  const statusDefs = getStatusDefinitions();

  // Lifesteal accrues across the whole ability's damage, applied once after all effects resolve.
  let abilityDamage = 0;
  let lifestealPct = 0;

  for (const effectId in ability.effects) {
    const aspects = ability.effects[effectId];

    // Roll chance
    if (aspects.chance !== undefined && Math.random() > aspects.chance) continue;

    // Summon: spawn a combatant from a character template onto the caster's side (once per effect,
    // not re-summoned on bounces). Independent of the ability's target; composes with other aspects.
    if (aspects.summon && !isBounce) {
      const newChar = game.createCharacter(game.createUid(), aspects.summon);
      if (newChar) {
        const id = summonCombatant(newChar, getSide(casterId));
        if (id) allResults.push({ type: 'summon', targetId: id });
      }
    }

    // Per-target work (damage / heal / status / cleanse / cooldown / charges). When the effect only
    // does caster-side things (summon and/or self-status), the target list is empty so the loop
    // below is a no-op and no empty battle_action_apply events fire.
    const hasTargetPayload = !!(aspects.damage || aspects.healing
      || aspects.status_apply_target?.length || aspects.status_remove_target?.length
      || aspects.cleanse || aspects.cooldown_change || aspects.charges_change || aspects.require_status_target_consume);

    const effectTargets = !hasTargetPayload ? []
      : aspects.splash
        ? expandSplashTargets(casterId, targets, aspects.splash, aspects.splash_only)
        : targets;

    if (aspects.lifesteal) lifestealPct = Math.max(lifestealPct, aspects.lifesteal);

    for (const tId of effectTargets) {
      const target = game.getCharacter(tId);
      if (!target || target.getResource('health') <= 0) continue;

      // Target status requirement (pre-condition, not part of the apply event)
      if (aspects.require_status_target) {
        if (getStatusStacks(tId, aspects.require_status_target) <= 0) continue;
        if (aspects.require_status_target_consume) removeStatusStacks(tId, aspects.require_status_target, 1);
      }

      // ── Compute all math ──

      let rawDamage = 0, finalDamage = 0, isCrit = false, isDodged = false;
      let dmgType = aspects.damage_type || 'physical';

      if (aspects.damage) {
        const calc = calculateRawDamage(caster, aspects, target);
        rawDamage = calc.raw;
        isCrit = calc.isCrit;

        const dodgeChance = target.getStat('dodge') || 0;
        isDodged = dodgeChance > 0 && Math.random() * 100 < dodgeChance;

        if (!isDodged) {
          finalDamage = applyDefenses(rawDamage, dmgType, target);
        }
      }

      let healing = 0;
      if (aspects.healing) {
        const healAmp = caster.getStat('heal_amplification') || 0;
        healing = Math.round(getScalingStat(caster) * (aspects.healing / 100) * (1 + healAmp / 100));
      }

      const statusApplyList = aspects.status_apply_target ? [...aspects.status_apply_target] : [];
      const statusRemoveList = aspects.status_remove_target ? [...aspects.status_remove_target] : [];
      const baseStatusStacks = aspects.status_stacks_target ?? 1;

      // ── Build apply event ──

      /** @type {RpgActionApplyEvent} */
      const applyEvent = {
        effectId,
        targetId: tId,
        damage: finalDamage,
        rawDamage,
        damageType: dmgType,
        isCrit,
        isDodged,
        healing,
        statusApply: statusApplyList,
        statusStacks: baseStatusStacks,
        statusDuration: aspects.status_duration_target,
        statusRemove: statusRemoveList,
        statusRemoveStacks: aspects.status_remove_stacks_target,
        cleanse: !!aspects.cleanse,
        cooldownChange: aspects.cooldown_change || 0,
        chargesChange: aspects.charges_change || 0,
      };

      if (!game.trigger('battle_action_apply', caster, applyEvent)) continue;

      // ── Apply state mutations from event ──
      const resultStartIdx = allResults.length;

      if (applyEvent.isDodged) {
        /** @type {RpgEffectResult} */
        const dodgeResult = { type: 'dodge', targetId: tId };
        allResults.push(dodgeResult);
        logEffect(battle, casterId, dodgeResult);
        continue;
      }

      // Damage
      if (applyEvent.damage > 0) {
        const { results, dealt } = applyDamageInstance(casterId, tId, applyEvent.damage, applyEvent.rawDamage, applyEvent.damageType, applyEvent.isCrit);
        abilityDamage += dealt;
        allResults.push(...results);
      }

      // Healing
      if (applyEvent.healing > 0) {
        const healReceivedMult = target.getStat('heal_received_mult') || 0;
        let healed = applyEvent.healing;
        if (healReceivedMult) healed = Math.max(0, Math.round(healed * (1 + healReceivedMult / 100)));
        target.addResource('health', healed);
        allResults.push({ type: 'heal', targetId: tId, amount: healed, rawAmount: applyEvent.healing });
      }

      // Status apply (each id in the list)
      for (const statusId of applyEvent.statusApply) {
        const def = statusDefs.get(statusId);
        if (!def) continue;
        // Per-ability power-scaling decided here; applyStatusEffect takes the final stack count.
        let stacks = applyEvent.statusStacks;
        if (def.meta?.power_scaling) stacks = Math.round(getScalingStat(caster) * stacks / 100);
        const result = applyStatusEffect(casterId, tId, statusId, stacks, applyEvent.statusDuration);
        if (result) allResults.push(result);
      }

      // Cleanse — reads status.meta directly (so item-granted statuses participate too)
      if (applyEvent.cleanse) {
        const casterSide = getSide(casterId);
        const tSide = getSide(tId);
        const removePolarity = (casterSide === tSide) ? 'negative' : 'positive';
        for (const status of [...target.getStatuses()]) {
          if (!status.meta?.is_battle) continue;
          const polarity = status.polarity || statusDefs.get(status.id)?.polarity;
          if (polarity === removePolarity) target.removeStatus(status.id);
        }
        allResults.push({ type: 'cleanse', targetId: tId });
      }

      // Status remove
      for (const statusId of applyEvent.statusRemove) {
        const have = getStatusStacks(tId, statusId);
        if (have <= 0) continue;
        const toRemove = applyEvent.statusRemoveStacks !== undefined
          ? Math.min(have, applyEvent.statusRemoveStacks)
          : have;
        if (toRemove <= 0) continue;
        const def = statusDefs.get(statusId);
        removeStatusStacks(tId, statusId, toRemove);
        allResults.push({
          type: 'status_remove',
          targetId: tId,
          statusId,
          statusName: def?.name || statusId,
          stacks: toRemove,
        });
      }

      // Cooldown change on target
      if (applyEvent.cooldownChange && battle.charState[tId]?.abilities) {
        for (const abId in battle.charState[tId]?.abilities) {
          const state = battle.charState[tId]?.abilities[abId];
          state.cooldown = Math.max(0, state.cooldown + applyEvent.cooldownChange);
        }
      }

      // Charges change on target
      if (applyEvent.chargesChange && battle.charState[tId]?.abilities) {
        for (const abId in battle.charState[tId]?.abilities) {
          const state = battle.charState[tId]?.abilities[abId];
          if (state.charges !== -1) {
            state.charges = Math.max(0, state.charges + applyEvent.chargesChange);
          }
        }
      }

      // Log all results from this target's mutations, then fire post-apply
      for (let i = resultStartIdx; i < allResults.length; i++) {
        logEffect(battle, casterId, allResults[i]);
      }
      game.trigger('battle_action_applied', caster, applyEvent);
      if (applyEvent.statusApply.includes('stagger')) checkStaggerThreshold(tId);
    }

    // Self-heal — heals the caster regardless of the ability's target.
    if (aspects.healing_self) {
      const healAmp = caster.getStat('heal_amplification') || 0;
      const recvMult = caster.getStat('heal_received_mult') || 0;
      const healed = Math.round(getScalingStat(caster) * (aspects.healing_self / 100) * (1 + healAmp / 100) * (1 + recvMult / 100));
      if (healed > 0) {
        caster.addResource('health', healed);
        /** @type {RpgEffectResult} */
        const r = { type: 'heal', targetId: casterId, amount: healed, rawAmount: healed };
        allResults.push(r);
        logEffect(battle, casterId, r);
      }
    }

    // Side-scoped status apply/remove (self / allies / enemies). Each holder gets its own
    // status-only apply event — mirrors the per-target loop but without damage/cleanse.
    const applyScope = (holderIds, applyList, stacks, duration, removeList, removeStacks) => {
      const apply = applyList ? [...applyList] : [];
      const remove = removeList ? [...removeList] : [];
      if (!apply.length && !remove.length) return;
      for (const holderId of holderIds) {
        if (!isCharAlive(holderId)) continue;
        /** @type {RpgActionApplyEvent} */
        const event = {
          effectId,
          targetId: holderId,
          damage: 0, rawDamage: 0, damageType: 'physical', isCrit: false, isDodged: false,
          healing: 0,
          statusApply: [...apply],
          statusStacks: stacks ?? 1,
          statusDuration: duration,
          statusRemove: [...remove],
          statusRemoveStacks: removeStacks,
          cleanse: false,
          cooldownChange: 0,
          chargesChange: 0,
        };
        if (!game.trigger('battle_action_apply', caster, event)) continue;
        const startIdx = allResults.length;
        for (const statusId of event.statusApply) {
          const def = statusDefs.get(statusId);
          if (!def) continue;
          let s = event.statusStacks;
          if (def.meta?.power_scaling) s = Math.round(getScalingStat(caster) * s / 100);
          const result = applyStatusEffect(casterId, holderId, statusId, s, event.statusDuration);
          if (result) allResults.push(result);
        }
        for (const statusId of event.statusRemove) {
          const have = getStatusStacks(holderId, statusId);
          if (have <= 0) continue;
          const toRemove = event.statusRemoveStacks !== undefined ? Math.min(have, event.statusRemoveStacks) : have;
          if (toRemove <= 0) continue;
          const def = statusDefs.get(statusId);
          removeStatusStacks(holderId, statusId, toRemove);
          allResults.push({ type: 'status_remove', targetId: holderId, statusId, statusName: def?.name || statusId, stacks: toRemove });
        }
        for (let i = startIdx; i < allResults.length; i++) logEffect(battle, casterId, allResults[i]);
        game.trigger('battle_action_applied', caster, event);
        if (event.statusApply.includes('stagger')) checkStaggerThreshold(holderId);
      }
    };

    if (!isBounce) {
      applyScope([casterId], aspects.status_apply_self, aspects.status_stacks_self, aspects.status_duration_self, aspects.status_remove_self, aspects.status_remove_stacks_self);
      applyScope(getAliveAllies(casterId), aspects.status_apply_allies, aspects.status_stacks_allies, aspects.status_duration_allies, aspects.status_remove_allies, aspects.status_remove_stacks_allies);
      applyScope(getAliveEnemies(casterId), aspects.status_apply_enemies, aspects.status_stacks_enemies, aspects.status_duration_enemies, aspects.status_remove_enemies, aspects.status_remove_stacks_enemies);
    }
  }

  // Lifesteal: heal the caster from the ability's TOTAL damage this resolution.
  // Amplified like any heal the caster receives (heal_amplification + heal_received_mult).
  if (lifestealPct > 0 && abilityDamage > 0) {
    const healAmp = caster.getStat('heal_amplification') || 0;
    const recvMult = caster.getStat('heal_received_mult') || 0;
    const healed = Math.round(abilityDamage * (lifestealPct / 100) * (1 + healAmp / 100) * (1 + recvMult / 100));
    if (healed > 0) {
      caster.addResource('health', healed);
      /** @type {RpgEffectResult} */
      const r = { type: 'steal', targetId: caster.id, amount: healed };
      allResults.push(r);
      logEffect(battle, casterId, r);
    }
  }

  // Set cooldown and consume charges
  const abilityState = battle.charState[casterId]?.abilities[abilityId];
  if (!isBounce && abilityState) {
    if (abilityState.charges > 0) abilityState.charges--;
    const cd = meta.cooldown || 0;
    if (cd > 0) abilityState.cooldown = cd;

    // Shared cooldown group: put all abilities with same cd_group on cooldown
    if (meta.cd_group && cd > 0) {
      const charAbilities = caster.getAbilities();
      for (const abId in charAbilities) {
        if (abId === abilityId) continue;
        if (charAbilities[abId].meta.cd_group === meta.cd_group) {
          const state = battle.charState[casterId]?.abilities[abId];
          if (state) state.cooldown = cd;
        }
      }
    }
  }

  if (meta.channel && !isBounce) startChannel(casterId, abilityId, ability, _actionPower);

  _actionPower = null;
  return allResults;
}
