/// <reference path="./dtypes.d.ts" />

import { getEffectiveRange } from './battle-effects.mjs';

const { game } = window.engine;

/**
 * Compute how much a character wants to be on the front line.
 * Higher score = more frontline. Based on ability kit (range, targeting, healing) and shield.
 * @param {Character} character
 * @param {number} gridCols - grid depth (number of columns)
 * @returns {number}
 */
function getFrontlineScore(character, gridCols) {
  const abilities = character.getAbilities();
  let maxRange = 0;
  let hasHealing = false;
  let hasAllyTarget = false;

  for (const abId in abilities) {
    if (abId === 'ab_move') continue;
    const { meta, effects } = abilities[abId];

    if (!meta.target) {
      console.warn('[GridPlacement] Ability "%s" on "%s" has no meta.target', abId, character.id);
      continue;
    }

    const effRange = getEffectiveRange(abilities[abId]);
    if (effRange != null && effRange > maxRange) maxRange = effRange;

    if (meta.target.includes('ally') || meta.target.includes('tile_ally')) hasAllyTarget = true;

    for (const effId in effects) {
      if (effects[effId].healing) hasHealing = true;
    }
  }

  let score = 0;
  score += (character.getStat('shield') || 0) * 0.3;
  if (maxRange <= gridCols) score += (gridCols + 1 - maxRange);
  if (hasHealing) score -= 3;
  if (hasAllyTarget) score -= 2;
  return score;
}

/**
 * Check if any character in the group has a beneficial AoE ability
 * that targets the ally grid (healing, buffs, cleanse with row/blast/etc shape).
 * @param {string[]} characterIds
 * @returns {boolean}
 */
function hasAllyAoE(characterIds) {
  for (const id of characterIds) {
    const abilities = game.getCharacter(id).getAbilities();
    for (const abId in abilities) {
      if (abId === 'ab_move') continue;
      const { meta, effects } = abilities[abId];
      if (!meta.target) continue;
      const shape = meta.area_shape || 'single';

      const hitsAllyGrid = meta.target.includes('ally') || meta.target.includes('tile_ally');
      const isAoE = shape !== 'single' && shape !== 'all';
      if (!hitsAllyGrid || !isAoE) continue;

      for (const effId in effects) {
        const asp = effects[effId];
        if (asp.healing || asp.status_apply?.length || asp.status_remove?.length || asp.cleanse) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Auto-place characters on the battle grid based on their ability kit and stats.
 * Tanky/melee characters go to front columns, ranged/healers to back.
 * Row distribution: cluster if team has ally AoE, spread otherwise.
 * @param {string[]} characterIds
 * @returns {Record<string, string>} grid positions (e.g. { "0_0": charId, "1_2": charId })
 */
export function autoPlaceOnGrid(characterIds) {
  const cfg = game.getData('plugins_data/auto_battler/battle_config', true);
  const rows = cfg?.rows_size ?? 5;
  const cols = cfg?.columns_size ?? 3;
  const maxSlots = rows * cols;

  // Shuffle before scoring so external list order (e.g. breeding sort) doesn't affect tiebreakers
  const shuffled = characterIds.slice(0, maxSlots).sort(() => Math.random() - 0.5);

  const scored = shuffled
    .map(id => ({ id, score: getFrontlineScore(game.getCharacter(id), cols) }))
    .sort((a, b) => b.score - a.score);

  const shouldCluster = hasAllyAoE(characterIds);

  if (game.isDevMode()) {
    console.groupCollapsed('[GridPlacement] Auto-placing %d characters (%s)', characterIds.length, shouldCluster ? 'cluster' : 'spread');
    for (const { id, score } of scored) {
      const c = game.getCharacter(id);
      console.log('  %s (score: %s)', c.getTrait('name') || id, score.toFixed(1));
    }
    console.groupEnd();
  }

  /** @type {Record<string, string>} */
  const grid = {};

  if (shouldCluster) {
    // Center-out row order: e.g. for 5 rows → [2, 1, 3, 0, 4]
    const centerRows = [];
    const mid = Math.floor(rows / 2);
    centerRows.push(mid);
    for (let offset = 1; centerRows.length < rows; offset++) {
      const above = mid - offset;
      const below = mid + offset;
      if (above >= 0) centerRows.push(above);
      if (below < rows) centerRows.push(below);
    }

    let ri = 0, col = 0;
    for (const { id } of scored) {
      grid[`${centerRows[ri]}_${col}`] = id;
      ri++;
      if (ri >= rows) { ri = 0; col++; }
    }
  } else {
    // Spread: distribute columns proportionally by frontline score rank
    const columns = [];
    const total = scored.length;
    for (let i = 0; i < total; i++) {
      const col = Math.min(Math.floor((i / total) * cols), cols - 1);
      if (!columns[col]) columns[col] = [];
      columns[col].push(scored[i].id);
    }

    for (let col = 0; col < columns.length; col++) {
      if (!columns[col]) continue;
      const chars = columns[col];
      const spacing = rows / chars.length;
      for (let i = 0; i < chars.length; i++) {
        const row = Math.floor(i * spacing + spacing / 2);
        grid[`${row}_${col}`] = chars[i];
      }
    }
  }

  if (game.isDevMode()) {
    console.groupCollapsed('[GridPlacement] Final grid');
    for (const pos in grid) {
      const c = game.getCharacter(grid[pos]);
      console.log('  %s → %s', pos, c.getTrait('name') || grid[pos]);
    }
    console.groupEnd();
  }

  return grid;
}
