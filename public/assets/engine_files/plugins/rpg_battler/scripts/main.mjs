/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle } from './rpg-battle-state.mjs';
import { initBattleTracking } from './rpg-battle-flow.mjs';
import { RpgBattleScreen } from './components/RpgBattleScreen.mjs';
import { RpgCharOverlay } from './components/RpgCharOverlay.mjs';
import { RpgHealthOverlay } from './components/RpgHealthOverlay.mjs';
import { RpgTokenBricks } from './components/RpgTokenBricks.mjs';

const { game } = window.engine;

console.log('rpg_battler plugin loaded');

// ── Emitters ──
// Emitter: battle_start — Fired before battle begins. Args: (battle). Return false to prevent.
game.registerEmitter('battle_start');
// Emitter: battle_end — Fired when battle ends. Args: (battle, result).
game.registerEmitter('battle_end');
// Emitter: battle_turn_start — Fired at the start of a new round. Args: (battle, turnNumber).
game.registerEmitter('battle_turn_start');
// Emitter: battle_action_start — Fired before ability execution. Args: (battle, character, abilityId, targetId). Return false to skip.
game.registerEmitter('battle_action_start');
// Emitter: battle_action_end — Fired after ability effects resolve. Args: (battle, character, abilityId).
game.registerEmitter('battle_action_end');
// Emitter: battle_damage_raw — Fired after raw damage calc, before defenses. Args: (battle, caster, target, event). Modify event.amount.
game.registerEmitter('battle_damage_raw');
// Emitter: battle_damage_final — Fired after defenses, before HP change. Args: (battle, caster, target, event). Return false to prevent.
game.registerEmitter('battle_damage_final');
// Emitter: battle_heal — Fired before healing applied. Args: (battle, caster, target, event). Modify event.amount.
game.registerEmitter('battle_heal');
// Emitter: battle_character_defeated — Fired when character reaches 0 HP. Args: (battle, characterId, side).
game.registerEmitter('battle_character_defeated');

game.registerState('rpg_battle_log_minimized', false);

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

// Register token bricks in character statuses panel
game.addComponent({
  id: 'rpg_battler_token_bricks',
  slot: 'character-statuses-bottom',
  component: RpgTokenBricks,
});

/**
 * Spawn enemies from a battle definition's enemy list.
 * @param {RpgBattleEntry[]} entries
 * @returns {string[]} character IDs
 */
function spawnEnemies(entries) {
  const ids = [];
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
      }
    }
  }
  return ids;
}

/**
 * Build turn order by sorting all combatants by speed (descending).
 * Ties: player side goes first.
 * @param {string[]} playerParty
 * @param {string[]} enemyParty
 * @returns {string[]}
 */
function buildTurnOrder(playerParty, enemyParty) {
  const playerSet = new Set(playerParty);
  const all = [...playerParty, ...enemyParty];
  all.sort((a, b) => {
    const charA = game.getCharacter(a);
    const charB = game.getCharacter(b);
    const speedA = charA?.getStat('speed') || 0;
    const speedB = charB?.getStat('speed') || 0;
    if (speedB !== speedA) return speedB - speedA;
    if (playerSet.has(a) && !playerSet.has(b)) return -1;
    if (!playerSet.has(a) && playerSet.has(b)) return 1;
    return 0;
  });
  return all;
}

// ── Service: start_battle ──

game.registerService('start_battle', {
  /**
   * @param {StartRpgBattleParams} params
   */
  start(params) {
    let enemyEntries = params.enemies;
    let background = params.background || null;

    if (params.battleId && !enemyEntries) {
      const battles = game.getData('plugins_data/rpg_battler/battles', true);
      const def = battles?.get(params.battleId);
      if (!def) {
        console.warn(`rpg_battler: battle definition "${params.battleId}" not found`);
        return { ok: false, reason: 'not_found' };
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

    const enemyParty = spawnEnemies(enemyEntries);
    const turnOrder = buildTurnOrder(params.playerParty, enemyParty);
    const playerSet = new Set(params.playerParty);

    /** @type {RpgBattle} */
    const battle = {
      id: game.createUid(),
      turn: 1,
      phase: 'active',
      playerParty: [...params.playerParty],
      enemyParty,
      turnOrder,
      turnIndex: 0,
      activeCharId: turnOrder[0] || null,
      activeSide: playerSet.has(turnOrder[0]) ? 'player' : 'enemy',
      result: null,
      battlePhase: playerSet.has(turnOrder[0]) ? 'choosing_ability' : 'enemy_turn',
      selectedAbilityId: null,
      log: [],
      backgroundAssetId: background,
      abilitiesState: {},
      tokens: {},
      defeatedPlayer: [],
      defeatedEnemy: [],
      prevDisableSaves: game.getState('disable_saves'),
      prevBlockInventory: game.getState('block_party_inventory'),
      prevGameState: game.getState('game_state'),
      prevHideEvents: game.getState('hide_events'),
    };

    currentRpgBattle.value = battle;

    // Initialize ability states, tokens from source stats
    initBattleTracking();

    if (!game.trigger('battle_start', battle)) {
      currentRpgBattle.value = null;
      return { ok: false, reason: 'prevented' };
    }

    game.setState('disable_saves', true);
    game.setState('block_party_inventory', true);
    game.setState('hide_events', true);
    game.setState('game_state', 'rpg_battle');
    game.setMusic('battle');

    return { ok: true, battle };
  }
});

// ── Action: battle ──

game.registerAction('battle', {
  eventDelayed: true,
  /** @param {StartBattleActionValue} value */
  action(value) {
    if (typeof value === 'string') {
      game.getService('start_battle').start({ battleId: value });
    } else {
      game.getService('start_battle').start(value);
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
  game.trigger('battle_end', battle, result);

  // Remove battle-tagged statuses from all participants
  for (const charId of [...battle.playerParty, ...battle.enemyParty]) {
    const char = game.getCharacter(charId);
    if (!char) continue;
    for (const status of char.getStatuses()) {
      if (status.tags?.includes('battle')) char.removeStatus(status.id);
    }
  }

  // Remove spawned enemies
  for (const charId of battle.enemyParty) {
    const char = game.getCharacter(charId);
    if (char) game.deleteCharacter(charId);
  }

  // Restore previous state
  game.setState('disable_saves', battle.prevDisableSaves);
  game.setState('block_party_inventory', battle.prevBlockInventory);
  game.setState('game_state', battle.prevGameState);
  game.setState('hide_events', battle.prevHideEvents);
  game.nextScene();
  game.setMusic(false);



  currentRpgBattle.value = null;
}

// ── Service: end_battle ──

game.registerService('end_battle', {
  /** @param {RpgBattleResult} result */
  end(result) {
    endRpgBattle(result);
  }
});
