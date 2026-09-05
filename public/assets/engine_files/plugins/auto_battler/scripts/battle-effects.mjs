/// <reference path="./dtypes.d.ts" />

import { currentBattle } from './battle-state.mjs';

const { game } = window.engine;

const ELEMENTAL_TYPES = ['fire', 'water', 'air', 'earth', 'arcane', 'poison', 'light', 'dark'];

/** Returns the scaling stat value for a given damage type. */
function getScalingStat(caster, damageType) {
  let value;
  if (damageType === 'physical') value = caster.getStat('power');
  else if (damageType === 'absolute') value = Math.max(caster.getStat('power'), caster.getStat('sorcery'));
  else value = caster.getStat('sorcery');

  const event = { value };
  game.trigger('battle_scaling_stat', currentBattle.value, caster, damageType, event);
  return event.value;
}

/** Derive the damage type a status scales with from its meta. */
export function getStatusDamageType(statusDef) {
  const meta = statusDef?.meta || {};
  if (meta.absorb) return 'absolute';
  if (meta.hot) return 'sorcery';
  if (meta.dot_damage_type) return meta.dot_damage_type;
  return 'absolute';
}

// ── Status helpers ──

/** @returns {Map<string, any>} */
export function getStatusDefinitions() {
  return game.getData('character_statuses', true);
}

/**
 * Apply via engine status API. For multi_stack=true statuses appends a new instance
 * (DD-style); for single-stack refreshes the existing one.
 */
export function applyStatusInstance(characterId, statusId, stacks, duration, source) {
  if (stacks <= 0) return null;
  const char = game.getCharacter(characterId);
  if (!char) return null;
  const def = getStatusDefinitions().get(statusId);
  if (!def) return null;
  const status = game.createStatus(statusId);
  if (!status) return null;
  char.addStatus(status, { stacks, duration, source });
  return { applied: stacks, name: def.name };
}

/** Remove stacks from a status. Removes the status entirely if it drops to 0. */
export function removeStatusStacks(characterId, statusId, stacks) {
  return game.getCharacter(characterId)?.removeStatusStacks(statusId, stacks) ?? 0;
}

/** Get total stacks of a status on a character. */
export function getStatusStacks(characterId, statusId) {
  const char = game.getCharacter(characterId);
  return char?.getStatus(statusId)?.currentStacks ?? 0;
}

/** Process DoT and HoT status effects for a character. Reads status.meta.dot_damage_type / .hot. */
export function processStatusEffects(characterId) {
  const character = game.getCharacter(characterId);
  if (!character) return [];
  const defs = getStatusDefinitions();

  /** @type {EffectResult[]} */
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
        results.push({ type: 'status_dot', targetId: characterId, amount: dmg, rawAmount: rawDmg, damageType: dmgType, statusId: status.id, statusName });
      }
    } else if (isRegen) {
      let heal = totalStacks;
      const rawHeal = heal;
      const healReceivedMult = character.getStat('heal_received_mult') || 0;
      if (healReceivedMult) {
        heal = Math.max(0, Math.round(heal * (1 + healReceivedMult / 100)));
      }
      if (heal > 0) {
        character.addResource('health', heal);
        results.push({ type: 'status_hot', targetId: characterId, amount: heal, rawAmount: rawHeal, statusId: status.id, statusName });
      }
    }
  }

  return results;
}

/**
 * Resolve a full ability cast: deduct costs, build effect steps.
 * Costs are deducted immediately. Each effect becomes a step function
 * that applies its aspects and returns log entries. The final step
 * handles charge/cooldown bookkeeping.
 * @param {string} casterId
 * @param {string} abilityId
 * @param {string} targetPos - "row_col" on the target grid
 * @param {{ meta: any, effects: Record<string, any> }} [abilityOverride] - optional ability data (for autocast abilities not on the character)
 * @returns {EffectStep[]} array of step objects
 */
export function resolveAbility(casterId, abilityId, targetPos, abilityOverride) {
  const battle = currentBattle.value;
  const caster = game.getCharacter(casterId);
  const ability = abilityOverride || caster.getAbility(abilityId);
  if (!ability) return [{ execute: () => [], aspects: null, cells: [] }];

  const meta = ability.meta;

  // Deduct costs immediately
  if (meta.costs) {
    for (const statId in meta.costs) {
      caster.addResource(statId, -meta.costs[statId]);
    }
  }

  // Consume preparation status
  if (meta.preparation) {
    removeStatusStacks(casterId, 'preparation', 1);
  }

  // Determine caster position and target side
  const casterPos = getCharacterPosition(casterId);
  const targetSide = casterPos.side === 'player' ? 'enemy' : 'player';

  // Resolve target side based on ability target types
  let effectiveSide = targetSide;
  if (meta.target) {
    const targets = meta.target;
    if (targets.includes('self') || targets.includes('ally')) {
      effectiveSide = casterPos.side;
    }
  }

  const areaShape = meta.area_shape || 'single';
  const cfg = game.getData('plugins_data/auto_battler/battle_config', true);

  const steps = [];

  // Each effect becomes a step with its own targets based on area_size
  for (const effectId in ability.effects) {
    const aspects = ability.effects[effectId];

    // Roll chance up front — skip entire step if failed
    if (aspects.chance !== undefined && Math.random() > aspects.chance) continue;

    const effectAreaSize = aspects.area_size ?? 0;
    const effectTargets = getTargets(casterPos, targetPos, areaShape, effectAreaSize, effectiveSide);
    let effectCells = getAoECells(targetPos, areaShape, effectAreaSize, cfg.rows_size, cfg.columns_size);
    if (areaShape === 'chain') {
      effectCells = [...new Set([...effectCells, ...effectTargets.map(t => `${t.row}_${t.col}`)])];
    }

    steps.push({
      aspects,
      cells: effectCells,
      execute: () => {
        /** @type {EffectResult[]} */
        const logs = [];
        let totalDamageDealt = 0;

        for (const t of effectTargets) {
          const target = game.getCharacter(t.characterId);
          if (!target || target.getResource('health') <= 0) continue;

          // Combo gate: require and consume 1 combo stack per target
          if (aspects.combo) {
            const stacks = getStatusStacks(t.characterId, 'combo');
            if (stacks <= 0) continue;
            removeStatusStacks(t.characterId, 'combo', 1);
          }

          // Damage
          if (aspects.damage) {
            const dmgType = aspects.damage_type || 'physical';
            const { raw, isCrit } = calculateRawDamage(caster, aspects, target);

            // Pre-defense emitter
            const rawEvent = { amount: raw, damageType: dmgType, ability, isCrit };
            if (!game.trigger('battle_damage_raw', battle, caster, target, rawEvent)) continue;

            // Defense phase
            let finalDmg = applyDefenses(rawEvent.amount, dmgType, target);

            // Dodge roll
            const dodgeChance = target.getStat('dodge') || 0;
            const isDodged = dodgeChance > 0 && Math.random() * 100 < dodgeChance;

            // Post-defense emitter (listeners can mutate isDodged)
            const finalEvent = { amount: finalDmg, damageType: dmgType, ability, isCrit, isDodged };
            if (!game.trigger('battle_damage_final', battle, caster, target, finalEvent)) continue;

            if (finalEvent.isDodged) {
              logs.push({ type: 'dodge', targetId: target.id });
              continue;
            }

            const result = applyDamage(target, finalEvent.amount, dmgType);
            totalDamageDealt += result.dealt;
            logs.push({ type: 'damage', targetId: target.id, amount: result.dealt, rawAmount: Math.round(rawEvent.amount), damageType: dmgType, shieldAbsorbed: result.shieldAbsorbed, isCrit });
          }

          // Healing
          if (aspects.healing) {
            const { healed, raw } = applyHealing(caster, target, aspects.healing);
            logs.push({ type: 'heal', targetId: target.id, amount: healed, rawAmount: raw });
          }

          // Status apply (each id in the list)
          if (aspects.status_apply) {
            const baseStacks = aspects.status_stacks ?? 1;
            const defs = getStatusDefinitions();
            for (const statusId of aspects.status_apply) {
              const def = defs.get(statusId);
              if (!def) continue;
              let stacks = baseStacks;
              if (def.meta?.power_scaling) stacks = Math.round(getScalingStat(caster, getStatusDamageType(def)) * stacks / 100);
              if (stacks <= 0) continue;
              const result = applyStatusInstance(t.characterId, statusId, stacks, aspects.status_duration, casterId);
              if (result) logs.push({ type: 'status_apply', targetId: t.characterId, statusId, statusName: result.name, stacks: result.applied, duration: aspects.status_duration || 0 });
            }
          }

          // Cleanse: remove polarity-matched battle statuses (reads status.meta directly)
          if (aspects.cleanse) {
            const casterSide = getCharacterPosition(casterId)?.side;
            const tSide = getCharacterPosition(t.characterId)?.side;
            const removePolarity = (casterSide === tSide) ? 'negative' : 'positive';
            const defs = getStatusDefinitions();
            for (const status of [...target.getStatuses()]) {
              if (!status.meta?.is_battle) continue;
              const polarity = status.polarity || defs.get(status.id)?.polarity;
              if (polarity === removePolarity) target.removeStatus(status.id);
            }
            logs.push({ type: 'cleanse', targetId: t.characterId });
          }

          // Status remove (each id in the list; status_remove_stacks unset = remove all)
          if (aspects.status_remove) {
            for (const statusId of aspects.status_remove) {
              const have = getStatusStacks(t.characterId, statusId);
              if (have <= 0) continue;
              const toRemove = aspects.status_remove_stacks !== undefined
                ? Math.min(have, aspects.status_remove_stacks)
                : have;
              if (toRemove > 0) removeStatusStacks(t.characterId, statusId, toRemove);
            }
          }

          // Cooldown change on target's abilities
          if (aspects.cooldown_change && battle.abilitiesState[t.characterId]) {
            for (const abId in battle.abilitiesState[t.characterId]) {
              const state = battle.abilitiesState[t.characterId][abId];
              state.cooldown = Math.max(0, state.cooldown + aspects.cooldown_change);
            }
          }

          // Charges change on target's abilities
          if (aspects.charges_change && battle.abilitiesState[t.characterId]) {
            for (const abId in battle.abilitiesState[t.characterId]) {
              const state = battle.abilitiesState[t.characterId][abId];
              if (state.charges !== -1) {
                state.charges = Math.max(0, state.charges + aspects.charges_change);
              }
            }
          }

          // Movement
          if (aspects.movement_x || aspects.movement_y) {
            const moveTargetType = aspects.movement_target || 'target';
            if (moveTargetType === 'target' || moveTargetType === 'all_targets') {
              applyMovement(t.characterId, aspects.movement_x || 0, aspects.movement_y || 0);
            }
          }
        }

        // Lifesteal: heal caster based on % of total damage dealt
        if (aspects.lifesteal && totalDamageDealt > 0) {
          const healed = Math.round(totalDamageDealt * (aspects.lifesteal / 100));
          if (healed > 0) {
            caster.addResource('health', healed);
            logs.push({ type: 'steal', targetId: caster.id, amount: healed });
          }
        }

        // Relocate self (move ability)
        if (aspects.relocate_self) {
          const grid = casterPos.side === 'player' ? battle.playerGrid : battle.enemyGrid;
          const oldKey = `${casterPos.row}_${casterPos.col}`;
          if (!grid[targetPos]) {
            delete grid[oldKey];
            grid[targetPos] = casterId;
            logs.push({ type: 'move' });
          }
        }

        // Status apply to self
        if (aspects.status_apply_self) {
          const baseStacks = aspects.status_stacks_self ?? 1;
          const defs = getStatusDefinitions();
          for (const statusId of aspects.status_apply_self) {
            const def = defs.get(statusId);
            if (!def) continue;
            let stacks = baseStacks;
            if (def.meta?.power_scaling) stacks = Math.round(getScalingStat(caster, getStatusDamageType(def)) * stacks / 100);
            if (stacks <= 0) continue;
            const result = applyStatusInstance(casterId, statusId, stacks, aspects.status_duration_self, casterId);
            if (result) logs.push({ type: 'status_apply', targetId: casterId, statusId, statusName: result.name, stacks: result.applied, duration: aspects.status_duration_self || 0 });
          }
        }

        // Self movement
        if ((aspects.movement_x || aspects.movement_y) && aspects.movement_target === 'self') {
          applyMovement(casterId, aspects.movement_x || 0, aspects.movement_y || 0);
        }

        return logs;
      },
    });
  }

  // Final step: consume charge + set cooldown
  steps.push({
    aspects: null,
    cells: [],
    execute: () => {
      const abilityState = battle.abilitiesState[casterId]?.[abilityId];
      if (abilityState) {
        if (abilityState.charges > 0) abilityState.charges--;
        const cd = meta.cd || 0;
        if (cd > 0) abilityState.cooldown = cd;
      }
      return [];
    },
  });

  return steps;
}

/**
 * Calculate raw damage before defenses (includes crit).
 * @param {*} caster - Character
 * @param {Record<string, any>} aspects - effect aspects
 * @param {*} target - Target character
 * @returns {{ raw: number, isCrit: boolean }}
 */
export function calculateRawDamage(caster, aspects, target) {
  const battle = currentBattle.value;
  const dmgType = aspects.damage_type || 'physical';
  const baseStat = getScalingStat(caster, dmgType);
  let rawDamage = baseStat * (aspects.damage / 100);

  // Caster-side damage multipliers (additive %, 10% floor)
  let dmgMult = caster.getStat('damage_dealt_mult');
  const missingHpCoef = caster.getStat('damage_per_missing_health');
  if (missingHpCoef) dmgMult += missingHpCoef * (1 - caster.getResourceRatio('health')) * 100;
  const allyCoef = caster.getStat('damage_per_ally');
  if (allyCoef) {
    const pos = getCharacterPosition(caster.id);
    if (pos) {
      const grid = pos.side === 'player' ? battle.playerGrid : battle.enemyGrid;
      let allies = 0;
      for (const k in grid) { if (grid[k] && grid[k] !== caster.id) allies++; }
      dmgMult += allyCoef * allies;
    }
  }
  const neighborCoef = caster.getStat('damage_per_neighbor');
  if (neighborCoef) {
    dmgMult += neighborCoef * getAdjacentAllyCount(caster.id);
  }
  // Focus Fire: bonus damage per own focus_mark stack on target
  const focusFire = caster.getStat('focus_fire');
  if (focusFire) {
    const markStatus = target.getStatus('focus_mark');
    const markInstances = markStatus?.getInstances() ?? [];
    const ownMarks = markInstances
      .filter(i => i.source === caster.id)
      .reduce((s, i) => s + i.stacks, 0);
    if (ownMarks > 0) dmgMult += ownMarks * focusFire;
  }
  const cfg = game.getData('plugins_data/auto_battler/battle_config', true);
  const multFloor = cfg?.mult_floor ?? 0.1;
  rawDamage *= Math.max(1 + dmgMult / 100, multFloor);

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
 * Apply target-side multiplier and defenses to raw damage.
 * @param {number} raw - Raw damage amount
 * @param {string} dmgType - Damage type
 * @param {*} target - Character
 * @returns {number}
 */
export function applyDefenses(raw, dmgType, target) {
  // Target-side damage multiplier
  const dmgTakenMult = target.getStat('damage_taken_mult');
  raw *= Math.max(1 + dmgTakenMult / 100, 0.1);

  if (dmgType === 'absolute') {
    return Math.max(0, Math.round(raw));
  }

  if (dmgType === 'physical') {
    return Math.max(0, Math.round(raw - target.getStat('armor')));
  }

  if (ELEMENTAL_TYPES.includes(dmgType)) {
    const resist = target.getStat(`resist_${dmgType}`) || 0;
    return Math.max(0, Math.round(raw * (1 - resist / 100)));
  }

  return Math.max(0, Math.round(raw));
}

/**
 * Apply damage to target, absorbing via absorb tokens first.
 * Absolute damage bypasses shields entirely.
 * @param {*} target - Character
 * @param {number} amount
 * @param {string} [damageType]
 * @returns {{ dealt: number, shieldAbsorbed: number }}
 */
/** Drain `amount` shield stacks shortest-duration-first (-1 = permanent goes last). */
function consumeShieldStacks(target, amount) {
  const status = target.getStatus('shield');
  if (!status || amount <= 0) return;
  const instances = status.getInstances();
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
  /** @type {any} */ (status)._instances = instances.filter(i => i.stacks > 0);
  if (status.currentStacks <= 0) target.removeStatus('shield');
}

export function applyDamage(target, amount, damageType) {
  let remaining = amount;
  let shieldAbsorbed = 0;

  // Absorb (shield-only) — each stack absorbs 1 damage, consumed shortest-duration first
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
  return { dealt: amount, shieldAbsorbed };
}

/**
 * Apply healing from caster to target.
 * @param {*} caster - Character
 * @param {*} target - Character
 * @param {number} healPercent - base-100 healing value
 * @returns {{ healed: number, raw: number }}
 */
export function applyHealing(caster, target, healPercent) {
  const healAmp = caster.getStat('heal_amplification') || 0;
  let healing = Math.round(getScalingStat(caster, 'sorcery') * (healPercent / 100) * ((100 + healAmp) / 100));
  const raw = healing;
  const healReceivedMult = target.getStat('heal_received_mult') || 0;
  if (healReceivedMult) {
    healing = Math.max(0, Math.round(healing * (1 + healReceivedMult / 100)));
  }
  target.addResource('health', healing);
  return { healed: healing, raw };
}

/**
 * Add shield (absorb status) to target.
 * @param {*} target - Character
 * @param {number} amount
 */
export function applyShield(target, amount, source) {
  return applyStatusInstance(target.id, 'shield', amount, undefined, source || target.id);
}

/**
 * Move a character on its grid.
 * @param {string} characterId
 * @param {number} dx - column movement (+toward front, -away)
 * @param {number} dy - row movement (+down, -up)
 */
function applyMovement(characterId, dx, dy) {
  const battle = currentBattle.value;
  const pos = getCharacterPosition(characterId);
  if (!pos) return;

  const grid = pos.side === 'player' ? battle.playerGrid : battle.enemyGrid;
  const config = game.getData('plugins_data/auto_battler/battle_config', true);
  const maxRows = config.rows_size;
  const maxCols = config.columns_size;

  const newRow = Math.max(0, Math.min(maxRows - 1, pos.row + dy));
  const newCol = Math.max(0, Math.min(maxCols - 1, pos.col + dx));
  const newKey = `${newRow}_${newCol}`;

  // Only move if destination is empty
  if (!grid[newKey]) {
    const oldKey = `${pos.row}_${pos.col}`;
    delete grid[oldKey];
    grid[newKey] = characterId;
  }
}

/**
 * Get all cell position keys in an AoE pattern (regardless of occupancy).
 * For chain: returns just [targetPos] since chain depends on occupied cells.
 * @param {string} targetPos - "row_col"
 * @param {string} areaShape
 * @param {number} areaSize
 * @param {number} maxRows
 * @param {number} maxCols
 * @returns {string[]}
 */
export function getAoECells(targetPos, areaShape, areaSize, maxRows, maxCols) {
  const [row, col] = targetPos.split('_').map(Number);
  const positions = [];
  switch (areaShape) {
    case 'single':
      positions.push(targetPos);
      break;
    case 'row': {
      const size = areaSize;
      for (let c = 0; c < maxCols; c++)
        if (Math.abs(c - col) <= size) positions.push(`${row}_${c}`);
      break;
    }
    case 'column': {
      const size = areaSize;
      for (let r = 0; r < maxRows; r++)
        if (Math.abs(r - row) <= size) positions.push(`${r}_${col}`);
      break;
    }
    case 'cross': {
      const size = areaSize;
      for (let r = 0; r < maxRows; r++)
        for (let c = 0; c < maxCols; c++)
          if ((r === row && Math.abs(c - col) <= size) || (c === col && Math.abs(r - row) <= size))
            positions.push(`${r}_${c}`);
      break;
    }
    case 'blast': {
      const radius = areaSize;
      for (let r = 0; r < maxRows; r++)
        for (let c = 0; c < maxCols; c++)
          if (Math.abs(r - row) <= radius && Math.abs(c - col) <= radius)
            positions.push(`${r}_${c}`);
      break;
    }
    case 'all':
      for (let r = 0; r < maxRows; r++)
        for (let c = 0; c < maxCols; c++) positions.push(`${r}_${c}`);
      break;
    default:
      positions.push(targetPos);
  }
  return positions;
}

/**
 * Get all targets for an ability based on AoE shape (occupied cells only).
 * @param {{ side: string, row: number, col: number }} casterPos
 * @param {string} targetPos - "row_col"
 * @param {string} areaShape
 * @param {number} areaSize
 * @param {string} targetSide - 'player' or 'enemy'
 * @returns {{ characterId: string, row: number, col: number }[]}
 */
export function getTargets(casterPos, targetPos, areaShape, areaSize, targetSide) {
  const battle = currentBattle.value;
  const grid = targetSide === 'player' ? battle.playerGrid : battle.enemyGrid;

  // Chain has its own occupancy-dependent logic
  if (areaShape === 'chain') {
    const [r, c] = targetPos.split('_').map(Number);
    return getChainTargets(grid, r, c, areaSize);
  }

  const config = game.getData('plugins_data/auto_battler/battle_config', true);
  const cells = getAoECells(targetPos, areaShape, areaSize, config.rows_size, config.columns_size);
  return cells
    .filter(key => grid[key])
    .map(key => {
      const [r, c] = key.split('_').map(Number);
      return { characterId: grid[key], row: r, col: c };
    });
}

function getChainTargets(grid, startRow, startCol, maxTargets) {
  const count = maxTargets || 3;
  const results = [];
  const used = new Set();

  const firstKey = `${startRow}_${startCol}`;
  if (grid[firstKey]) {
    results.push({ characterId: grid[firstKey], row: startRow, col: startCol });
    used.add(firstKey);
  }

  while (results.length < count) {
    const last = results[results.length - 1];
    if (!last) break;

    let closest = null;
    let closestDist = Infinity;

    for (const key in grid) {
      if (used.has(key)) continue;
      const [r, c] = key.split('_').map(Number);
      const dist = Math.abs(r - last.row) + Math.abs(c - last.col);
      if (dist < closestDist) {
        closestDist = dist;
        closest = { characterId: grid[key], row: r, col: c, key };
      }
    }

    if (!closest) break;
    used.add(closest.key);
    results.push({ characterId: closest.characterId, row: closest.row, col: closest.col });
  }

  return results;
}

/**
 * Find a character's position on either grid.
 * @param {string} characterId
 * @returns {{ side: string, row: number, col: number } | null}
 */
export function getCharacterPosition(characterId) {
  const battle = currentBattle.value;
  for (const key in battle.playerGrid) {
    if (battle.playerGrid[key] === characterId) {
      const [r, c] = key.split('_').map(Number);
      return { side: 'player', row: r, col: c };
    }
  }
  for (const key in battle.enemyGrid) {
    if (battle.enemyGrid[key] === characterId) {
      const [r, c] = key.split('_').map(Number);
      return { side: 'enemy', row: r, col: c };
    }
  }
  return null;
}

/**
 * Count allies adjacent to a character on the grid (8-connectivity).
 * @param {string} characterId
 * @returns {number}
 */
export function getAdjacentAllyCount(characterId) {
  const battle = currentBattle.value;
  const pos = getCharacterPosition(characterId);
  if (!pos) return 0;
  const grid = pos.side === 'player' ? battle.playerGrid : battle.enemyGrid;
  let count = 0;
  for (const key in grid) {
    if (!grid[key] || grid[key] === characterId) continue;
    const [r, c] = key.split('_').map(Number);
    if (Math.abs(r - pos.row) <= 1 && Math.abs(c - pos.col) <= 1) count++;
  }
  return count;
}

/**
 * Calculate range distance between a caster and a target position on the enemy grid.
 * Formula: casterCol + 1 + countOccupiedEnemyCols(0 to targetCol - 1)
 * Empty enemy columns are skipped, allowing melee to reach backline when frontline is cleared.
 * @param {{ side: string, row: number, col: number }} casterPos
 * @param {number} targetCol - column on the enemy grid
 * @returns {number}
 */
/**
 * Get effective range for an ability: meta.range + sum of range_change from all effects.
 * Returns undefined if ability has no range limit (unlimited).
 * @param {{ meta: any, effects: Record<string, any> }} ability
 * @returns {number|undefined}
 */
export function getEffectiveRange(ability) {
  const base = ability.meta.range;
  if (base == null) return undefined;
  let change = 0;
  for (const effectId in ability.effects) {
    change += ability.effects[effectId].range_change || 0;
  }
  return Math.max(1, base + change);
}

export function calculateRange(casterPos, targetCol) {
  const battle = currentBattle.value;
  const enemyGrid = casterPos.side === 'player' ? battle.enemyGrid : battle.playerGrid;

  // Count occupied enemy columns between col 0 and targetCol (exclusive)
  let occupiedCols = 0;
  for (let col = 0; col < targetCol; col++) {
    for (const key in enemyGrid) {
      const c = parseInt(key.split('_')[1]);
      if (c === col) {
        occupiedCols++;
        break;
      }
    }
  }

  return casterPos.col + 1 + occupiedCols;
}
