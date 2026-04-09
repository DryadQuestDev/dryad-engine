/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle, addFloatingText, pushLog } from './rpg-battle-state.mjs';
import { initBattleTracking } from './rpg-battle-flow.mjs';
import { getTokenStacks, removeTokenStacks, applyToken, getTokenDefinitions } from './rpg-battle-effects.mjs';
import { RpgBattleScreen } from './components/RpgBattleScreen.mjs';
import { RpgCombatStats } from './components/RpgCombatStats.mjs';
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
// Emitter: battle_action_start — Fired before ability execution. Args: (battle, caster, event).
// event = { abilityId, targetId, power }. Mutate to redirect ability, change target, or adjust power. Return false to cancel.
game.registerEmitter('battle_action_start');
// Emitter: battle_action_cast — Fired after ability is confirmed and costs deducted, before effects resolve.
// Args: (battle, caster, abilityId). Use for on-cast side effects (rage generation, etc.).
game.registerEmitter('battle_action_cast');
// Emitter: battle_action_apply — Fired per-effect per-target after all math, before state mutation.
// Args: (battle, caster, event). event = { effectId, targetId, damage, rawDamage, damageType, isCrit, isDodged, healing, tokenId, tokenStacks, tokenDuration, statusApply, statusRemove, cleanse, cooldownChange, chargesChange }.
// Mutate any field. Return false to skip this effect on this target.
game.registerEmitter('battle_action_apply');
// Emitter: battle_action_applied — Fired per-effect per-target AFTER state mutations. Same args as battle_action_apply.
// Use for reactive effects (rage-on-hit, counters, on-kill triggers). Not cancellable.
game.registerEmitter('battle_action_applied');
// Emitter: battle_action_end — Fired after ability effects resolve. Args: (battle, caster, abilityId, results).
game.registerEmitter('battle_action_end');
// Emitter: battle_character_defeated — Fired when character reaches 0 HP. Args: (battle, characterId, side).
game.registerEmitter('battle_character_defeated');

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

// ── Token service ──

game.registerService('rpg_tokens', {
  getStacks: getTokenStacks,
  removeStacks: removeTokenStacks,
  apply: applyToken,
  getDefinitions: getTokenDefinitions,
});

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

// Register token bricks in character statuses panel
game.addComponent({
  id: 'rpg_battler_token_bricks',
  slot: 'character-statuses-bottom',
  component: RpgTokenBricks,
});

// Register combat stats above ability list + export for game reuse
game.addComponent({
  id: 'rpg_combat_stats',
  slot: 'rpg-ability-panel-top',
  component: RpgCombatStats,
  order: 10,
});
game.registerComponent('RpgCombatStats', RpgCombatStats);

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


// ── Battle service ──

game.registerService('rpg_battle', {
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
    };

    // Initialize charState for all combatants
    const allCombatants = [...battle.playerParty, ...battle.enemyParty];
    for (const id of allCombatants) {
      battle.charState[id] = {
        side: playerSet.has(id) ? 'player' : 'enemy',
        battleIndex: 0,
        abilities: {},
        tokens: {},
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
  },
  /** @param {RpgBattleResult} result */
  end(result) {
    endRpgBattle(result);
  },
  /** @param {string} battleId */
  addDefeated(battleId) {
    addDefeated(battleId);
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

