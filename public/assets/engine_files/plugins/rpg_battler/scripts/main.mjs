/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle, addFloatingText, pushLog } from './rpg-battle-state.mjs';
import { initBattleTracking, summonCombatant, previewAbilityUsable } from './rpg-battle-flow.mjs';
import { checkStaggerThreshold, getStatusDefinitions, getEffectivePower, applyDefenses, applyDamageInstance, applyStatusEffect, logEffect } from './rpg-battle-effects.mjs';
import { RpgBattleScreen } from './components/RpgBattleScreen.mjs';
import { RpgCombatStats } from './components/RpgCombatStats.mjs';
import { RpgChannelCard } from './components/RpgChannelCard.mjs';
import { RpgCharOverlay } from './components/RpgCharOverlay.mjs';
import { RpgHealthOverlay } from './components/RpgHealthOverlay.mjs';

const { game } = window.engine;

console.log('rpg_battler plugin loaded');

// ── Emitters ──
// Emitter: battle_start — Fired before battle begins. Args: (). Return false to prevent.
game.registerEmitter('battle_start');
// Emitter: battle_end — Fired when battle ends, BEFORE pre-battle states are restored and the
// roster is cleaned up — battle data (enemies, statuses) is still readable here, but state
// writes get overwritten by the restore; set post-battle state in battle_closed instead.
// Args: (result: 'victory' | 'defeat'). Not cancellable.
game.registerEmitter('battle_end');
// Emitter: battle_closed
// Fired after the battle is fully torn down: pre-battle states restored, battle statuses
// removed, spawned enemies deleted, battle cleared. Fires before the triggering scene
// resumes (victory only). Safe place to set post-battle game state.
// Args: (result: 'victory' | 'defeat'). Not cancellable.
game.registerEmitter('battle_closed');
// Emitter: battle_turn_start — Fired at the start of a new round. Args: (turnNumber).
game.registerEmitter('battle_turn_start');
// Emitter: battle_action_start — Fired before ability execution. Args: (caster, event).
// event = { abilityId, targetId }. Mutate to redirect ability or change target. Return false to cancel.
// For power adjustments, listen to `rpg_compute_power` instead — that hook fires for both runtime and tooltip.
game.registerEmitter('battle_action_start');
// Emitter: battle_action_cast — Fired after ability is confirmed and costs deducted, before effects resolve.
// Args: (caster, abilityId). Use for on-cast side effects (rage generation, etc.).
game.registerEmitter('battle_action_cast');
// Emitter: battle_action_apply — Fired per-effect per-target after all math, before state mutation.
// Args: (caster, event). event = { effectId, targetId, damage, rawDamage, damageType, isCrit, isDodged, healing, statusApply, statusStacks, statusDuration, statusRemove, statusRemoveStacks, cleanse, cooldownChange, chargesChange }.
// Mutate any field. Return false to skip this effect on this target.
game.registerEmitter('battle_action_apply');
// Emitter: battle_action_applied — Fired per-effect per-target AFTER state mutations. Same args as battle_action_apply.
// Use for reactive effects (rage-on-hit, counters, on-kill triggers). Not cancellable.
game.registerEmitter('battle_action_applied');
// Emitter: battle_action_end — Fired after ability effects resolve. Args: (caster, abilityId, results).
game.registerEmitter('battle_action_end');
// Emitter: battle_action_complete — Fired after an action AND its animations finish (cast + hit
// + bounces), unlike battle_action_end which fires when effects resolve, before animation.
// Args: (caster, abilityId, results). Use for UI that must not interrupt the animation.
game.registerEmitter('battle_action_complete');
// Emitter: battle_character_defeated — Fired when character reaches 0 HP. Args: (characterId, side).
game.registerEmitter('battle_character_defeated');
// Emitter: character_turn_post_tick — Fired at the start of an individual character's turn,
// AFTER cooldowns/tokens/statuses have ticked and DoTs processed, BEFORE the stun check.
// Args: (characterId). Not cancellable. Use for reactive effects depending on post-tick state.
game.registerEmitter('character_turn_post_tick');

// ── Aspect renderers ──

// CSS classes are defined in css/rpg-battle.css: .physical .magic .burn .poison .bleeding .heal .value
function colorize(text, cls) {
  return `<span class="${cls}">${text}</span>`;
}

// Status ids that have a dedicated color class; everything else falls back to .value.
const STATUS_COLOR_CLASSES = new Set(['burn', 'poison', 'bleeding']);
function statusClassFor(statusIds) {
  if (Array.isArray(statusIds)) {
    for (const id of statusIds) if (STATUS_COLOR_CLASSES.has(id)) return id;
  }
  return 'value';
}

function powerScaledRenderer({ value, character, ability }, colorClass = 'value') {
  // Delta-overlaid values arrive as { _base, _merged } objects; unwrap them for scaling.
  const isDelta = value && typeof value === 'object' && '_base' in value && '_merged' in value;
  const num = isDelta ? value._merged : value;
  const display = isDelta
    ? `${value._base}➜<span class="delta-value">${num}</span>`
    : num;
  if (ability?.meta?.flat) return `<b>${colorize(display, colorClass)}</b>`;
  let txt = `<b>${display}% of power</b>`;
  if (character && typeof num === 'number' && isFinite(num)) {
    const effective = getEffectivePower(character, ability);
    txt += ` <b>(${colorize(Math.round(effective * num / 100), colorClass)})</b>`;
  }
  return txt;
}

game.registerAspectRenderer('damage', (ctx) => powerScaledRenderer(ctx, ctx.aspects?.damage_type || 'value'));
game.registerAspectRenderer('healing', (ctx) => powerScaledRenderer(ctx, 'heal'));
game.registerAspectRenderer('healing_self', (ctx) => powerScaledRenderer(ctx, 'heal'));

function statusStacksRenderer(applyAspectId) {
  return ({ value, aspects, character, ability }) => {
    const statusIds = aspects[applyAspectId];
    const cls = statusClassFor(statusIds);
    const isDelta = value && typeof value === 'object' && '_base' in value && '_merged' in value;
    const plainDisplay = isDelta
      ? `${value._base}➜<span class="delta-value">${value._merged}</span>`
      : value;
    if (ability?.meta?.flat || !Array.isArray(statusIds) || statusIds.length === 0) {
      return `<b>${colorize(plainDisplay, cls)}</b>`;
    }
    const defs = getStatusDefinitions();
    const anyScaled = statusIds.some(id => defs?.get(id)?.meta?.power_scaling);
    if (!anyScaled) return `<b>${colorize(plainDisplay, cls)}</b>`;
    return powerScaledRenderer({ value, character, ability }, cls);
  };
}
game.registerAspectRenderer('status_stacks_target', statusStacksRenderer('status_apply_target'));
game.registerAspectRenderer('status_stacks_self', statusStacksRenderer('status_apply_self'));
game.registerAspectRenderer('status_stacks_allies', statusStacksRenderer('status_apply_allies'));
game.registerAspectRenderer('status_stacks_enemies', statusStacksRenderer('status_apply_enemies'));

// Generic yellow highlight for any other numeric ability-effect aspect that hits the
// default <b>${value}</b> fallback (durations, cooldowns, charges, splash, conditions, etc.).
function valueRenderer({ value }) {
  const isDelta = value && typeof value === 'object' && '_base' in value && '_merged' in value;
  const display = isDelta
    ? `${value._base}➜<span class="delta-value">${value._merged}</span>`
    : value;
  return `<b>${colorize(display, 'value')}</b>`;
}
for (const id of [
  'status_duration_target', 'status_duration_self', 'status_duration_allies', 'status_duration_enemies',
  'status_remove_stacks_target', 'status_remove_stacks_self', 'status_remove_stacks_allies', 'status_remove_stacks_enemies',
  'cooldown_change', 'charges_change', 'lifesteal', 'splash', 'bounce', 'chance',
  'caster_min_health', 'caster_max_health', 'target_min_health', 'target_max_health',
  'charges', 'cd_on_battle_start',
]) {
  game.registerAspectRenderer(id, valueRenderer);
}

// Grey out abilities in the engine's AbilityCard when a character couldn't use them on their turn.
game.registerAbilityUsabilityChecker(previewAbilityUsable);

game.registerState('rpg_battle_log_minimized', false);
game.registerState('rpg_ability_tabs', {});
game.registerState('rpg_defeated_battles', []);

// ── Defeated battles ──

function addDefeated(battleId) {
  const defeated = game.getState('rpg_defeated_battles') || [];
  if (!defeated.includes(battleId)) {
    defeated.push(battleId);
    game.setState('rpg_defeated_battles', defeated);
  }
}

game.registerCondition('_defeated', (battleId) => {
  const defeated = game.getState('rpg_defeated_battles') || [];
  return defeated.includes(battleId);
});

// ── Party size helpers ──

function getMaxPartySize() {
  const config = game.getData('plugins_data/rpg_battler/battle_config');
  return config?.max_party_size || 4;
}

game.registerService('rpg_party', {
  getMaxPartySize,
  isPartyFull() { return game.getParty().length >= getMaxPartySize(); },
});

game.registerCondition('_party_full', () => game.getParty().length >= getMaxPartySize());

// ── Floating text service ──

game.registerService('rpg_floating_text', {
  add: addFloatingText,
});

// ── Battle log service ──

game.registerService('rpg_battle_log', {
  push: pushLog,
});

// Register battle screen as game_state component
game.addComponent({
  id: 'rpg_battle',
  slot: 'game_state',
  component: RpgBattleScreen,
});

// Register character overlay for battle CharacterSlots
game.addComponent({
  id: 'rpg_battler_char_overlay',
  slot: 'rpg-battle-char-overlay',
  component: RpgCharOverlay,
  order: 1,
});

// Register health-lost overlay for party list portraits
game.addComponent({
  id: 'rpg_battler_health_overlay',
  slot: 'character-list-item',
  component: RpgHealthOverlay,
  order: 1,
});

// Register combat stats above ability list + export for game reuse
game.addComponent({
  id: 'rpg_combat_stats',
  slot: 'rpg-ability-panel-top',
  component: RpgCombatStats,
  order: 10,
});
game.registerComponent('RpgCombatStats', RpgCombatStats);

// Channel card: shows the active channel with a cancel button, between reservoirs (0) and combat stats (10)
game.addComponent({
  id: 'rpg_channel_card',
  slot: 'rpg-ability-panel-top',
  component: RpgChannelCard,
  order: 5,
});

/**
 * Spawn enemies from a battle definition's enemy list.
 * @param {RpgBattleEntry[]} entries
 * @returns {{ ids: string[], spawned: string[] }} all enemy IDs, and the subset the battle created (non-live)
 */
function spawnEnemies(entries) {
  const ids = [];
  const spawned = [];
  for (const entry of entries) {
    for (let i = 0; i < (entry.amount || 1); i++) {
      if (entry.is_live_instance) {
        const char = game.getCharacter(entry.character_id);
        if (char) ids.push(char.id);
      } else {
        const uid = game.createUid();
        const char = game.createCharacter(uid, entry.character_id);
        game.addCharacter(char);
        ids.push(char.id);
        spawned.push(char.id);
      }
    }
  }
  return { ids, spawned };
}


// ── Difficulty ──

/** @param {RpgBattle} battle */
function applyDifficultyToEnemies(battle) {
  const diff = game.getGameSetting('rpg_battle_difficulty') || 'medium';
  const cfg = game.getData('plugins_data/rpg_battler/battle_config') || {};
  const d = cfg.difficulty || {};
  const pctByDiff = {
    easy: d.easy ?? -30,
    medium: d.medium ?? 0,
    hard: d.hard ?? 30,
    very_hard: d.very_hard ?? 60,
  };
  const pct = pctByDiff[diff] ?? 0;
  if (!pct) return;

  for (const enemyId of battle.enemyParty) {
    const char = game.getCharacter(enemyId);
    if (!char) continue;
    const core = char.getCoreStatus();
    const baseHealth = core?.stats?.health ?? 0;
    const basePower = core?.stats?.power ?? 0;
    const status = game.createStatus('difficulty');
    if (!status) continue;
    status.stats = {
      health: Math.round(baseHealth * pct / 100),
      power: Math.round(basePower * pct / 100),
    };
    char.addStatus(status, { stacks: 1 });
  }
}


// ── Battle service ──

game.registerService('rpg_battle', {
  /**
   * @param {StartRpgBattleParams} params
   */
  async start(params) {
    let enemyEntries = params.enemies;
    let background = params.background || null;

    if (params.battleId && !enemyEntries) {
      const battles = game.getData('plugins_data/rpg_battler/battles', true);
      const def = battles?.get(params.battleId);
      if (!def) {
        throw new Error(`rpg_battler: battle "${params.battleId}" not found — create it in the editor under the RPG Battler tab → Battles, or fix the id passed to the battle action.`);
      }
      enemyEntries = def.enemies;
      if (!background && def.background) background = def.background;
    }

    if (!enemyEntries || enemyEntries.length === 0) {
      console.warn('rpg_battler: no enemies provided');
      return { ok: false, reason: 'no_enemies' };
    }

    // Use current party as default
    if (!params.playerParty || params.playerParty.length === 0) {
      params.playerParty = game.getParty().map(c => c.id);
    }

    if (!params.playerParty || params.playerParty.length === 0) {
      console.warn('rpg_battler: no player party available');
      return { ok: false, reason: 'no_party' };
    }

    // Enforce max party size
    const max = getMaxPartySize();
    if (params.playerParty.length > max) {
      console.warn(`rpg_battler: party size (${params.playerParty.length}) exceeds max (${max}), using first ${max}`);
      params.playerParty = params.playerParty.slice(0, max);
    }

    const { ids: enemyParty, spawned: spawnedEnemies } = spawnEnemies(enemyEntries);
    const turnOrder = [...params.playerParty, ...enemyParty];
    const playerSet = new Set(params.playerParty);

    /** @type {RpgBattle} */
    const battle = {
      id: game.createUid(),
      battleId: params.battleId || null,
      turn: 0,
      phase: 'active',
      playerParty: [...params.playerParty],
      enemyParty,
      turnOrder,
      summoned: [],
      spawnedEnemies,
      actorTurn: -1,
      activeCharId: null,
      activeSide: 'player',
      result: null,
      battlePhase: 'choosing_ability',
      selectedAbilityId: null,
      log: [],
      backgroundAssetId: background,
      charState: {},
      prevDisableSaves: game.getState('disable_saves'),
      prevBlockInventory: game.getState('block_party_inventory'),
      prevGameState: game.getState('game_state'),
      prevHideEvents: game.getState('hide_events'),
      prevAssets: game.getAssets(),
    };

    // Initialize charState for all combatants
    const allCombatants = [...battle.playerParty, ...battle.enemyParty];
    for (const id of allCombatants) {
      battle.charState[id] = {
        side: playerSet.has(id) ? 'player' : 'enemy',
        battleIndex: 0,
        abilities: {},
        defeated: false,
        bonusUsed: 0,
      };
    }

    // Compute battle indices for duplicate names
    const nameGroups = {};
    for (const id of allCombatants) {
      const name = game.getCharacter(id)?.getTrait('name') || id;
      if (!nameGroups[name]) nameGroups[name] = [];
      nameGroups[name].push(id);
    }
    for (const name in nameGroups) {
      const ids = nameGroups[name];
      if (ids.length > 1) {
        ids.forEach((id, i) => { battle.charState[id].battleIndex = i + 1; });
      }
    }

    currentRpgBattle.value = battle;

    // Initialize ability states, tokens from source stats, sort turn order, start turn 1
    initBattleTracking();

    if (!game.trigger('battle_start')) {
      currentRpgBattle.value = null;
      return { ok: false, reason: 'prevented' };
    }

    applyDifficultyToEnemies(battle);

    // Preload every combatant's battle assets behind a loading screen — all
    // battle_state poses, masks, spines, plus any characters their abilities
    // can summon — so first hits/attacks never fetch images mid-animation.
    game.setScreenLoading(true);
    try {
      const battleStates = [...(game.getData('character_attributes', true).get('battle_state')?.values || [])];
      const preloadTargets = new Set(allCombatants);
      for (const id of allCombatants) {
        const abilities = game.getCharacter(id)?.getAbilities() || {};
        for (const abId in abilities) {
          // FinalAbilities effects: object keyed by effect id, values = aspects
          const effects = abilities[abId].effects || {};
          for (const effectId in effects) {
            if (effects[effectId]?.summon) preloadTargets.add(effects[effectId].summon); // character template id
          }
        }
      }
      await Promise.allSettled([...preloadTargets].map((target) =>
        game.preloadCharacterAssets(target, {
          simulateAttributes: { battle_state: battleStates },
          spine: true,
        })
      ));
    } finally {
      game.setScreenLoading(false);
    }

    game.setState('disable_saves', true);
    game.setState('block_party_inventory', true);
    game.setState('hide_events', true);
    game.setState('game_state', 'rpg_battle');
    game.clearAssets();
    game.setMusic('battle');

    return { ok: true, battle };
  },
  /** @param {RpgBattleResult} result */
  end(result) {
    endRpgBattle(result);
  },
  /** @param {string} battleId */
  addDefeated(battleId) {
    addDefeated(battleId);
  },
  checkStaggerThreshold,
  /**
   * Effective power for a character (amplifier-aware), independent of battle state — safe to
   * call from UI/character sheet. Mirrors the scaling all combat damage uses.
   * @param {Character} character
   * @param {{ meta?: any }} [ability]
   * @returns {number}
   */
  effectivePower(character, ability) {
    return getEffectivePower(character, ability);
  },
  /** @returns {boolean} whether a battle is currently active */
  isActive() {
    return !!currentRpgBattle.value;
  },
  /** @returns {string[]} enemy character ids (copy) */
  getEnemyParty() {
    return [...(currentRpgBattle.value?.enemyParty || [])];
  },
  /** @returns {string[]} player character ids (copy) */
  getPlayerParty() {
    return [...(currentRpgBattle.value?.playerParty || [])];
  },
  /** @returns {string[]} all combatant ids, players then enemies (copy) */
  getCombatants() {
    const b = currentRpgBattle.value;
    return b ? [...b.playerParty, ...b.enemyParty] : [];
  },
  /** @returns {number} current turn number (0 if no battle) */
  getTurn() {
    return currentRpgBattle.value?.turn || 0;
  },
  /** @returns {string|null} id of the character whose turn it is */
  getActiveCharId() {
    return currentRpgBattle.value?.activeCharId || null;
  },
  /**
   * True if an apply event represents a damage hit that actually landed (damage > 0, not dodged).
   * Pure — reads the event only.
   * @param {RpgActionApplyEvent} event
   */
  eventDealtDamage(event) {
    return !!event && event.damage > 0 && !event.isDodged;
  },
  /**
   * Deal a one-off damage instance through the full pipeline (defenses → shield/HP/thorns →
   * floating text → log → death flag), for scripted effects like elemental reactions. Operates
   * on the active battle. Does NOT re-emit battle_action_applied (no listener recursion).
   * @param {string} casterId @param {string} targetId @param {number} amount @param {string} damageType
   */
  dealDamage(casterId, targetId, amount, damageType) {
    const battle = currentRpgBattle.value;
    if (!battle) return;
    const target = game.getCharacter(targetId);
    if (!target || !(amount > 0)) return;
    const type = damageType || 'physical';
    const final = applyDefenses(amount, type, target);
    if (final <= 0) return;
    const { results } = applyDamageInstance(casterId, targetId, final, amount, type, false);
    for (const r of results) logEffect(battle, casterId, r);
  },
  /**
   * Apply N stacks of a status through the pipeline (floating text → log → stagger check).
   * Stacks taken as-is (no power-scaling — caller computed the final amount). Operates on the
   * active battle.
   * @param {string} casterId @param {string} targetId @param {string} statusId @param {number} stacks @param {number} [duration]
   */
  applyStatus(casterId, targetId, statusId, stacks, duration) {
    const battle = currentRpgBattle.value;
    if (!battle) return;
    const r = applyStatusEffect(casterId, targetId, statusId, stacks, duration);
    if (r) logEffect(battle, casterId, r);
    if (r && statusId === 'stagger') checkStaggerThreshold(targetId);
  },
  /**
   * Add an already-created character to the active battle on `side` as a combatant. Registers it,
   * appends it to that side's roster, and inserts it into the turn order so it can act this round
   * by speed. Does not affect the persistent party. Returns the combatant id (or null).
   * @param {Character} character @param {'player' | 'enemy'} side @returns {string | null}
   */
  summon(character, side) {
    return summonCombatant(character, side);
  },
});

// ── Action: battle ──

game.registerAction('battle', {
  eventDelayed: true,
  /** @param {StartBattleActionValue} value */
  action(value) {
    if (typeof value === 'string') {
      game.getService('rpg_battle').start({ battleId: value });
    } else {
      game.getService('rpg_battle').start(value);
    }
  }
});

// ── End battle ──

/**
 * End the current battle and restore previous state.
 * @param {RpgBattleResult} result
 */
export function endRpgBattle(result) {
  const battle = currentRpgBattle.value;
  if (!battle) return;

  battle.result = result;
  battle.phase = 'finished';

  // Track victory
  if (result === 'victory' && battle.battleId) {
    addDefeated(battle.battleId);
  }

  game.trigger('battle_end', result);

  // Remove meta.is_battle statuses from all participants (reads per-instance status.meta)
  for (const charId of [...battle.playerParty, ...battle.enemyParty]) {
    const char = game.getCharacter(charId);
    if (!char) continue;
    for (const status of [...char.getStatuses()]) {
      if (status.meta?.is_battle) char.removeStatus(status.id);
    }
  }

  // Remove spawned enemies + mid-battle summons
  for (const charId of [...battle.spawnedEnemies, ...battle.summoned]) {
    const char = game.getCharacter(charId);
    if (char) game.deleteCharacter(charId);
  }

  // Restore previous state
  game.setState('disable_saves', battle.prevDisableSaves);
  game.setState('block_party_inventory', battle.prevBlockInventory);
  game.setState('game_state', battle.prevGameState);
  game.setState('hide_events', battle.prevHideEvents);
  game.setAssets(battle.prevAssets);
  game.setMusic(false);

  currentRpgBattle.value = null;

  game.trigger('battle_closed', result);

  // Resume the scene that triggered the battle only on victory — on defeat it must not
  // continue as if won; the game's battle_closed listener owns what happens next.
  if (result === 'victory') {
    game.nextScene();
  }
}

