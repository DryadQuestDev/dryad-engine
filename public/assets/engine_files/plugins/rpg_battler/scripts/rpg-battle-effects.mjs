/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle, parseFloatingText, addFloatingText, requiredSelfStatuses } from './rpg-battle-state.mjs';
import { summonFromTemplate } from './rpg-battle-flow.mjs';

const { game } = window.engine;

// Burst (ability-hit) channels use flat armor; DoT channels use % resist.
const FLAT_ARMOR = { physical: 'physical_armor', magic: 'magical_armor' };
const DOT_RESIST = { burn: 'resist_burn', poison: 'resist_poison', bleeding: 'resist_bleed' };

function getConfig() {
  return game.getData('plugins_data/rpg_battler/battle_config') || {};
}

// ── Scaling ──

/** @type {number|null} Per-action cache of effective power; set at the top of resolveAbility. */
let _actionPower = null;

/**
 * Per-action stat bonuses baked into the cast itself, summed across the ability's effects. Unlike a
 * status the ability applies to itself — which only lands after the damage loop and so helps the
 * NEXT cast — these apply to the cast carrying them.
 * @type {Record<string, number>}
 */
let _castBonus = {};

/**
 * Set when an effect of the cast granted `free_action` — the caster acts again instead of ending the
 * turn, exactly as `meta.bonus_action` does, except this is per-effect and so can ride a `chance`
 * roll. Consumed by the battle screen once the whole action (including bounces) has resolved.
 */
let _freeAction = false;

/** True if the action that just resolved granted a free action. Clears on read. */
export function consumeFreeAction() {
  const was = _freeAction;
  _freeAction = false;
  return was;
}

/** Cast-baked bonus for a stat, 0 outside an action resolution. */
function castBonus(stat) {
  return _castBonus[stat] || 0;
}

/** Stats an ability effect may add to its own caster for the duration of that one cast. */
const CAST_BONUS_STATS = ['crit_chance', 'crit_multi', 'accuracy', 'lifesteal'];

/**
 * Compute the effective scaling stat for an ability: `(power + power_bonus) * (1 + power_amplifier/100)`,
 * unless the ability opts out via `meta.unamplified`, which uses raw `power` alone — so a basic
 * attack benefits from neither the bonus nor the amplifier. `power_bonus` is flat (gear-style),
 * `power_amplifier` is a percentage (100 = +100% = doubles power); because the bonus sits inside
 * the amplified term, the two multiply. Used by both runtime (resolveAbility) and tooltip
 * (powerScaledRenderer). Games drive both stats through normal stat channels — typically a stat
 * computer, an equipped item's status, or a buff.
 * @param {Character} character
 * @param {{ meta?: any } | undefined} ability
 * @returns {number}
 */
export function getEffectivePower(character, ability) {
  const base = character.getStat('power');
  if (ability?.meta?.unamplified) return base;
  const bonus = character.getStat('power_bonus') || 0;
  const amp = character.getStat('power_amplifier') || 0;
  return (base + bonus) * (1 + amp / 100);
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
export function applyStatusInstance(characterId, statusId, stacks, duration, source, iconSource) {
  if (stacks <= 0) return null;
  const char = game.getCharacter(characterId);
  if (!char) return null;
  const def = getStatusDefinitions().get(statusId);
  if (!def) return null;
  const status = game.createStatus(statusId);
  if (!status) return null;
  // Third link of the icon chain (item → ability → status): a status that defines no art of its own
  // borrows from whatever applied it. Stored as an id — Status.displayImage resolves it live.
  if (iconSource && !status.image) status.iconSource = iconSource;
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
  // DoT ticks bypass applyDamage (direct resource writes) — supports stay untouched even
  // if a script sticks a DoT on them.
  if (isSupport(characterId)) return [];
  const defs = getStatusDefinitions();

  /** @type {RpgEffectResult[]} */
  const results = [];

  const statuses = character.getStatuses();
  const nameOf = (status) => status.name || defs.get(status.id)?.name || status.id;

  // Regen ticks BEFORE any DoT. Ticking both in getStatuses() order made the holder's fate depend
  // on that arbitrary order (poison 4 vs regen 6 killed or spared the same character depending on
  // which iterated first), and let a lethal DoT stamp `defeated` on its result that a later regen
  // tick in the same pass silently undid — flagging a combatant dead while it fought on.
  for (const status of statuses) {
    if (status.id !== 'regen') continue;
    const totalStacks = Math.round(status.currentStacks);
    if (totalStacks <= 0) continue;
    // Casterless: nobody casts the tick, so no heal_amplification — only the holder's
    // heal_received_mult shapes it.
    const { healed, raw } = applyHeal(null, character, totalStacks);
    if (healed > 0) {
      results.push({ type: 'status_hot', targetId: characterId, amount: healed, rawAmount: raw, statusId: status.id, statusName: nameOf(status) });
    }
  }

  for (const status of statuses) {
    const dmgType = status.meta?.dot_damage_type;
    if (!dmgType) continue;
    const totalStacks = Math.round(status.currentStacks);
    if (totalStacks <= 0) continue;
    const statusName = nameOf(status);
    const rawDmg = totalStacks;
    const dmg = applyDefenses(rawDmg, dmgType, character);
    if (dmg > 0) {
      character.addResource('health', -dmg);
      game.trigger('battle_took_damage', character, dmg, dmgType, null);
      results.push({ type: 'status_dot', targetId: characterId, amount: dmg, rawAmount: rawDmg, damageType: dmgType, statusId: status.id, statusName, defeated: isLethallyDefeated(characterId) });
    } else if (dmg < 0 && character.getResource('health') > 0) {
      // Resist above 100% turned the tick into healing. Skipped once the holder is down: this
      // writes health directly, so applyHeal's no-resurrect guard would not otherwise cover it.
      character.addResource('health', -dmg);
      results.push({ type: 'status_dot_heal', targetId: characterId, amount: -dmg, rawAmount: rawDmg, damageType: dmgType, statusId: status.id, statusName });
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

/**
 * Support combatant (battle_support trait): fights from the sidelines — in the turn order but
 * with no battlefield slot, never targetable, never damaged, invisible to ally-counting effects.
 * Read from charState (cached at battle start) so hot targeting loops skip the trait lookup.
 * @param {string} characterId
 */
export function isSupport(characterId) {
  const battle = currentRpgBattle.value;
  return !!battle?.charState[characterId]?.support;
}

/** @param {string} characterId */
export function isAIControlled(characterId) {
  // Called from the async turn loop, which can resume after a scripted teardown.
  if (!currentRpgBattle.value) return false;
  if (getSide(characterId) === 'enemy') return true;
  // Player-side chars with battle_ai act on their own (read live so a future
  // berserk/charm status can flip it mid-battle by toggling the trait).
  return !!game.getCharacter(characterId)?.getTrait('battle_ai');
}

/**
 * @param {string} characterId
 * @returns {string[]}
 */
export function getAliveEnemies(characterId) {
  const battle = currentRpgBattle.value;
  const side = getSide(characterId);
  const pool = side === 'player' ? battle.enemyParty : battle.playerParty;
  // Supports are untargetable — excluding them HERE covers single-target, AoE,
  // splash, bounce and all AI targeting/scoring in one place.
  return pool.filter(id => isCharAlive(id) && !isSupport(id));
}

/**
 * @param {string} characterId
 * @returns {string[]}
 */
export function getAliveAllies(characterId) {
  const battle = currentRpgBattle.value;
  const side = getSide(characterId);
  const pool = side === 'player' ? battle.playerParty : battle.enemyParty;
  // Also keeps supports out of ally-counting effects (damage_per_ally, ally-wide statuses).
  return pool.filter(id => isCharAlive(id) && !isSupport(id));
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
  const critChance = (caster.getStat('crit_chance') || 0) + castBonus('crit_chance');
  if (critChance > 0 && Math.random() * 100 < critChance) {
    const critMulti = (caster.getStat('crit_multi') || 0) + castBonus('crit_multi');
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

  // Burst hits: flat armor, floored per `damage_floor`, negative armor amplifies.
  const armorStat = FLAT_ARMOR[dmgType];
  if (armorStat) {
    const reduced = Math.round(raw - (target.getStat(armorStat) || 0));
    // damage_floor (%): the minimum share of the raw hit that always lands despite flat armor.
    // Undefined → at least 1. 0 → armor may fully block. 25 → at least 25% of raw gets through.
    const floorPct = getConfig().damage_floor;
    const min = floorPct == null ? 1 : Math.round(raw * floorPct / 100);
    return Math.max(min, reduced);
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
 * Reflects via `thorns` status (1 flat per stack per hit, not consumed, unaffected by shields).
 * Reflects via `reflect` status (1% of damage reaching health per stack — shields stop it).
 * @param {Character} target
 * @param {number} amount
 * @param {string} [damageType]
 * @param {string} [casterId]
 * @returns {{ dealt: number, toHealth: number, shieldAbsorbed: number, thornsReflected: number, reflected: number }}
 */
export function applyDamage(target, amount, damageType, casterId) {
  // Supports are immune to ALL damage — anything that reaches the pipeline (scripted
  // dealDamage, splash, absolute) lands as zero, keeping callers' lifesteal math inert.
  if (isSupport(target.id)) {
    return { dealt: 0, toHealth: 0, shieldAbsorbed: 0, thornsReflected: 0, reflected: 0 };
  }

  let remaining = amount;
  let shieldAbsorbed = 0;
  let thornsReflected = 0;
  let reflected = 0;

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

  if (remaining > 0) {
    target.addResource('health', -remaining);
    game.trigger('battle_took_damage', target, remaining, damageType || 'physical', casterId || null);
  }

  // Thorns (thorns-only): 1 flat damage per stack per hit. Not consumed. Fires on any hit that
  // LANDED, whether or not a shield ate it — spikes answer the blow, not the wound, so a shield
  // must not switch them off (dodged hits never reach this function at all).
  if (casterId && amount > 0 && !isSupport(casterId)) {
    const thorns = target.getStatus('thorns');
    if (thorns && thorns.currentStacks > 0) {
      const caster = game.getCharacter(casterId);
      if (caster) {
        thornsReflected = thorns.currentStacks;
        caster.addResource('health', -thornsReflected);
        game.trigger('battle_took_damage', caster, thornsReflected, 'thorns', target.id);
      }
    }
  }

  // Reflect (reflect-only): returns a PERCENTAGE of the damage that actually reached health, so a
  // shield that soaks the hit genuinely stops it — the opposite of thorns above, which answers the
  // blow itself. Stacks are a straight percent and are never power-scaled.
  if (casterId && remaining > 0 && !isSupport(casterId)) {
    const reflect = target.getStatus('reflect');
    if (reflect && reflect.currentStacks > 0) {
      const caster = game.getCharacter(casterId);
      if (caster) {
        reflected = Math.round(remaining * reflect.currentStacks / 100);
        if (reflected > 0) {
          caster.addResource('health', -reflected);
          game.trigger('battle_took_damage', caster, reflected, 'reflect', target.id);
        }
      }
    }
  }

  // `dealt` is the full hit (what the damage number shows, with "Absorbed X" alongside it);
  // `toHealth` is the part that actually cost the target health, which is what lifesteal feeds on.
  return { dealt: amount, toHealth: remaining, shieldAbsorbed, thornsReflected, reflected };
}

/**
 * Apply healing from caster to target. Scales from power.
 * Central heal primitive: takes a RAW amount — callers compute their own base value (% of power,
 * regen stacks, a script's % of max health) — and applies the heal modifiers uniformly: the
 * caster's heal_amplification (only when there IS a caster — null means a casterless heal and no
 * amplification), then the target's heal_received_mult. Writes the resource; floats/logs are on
 * the caller (result objects through logEffect), so the UI never cares who computed the number.
 * @param {Character | null} caster null = casterless (a status tick, an environment effect)
 * @param {Character} target
 * @param {number} amount raw heal before modifiers (fractions fine — rounded inside)
 * @returns {{ healed: number, raw: number }} raw = post-amplification, pre-received-mult
 */
export function applyHeal(caster, target, amount) {
  // A heal never resurrects. `defeated` is stamped on a result the moment damage lands, so any
  // heal that reached a downed character later in the same resolution (a regen tick, lifesteal
  // after thorns/reflect) would revive it while the battle still counted it dead. death_defiance
  // is the only way back and writes health directly, bypassing this.
  if (target.getResource('health') <= 0) return { healed: 0, raw: 0 };
  const healAmp = caster ? (caster.getStat('heal_amplification') || 0) : 0;
  let healing = Math.round(amount * (1 + healAmp / 100));
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
 * @returns {{ results: RpgEffectResult[], dealt: number, toHealth: number }}
 */
export function applyDamageInstance(casterId, targetId, finalDamage, rawDamage, damageType, isCrit) {
  const target = game.getCharacter(targetId);
  if (!target) return { results: [], dealt: 0 };
  // No result objects for immune supports — a "0 damage" line in the log/floating
  // text would read as a resisted hit rather than an invalid target.
  if (isSupport(targetId)) return { results: [], dealt: 0, toHealth: 0 };
  const r = applyDamage(target, finalDamage, damageType, casterId);
  /** @type {RpgEffectResult[]} */
  const results = [{
    type: 'damage', targetId, amount: r.dealt, rawAmount: Math.round(rawDamage),
    damageType, shieldAbsorbed: r.shieldAbsorbed, isCrit: !!isCrit, defeated: isLethallyDefeated(targetId),
  }];
  if (r.thornsReflected > 0) {
    results.push({ type: 'thorns', targetId: casterId, amount: r.thornsReflected, defeated: isLethallyDefeated(casterId) });
  }
  if (r.reflected > 0) {
    results.push({ type: 'reflect', targetId: casterId, amount: r.reflected, defeated: isLethallyDefeated(casterId) });
  }
  return { results, dealt: r.dealt, toHealth: r.toHealth };
}

/**
 * Apply ONE status with the FINAL stack count (caller does any power-scaling). Handles the
 * stagger guard + threshold check. Returns the result object, or null if nothing applied.
 * @returns {RpgEffectResult|null}
 */
export function applyStatusEffect(casterId, targetId, statusId, stacks, duration, iconSource) {
  if (!(stacks > 0)) return null;
  if (statusId === 'stagger' && getStatusStacks(targetId, 'stun') > 0) return null;
  const r = applyStatusInstance(targetId, statusId, stacks, duration, casterId, iconSource);
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
  if (!ability) { _actionPower = null; _castBonus = {}; return []; }
  const meta = ability.meta;
  // Passed to every status this cast applies, as the look fallback for statuses with no art of
  // their own. `icon_source` is set when the ability itself borrowed from an item, so the status
  // records that item's id and survives a re-icon; otherwise the ability's own id is the source.
  const abilityIcon = meta?.icon_source || (meta?.icon ? abilityId : '');
  _actionPower = actionPower ?? (meta?.flat ? 100 : getEffectivePower(caster, ability));

  // Reset on the primary cast only: bounces re-enter this function and must not clear a free action
  // the primary already granted.
  if (!isBounce) _freeAction = false;

  // Cast-baked stat bonuses SUM across the ability's effects, like the splash values, and last only
  // for this resolution — bounces re-enter resolveAbility and so recompute their own.
  _castBonus = {};
  for (const bEffId in ability.effects) {
    const a = ability.effects[bEffId];
    for (const stat of CAST_BONUS_STATS) {
      if (a[stat]) _castBonus[stat] = (_castBonus[stat] || 0) + a[stat];
    }
  }

  // Deduct costs (skipped on bounces — primary cast already paid)
  if (!isBounce && meta.costs) {
    for (const statId in meta.costs) {
      caster.addResource(statId, -meta.costs[statId]);
    }
  }

  // Consume the self status requirement on cast (skipped on bounces). With an OR-list
  // requirement, the first listed status the caster actually holds pays the cost.
  if (!isBounce && meta.require_status_self_consume) {
    const held = requiredSelfStatuses(meta.require_status_self)
      .find((id) => getStatusStacks(casterId, id) > 0);
    if (held) removeStatusStacks(casterId, held, 1);
  }

  game.trigger('battle_action_cast', caster, abilityId);

  const targetType = meta.target || 'enemy';
  let targets = resolveTargets(casterId, targetType, targetId);

  /** @type {RpgEffectResult[]} */
  const allResults = [];
  const summonedIds = [];         // combatants summoned this cast
  const summonStatusQueue = [];   // { status, stacks } collected from every effect, applied once summons exist

  const statusDefs = getStatusDefinitions();

  // Lifesteal accrues across the whole ability's damage, applied once after all effects resolve.
  let abilityDamage = 0; // health actually lost across all targets — shield-absorbed damage does not count (lifesteal)

  // Splash neighbours are resolved NOW, before the effect loop can kill the primary target: the apply
  // runs after the loop, and expandSplashTargets reads the ALIVE pool, so a primary that died from this
  // ability's own damage would otherwise find no neighbours. splash_count, splash_damage and
  // splash_statuses all SUM across the ability's effects. Damage and statuses spill independently:
  // either percentage alone is enough to make the spill happen.
  let splashCount = 0, splashPct = 0, splashStatusPct = 0;
  const splashEntries = [], splashStatusEntries = [];
  for (const sEffId in ability.effects) {
    const a = ability.effects[sEffId];
    splashCount += a.splash_count || 0;
    splashPct += a.splash_damage || 0;
    splashStatusPct += a.splash_statuses || 0;
    if (a.damage) splashEntries.push(a);
    if (a.status_apply_target?.length) splashStatusEntries.push(a);
  }
  const splashesDamage = splashPct > 0 && splashEntries.length > 0;
  const splashesStatuses = splashStatusPct > 0 && splashStatusEntries.length > 0;
  const splashTargets = (!isBounce && splashCount > 0 && (splashesDamage || splashesStatuses))
    ? expandSplashTargets(casterId, targets, splashCount, true)
    : [];

  // Targets that have already evaded a damaging effect of this cast. Effects are walked in `order`,
  // so a later rider is skipped for anyone the attack already missed — the whole ability misses that
  // target rather than the damage missing while its statuses land anyway. Damaging effects still roll
  // for themselves, so a multi-hit ability keeps an independent roll per hit.
  const evaded = new Set();

  for (const effectId in ability.effects) {
    const aspects = ability.effects[effectId];

    // Roll chance. Percent (0-100), matching every other percentage in the plugin and the dodge
    // roll below — a bare 0-1 fraction here made an authored `40` mean "always".
    if (aspects.chance !== undefined && Math.random() * 100 > aspects.chance) continue;

    // Past the chance roll, so `free_action` on an effect with `chance` only grants on a success.
    // Needs no target — an effect carrying nothing else still refunds the turn. Primary cast only:
    // bounces re-enter resolveAbility and would re-roll the chance per hop, silently turning an
    // authored 40% on a bounce-3 ability into an effective 87%.
    if (aspects.free_action && !isBounce) _freeAction = true;

    // Summon: spawn a combatant from a character template onto the caster's side (once per effect,
    // not re-summoned on bounces). Independent of the ability's target; composes with other aspects.
    if (aspects.summon && !isBounce) {
      // summon_amount repeats the SAME template; different templates live in their own effects (an
      // effect id can only appear once in the merged ability, so duplicates there would collapse).
      const amount = Math.max(1, Math.round(aspects.summon_amount ?? 1));
      for (let i = 0; i < amount; i++) {
        // Cap checked inside, per spawn, BEFORE creation — canUseAbility greys the ability at
        // the cap, but summon_amount can exceed the remaining slots and channel re-fires skip
        // the grey check entirely; creating first would leak the refused characters' inventories.
        const id = summonFromTemplate(aspects.summon, getSide(casterId));
        if (!id) break;
        summonedIds.push(id);
        allResults.push({ type: 'summon', targetId: id });
      }
    }

    // Buffs to bolt onto this cast's summon(s). Every effect carrying summon_status contributes
    // independently, so multiple effects stack rather than dedupe. Applied after the loop (below),
    // once the summons exist.
    if (aspects.summon_status?.length && !isBounce) {
      for (const statusId of aspects.summon_status) {
        summonStatusQueue.push({ status: statusId, stacks: aspects.summon_status_stacks ?? 1 });
      }
    }

    // Per-target work (damage / heal / status / cleanse / cooldown / charges). When the effect only
    // does caster-side things (summon and/or self-status), the target list is empty so the loop
    // below is a no-op and no empty battle_action_apply events fire.
    const hasTargetPayload = !!(aspects.damage || aspects.healing
      || aspects.status_apply_target?.length || aspects.status_remove_target?.length
      || aspects.cleanse || aspects.cooldown_change || aspects.charges_change || aspects.require_status_target_consume);

    const effectTargets = hasTargetPayload ? targets : [];

    for (const tId of effectTargets) {
      const target = game.getCharacter(tId);
      if (!target || target.getResource('health') <= 0) continue;

      // Rider on a target that already dodged this cast: skip it silently — the DODGE float and log
      // line were emitted by the damaging effect that missed, and repeating them per rider would read
      // as several separate misses. Side-scoped applies (self/allies/enemies) are untouched: they run
      // outside this loop, so a self-buff still lands even when every target evaded.
      if (!aspects.damage && evaded.has(tId)) continue;

      // Target status requirement (pre-condition, not part of the apply event). The stack itself is
      // consumed after the damage block below, never here: consuming at the gate would strip the
      // status before applyDefenses reads it, so the payoff hit could never benefit from what it spends.
      if (aspects.require_status_target && getStatusStacks(tId, aspects.require_status_target) <= 0) continue;

      // ── Compute all math ──

      let rawDamage = 0, finalDamage = 0, isCrit = false, isDodged = false;
      let dmgType = aspects.damage_type || 'physical';

      if (aspects.damage) {
        const calc = calculateRawDamage(caster, aspects, target);
        rawDamage = calc.raw;
        isCrit = calc.isCrit;

        // Accuracy subtracts from the target's dodge first, then clamp the FINAL value to [0,100].
        // The cap sits on the result, never on the raw dodge stat — capping first would let a
        // >100-dodge target ignore the attacker's first points of accuracy for free.
        const dodgeChance = Math.min(100, Math.max(0, (target.getStat('dodge') || 0) - ((caster.getStat('accuracy') || 0) + castBonus('accuracy'))));
        isDodged = dodgeChance > 0 && Math.random() * 100 < dodgeChance;

        if (!isDodged) {
          finalDamage = applyDefenses(rawDamage, dmgType, target);
        }
      }

      // Raw, pre-modifier value: amplification/received-mult are applyHeal's job after the
      // apply event, so listeners mutate the base number and modifiers still land on top.
      let healing = 0;
      if (aspects.healing) {
        healing = Math.round(getScalingStat(caster) * (aspects.healing / 100));
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
        evaded.add(tId);
        /** @type {RpgEffectResult} */
        const dodgeResult = { type: 'dodge', targetId: tId };
        allResults.push(dodgeResult);
        logEffect(battle, casterId, dodgeResult);
        continue;
      }

      // Damage
      if (applyEvent.damage > 0) {
        const { results, toHealth } = applyDamageInstance(casterId, tId, applyEvent.damage, applyEvent.rawDamage, applyEvent.damageType, applyEvent.isCrit);
        abilityDamage += toHealth;
        allResults.push(...results);
      }

      // Spend the required target status now that the damage it modified has landed — a mark that
      // raises damage taken has to apply to the shot that eats it. A dodge or a vetoed apply
      // `continue`s above, so a hit that never connected leaves the mark standing.
      if (aspects.require_status_target && aspects.require_status_target_consume) {
        removeStatusStacks(tId, aspects.require_status_target, 1);
      }

      // Healing
      if (applyEvent.healing > 0) {
        const { healed, raw } = applyHeal(caster, target, applyEvent.healing);
        // Write back what actually landed, so battle_action_applied listeners (accolades) count
        // real healing rather than the pre-modifier base.
        applyEvent.healing = healed;
        allResults.push({ type: 'heal', targetId: tId, amount: healed, rawAmount: raw });
      }

      // Status apply (each id in the list)
      for (const statusId of applyEvent.statusApply) {
        const def = statusDefs.get(statusId);
        if (!def) continue;
        // Per-ability power-scaling decided here; applyStatusEffect takes the final stack count.
        let stacks = applyEvent.statusStacks;
        if (def.meta?.power_scaling) stacks = Math.round(getScalingStat(caster) * stacks / 100);
        const result = applyStatusEffect(casterId, tId, statusId, stacks, applyEvent.statusDuration, abilityIcon);
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
      const { healed, raw } = applyHeal(caster, caster, getScalingStat(caster) * (aspects.healing_self / 100));
      if (healed > 0) {
        /** @type {RpgEffectResult} */
        const r = { type: 'heal', targetId: casterId, amount: healed, rawAmount: raw };
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
          const result = applyStatusEffect(casterId, holderId, statusId, s, event.statusDuration, abilityIcon);
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

  // Apply the pre-resolved splash to each neighbour captured before the loop: splash_damage% of every
  // damage entry (per-type) and splash_statuses% of every target status. A neighbour that died in the
  // meantime is skipped. Health damage feeds abilityDamage so lifesteal still counts it.
  for (const nId of splashTargets) {
    const nbr = game.getCharacter(nId);
    if (!nbr || nbr.getResource('health') <= 0) continue;
    const startIdx = allResults.length;
    if (splashesDamage) {
      for (const a of splashEntries) {
        const type = a.damage_type || 'physical';
        const calc = calculateRawDamage(caster, { ...a, damage: a.damage * splashPct / 100 }, nbr);
        const finalDmg = applyDefenses(calc.raw, type, nbr);
        if (finalDmg <= 0) continue;
        const { results, toHealth } = applyDamageInstance(casterId, nId, finalDmg, calc.raw, type, calc.isCrit);
        abilityDamage += toHealth;
        allResults.push(...results);
      }
    }
    if (splashesStatuses) {
      for (const a of splashStatusEntries) {
        const base = a.status_stacks_target ?? 1;
        for (const statusId of a.status_apply_target) {
          const def = statusDefs.get(statusId);
          if (!def) continue;
          // Take the primary target's stacks, then the splash percentage of that — rounding once at
          // the end, so a small share of a power-scaled status is not lost to a double round.
          const onTarget = def.meta?.power_scaling ? getScalingStat(caster) * base / 100 : base;
          const stacks = Math.round(onTarget * splashStatusPct / 100);
          if (stacks <= 0) continue;
          const result = applyStatusEffect(casterId, nId, statusId, stacks, a.status_duration_target, abilityIcon);
          if (result) allResults.push(result);
        }
      }
    }
    for (let i = startIdx; i < allResults.length; i++) logEffect(battle, casterId, allResults[i]);
  }

  // Apply queued summon buffs to every combatant summoned this cast (from all effects). A
  // status with meta.power_scaling scales its stacks off the caster's power; otherwise flat stacks.
  if (summonedIds.length && summonStatusQueue.length) {
    for (const sid of summonedIds) {
      for (const { status: statusId, stacks: raw } of summonStatusQueue) {
        const def = statusDefs.get(statusId);
        if (!def) continue;
        const stacks = def.meta?.power_scaling ? Math.round(getScalingStat(caster) * raw / 100) : raw;
        const result = applyStatusEffect(casterId, sid, statusId, stacks, undefined, abilityIcon);
        if (result) allResults.push(result);
      }
    }
  }

  // Lifesteal: heal the caster from the ability's TOTAL damage this resolution. The caster's own
  // `lifesteal` stat is the floor and the effects' `lifesteal` aspects add on top, exactly like
  // crit_chance — so gear/strain sustain applies to every ability and a draining ability stacks
  // with it. Cast bonuses are summed upfront from every effect, so unlike the old in-loop tally an
  // effect whose `chance` roll failed still contributes (matching the other cast-bonus stats).
  // Amplified like any heal the caster receives (heal_amplification + heal_received_mult).
  const lifestealPct = (caster.getStat('lifesteal') || 0) + castBonus('lifesteal');
  if (lifestealPct > 0 && abilityDamage > 0) {
    const { healed } = applyHeal(caster, caster, abilityDamage * (lifestealPct / 100));
    if (healed > 0) {
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
    const cd = meta.cd || 0;
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
  _castBonus = {};
  return allResults;
}
