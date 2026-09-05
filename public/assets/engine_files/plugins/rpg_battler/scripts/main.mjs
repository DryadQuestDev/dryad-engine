/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle, addFloatingText, pushLog } from './rpg-battle-state.mjs';
import { isBattleScenePauseActive, teardownBattleScenes, resetBattleScenes } from './rpg-battle-scenes.mjs';
import { initBattleTracking, summonCombatant, summonFromTemplate, sideAtUnitCap, previewAbilityUsable, spawnEnemies } from './rpg-battle-flow.mjs';
import { checkStaggerThreshold, getEffectivePower, applyDefenses, applyDamageInstance, applyHeal, applyStatusEffect, logEffect, getSide, isCharAlive, isSupport } from './rpg-battle-effects.mjs';
import { registerAspectRenderers } from './aspect-renderers.mjs';
import { RpgBattleScreen } from './components/RpgBattleScreen.mjs';
import { RpgCombatStats } from './components/RpgCombatStats.mjs';
import './DebugBattles.mjs';
import { RpgChannelCard } from './components/RpgChannelCard.mjs';
import { RpgCharOverlay } from './components/RpgCharOverlay.mjs';
import { RpgHealthOverlay } from './components/RpgHealthOverlay.mjs';
import './components/RpgPartySelect.mjs';

const { game } = window.engine;

console.log('rpg_battler plugin loaded');

// ── Emitters ──
// Emitter: battle_start — Fired before battle begins. Args: (). Return false to prevent.
game.registerEmitter('battle_start');
// Emitter: battle_end — Fired when battle ends, BEFORE pre-battle states are restored and the
// roster is cleaned up — battle data (enemies, statuses) is still readable here, but state
// writes get overwritten by the restore; set post-battle state in battle_closed_before instead.
// Args: (result: 'victory' | 'defeat'). Not cancellable.
game.registerEmitter('battle_end');
// Emitter: battle_finished
// Fired the moment the battle is DECIDED, before the result overlay renders — every time,
// including a re-fight. Also fired by the scripted `{win: "<battleId>"}` action, so "a battle was
// won" is one hook whether it was fought or awarded. This is the hook for anything that must have its state ready for the
// overlay to display. `battle_end` is too late (it fires from the Continue button, once the
// overlay is being torn down) and `battle_defeated` is first-clear-only.
// Args: (result: 'victory' | 'defeat', battleId: string | null). Not cancellable.
game.registerEmitter('battle_finished');
// Emitter: battle_closed_before
// Fired after the battle is fully torn down: pre-battle states restored, battle statuses
// removed, spawned enemies deleted, battle cleared. Fires before the triggering scene
// resumes (victory only). Safe place to set post-battle game state.
// Args: (result: 'victory' | 'defeat'). Not cancellable.
game.registerEmitter('battle_closed_before');
// Emitter: battle_closed_after
// Fired at the very end of the battle, after `battle_closed_before` AND after the triggering
// scene has been resumed (victory) — the first moment the story has moved past the paragraph
// that ran {battle: "id"}. That paragraph's delayed action is still armed at _before time, so a
// save taken there reloads into a re-fight of the battle just won; take it here instead.
// A scene that chains straight into another fight has already started it by the time this fires —
// check `rpg_battle.isActive()` if that matters.
// Args: (result: 'victory' | 'defeat'). Not cancellable.
game.registerEmitter('battle_closed_after');
// Emitter: battle_turn_start — Fired at the start of a new round. Args: (turnNumber).
game.registerEmitter('battle_turn_start');
// Emitter: battle_wave_start — Fired when a wave AFTER the first takes the field (the previous
// wave was wiped and victory was withheld). Never fires for the opening wave.
// Args: (waveIndex: number /* 0-based, so the second wave is 1 */, enemyIds: string[]).
// Not cancellable.
game.registerEmitter('battle_wave_start');
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
// Emitter: battle_took_damage
// Fired after a combatant's health is actually reduced in battle — ability hits and service
// dealDamage (post-shield), thorns reflections, and DoT ticks. Fully shield-absorbed hits
// don't fire. Fires AFTER the HP change is applied.
// Args: (target: Character, damage: number, damageType: string, casterId: string | null).
// Not cancellable.
game.registerEmitter('battle_took_damage');

// ── Aspect renderers ──

// CSS classes are defined in css/rpg-battle.css: .physical .magic .burn .poison .bleeding .heal .value
// Aspect renderers live in aspect-renderers.mjs — a self-contained module the editor's
// preview hook (plugin.json `editor_preview`) also loads, so tooltips read identically
// in the editor's ability picker. Only the runtime injects getEffectivePower.
registerAspectRenderers(game, { getEffectivePower });

// Grey out abilities in the engine's AbilityCard when a character couldn't use them on their turn.
game.registerAbilityUsabilityChecker(previewAbilityUsable);

game.registerState('rpg_battle_log_minimized', false);
game.registerState('rpg_ability_tabs', {});
game.registerState('rpg_defeated_battles', []);

// ── Defeated battles ──

// Emitter: battle_defeated
// Fired ONCE when a battle definition is first marked defeated — by fight victory or by any
// script/action calling addDefeated (a scripted defeat). Args: (battleId: string).
// The single hook for defeat rewards: rpg_defeated_battles is the only tracking state.
game.registerEmitter('battle_defeated');

function addDefeated(battleId) {
  const defeated = game.getState('rpg_defeated_battles') || [];
  if (!defeated.includes(battleId)) {
    defeated.push(battleId);
    game.setState('rpg_defeated_battles', defeated);
    game.trigger('battle_defeated', battleId);
  }
}

// Action: win — {win: "<battleId>"} marks a battle definition defeated from a scene: the same flag
// a fight victory sets, firing battle_defeated once. Delayed, so it runs on the continue-click
// after the paragraph is read — letting battle_defeated listeners (e.g. defeat rewards) present
// their UI over the finished paragraph and gate the scene until dismissed.
game.registerAction('win', {
  eventDelayed: true,
  action: (/** @type {string} */ battleId) => {
    // addDefeated only TRACKS the clear (once per definition, for `_defeated` content gates).
    // The win itself is announced every time, so per-win listeners never get skipped.
    if (typeof battleId === 'string' && battleId) addDefeated(battleId);
    game.trigger('battle_finished', 'victory', battleId || null);
  },
});

/** @param {string} battleId @returns {boolean} */
function isDefeated(battleId) {
  return (game.getState('rpg_defeated_battles') || []).includes(battleId);
}

game.registerCondition('_defeated', isDefeated);

// ── Party size helpers ──

function getMaxPartySize() {
  const config = game.getData('plugins_data/rpg_battler/battle_config');
  return config?.max_battle_units || 4;
}

export function getMaxTotalUnits() {
  const config = game.getData('plugins_data/rpg_battler/battle_config');
  return config?.max_total_units || 5;
}

// Pre-battle party picker: when more eligible members exist than max_battle_units, start()
// stashes its params here and opens the picker popup; confirmPartySelect re-enters start()
// with the chosen roster. battle_always members are locked in, battle_ignore never appears.
export const partySelectRequest = window.engine.vue.ref(/** @type {{ params: any, eligible: string[], locked: string[], max: number } | null} */ (null));

// Pre-battle state snapshot. Taken at PREPARE (the picker opening) when there is a prepare
// step, else at battle start — saves are disabled from that moment, and endRpgBattle's normal
// restore covers the whole span because the battle object consumes this snapshot.
let preBattleStates = /** @type {{ disableSaves: any, blockInventory: any, gameState: any, hideEvents: any } | null} */ (null);

function captureBattleStates() {
  if (preBattleStates) return preBattleStates;
  preBattleStates = {
    disableSaves: game.getState('disable_saves'),
    blockInventory: game.getState('block_party_inventory'),
    gameState: game.getState('game_state'),
    hideEvents: game.getState('hide_events'),
  };
  return preBattleStates;
}

export function confirmPartySelect(/** @type {string[]} */ chosenIds) {
  const request = partySelectRequest.value;
  partySelectRequest.value = null;
  game.closePopup('rpg_party_select');
  if (!request) return;
  game.getService('rpg_battle').start({ ...request.params, playerParty: chosenIds, _partySelected: true });
}

export function cancelPartySelect() {
  partySelectRequest.value = null;
  game.closePopup('rpg_party_select');
  // No battle will consume the snapshot — restore everything the prepare step blocked.
  if (preBattleStates) {
    game.setState('disable_saves', preBattleStates.disableSaves);
    game.setState('block_party_inventory', preBattleStates.blockInventory);
    game.setState('hide_events', preBattleStates.hideEvents);
    preBattleStates = null;
  }
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
 * Fallback battle background when a battle sets none: the configured default asset
 * of the current room, else the current (map) dungeon. Read from the parsed dungeon
 * data so it reflects the editor config, not whatever happens to be staged.
 * @returns {string | null} an asset id, or null when no default is configured
 */
function resolveSceneDefaultBackground() {
  const dungeonId = game.getCurrentDungeonId();
  if (!dungeonId) return null;

  // Room-level default (most specific) — rooms data is keyed by room id.
  const roomId = game.getCurrentRoomId();
  if (roomId) {
    try {
      const rooms = game.getData(`dungeons/${dungeonId}/rooms`, true);
      const roomDefaults = rooms?.get?.(roomId)?.default_assets;
      if (roomDefaults?.length) return roomDefaults[0];
    } catch { /* dungeon has no rooms data */ }
  }

  // Dungeon-level default from `_config_.default_assets`.
  try {
    const lines = game.getData(`dungeons/${dungeonId}/content_parsed`, true);
    const config = lines?.get?.('_config_')?.params;
    if (config?.default_assets?.length) return config.default_assets[0];
  } catch { /* dungeon has no parsed content */ }

  return null;
}

// ── Battle service ──

/**
 * Expand a battle definition into one entry per body. Template entries repeat `amount` times;
 * a live entry spawns nothing and carries no `amount` — it IS the characters it lists.
 * @param {string} battleId
 * @returns {RpgRosterEntry[]}
 */
function battleRoster(battleId) {
  const def = game.getData('plugins_data/rpg_battler/battles', true)?.get(battleId);
  const roster = [];
  for (const key in def || {}) {
    const match = /^enemies(\d*)$/.exec(key);
    if (!match) continue;
    const wave = match[1] ? Number(match[1]) - 1 : 0;
    for (const entry of def[key] || []) {
      if (entry.is_live_instance) {
        for (const id of entry.live_character_ids || []) {
          // No template to price — read the live character's own trait.
          roster.push({ characterId: id, templateId: null, wave, threat: game.getCharacter(id)?.getTrait('threat') || 0 });
        }
        continue;
      }
      const threat = game.getData('character_templates', true)?.get(entry.character_id)?.traits?.threat || 0;
      for (let i = 0; i < (entry.amount || 1); i++) {
        roster.push({ characterId: null, templateId: entry.character_id, wave, threat });
      }
    }
  }
  return roster;
}

game.registerService('rpg_battle', {
  /**
   * @param {StartRpgBattleParams} params
   */
  async start(params) {
    // Re-entry guard: a stray battle action while a battle runs (e.g. input reaching
    // the parked scene's delayed {battle} choice) must not replace the live battle —
    // the screen is already mounted and would never re-drive the new one.
    if (currentRpgBattle.value) {
      console.warn('rpg_battler: battle already active - ignoring start()');
      return { ok: false, reason: 'already_active' };
    }

    let waves = params.waves;
    let background = params.background || null;

    if (!waves && params.enemies) waves = [params.enemies, params.enemies2];

    if (params.battleId && !waves) {
      const battles = game.getData('plugins_data/rpg_battler/battles', true);
      const def = battles?.get(params.battleId);
      if (!def) {
        throw new Error(`rpg_battler: battle "${params.battleId}" not found — create it in the editor under the RPG Battler tab → Battles, or fix the id passed to the battle action.`);
      }
      // The editor exposes flat wave fields (enemies, enemies2) because a nested
      // array-of-arrays has no sane form UI; everything past this point is wave-agnostic,
      // so adding `enemies3` later is a schema-only change.
      waves = [def.enemies, def.enemies2];
      if (!background && def.background) background = def.background;
    }

    // Empty/absent waves drop out — a battle with only `enemies` is simply a one-wave battle.
    waves = (waves || []).filter(w => w?.length);

    // No explicit background → fall back to the dungeon/room's configured default asset.
    if (!background) background = resolveSceneDefaultBackground();

    if (waves.length === 0) {
      console.warn('rpg_battler: no enemies provided');
      return { ok: false, reason: 'no_enemies' };
    }
    const enemyEntries = waves[0];

    // Everything below works on a LOCAL roster: a scene's `{battle: {...}}` action value is
    // the same object every time that choice fires, so mutating params would carry one
    // battle's roster (and its support split) into the next.
    // Use current party as default — members flagged battle_ignore never enter battles
    let roster = params.playerParty?.length
      ? [...params.playerParty]
      : game.getParty().filter(c => !c.getTrait('battle_ignore')).map(c => c.id);

    if (roster.length === 0) {
      console.warn('rpg_battler: no player party available');
      return { ok: false, reason: 'no_party' };
    }

    // Supports (battle_support) fight from the sidelines: split them out BEFORE the size
    // gate so the picker never shows them and max_battle_units only counts real slots.
    // On a picker re-entry the chosen roster no longer holds them, so they ride along on
    // _supportParty — which is only ever trusted on that re-entry, never as a cache.
    const supportIds = params._partySelected
      ? (params._supportParty || [])
      : roster.filter(id => game.getCharacter(id)?.getTrait('battle_support'));
    roster = roster.filter(id => !supportIds.includes(id));

    if (roster.length === 0) {
      console.warn('rpg_battler: player party has only support members');
      return { ok: false, reason: 'no_party' };
    }

    // Enforce max starting units. With more eligible members than slots, open the party
    // picker instead of silently slicing — battle_always members are locked into it.
    const max = getMaxPartySize();
    if (roster.length > max) {
      if (!params._partySelected) {
        const locked = roster.filter(id => game.getCharacter(id)?.getTrait('battle_always'));
        // With locked members alone filling (or overfilling) the roster there is nothing to
        // pick — proceed with them directly. Opening the picker here would soft-lock: locked
        // faces can't be deselected, so Fight could never enable.
        if (locked.length >= max) {
          roster = locked.slice(0, max);
        } else {
          // PREPARE = the first battle event: snapshot pre-battle states and engage the full
          // blocking set right away (saves, party inventory, events). A save or inventory
          // change mid-pick would desync the half-started battle. The screen itself
          // (game_state) only swaps when the battle actually starts.
          captureBattleStates();
          game.setState('disable_saves', true);
          game.setState('block_party_inventory', true);
          game.setState('hide_events', true);
          // A COPY of params — confirmPartySelect spreads this back into start(), and the
          // caller's own object must stay untouched for the next battle.
          partySelectRequest.value = {
            params: { ...params, playerParty: roster, _supportParty: supportIds },
            eligible: [...roster], locked, max,
          };
          game.openPopup('rpg_party_select');
          return { ok: false, reason: 'party_select_pending' };
        }
      } else {
        console.warn(`rpg_battler: party size (${roster.length}) exceeds max (${max}), using first ${max}`);
        roster = roster.slice(0, max);
      }
    }

    // Supports rejoin AFTER size enforcement, appended at the END of the roster so they
    // never sit between real members (splash/neighbor adjacency walks party order).
    const supportSet = new Set(supportIds.filter(id => game.getCharacter(id)));
    const playerParty = [...roster, ...supportSet];

    const { ids: enemyParty, spawned: spawnedEnemies } = spawnEnemies(enemyEntries);
    const turnOrder = [...playerParty, ...enemyParty];
    const playerSet = new Set(playerParty);

    /** @type {RpgBattle} */
    const battle = {
      id: game.createUid(),
      battleId: params.battleId || null,
      turn: 0,
      phase: 'active',
      playerParty: [...playerParty],
      enemyParty,
      turnOrder,
      summoned: [],
      spawnedEnemies,
      // Waves past the first spawn when the field is cleared (see advanceWave). waveIndex is
      // the wave currently on the field; a single-wave battle just never advances.
      waves,
      waveIndex: 0,
      actorTurn: -1,
      activeCharId: null,
      activeSide: 'player',
      result: null,
      battlePhase: 'choosing_ability',
      selectedAbilityId: null,
      log: [],
      backgroundAssetId: background,
      charState: {},
      prevDisableSaves: captureBattleStates().disableSaves,
      prevBlockInventory: captureBattleStates().blockInventory,
      prevGameState: captureBattleStates().gameState,
      prevHideEvents: captureBattleStates().hideEvents,
      prevAssets: game.getAssets(),
    };
    preBattleStates = null; // consumed — the battle object now owns the restore values

    // Initialize charState for all combatants
    const allCombatants = [...battle.playerParty, ...battle.enemyParty];
    for (const id of allCombatants) {
      battle.charState[id] = {
        side: playerSet.has(id) ? 'player' : 'enemy',
        battleIndex: 0,
        abilities: {},
        defeated: false,
        bonusUsed: 0,
        support: supportSet.has(id),
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

    // Drop any scene-queue state left over from a previous battle's teardown BEFORE
    // battle_start fires — scenes queued by battle_start listeners must survive.
    resetBattleScenes();

    if (!game.trigger('battle_start')) {
      currentRpgBattle.value = null;
      return { ok: false, reason: 'prevented' };
    }


    // Opening statuses on the whole player party (e.g. an ambush advantage):
    // { battle: { battleId: "bats", statuses: ["advantage"] } }
    if (params.statuses?.length) {
      for (const statusId of params.statuses) {
        for (const charId of battle.playerParty) {
          if (isSupport(charId)) continue;
          applyStatusEffect(charId, charId, statusId, 1);
        }
      }
    }

    // Preload every combatant's battle assets behind a loading screen — all
    // battle_state poses, masks, spines, plus any characters their abilities
    // can summon — so first hits/attacks never fetch images mid-animation.
    game.setScreenLoading(true);
    try {
      const battleStates = [...(game.getData('character_attributes', true).get('battle_state')?.values || [])];
      const preloadTargets = new Set(allCombatants);
      // Later waves are known upfront, so their art loads behind THIS loading screen —
      // a wave spawns mid-fight with no pause to fetch images.
      for (const wave of waves.slice(1)) {
        // preloadCharacterAssets resolves a live character id or a template id, so a wave's live
        // entries warm from the same call as its template ones.
        for (const entry of wave) {
          if (entry?.is_live_instance) for (const id of entry.live_character_ids || []) preloadTargets.add(id);
          else if (entry?.character_id) preloadTargets.add(entry.character_id);
        }
      }
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
  /** @param {string} battleId @returns {boolean} */
  isDefeated(battleId) {
    return isDefeated(battleId);
  },
  /**
   * Base threat of a battle DEFINITION: Σ template `threat` trait × amount over the enemies of
   * EVERY wave, plus the battle's own `threat` field on top. Games price it either way — per
   * character (templates carry `threat`, the battle field adds boss stakes) or per battle
   * (templates carry none and the field holds the full value on the 1-100 design scale:
   * vermin ~5 … chapter boss ~90-100, overflow allowed — the dryad_tale style). Every
   * threat-driven system reads this: loot budgets, XP, game-side economies (allure pricing).
   * Unscaled base value.
   * @param {string} battleId @returns {number}
   */
  getThreat(battleId) {
    let total = game.getData('plugins_data/rpg_battler/battles', true)?.get(battleId)?.threat || 0;
    for (const body of battleRoster(battleId)) total += body.threat;
    return total;
  },
  /**
   * The resolved roster of a battle DEFINITION — one entry per body, across every wave. This is
   * the single walk of the definition shape; anything needing "who is in this battle" (headcounts,
   * threat, previews) reads it instead of re-deriving the wave / live-instance / template rules.
   * @param {string} battleId
   * @returns {RpgRosterEntry[]}
   */
  getRoster: battleRoster,
  /**
   * Base threat summed over the LIVE enemy party's `threat` traits (per-character authoring
   * style only — returns 0 for games that author battle-level `threat`). Traits are frozen
   * per-template, so this equals the definition sum — call from a battle_end listener (the
   * roster is deleted by battle_closed_before).
   * @returns {number}
   */
  getLiveThreat() {
    let total = 0;
    for (const id of currentRpgBattle.value?.enemyParty || []) {
      total += game.getCharacter(id)?.getTrait('threat') || 0;
    }
    return total;
  },
  /**
   * Loot inventory id for a battle: the definition's `loot` field, else the inventory sharing the
   * battle's id, else null.
   * @param {string} battleId @returns {string|null}
   */
  getBattleLoot(battleId) {
    const def = game.getData('plugins_data/rpg_battler/battles', true)?.get(battleId);
    if (def?.loot) return def.loot;
    return game.getData('item_inventories', true)?.has(battleId) ? battleId : null;
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
  /** Id of the running battle definition, or null outside battle / for ad-hoc battles. */
  getBattleId() {
    return currentRpgBattle.value?.battleId || null;
  },
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
   * Heal a combatant with a RAW amount through the heal pipeline — the caller computes the base
   * value (flat, % of max health, whatever) and the modifiers are applied inside, then the heal
   * floats and logs like any pipeline heal. casterId is explicit: given, that caster's
   * heal_amplification applies; omitted, the heal is casterless and only the target's
   * heal_received_mult shapes it.
   * @param {string} targetId @param {number} amount raw heal before modifiers
   * @param {{ casterId?: string, label?: string }} [opts] label attributes the log line to a
   *   named source ("recovers X HP from <label>"); without it the line reads as a plain heal.
   * @returns {number} health actually restored (0 on no battle / dead target / fizzle)
   */
  heal(targetId, amount, opts = {}) {
    const battle = currentRpgBattle.value;
    if (!battle) return 0;
    const target = game.getCharacter(targetId);
    if (!target || !(amount > 0)) return 0;
    // The dead don't heal — a defeated combatant awaiting processDeaths must stay at 0.
    if (target.getResource('health') <= 0) return 0;
    const caster = opts.casterId ? (game.getCharacter(opts.casterId) || null) : null;
    const { healed, raw } = applyHeal(caster, target, amount);
    if (healed <= 0) return 0;
    const result = opts.label
      ? { type: 'status_hot', targetId, amount: healed, rawAmount: raw, statusName: opts.label }
      : { type: 'heal', targetId, amount: healed, rawAmount: raw };
    logEffect(battle, caster ? caster.id : targetId, result);
    return healed;
  },
  /**
   * Apply N stacks of a status through the pipeline (floating text → log → stagger check).
   * Stacks taken as-is (no power-scaling — caller computed the final amount). Operates on the
   * active battle.
   * @param {string} casterId @param {string} targetId @param {string} statusId @param {number} stacks @param {number} [duration]
   */
  /**
   * Which side a combatant fights on. Lets a game script ask whether two characters are enemies
   * without reaching into the battle's party arrays.
   * @param {string} charId
   * @returns {'player' | 'enemy' | null} null when no battle is running or the id is unknown
   */
  getSide(charId) {
    const battle = currentRpgBattle.value;
    if (!battle || !charId) return null;
    if (!battle.playerParty.includes(charId) && !battle.enemyParty.includes(charId)) return null;
    return getSide(charId);
  },
  /**
   * The living combatants standing next to `targetId` in its OWN party. Counts exactly like
   * `splash_count`: `count` is the TOTAL number of NEIGHBOURS to return, taking the left one first
   * then the right, so 1 yields one and 2 yields both. Only immediate neighbours exist, so anything
   * above 2 still returns at most 2. Pass `includeSelf` to get the target at the head of the list —
   * `count` still counts neighbours only, so (2, true) is a three-in-a-row blast.
   * Positions come from the full roster, so a target that just died still finds its neighbours; only
   * living ids come back, and `includeSelf` is ignored for a dead target.
   * @param {string} targetId @param {number} [count=1] @param {boolean} [includeSelf=false]
   * @returns {string[]}
   */
  getNeighbors(targetId, count = 1, includeSelf = false) {
    const battle = currentRpgBattle.value;
    if (!battle || !targetId) return [];
    // Supports stand outside the line: they have no neighbors and are never one.
    if (isSupport(targetId)) return [];
    // Positions come from the FULL roster, not the living, so a combatant that just died still has
    // a place in the line and can still spread something outward. Only living ids are returned, and
    // the walk steps over corpses — so for a living target this matches splash's alive-only pool.
    const roster = battle.playerParty.includes(targetId) ? battle.playerParty : battle.enemyParty;
    const party = roster.filter(id => !isSupport(id));
    const idx = party.indexOf(targetId);
    if (idx === -1) return [];

    const nextAlive = (step) => {
      for (let i = idx + step; i >= 0 && i < party.length; i += step) {
        if (isCharAlive(party[i])) return party[i];
      }
      return null;
    };

    const out = [];
    if (count > 0) {
      const left = nextAlive(-1);
      if (left) out.push(left);
      if (out.length < count) {
        const right = nextAlive(1);
        if (right) out.push(right);
      }
    }
    const neighbours = out.slice(0, count);
    return includeSelf && isCharAlive(targetId) ? [targetId, ...neighbours] : neighbours;
  },
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
  /**
   * Summon a fresh combatant from a character template — the plugin owns the whole pipeline:
   * unit cap checked BEFORE the character is created (a refused summon never leaks its private
   * inventory into saves), then created, registered, and inserted into the turn order. Prefer
   * this over summon() whenever the spawn comes from a template.
   * @param {string} templateId @param {'player' | 'enemy'} side
   * @returns {string | null} combatant id, or null (cap reached / unknown template)
   */
  summonFromTemplate(templateId, side) {
    return summonFromTemplate(templateId, side);
  },
  /**
   * Whether a side is at its unit cap. summonFromTemplate checks this itself; check it manually
   * only before building a CUSTOM character for summon() — a character created and then refused
   * by the cap leaks its private inventory into saves.
   * @param {'player' | 'enemy'} side @returns {boolean}
   */
  atUnitCap(side) {
    return sideAtUnitCap(side);
  },
  /** True while queued battle scenes are pending or one is on screen (battle flow paused). */
  isScenePlaying() {
    return isBattleScenePauseActive();
  },
  /**
   * True when the running battle definition matches `battleId`. False outside battle
   * and for ad-hoc battles.
   * @param {string} battleId
   */
  inBattle(battleId) {
    return !!battleId && currentRpgBattle.value?.battleId === battleId;
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

  // Abort any queued/open battle scene and put the parked story scene back BEFORE
  // the state restore below and the nextScene() resume at the bottom.
  teardownBattleScenes();

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

  game.trigger('battle_closed_before', result);

  // Resume the scene that triggered the battle only on victory — on defeat it must not
  // continue as if won; the game's battle_closed_before listener owns what happens next.
  // instant: teardownBattleScenes put the parked cast back so a CONTINUING scene keeps its actors.
  // When the scene has nothing left, that restored cast was never on screen (the battle covered it),
  // so closing gracefully would fade it out — actors appearing for a moment before vanishing.
  if (result === 'victory') {
    game.nextScene(true);
  }

  game.trigger('battle_closed_after', result);
}

