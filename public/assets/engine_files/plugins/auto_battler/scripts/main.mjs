/// <reference path="./dtypes.d.ts" />

import { FormationTab } from './components/FormationTab.mjs';
import { BattleScreen } from './components/BattleScreen.mjs';
import { HealthOverlay } from './components/HealthOverlay.mjs';
import { currentBattle } from './battle-state.mjs';
import { initBattleTracking, addFloatingText, isAlive, isActive, getAliveOnSide, getAllOnSide, getAll } from './battle-flow.mjs';
import { autoPlaceOnGrid } from './grid-placement.mjs';
import { getStatusDefinitions, getStatusDamageType } from './battle-effects.mjs';

console.log("auto_battler plugin loaded");

const { game } = window.engine;

// Export FormationTab for user scripts to use
game.registerComponent('AutoBattler_FormationTab', FormationTab);

// Battle speed: 0 = paused, 1/2/3/5 = multiplier
game.registerState('battle_speed', 1);

// Leader: which party character defines the formation budget
game.registerState('leader_id', null);

// Set starting leader from config (save restore will overwrite for existing games)
const _cfg = game.getData('plugins_data/auto_battler/battle_config', true);
if (_cfg?.starting_leader_id) {
  game.setState('leader_id', _cfg.starting_leader_id);
}

// Create store for party positions on grid
// Key: "row_col" (e.g., "0_0", "1_2")
// Value: character ID
game.createStore('battle_positions');

// Free formation slots when a character leaves party (also fires before character_delete)
game.on("character_leave_party", (character) => {
  const positionStore = game.getStore("battle_positions");
  for (const [key, charId] of positionStore) {
    if (charId === character.id) {
      positionStore.delete(key);
    }
  }
});

// Emitter: formation_add
// Fired before a character is placed into the formation grid.
// Args: (character: Character, row: number, col: number)
// You may return false in listener to prevent placement.
game.registerEmitter('formation_add');

// Emitter: formation_remove
// Fired before a character is removed from the formation grid.
// Args: (character: Character)
// You may return false in listener to prevent removal.
game.registerEmitter('formation_remove');

// ── Battle Emitters ──

// Emitter: battle_start
// Fired before a battle begins.
// Args: (battle: Battle)
// Return false to prevent the battle from starting.
game.registerEmitter('battle_start');

// Emitter: battle_end
// Fired when a battle ends (victory, defeat, or retreat).
// Args: (battle: Battle, result: 'victory' | 'defeat' | 'retreat')
game.registerEmitter('battle_end');

// Emitter: battle_turn_start
// Fired when a new turn begins (turn clock crosses threshold).
// Args: (battle: Battle, turnNumber: number)
game.registerEmitter('battle_turn_start');

// Emitter: battle_action_start
// Fired before an actor uses an ability. Return false to skip the action.
// Args: (battle: Battle, character: Character, abilityId: string, targetPos: string)
game.registerEmitter('battle_action_start');

// Emitter: battle_action_end
// Fired after all effects of an ability have resolved.
// Args: (battle: Battle, character: Character, abilityId: string)
game.registerEmitter('battle_action_end');

// Emitter: battle_damage_raw
// Fired after raw damage calculation (including crit) but BEFORE armor/resist.
// Modify event.amount to change raw damage. Return false to prevent damage entirely.
// Args: (battle: Battle, caster: Character, target: Character, event: { amount: number, damageType: string, ability: object, isCrit: boolean })
game.registerEmitter('battle_damage_raw');

// Emitter: battle_damage_final
// Fired after defense + dodge roll, just before damage is applied to HP.
// Modify event.amount to change final damage. Set event.isDodged to override dodge result.
// Return false to prevent damage entirely.
// Args: (battle: Battle, caster: Character, target: Character, event: { amount: number, damageType: string, ability: object, isCrit: boolean, isDodged: boolean })
game.registerEmitter('battle_damage_final');

// Emitter: battle_heal
// Fired before healing is applied. Modify amount on the event object to change it.
// Args: (battle: Battle, caster: Character, target: Character, event: { amount: number })
// Return false to prevent the heal.
game.registerEmitter('battle_heal');

// Emitter: battle_character_defeated
// Fired when a character reaches 0 HP. Return false to prevent death (survives with 1 HP).
// Args: (battle: Battle, character: Character, side: 'player' | 'enemy', killer: Character | null)
game.registerEmitter('battle_character_defeated');

// Emitter: battle_status_apply
// Fired before a status effect is applied. Return false to prevent it.
// Args: (battle: Battle, target: Character, statusId: string, caster: Character)
game.registerEmitter('battle_status_apply');

// Emitter: battle_status_remove
// Fired before a status effect is removed. Return false to prevent removal.
// Args: (battle: Battle, target: Character, statusId: string)
game.registerEmitter('battle_status_remove');

// Emitter: battle_scaling_stat
// Fired when resolving the scaling stat (power/sorcery) for an effect.
// Modify event.value to change the effective stat. Affects damage, healing, and status stacks.
// Args: (battle: Battle, caster: Character, damageType: string, event: { value: number })
game.registerEmitter('battle_scaling_stat');

// Emitter: battle_move
// Fired before a character relocates on the grid. Return false to prevent the move.
// Args: (battle: Battle, character: Character, fromPos: string, toPos: string)
game.registerEmitter('battle_move');

// ── Aspect renderers ──
// auto_battler splits power/sorcery: physical=power, elemental=sorcery, absolute=max,
// healing=sorcery (matches getScalingStat in battle-effects.mjs).

function renderScaled(value, character, statKey, label) {
  let txt = `<b>${value}% of ${label}</b>`;
  if (character) {
    const base = statKey === 'max'
      ? Math.max(character.getStat('power'), character.getStat('sorcery'))
      : character.getStat(statKey);
    txt += ` <b>(${Math.round(base * value / 100)})</b>`;
  }
  return txt;
}

function statForDamageType(dmgType) {
  if (dmgType === 'physical') return { key: 'power', label: 'power' };
  if (dmgType === 'absolute') return { key: 'max', label: 'power/sorcery' };
  return { key: 'sorcery', label: 'sorcery' };
}

game.registerAspectRenderer('damage', ({ value, aspects, character }) => {
  const { key, label } = statForDamageType(aspects.damage_type || 'physical');
  return renderScaled(value, character, key, label);
});

game.registerAspectRenderer('healing', ({ value, character }) =>
  renderScaled(value, character, 'sorcery', 'sorcery')
);

function statusStacksRenderer(applyAspectId) {
  return ({ value, aspects, character }) => {
    const statusIds = aspects[applyAspectId];
    if (!Array.isArray(statusIds) || statusIds.length === 0) {
      return `<b>${value}</b>`;
    }
    const defs = getStatusDefinitions();
    let scalingDef = null;
    for (const id of statusIds) {
      const def = defs?.get(id);
      if (def?.meta?.power_scaling) { scalingDef = def; break; }
    }
    if (!scalingDef) return `<b>${value}</b>`;
    const { key, label } = statForDamageType(getStatusDamageType(scalingDef));
    return renderScaled(value, character, key, label);
  };
}
game.registerAspectRenderer('status_stacks', statusStacksRenderer('status_apply'));
game.registerAspectRenderer('status_stacks_self', statusStacksRenderer('status_apply_self'));

// Add universal Move ability to all characters
game.on('character_create', (character) => {
  character.addAbility('ab_move');
});

// Thorns: reflect % of received damage back to attacker
game.on('battle_damage_final', (battle, caster, target, event) => {
  if (event.isDodged || event.amount <= 0) return;
  const thorns = target.getStat('thorns');
  if (!thorns) return;
  const thornsDmg = Math.round(event.amount * thorns / 100);
  if (thornsDmg <= 0) return;
  caster.addResource('health', -thornsDmg);
  addFloatingText(caster.id, `-${thornsDmg}`, 'physical', 'assets/engine_assets/plugins/auto_battler/damage.svg');
  if (!battle._pendingThorns) battle._pendingThorns = [];
  battle._pendingThorns.push({
    turn: battle.turn,
    actorId: battle.activeActorId,
    effect: { type: 'thorns', targetId: caster.id, amount: thornsDmg }
  });
});

// ── Leadership ──

/**
 * Check leadership budget vs formation cost.
 * @returns {LeadershipCheck}
 */
export function checkLeadership() {
  const leaderId = game.getState('leader_id');
  const leader = leaderId ? game.getCharacter(leaderId) : null;
  const budget = leader ? leader.getStat('leadership') : 0;
  const positions = game.getStore('battle_positions');
  let total = 0;
  for (const [, charId] of positions) {
    if (!charId) continue;
    const char = game.getCharacter(charId);
    if (char) total += char.getStat('leadership_cost') || 0;
  }
  return { leaderId, budget, total, overflow: budget > 0 && total > budget };
}

game.registerService('check_leadership', { check: checkLeadership });

// Service: battle
// Query battle state from outside the plugin.
// Usage: game.getService('battle').getAliveOnSide('player')
game.registerService('battle', {
  getCurrentBattle() { return currentBattle.value; },
  isAlive,
  isActive,
  getAliveOnSide,
  getAllOnSide,
  getAll,
});

// Condition: _leadership_overflow
// Usage in dialogue: if{_leadership_overflow = true}
game.registerCondition('_leadership_overflow', () => checkLeadership().overflow);

// Condition: _formation_empty
// True when no characters are placed in the formation grid.
game.registerCondition('_formation_empty', () => isFormationEmpty());

// Condition: _battle_ready
// True when formation has characters AND leadership is not overflowing.
game.registerCondition('_battle_ready', () => !isFormationEmpty() && !checkLeadership().overflow);

function isFormationEmpty() {
  const positions = game.getStore('battle_positions');
  for (const [, charId] of positions) {
    if (charId) return false;
  }
  return true;
}

// Service: check_formation
// Usage: game.getService('check_formation').isEmpty()
game.registerService('check_formation', {
  isEmpty: isFormationEmpty,
});

// Service: check_battle_ready
// Usage: game.getService('check_battle_ready').check()
game.registerService('check_battle_ready', {
  check() {
    const empty = isFormationEmpty();
    const { overflow } = checkLeadership();
    return { ready: !empty && !overflow, empty, overflow };
  },
});

// Register formation tab in progression panel
game.addComponent({
  id: 'battle-formation',
  slot: 'progression-tabs',
  title: game.getLine('formation_tab_title'),
  component: FormationTab,
  order: 5
});

// Register battle screen as game_state component (replaces placeholder)
game.addComponent({
  id: 'd_battle',
  slot: 'game_state',
  component: BattleScreen
});

// Health-lost red overlay on character list portraits
game.addComponent({
  id: 'auto_battler_health_overlay',
  slot: 'character-list-item',
  component: HealthOverlay,
  order: 1
});

// Service: start_battle
// Contains the real battle creation logic. Returns { ok, reason? }.
// Game code calls: game.getService('start_battle').start(params)
game.registerService('start_battle', {
  /**
   * @param {StartBattleParams} params
   * @returns {StartBattleResult}
   */
  start(params) {
    const { enemies } = params;
    const cfg = game.getData('plugins_data/auto_battler/battle_config', true);
    const noRetreat = params.noRetreat ?? (cfg?.retreat === 'disabled');

    // Leadership guard
    const { overflow } = checkLeadership();
    if (overflow) return { ok: false, reason: game.getLine('leadership_overflow') };

    // Read player formation from battle_positions store
    const positions = game.getStore('battle_positions');
    /** @type {Record<string, string>} */
    const playerGrid = {};
    for (const [key, charId] of positions) {
      if (charId) playerGrid[key] = charId;
    }

    // Build enemy grid — auto-place from IDs or use manual positions
    /** @type {Record<string, string>} */
    let enemyGrid;
    if (enemies.length && typeof enemies[0] === 'string') {
      enemyGrid = autoPlaceOnGrid(/** @type {string[]} */(enemies));
    } else {
      enemyGrid = {};
      for (const e of /** @type {EnemyPosition[]} */ (enemies)) {
        enemyGrid[`${e.row}_${e.col}`] = e.characterId;
      }
    }

    // Build actor list (ATB determines order via gauges, no pre-sort needed)
    /** @type {BattleActor[]} */
    const allActors = [];
    for (const key in playerGrid) {
      const c = game.getCharacter(playerGrid[key]);
      allActors.push({ characterId: c.id, side: 'player', speed: c.getStat('speed'), gauge: 0 });
    }
    for (const key in enemyGrid) {
      const c = game.getCharacter(enemyGrid[key]);
      allActors.push({ characterId: c.id, side: 'enemy', speed: c.getStat('speed'), gauge: 0 });
    }

    /** @type {Battle} */
    const battle = {
      id: game.createUid(),
      turn: 1,
      phase: 'active',
      playerGrid,
      enemyGrid,
      initiative: allActors,
      activeActorId: null,
      actionCount: 0,
      turnGauge: 0,
      log: [],
      result: null,
      prevDisableSaves: game.getState('disable_saves'),
      prevGameState: game.getState('game_state'),
      abilitiesState: {},
      defeatedPlayer: [],
      defeatedEnemy: [],
      noRetreat: !!noRetreat,
      retreating: false,
      retreated: [],
    };

    currentBattle.value = battle;
    initBattleTracking();

    if (!game.trigger('battle_start', battle)) {
      currentBattle.value = null;
      return { ok: false, reason: 'cancelled' };
    }
    game.setState('disable_saves', true);
    game.setState('game_state', 'd_battle');
    return { ok: true };
  }
});

// Action: battle (thin wrapper for script/dialogue access)
// Called via game.execute({ battle: "orc, goblin" })
game.registerAction('battle', (value) => {
  const enemies = typeof value === 'string'
    ? value.split(',').map(s => s.trim()).filter(Boolean)
    : value;
  game.getService('start_battle').start({ enemies });
});

/**
 * End the current battle and restore previous state.
 */
export function endBattle() {
  const battle = currentBattle.value;
  if (battle) {
    game.trigger('battle_end', battle, battle.result);

    // Remove all 'battle'-tagged statuses from participants
    for (const actor of battle.initiative) {
      const char = game.getCharacter(actor.characterId);
      if (!char) continue;
      for (const status of char.getStatuses()) {
        if (status.tags.includes('battle')) char.removeStatus(status.id);
      }
    }

    game.setState('disable_saves', battle.prevDisableSaves);
    game.setState('game_state', battle.prevGameState);
  }
  currentBattle.value = null;
}
