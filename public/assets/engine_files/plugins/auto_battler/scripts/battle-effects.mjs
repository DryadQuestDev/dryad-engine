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

/** Derive the damage type a token scales with from its first scaling-relevant effect. */
function getTokenDamageType(tokenDef) {
  const eff = tokenDef.effects?.find(e => e.type === 'dot' || e.type === 'hot' || e.type === 'absorb');
  if (!eff) return 'absolute';
  if (eff.type === 'absorb') return 'absolute';
  if (eff.type === 'hot') return 'sorcery';
  return eff.damage_type || 'absolute';
}

// ── Token helpers ──

/** @returns {Map<string, TokenDefinition>} */
export function getTokenDefinitions() {
  return game.getData('plugins_data/auto_battler/token_definitions', true);
}

/**
 * Apply stacks as a new independent instance. Returns applied count or null.
 * @param {string} characterId
 * @param {string} tokenId
 * @param {number} stacks
 * @param {number} [duration] - turns until this instance expires (omit = permanent)
 * @param {string} [source] - who applied this token (defaults to characterId)
 */
export function applyToken(characterId, tokenId, stacks, duration, source) {
  const battle = currentBattle.value;
  const def = getTokenDefinitions().get(tokenId);
  if (!def || stacks <= 0) return null;
  if (!battle.tokens[characterId]) battle.tokens[characterId] = {};
  if (!battle.tokens[characterId][tokenId]) battle.tokens[characterId][tokenId] = [];
  const instances = battle.tokens[characterId][tokenId];
  const max = def.max_stacks || Infinity;
  const total = instances.reduce((s, i) => s + i.stacks, 0);
  const allowed = Math.min(stacks, max - total);
  if (allowed <= 0) return null;
  /** @type {TokenInstance} */
  const inst = { stacks: allowed, source: source || characterId };
  if (duration != null) inst.duration = duration;
  instances.push(inst);
  return { applied: allowed, tokenName: def.name };
}

/** Remove stacks FIFO from oldest instances. Deletes entry if all consumed. */
export function removeTokenStacks(characterId, tokenId, stacks) {
  const battle = currentBattle.value;
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

/** Get total stacks of a token on a character (sum across all instances). */
export function getTokenStacks(characterId, tokenId) {
  const instances = currentBattle.value.tokens[characterId]?.[tokenId];
  if (!instances?.length) return 0;
  return instances.reduce((sum, i) => sum + i.stacks, 0);
}

/** Process DoT and HoT token effects for a character. Uses total stacks across all instances. */
export function processTokenEffects(characterId) {
  const battle = currentBattle.value;
  const charTokens = battle.tokens[characterId];
  if (!charTokens) return [];
  const defs = getTokenDefinitions();
  const character = game.getCharacter(characterId);
  if (!character) return [];

  /** @type {EffectResult[]} */
  const results = [];

  for (const tokenId in charTokens) {
    const instances = charTokens[tokenId];
    const def = defs.get(tokenId);
    if (!def) continue;
    const totalStacks = instances.reduce((s, i) => s + i.stacks, 0);
    const effectiveStacks = Math.round(totalStacks);
    if (effectiveStacks <= 0) continue;
    for (const eff of def.effects) {
      if (eff.type === 'dot') {
        const rawDmg = Math.round(eff.value * effectiveStacks);
        const dmgType = eff.damage_type || 'absolute';
        const dmg = applyDefenses(rawDmg, dmgType, character);
        if (dmg > 0) {
          character.addResource('health', -dmg);
          results.push({ type: 'token_dot', targetId: characterId, amount: dmg, rawAmount: rawDmg, damageType: dmgType, tokenId });
        }
      } else if (eff.type === 'hot') {
        let heal = Math.round(eff.value * effectiveStacks);
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

  // Consume preparation token
  if (meta.preparation) {
    removeTokenStacks(casterId, 'preparation', 1);
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
            const stacks = getTokenStacks(t.characterId, 'combo');
            if (stacks <= 0) continue;
            removeTokenStacks(t.characterId, 'combo', 1);
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

          // Token apply to target
          if (aspects.token_apply) {
            let stacks = aspects.token_stacks || 1;
            const tokenDef = getTokenDefinitions().get(aspects.token_apply);
            if (tokenDef?.power_scaling) stacks = Math.round(getScalingStat(caster, getTokenDamageType(tokenDef)) * stacks / 100);
            const result = applyToken(t.characterId, aspects.token_apply, stacks, aspects.token_duration, casterId);
            if (result) logs.push({ type: 'token_apply', targetId: t.characterId, tokenId: aspects.token_apply, stacks: result.applied, duration: aspects.token_duration || 0 });
          }

          // Cleanse: remove polarity-matched tokens
          if (aspects.cleanse) {
            const casterSide = getCharacterPosition(casterId)?.side;
            const tSide = getCharacterPosition(t.characterId)?.side;
            const removePolarity = (casterSide === tSide) ? 'negative' : 'positive';
            const defs = getTokenDefinitions();
            const charTokens = battle.tokens[t.characterId];
            if (charTokens) {
              for (const tokenId in charTokens) {
                if (defs.get(tokenId)?.polarity === removePolarity) {
                  delete charTokens[tokenId];
                }
              }
            }
            logs.push({ type: 'cleanse', targetId: t.characterId });
          }

          // Status apply
          if (aspects.status_apply) {
            for (const statusId of aspects.status_apply) {
              const status = game.createStatus(statusId);
              if (status) {
                target.addStatus(status);
                logs.push({ type: 'status_apply', targetId: t.characterId, statusId, statusName: status.name, duration: status.duration > 0 ? status.duration : 0 });
              }
            }
          }

          // Status remove
          if (aspects.status_remove) {
            for (const statusId of aspects.status_remove) {
              target.removeStatus(statusId);
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

        // Status apply self
        if (aspects.status_apply_self) {
          for (const statusId of aspects.status_apply_self) {
            const status = game.createStatus(statusId);
            if (status) {
              caster.addStatus(status);
              logs.push({ type: 'status_apply', targetId: casterId, statusId, statusName: status.name, duration: status.duration > 0 ? status.duration : 0 });
            }
          }
        }

        // Token apply to self
        if (aspects.token_apply_self) {
          let stacks = aspects.token_stacks_self || 1;
          const tokenDef = getTokenDefinitions().get(aspects.token_apply_self);
          if (tokenDef?.power_scaling) stacks = Math.round(getScalingStat(caster, getTokenDamageType(tokenDef)) * stacks / 100);
          const result = applyToken(casterId, aspects.token_apply_self, stacks, aspects.token_duration_self, casterId);
          if (result) logs.push({ type: 'token_apply', targetId: casterId, tokenId: aspects.token_apply_self, stacks: result.applied, duration: aspects.token_duration_self || 0 });
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
        const cd = meta.cooldown || 0;
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
    const markInstances = battle.tokens[target.id]?.['focus_mark'] || [];
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
export function applyDamage(target, amount, damageType) {
  const battle = currentBattle.value;
  let remaining = amount;
  let shieldAbsorbed = 0;

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
 * Add shield (absorb token) to target.
 * @param {*} target - Character
 * @param {number} amount
 */
export function applyShield(target, amount, source) {
  return applyToken(target.id, 'shield', amount, undefined, source || target.id);
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
