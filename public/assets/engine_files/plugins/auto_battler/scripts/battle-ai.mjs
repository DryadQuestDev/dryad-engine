/// <reference path="./dtypes.d.ts" />

import { currentBattle } from './battle-state.mjs';
import {
  calculateRawDamage, applyDefenses, applyHealing, getTargets, getCharacterPosition, calculateRange, getStatusStacks, getStatusDefinitions, getEffectiveRange
} from './battle-effects.mjs';
import {
  getUsableAbilities, getAliveOnSide, isAlive, canUseAbility
} from './battle-flow.mjs';

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
  MOVEMENT_DISRUPTION: 4,
  OVERKILL_PENALTY: -2,
  MOVE_PER_OOR_ABILITY: 4,
};

/**
 * Pick the best (ability, targetPos) pair for a character.
 * @param {string} characterId
 * @returns {{ abilityId: string, targetPos: string } | null}
 */
export function decideAction(characterId) {
  const battle = currentBattle.value;
  const usable = getUsableAbilities(characterId);
  if (usable.length === 0) return null;

  let bestScore = -Infinity;
  let bestAction = null;
  /** @type {{ abilityId: string, targetPos: string, score: number }[]} */
  const allScored = [];

  for (const abilityId of usable) {
    const positions = getValidTargetPositions(characterId, abilityId);
    for (const targetPos of positions) {
      const score = scoreAbilityTarget(characterId, abilityId, targetPos);
      allScored.push({ abilityId, targetPos, score });
      if (score > bestScore) {
        bestScore = score;
        bestAction = { abilityId, targetPos };
      }
    }
  }

  if (game.isDevMode()) {
    const character = game.getCharacter(characterId);
    const name = character?.getName() || characterId;
    const allAbilities = character?.getAbilities() || {};
    const states = battle.abilitiesState[characterId] || {};

    // Ability status table
    const abilityRows = [];
    for (const abId in allAbilities) {
      const meta = allAbilities[abId].meta;
      const st = states[abId];

      let cost = '';
      if (meta.costs) {
        cost = Object.entries(meta.costs).map(([k, v]) => `${v} ${k}`).join(', ');
      }

      let status = '✓';
      if (!usable.includes(abId)) {
        if (st?.cooldown > 0) status = '✗ cd';
        else if (st?.charges === 0) status = '✗ charges';
        else if (meta.costs && character) {
          for (const statId in meta.costs) {
            if (character.getResource(statId) < meta.costs[statId]) {
              status = '✗ resource';
              break;
            }
          }
        }
        if (status === '✓') status = '✗';
      }

      abilityRows.push({
        ability: abId,
        name: meta.name || abId,
        cd: st?.cooldown ?? 0,
        charges: st?.charges ?? -1,
        range: getEffectiveRange(allAbilities[abId]) ?? '∞',
        cost,
        usable: status,
      });
    }

    console.groupCollapsed(`[AI] ${name} — picked: ${bestAction?.abilityId || 'none'} → ${bestAction?.targetPos || '-'} (${bestScore.toFixed(1)})`);
    console.table(abilityRows);

    // Scored pairs
    allScored.sort((a, b) => b.score - a.score);
    for (const entry of allScored) {
      const label = entry === allScored[0] ? '★' : ' ';
      console.log(`${label} ${entry.abilityId} → ${entry.targetPos}  score: ${entry.score.toFixed(1)}`);
    }
    console.groupEnd();
  }

  return bestAction;
}

/**
 * Get all valid target positions for an ability, respecting range and target types.
 * @param {string} characterId
 * @param {string} abilityId
 * @returns {string[]}
 */
export function getValidTargetPositions(characterId, abilityId) {
  const battle = currentBattle.value;
  const character = game.getCharacter(characterId);
  if (!character) return [];

  const ability = character.getAbility(abilityId);
  if (!ability) return [];

  const meta = ability.meta;
  const casterPos = getCharacterPosition(characterId);
  if (!casterPos) return [];

  const targetTypes = meta.target || ['enemy'];
  const positions = [];

  for (const tt of targetTypes) {
    if (tt === 'self') {
      positions.push(`${casterPos.row}_${casterPos.col}`);
    } else if (tt === 'enemy') {
      const enemySide = casterPos.side === 'player' ? 'enemy' : 'player';
      const alive = getAliveOnSide(enemySide);
      for (const a of alive) {
        positions.push(`${a.row}_${a.col}`);
      }
    } else if (tt === 'ally') {
      const alive = getAliveOnSide(/** @type {'player' | 'enemy'} */ (casterPos.side));
      for (const a of alive) {
        positions.push(`${a.row}_${a.col}`);
      }
    } else if (tt === 'tile_ally') {
      // Empty tiles on own grid
      const grid = casterPos.side === 'player' ? battle.playerGrid : battle.enemyGrid;
      const config = game.getData('plugins_data/auto_battler/battle_config', true);
      for (let r = 0; r < config.rows_size; r++) {
        for (let c = 0; c < config.columns_size; c++) {
          const key = `${r}_${c}`;
          if (!grid[key]) positions.push(key);
        }
      }
    } else if (tt === 'tile_enemy') {
      const enemySide = casterPos.side === 'player' ? 'enemy' : 'player';
      const grid = enemySide === 'player' ? battle.playerGrid : battle.enemyGrid;
      const config = game.getData('plugins_data/auto_battler/battle_config', true);
      for (let r = 0; r < config.rows_size; r++) {
        for (let c = 0; c < config.columns_size; c++) {
          positions.push(`${r}_${c}`);
        }
      }
    }
  }

  // For 'all' area_shape, we only need one dummy position since it hits everyone
  if (meta.area_shape === 'all' && positions.length > 0) {
    return [positions[0]];
  }

  // Filter by range (only for enemy-targeting abilities)
  const effectiveRange = getEffectiveRange(ability);
  if (effectiveRange && (targetTypes.includes('enemy') || targetTypes.includes('tile_enemy'))) {
    return positions.filter(pos => {
      const targetCol = parseInt(pos.split('_')[1]);
      return calculateRange(casterPos, targetCol) <= effectiveRange;
    });
  }

  return positions;
}

/**
 * Score an (ability, targetPos) pair for AI decision making.
 * @param {string} characterId
 * @param {string} abilityId
 * @param {string} targetPos
 * @returns {number}
 */
function scoreAbilityTarget(characterId, abilityId, targetPos) {
  const battle = currentBattle.value;
  const character = game.getCharacter(characterId);
  const ability = character.getAbility(abilityId);
  const meta = ability.meta;
  const casterPos = getCharacterPosition(characterId);

  let score = meta.base_weight || 5;

  // Determine effective side for targets
  const targetTypes = meta.target || ['enemy'];
  const targetSide = targetTypes.includes('self') || targetTypes.includes('ally') || targetTypes.includes('tile_ally')
    ? casterPos.side
    : (casterPos.side === 'player' ? 'enemy' : 'player');

  for (const effectId in ability.effects) {
    const aspects = ability.effects[effectId];

    // Per-effect targets based on its own area_size
    const effectAreaSize = aspects.area_size ?? 0;
    const targets = getTargets(casterPos, targetPos, meta.area_shape || 'single', effectAreaSize, targetSide);

    // AoE bonus
    if (targets.length > 1) {
      score += WEIGHTS.AOE_PER_TARGET * (targets.length - 1);
    }

    // Score damage effects
    if (aspects.damage) {
      let totalDmg = 0;
      for (const t of targets) {
        const target = game.getCharacter(t.characterId);
        if (!target || !isAlive(t.characterId)) continue;

        const { raw } = calculateRawDamage(character, aspects, target);
        const dmg = applyDefenses(raw, aspects.damage_type || 'physical', target);
        totalDmg += dmg;

        const targetHp = target.getResource('health');
        const shield = getStatusStacks(t.characterId, 'shield');
        const effectiveHp = targetHp + shield;

        // Execute bonus — would kill the target
        if (dmg >= effectiveHp) {
          score += WEIGHTS.EXECUTE_BONUS;
        }

        // Overkill penalty — massive waste
        if (dmg > effectiveHp * 1.5) {
          score += WEIGHTS.OVERKILL_PENALTY;
        }
      }
      score += WEIGHTS.DAMAGE * totalDmg;
    }

    // Score healing effects
    if (aspects.healing) {
      for (const t of targets) {
        const target = game.getCharacter(t.characterId);
        if (!target || !isAlive(t.characterId)) continue;

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

    // Score status_apply effects (shield, buffs, debuffs)
    if (aspects.status_apply) {
      const stacks = aspects.status_stacks || 1;
      score += WEIGHTS.SHIELD * stacks * targets.length * (aspects.status_apply.length || 1);
    }
    if (aspects.status_apply_self) {
      const stacks = aspects.status_stacks_self || 1;
      score += WEIGHTS.SHIELD * stacks * (aspects.status_apply_self.length || 1);
    }

    // Setup scoring: preparation and combo statuses enable gated abilities
    if (aspects.status_apply_self?.includes('preparation')) {
      // Bonus if character has abilities with meta.preparation
      const abilities = character.getAbilities();
      for (const abId in abilities) {
        if (abilities[abId].meta.preparation) { score += WEIGHTS.TOKEN_SETUP; break; }
      }
    }
    if (aspects.status_apply?.includes('combo')) {
      // Bonus if character has abilities with combo-gated effects
      const abilities = character.getAbilities();
      for (const abId in abilities) {
        const effs = abilities[abId].effects;
        for (const eId in effs) {
          if (effs[eId].combo) { score += WEIGHTS.TOKEN_SETUP; break; }
        }
      }
    }

    // Cleanse scoring: bonus per cleansable battle status on targets (reads status.meta)
    if (aspects.cleanse) {
      const defs = getStatusDefinitions();
      const cSide = getCharacterPosition(characterId)?.side;
      for (const t of targets) {
        const tSide = getCharacterPosition(t.characterId)?.side;
        const removePolarity = (cSide === tSide) ? 'negative' : 'positive';
        const tChar = game.getCharacter(t.characterId);
        if (!tChar) continue;
        for (const status of tChar.getStatuses()) {
          if (!status.meta?.is_battle || status.currentStacks <= 0) continue;
          const polarity = status.polarity || defs.get(status.id)?.polarity;
          if (polarity === removePolarity) score += WEIGHTS.CLEANSE;
        }
      }
    }

    // Score cooldown_change (negative = refresh)
    if (aspects.cooldown_change && aspects.cooldown_change < 0) {
      // Count own abilities on cooldown
      const states = battle.abilitiesState[characterId];
      if (states) {
        let onCd = 0;
        for (const abId in states) {
          if (states[abId].cooldown > 0) onCd++;
        }
        score += WEIGHTS.CD_REFRESH * onCd;
      }
    }

    // Score movement disruption (pushing enemy back)
    if (aspects.movement_x && aspects.movement_x < 0) {
      const moveTarget = aspects.movement_target || 'target';
      if (moveTarget === 'target' || moveTarget === 'all_targets') {
        for (const t of targets) {
          const target = game.getCharacter(t.characterId);
          if (!target) continue;
          // Check if target has mostly short-range/no-range abilities
          const targetAbilities = target.getAbilities();
          let meleeCount = 0;
          for (const abId in targetAbilities) {
            const abRange = getEffectiveRange(targetAbilities[abId]);
            if (!abRange || abRange <= 1) meleeCount++;
          }
          if (meleeCount > Object.keys(targetAbilities).length / 2) {
            score += WEIGHTS.MOVEMENT_DISRUPTION;
          }
        }
      }
    }

    // Score relocate_self (move ability)
    if (aspects.relocate_self) {
      score += scoreRelocate(characterId, targetPos);
    }
  }

  return score;
}

/**
 * Score relocate_self: how many abilities become reachable from the new position.
 * @param {string} characterId
 * @param {string} newPos - "row_col"
 * @returns {number}
 */
function scoreRelocate(characterId, newPos) {
  const character = game.getCharacter(characterId);
  const casterPos = getCharacterPosition(characterId);
  if (!casterPos) return 0;

  const [newRow, newCol] = newPos.split('_').map(Number);
  const fakeCasterPos = { side: casterPos.side, row: newRow, col: newCol };

  const enemySide = casterPos.side === 'player' ? 'enemy' : 'player';
  const aliveEnemies = getAliveOnSide(enemySide);
  if (aliveEnemies.length === 0) return 0;

  const abilities = character.getAbilities();
  let newlyReachable = 0;

  for (const abilityId in abilities) {
    if (abilityId === 'ab_move') continue;
    const abRange = getEffectiveRange(abilities[abilityId]);
    if (!abRange) continue; // No range limit = always reachable
    const abMeta = abilities[abilityId].meta;
    if (!(abMeta.target || []).includes('enemy')) continue;
    if (!canUseAbility(characterId, abilityId)) continue;

    // Check if currently out of range for ALL enemies
    let currentlyInRange = false;
    let wouldBeInRange = false;

    for (const enemy of aliveEnemies) {
      if (calculateRange(casterPos, enemy.col) <= abRange) {
        currentlyInRange = true;
      }
      if (calculateRange(fakeCasterPos, enemy.col) <= abRange) {
        wouldBeInRange = true;
      }
    }

    if (!currentlyInRange && wouldBeInRange) {
      newlyReachable++;
    }
  }

  return WEIGHTS.MOVE_PER_OOR_ABILITY * newlyReachable;
}
