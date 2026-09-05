/// <reference path="./dtypes.d.ts" />

import { currentRpgBattle, addFloatingText, requiredSelfStatuses, pushLog } from './rpg-battle-state.mjs';
import {
  resolveAbility, processStatusEffects, getStatusStacks,
  removeStatusStacks, getStatusDefinitions, isCharAlive, isSupport,
  getSide, isAIControlled, checkStaggerThreshold, computeEffectiveThreshold, logEffect, endChannelsBy,
} from './rpg-battle-effects.mjs';
import { setIdleState } from './rpg-battle-anims.mjs';

const { game } = window.engine;

const LOG_VISIBLE_TURNS = 3;

/** @param {RpgBattle} b */
function isFinished(b) { return b.phase === 'finished'; }

// ── Initialization ──

/**
 * Initialize battle tracking: ability states, tokens from source stats.
 * Call after battle object is created and characters are spawned.
 */
export function initBattleTracking() {
  const battle = currentRpgBattle.value;
  if (!battle) return;
  for (const charId of [...battle.playerParty, ...battle.enemyParty]) initCombatantTracking(charId);
}

/**
 * Reconcile a combatant's cached ability roster (battle.charState[id].abilities) with its live
 * getAbilities(): add tracking for any newly-gained ability (fresh cooldown/charges), prune any it
 * no longer has. Existing entries keep their current cooldown/charge state.
 *
 * The roster is snapshotted at spawn, but statuses can grant/remove abilities mid-fight and
 * canUseAbility requires a charState entry — so without this a status-granted ability would never
 * become castable. Called at spawn (atBattleStart) and on every status add/remove/expire below, so
 * ability-granting statuses work for every combatant, summons included.
 * @param {string} charId
 * @param {boolean} [atBattleStart] apply the battle-start cooldown compensation to new entries
 */
export function syncCombatantAbilities(charId, atBattleStart = false) {
  const battle = currentRpgBattle.value;
  const cs = battle?.charState[charId];
  const char = game.getCharacter(charId);
  if (!cs || !char) return;
  const abilities = char.getAbilities();
  for (const abId in abilities) {
    if (cs.abilities[abId]) continue; // keep existing cooldown/charge state
    const meta = abilities[abId].meta;
    cs.abilities[abId] = {
      // battle-start: +1 for the pre-action tick on the first turn. mid-battle grant: ready now.
      cooldown: atBattleStart && meta.cd_on_battle_start && meta.cd ? meta.cd + 1 : 0,
      charges: meta.charges || -1,
    };
  }
  for (const abId in cs.abilities) {
    if (!abilities[abId]) delete cs.abilities[abId];
  }
}

// Only the ability ROSTER is cached in charState (stats are read live), so a status that grants or
// removes an ability mid-battle must re-sync that combatant's roster. Combatant check = has
// charState. Fires for every status change on any combatant (summons, MC, enemies).
function resyncCombatantRoster(character) {
  const battle = currentRpgBattle.value;
  if (!battle || !character || !battle.charState[character.id]) return;
  syncCombatantAbilities(character.id);
}
game.on('status_added', resyncCombatantRoster);
game.on('status_removed', resyncCombatantRoster);
game.on('status_expired', resyncCombatantRoster);

/**
 * Init per-combatant battle tracking: ability cooldown/charge state, source-stat statuses
 * (e.g. wind_mantle), and initial idle pose. Used at battle start and for mid-battle summons.
 * @param {string} charId
 */
function initCombatantTracking(charId) {
  const battle = currentRpgBattle.value;
  const char = game.getCharacter(charId);
  if (!char || !battle.charState[charId]) return;
  const cs = battle.charState[charId];

  const abilities = char.getAbilities();
  for (const abId in abilities) {
    const meta = abilities[abId].meta;
    cs.abilities[abId] = {
      // +1 compensates for the pre-action tick the character gets on their first turn
      cooldown: meta.cd_on_battle_start && meta.cd ? meta.cd + 1 : 0,
      charges: meta.charges || -1,
    };
  }

  const defs = getStatusDefinitions();
  if (defs) {
    for (const [statusId, def] of defs) {
      const src = def.meta?.source;
      if (!src) continue;
      const stacks = char.getStat(src) || 0;
      if (stacks > 0) {
        const status = game.createStatus(statusId);
        if (status) char.addStatus(status, { stacks: Math.round(stacks), source: charId });
      }
    }
  }

  setIdleState(charId);
}

/**
 * Add an already-created character to the active battle on `side` as a combatant — registers it,
 * pushes it onto that side's roster, inits its tracking, and inserts it into the turn order among
 * the not-yet-acted so it can act this round based on its speed. Does NOT touch the persistent
 * party. Returns the combatant id (or null).
 * @param {Character} character
 * @param {'player' | 'enemy'} side
 * @returns {string | null}
 */
/**
 * Free summon slots on a side: max_total_units for the player (battle-lifetime, counting
 * summons), max_enemy_units for enemies (so AI stops summoning into full ranks).
 * @param {'player' | 'enemy'} side @returns {number}
 */
export function sideFreeSlots(side) {
  const battle = currentRpgBattle.value;
  if (!battle) return 0;
  const config = game.getData('plugins_data/rpg_battler/battle_config');
  if (side === 'enemy') {
    // Enemy cap counts LIVING units ("at any moment") — summoner archetypes refill their
    // ranks as minions fall. The rosters themselves are append-only, so filter by health.
    const alive = battle.enemyParty.filter(id => (game.getCharacter(id)?.getResource('health') || 0) > 0).length;
    return Math.max(0, (config?.max_enemy_units || 6) - alive);
  }
  // Player cap is battle-lifetime (max_total_units): dead sprouts still spent their slot.
  // Supports never occupy slots, so they don't eat the summon budget.
  return Math.max(0, (config?.max_total_units || 5) - battle.playerParty.filter(id => !isSupport(id)).length);
}

/**
 * Whether a side is at its unit cap.
 * @param {'player' | 'enemy'} side
 */
export function sideAtUnitCap(side) {
  return sideFreeSlots(side) <= 0;
}

export function summonCombatant(character, side) {
  const battle = currentRpgBattle.value;
  if (!battle || !character) return null;
  const id = character.id;
  if (battle.charState[id]) return id;

  const s = side === 'enemy' ? 'enemy' : 'player';

  // A battle_support joiner (story reinforcement mid-battle) takes no slot, so it bypasses
  // the unit cap and enters flagged like a battle-start support. Player side only: an
  // immune, untargetable enemy would leave `enemiesAlive` true forever — no victory.
  const supportJoin = s === 'player' && !!character.getTrait?.('battle_support');
  if (s === 'enemy' && character.getTrait?.('battle_support')) {
    console.warn(`rpg_battler: battle_support is player-side only — "${id}" joins as a normal enemy`);
  }

  // Unit caps: summons beyond a side's cap fizzle — both the summon aspect and the service
  // path handle a null return, and canUseAbility greys summon abilities out at the cap.
  if (!supportJoin && sideAtUnitCap(s)) return null;

  // A character that already exists is a persistent one (a party member pulled into the
  // fight); only ad-hoc spawns go on `summoned`, which endRpgBattle deletes at teardown.
  const preexisting = !!game.getCharacter(id);
  if (!preexisting) game.addCharacter(character);

  battle[s === 'enemy' ? 'enemyParty' : 'playerParty'].push(id);
  if (!preexisting) battle.summoned.push(id);
  battle.charState[id] = { side: s, battleIndex: 0, abilities: {}, defeated: false, bonusUsed: 0, support: supportJoin };
  // A fresh spawn is created at full health; a preexisting reinforcement would otherwise walk in
  // carrying wounds from earlier in the run. Match spawnEnemies and bring live enemy joiners in
  // at full, before tracking init.
  if (s === 'enemy' && preexisting) character.setResource('health', character.getStat('health'));
  initCombatantTracking(id);

  const insertAt = Math.min(Math.max(battle.actorTurn + 1, 0), battle.turnOrder.length);
  battle.turnOrder.splice(insertAt, 0, id);
  resortRemainingTurnOrder();
  return id;
}

/** Templates already warned about this session — a missing summon template is an authoring
 *  error worth one line, not one per proc (statuses may ship pointing at templates that
 *  arrive with a later dungeon). */
const warnedSummonTemplates = new Set();

/**
 * Cap-safe template summon — the plugin owns the whole pipeline: the side's unit cap is checked
 * BEFORE the character is created, so a refused summon never pays createCharacter's side effects
 * (persistent private inventory, character_create actions/emitter). Callers just name a template;
 * use summonCombatant directly only for a character that already exists (a live instance, a
 * custom-built spawn).
 * @param {string} templateId @param {'player' | 'enemy'} side
 * @returns {string | null} combatant id, or null (cap reached / unknown template)
 */
export function summonFromTemplate(templateId, side) {
  const battle = currentRpgBattle.value;
  if (!battle || !templateId) return null;
  const s = side === 'enemy' ? 'enemy' : 'player';
  if (sideAtUnitCap(s)) return null;
  let character;
  try {
    character = game.createCharacter(game.createUid(), templateId);
  } catch (e) {
    if (!warnedSummonTemplates.has(templateId)) {
      warnedSummonTemplates.add(templateId);
      console.warn(`rpg_battler: summon template "${templateId}" does not exist — summon fizzles.`);
    }
    return null;
  }
  if (!character) return null;
  return summonCombatant(character, s);
}

// ── Ability usability ──

/**
 * Turn-invariant usability gates shared by `canUseAbility` (battle logic) and `previewAbilityUsable`
 * (UI) — charges, cost, self-status requirement, caster health. These don't change at turn start.
 * @param {Character} char @param {any} ability @param {{ charges: number }} state @returns {boolean}
 */
function passesStaticGates(char, ability, state) {
  if (state.charges === 0) return false;
  const meta = ability.meta;
  if (meta.costs) {
    for (const statId in meta.costs) {
      if (char.getResource(statId) < meta.costs[statId]) return false;
    }
  }
  const requiredSelf = requiredSelfStatuses(meta.require_status_self);
  if (requiredSelf.length && !requiredSelf.some((id) => getStatusStacks(char.id, id) > 0)) return false;
  if (meta.caster_min_health && char.getResourceRatio('health') * 100 < meta.caster_min_health) return false;
  if (meta.caster_max_health && char.getResourceRatio('health') * 100 > meta.caster_max_health) return false;
  return true;
}

/**
 * BATTLE LOGIC: can the **acting** character cast this ability **right now**? Strict & current —
 * drives the real cast gate (ability panel) and the AI. (Behaviour unchanged; shares passesStaticGates.)
 * @param {string} characterId @param {string} abilityId @returns {boolean}
 */
export function canUseAbility(characterId, abilityId) {
  const battle = currentRpgBattle.value;
  if (!battle) return false;
  const char = game.getCharacter(characterId);
  if (!char) return false;
  const ability = char.getAbility(abilityId);
  if (!ability) return false;
  const state = battle.charState[characterId]?.abilities[abilityId];
  if (!state) return false;

  if (state.cooldown > 0) return false;
  if (!passesStaticGates(char, ability, state)) return false;
  if (getStatusStacks(characterId, 'stun') > 0) return false;
  if (ability.meta.bonus_action && battle.charState[characterId].bonusUsed >= 1) return false;
  // Summon abilities are unusable at the caster side's unit cap — this is what stops the AI
  // from casting into full ranks (getUsableAbilities routes through here) and greys the button.
  if (abilityHasSummon(ability) && sideAtUnitCap(battle.charState[characterId].side)) return false;
  return true;
}

/** @param {any} ability */
function abilityHasSummon(ability) {
  for (const effectId in ability.effects || {}) {
    if (ability.effects[effectId]?.summon) return true;
  }
  return false;
}

/**
 * UI PREVIEW: will this character be able to use this ability **on their turn**? For greying ability
 * cards while browsing (e.g. inspecting an enemy). Lenient vs `canUseAbility`: projects the imminent
 * turn-start cooldown tick for a non-active character, and ignores stun & bonusUsed (both clear/reset
 * at turn start). Defaults to usable (true) when not in battle or the character isn't a combatant.
 * @param {string} characterId @param {string} abilityId @returns {boolean}
 */
export function previewAbilityUsable(characterId, abilityId) {
  const battle = currentRpgBattle.value;
  if (!battle) return true;
  const char = game.getCharacter(characterId);
  if (!char) return true;
  const ability = char.getAbility(abilityId);
  if (!ability) return true;
  const state = battle.charState[characterId]?.abilities[abilityId];
  if (!state) return true;

  const isActive = characterId === battle.activeCharId;
  const cd = isActive ? state.cooldown : Math.max(0, state.cooldown - 1);
  if (cd > 0) return false;
  return passesStaticGates(char, ability, state);
}

/**
 * Get all usable abilities for a character.
 * @param {string} characterId
 * @returns {string[]}
 */
export function getUsableAbilities(characterId) {
  const char = game.getCharacter(characterId);
  if (!char) return [];
  const abilities = char.getAbilities();
  const usable = [];
  for (const abId in abilities) {
    if (abilities[abId].meta.is_hidden) continue;
    if (canUseAbility(characterId, abId)) usable.push(abId);
  }
  return usable;
}

// ── Turn management ──

/**
 * Select a character for their turn: set active, reset bonus, tick cooldowns.
 * Runs before the camera zoom so it sets who the camera focuses.
 * @param {string} charId
 */
function beginCharacterTurn(charId) {
  const battle = currentRpgBattle.value;
  battle.activeCharId = charId;
  battle.activeSide = getSide(charId);
  battle.charState[charId].bonusUsed = 0;
  battle.log.push({ turn: battle.turn, actorId: charId, type: 'char_turn_start' });
  tickCooldowns(charId);
}

/**
 * Consume one `stun` stack if present (pure — no messaging). Returns true if the character was
 * stunned. A stun stack costs exactly one action: consume it at the point it forfeits an action
 * (turn start, or a mid-turn self-stun) so it never double-skips.
 * @param {string} charId @returns {boolean}
 */
export function consumeStun(charId) {
  if (getStatusStacks(charId, 'stun') <= 0) return false;
  removeStatusStacks(charId, 'stun', 1);
  return true;
}

/**
 * Tick the active character's turn-start effects (DoT/HoT, status drain, stagger, stun).
 * Run after the camera has zoomed in, so the flash and any death read clearly.
 * @param {string} charId
 * @returns {{ canAct: boolean, dotResults: RpgEffectResult[] }}
 */
export function tickActiveCharacter(charId) {
  const battle = currentRpgBattle.value;

  // Process DoT/HoT for this character (before draining so last-turn effects still apply)
  const dotResults = processStatusEffects(charId);

  // Snapshot effective stagger threshold BEFORE status drain (for bonus-loss bookkeeping)
  const prevStaggerThreshold = computeEffectiveThreshold(charId);

  // 4. Log this turn's DoT/HoT BEFORE draining, so anything a `status_expired` listener does (a burn
  //     detonating, say) reads after the tick that set it off rather than before it.
  for (const r of dotResults) logEffect(battle, charId, r);

  // 4.1. Drain battle-tagged status durations for this character
  drainCharStatusDurations(charId);

  // 4.5. Bonus-loss bookkeeping: when a threshold-bonus status (Braced) expires,
  //      remove the stagger that was accumulated in the bonus zone.
  const newStaggerThreshold = computeEffectiveThreshold(charId);
  if (newStaggerThreshold < prevStaggerThreshold) {
    const currentStagger = getStatusStacks(charId, 'stagger');
    if (currentStagger > 0) {
      const bonusLost = prevStaggerThreshold - newStaggerThreshold;
      const removeAmount = Math.min(currentStagger, bonusLost);
      if (removeAmount > 0) removeStatusStacks(charId, 'stagger', removeAmount);
    }
  }

  // 4.6. Stagger threshold check (defense-in-depth; should not fire after bonus-loss math)
  checkStaggerThreshold(charId);

  // 4.7. Public per-character turn-tick emitter (for game/plugin consumers)
  game.trigger('character_turn_post_tick', charId);

  // 5. Check if character died from DoT — defer to processDeaths for animations
  if (!isCharAlive(charId)) {
    return { canAct: false, dotResults };
  }

  // 5.5. Passive obstacle (meta.prevents_action) — forfeits every action without consuming
  //      anything, unlike stun which costs a stack per skipped action. Silent: no recover float.
  const actor = game.getCharacter(charId);
  if (actor?.getStatuses().some(st => st.meta?.prevents_action && st.currentStacks > 0)) {
    return { canAct: false, dotResults };
  }

  // 6. Check stun — skip turn (turn-start consume shows the "recover" float)
  if (consumeStun(charId)) {
    const stunDef = getStatusDefinitions().get('stun');
    addFloatingText({
      characterId: charId,
      text: game.getLine('float_recover'),
      cssClass: 'status-apply',
      icon: stunDef?.image || null,
      color: stunDef?.color,
    });
    battle.log.push({ turn: battle.turn, actorId: charId, targetId: charId, text: game.getLine('log_stunned') });
    return { canAct: false, dotResults };
  }

  return { canAct: true, dotResults };
}

/**
 * Re-fire the character's active channels from their frozen cast-time snapshots. Logs a cast entry
 * and flashes the ability name (a distinct `ability-channel` colour vs a normal cast), then resolves
 * each at its snapshotted power + effects. Returns the combined results so the caller can animate +
 * await them; effects are still floated/logged inside resolveAbility.
 * @param {string} charId @returns {RpgEffectResult[]}
 */
export function refireChannels(charId) {
  const battle = currentRpgBattle.value;
  const c = game.getCharacter(charId);
  if (!battle || !c) return [];
  /** @type {RpgEffectResult[]} */
  const results = [];
  for (const st of [...c.getStatuses()]) {
    const snap = st.meta?.channel_snapshot;
    if (!snap) continue;
    battle.log.push({ turn: battle.turn, actorId: charId, abilityId: snap.abilityId });
    addFloatingText({ characterId: charId, text: snap.ability?.meta?.name || snap.abilityId, cssClass: 'ability-channel', icon: snap.ability?.meta?.icon || null });
    results.push(...resolveAbility(charId, snap.abilityId, undefined, { isBounce: true, actionPower: snap.power, ability: snap.ability }));
  }
  return results;
}

/**
 * Per-round initiative roll — the final turn-order tiebreak among combatants of equal speed.
 * Without it the sort falls back to array order (JS sort is stable), so identical units would
 * keep the same pecking order for the whole battle and every battle after it.
 *
 * Rolled ONCE per round, not per sort: `resortRemainingTurnOrder` runs after every single turn,
 * and re-rolling there would make the upcoming turn order jitter while the player is reading it.
 */
function rollInitiative() {
  const battle = currentRpgBattle.value;
  if (!battle) return;
  for (const id in battle.charState) battle.charState[id].initiative = Math.random();
}

/** This round's roll for a combatant, rolled on demand for anyone who joined mid-round. */
function initiativeOf(characterId) {
  const cs = currentRpgBattle.value?.charState[characterId];
  if (!cs) return 0;
  if (cs.initiative === undefined) cs.initiative = Math.random();
  return cs.initiative;
}

/**
 * Turn-order comparator: fastest first, then this round's initiative roll. A tie is a genuine
 * coin flip regardless of side — the player used to win every cross-side tie, which made a
 * speed match-up a guaranteed first strike instead of a gamble.
 */
function compareTurnOrder(a, b) {
  const speedA = game.getCharacter(a)?.getStat('speed') || 0;
  const speedB = game.getCharacter(b)?.getStat('speed') || 0;
  if (speedB !== speedA) return speedB - speedA;
  return initiativeOf(a) - initiativeOf(b);
}

/**
 * Re-sort remaining characters (after actorTurn) by current speed.
 * Characters who already acted this round keep their positions.
 */
function resortRemainingTurnOrder() {
  const battle = currentRpgBattle.value;
  if (!battle) return;
  const startIdx = battle.actorTurn + 1;
  if (startIdx >= battle.turnOrder.length) return;
  const remaining = battle.turnOrder.slice(startIdx);
  remaining.sort(compareTurnOrder);
  battle.turnOrder.splice(startIdx, remaining.length, ...remaining);
}

/**
 * Full re-sort of turn order by current speed. Called at round start, which is also when
 * equal-speed combatants get their new initiative roll.
 */
export function resortFullTurnOrder() {
  const battle = currentRpgBattle.value;
  if (!battle) return;
  rollInitiative();
  battle.turnOrder.sort(compareTurnOrder);
}

/**
 * Advance to the next alive character and select them (no DoT/stun tick — the screen pipeline
 * calls tickActiveCharacter after the zoom). Skipping of DoT-dead / stunned characters happens
 * in the pipeline, one character at a time.
 * @returns {string | null} the selected character id, or null if none / battle finished
 */
export function advanceToNextTurn() {
  const battle = currentRpgBattle.value;
  if (!battle || isFinished(battle)) return null;

  // Re-sort remaining characters by current speed after each turn
  resortRemainingTurnOrder();

  const total = battle.turnOrder.length;
  for (let i = 0; i < total; i++) {
    battle.actorTurn = (battle.actorTurn + 1) % total;

    // New round when we wrap around
    if (battle.actorTurn === 0) {
      battle.turn++;
      resortFullTurnOrder();
      processRoundStart();
      if (isFinished(battle)) return null;
    }

    const charId = battle.turnOrder[battle.actorTurn];
    if (isCharAlive(charId)) {
      beginCharacterTurn(charId);
      return charId;
    }
  }

  return null;
}

/**
 * Process round start: log cleanup + turn header only.
 * All ticking moved to per-character tickActiveCharacter().
 */
function processRoundStart() {
  const battle = currentRpgBattle.value;
  if (!battle) return;

  const oldestKept = battle.turn - (LOG_VISIBLE_TURNS - 1);
  const kept = battle.log.filter(e => e.turn >= oldestKept);
  battle.log.length = 0;
  for (const e of kept) battle.log.push(e);
  battle.log.push({ turn: battle.turn, type: 'turn_start', text: game.getLine('log_turn_start', { turn: battle.turn }) });
  game.trigger('battle_turn_start', battle.turn);
}

/** Decrement cooldowns for a single character. @param {string} charId */
function tickCooldowns(charId) {
  const battle = currentRpgBattle.value;
  const abilities = battle.charState[charId]?.abilities;
  if (!abilities) return;
  for (const abId in abilities) {
    if (abilities[abId].cooldown > 0) abilities[abId].cooldown--;
  }
}

/** Tick meta.is_battle status durations for a single character, remove expired. @param {string} charId */
function drainCharStatusDurations(charId) {
  const char = game.getCharacter(charId);
  if (!char) return;
  // Snapshot statuses with their meta — tickStatusDuration may remove the status, mutating getStatuses
  const battleIds = char.getStatuses().filter(s => s.meta?.is_battle).map(s => s.id);
  for (const id of battleIds) char.tickStatusDuration(id, 1);
}

// ── Action execution ──

/**
 * When an equipped item with the `battle_consumable` trait grants the cast ability, reduce one
 * dose (item.quantity) from it. Walks getEquippedItems() in slot order so the leftmost stack
 * drains first; reduceItemQuantity auto-removes the Item (and therefore unequips it and drops the
 * status that granted the ability) when quantity hits 0.
 * @param {Character} caster
 * @param {string} abilityId
 */
export function consumeBattleConsumable(caster, abilityId) {
  if (!caster) return;
  for (const item of caster.getEquippedItems()) {
    if (!item?.traits?.battle_consumable) continue;
    const grantedAbilities = item.statusObject?.abilities || [];
    if (!grantedAbilities.includes(abilityId)) continue;
    const inv = caster.getPartyInventory();
    if (inv) inv.reduceItemQuantity(item, 1, caster);
    return; // one dose per cast
  }
}

/**
 * Execute a player's ability action.
 * Returns null when the cast didn't happen (no battle, no caster, no ability, or
 * `battle_action_start` veto) so callers can skip consume / animations. Returns the
 * results array (possibly empty) when the cast resolved.
 * @param {string} abilityId
 * @param {string} [targetId]
 * @returns {RpgEffectResult[] | null}
 */
export function executeAction(abilityId, targetId) {
  const battle = currentRpgBattle.value;
  if (!battle) return null;

  const casterId = battle.activeCharId;
  if (!casterId) return null;

  const caster = game.getCharacter(casterId);
  const ability = caster?.getAbility(abilityId);
  if (!ability) return null;

  // Build mutable action event — listeners can redirect abilityId/targetId or cancel
  const actionEvent = { abilityId, targetId };
  if (!game.trigger('battle_action_start', caster, actionEvent)) {
    return null;
  }

  // Log the action (use potentially mutated abilityId)
  battle.log.push({ turn: battle.turn, actorId: casterId, abilityId: actionEvent.abilityId });

  // Resolve effects (results are logged inside resolveAbility, before battle_action_applied)
  const results = resolveAbility(casterId, actionEvent.abilityId, actionEvent.targetId);

  game.trigger('battle_action_end', caster, actionEvent.abilityId, results);

  return results;
}

/**
 * Float the ability's name on an AI-controlled caster (the "ability-use" cast flash). Timed by the
 * cast animation (`animateCast`'s `onCast`) so it shows at the lunge peak / projectile launch.
 * @param {string} casterId @param {string} abilityId
 */
export function flashAbilityName(casterId, abilityId) {
  if (!isAIControlled(casterId)) return;
  const ab = game.getCharacter(casterId)?.getAbility(abilityId);
  addFloatingText({ characterId: casterId, text: ab?.meta?.name || abilityId, cssClass: 'ability-use', icon: ab?.meta?.icon || null });
}

/**
 * Process deaths and check battle end. Call AFTER animateEffects so death animations play first.
 */
export function processDeaths() {
  const battle = currentRpgBattle.value;
  if (!battle) return;

  // Fixpoint sweep: a defeat listener can kill OTHER combatants mid-sweep (a volatile passive
  // detonating into its neighbors, a burn detonation on death) — including at indexes already
  // visited. Re-sweep until a full pass finds no new deaths, so every chain victim gets its
  // handleDeath (and battle_character_defeated) before the battle-end check. Bounded: each real
  // death sets charState.defeated once; a death-defiance revive leaves the character alive.
  let sweepAgain = true;
  while (sweepAgain) {
    sweepAgain = false;
    const allChars = [...battle.playerParty, ...battle.enemyParty];
    for (const charId of allChars) {
      if (!isCharAlive(charId) && !battle.charState[charId]?.defeated) {
        handleDeath(charId);
        sweepAgain = true;
      }
    }
  }

  checkBattleEnd();
}

// ── Death handling ──

/**
 * Handle character death.
 * @param {string} characterId
 */
export function handleDeath(characterId) {
  const battle = currentRpgBattle.value;
  if (!battle) return;

  // Check death defiance
  const ddStacks = getStatusStacks(characterId, 'death_defiance');
  if (ddStacks > 0) {
    removeStatusStacks(characterId, 'death_defiance', 1);
    const char = game.getCharacter(characterId);
    if (char) char.setResource('health', 1);
    addFloatingText({ characterId, text: game.getLine('float_death_defiance'), cssClass: 'death-defiance' });
    return;
  }

  const cs = battle.charState[characterId];
  cs.defeated = true;

  // A defeated caster's channels end, same as on stun.
  endChannelsBy(characterId);

  game.trigger('battle_character_defeated', characterId, cs.side);
}

// ── Enemy spawning / scaling ──

/**
 * Spawn enemies from one wave's entry list.
 *
 * A live entry names persistent characters (`live_character_ids`) instead of a template — they are
 * fetched, not created, and survive the teardown that deletes the spawned ones. They enter at full
 * health: a live enemy carries its wounds out of the fight, so without this a retry after a defeat
 * would face the corpses the player left behind.
 * @param {RpgBattleEntry[]} entries
 * @returns {{ ids: string[], spawned: string[] }} all enemy IDs, and the subset the battle created (non-live)
 */
export function spawnEnemies(entries) {
  const ids = [];
  const spawned = [];
  for (const entry of entries) {
    if (entry.is_live_instance) {
      for (const liveId of entry.live_character_ids || []) {
        const char = game.getCharacter(liveId);
        if (!char) {
          console.error(`[rpg_battler] live enemy "${liveId}" does not exist — skipped. `
            + 'Live enemies are created by game scripts; check the id and that the script ran.');
          continue;
        }
        char.setResource('health', char.getStat('health'));
        ids.push(char.id);
      }
      continue;
    }
    for (let i = 0; i < (entry.amount || 1); i++) {
      const uid = game.createUid();
      const char = game.createCharacter(uid, entry.character_id);
      game.addCharacter(char);
      ids.push(char.id);
      spawned.push(char.id);
    }
  }
  return { ids, spawned };
}

// ── Waves ──

/** Whether another wave is queued behind the one currently on the field. */
export function hasPendingWave() {
  const battle = currentRpgBattle.value;
  if (!battle) return false;
  return battle.waveIndex < (battle.waves?.length || 1) - 1;
}

/**
 * Bring in the next wave: spawn it, scale it, track it, and slot it into the turn order among
 * the not-yet-acted so it can act this round by speed. The player side carries over untouched —
 * health, statuses and cooldowns all persist, which is the point of a wave.
 * Assets for every wave are preloaded at battle start, so nothing fetches here.
 * @returns {string[]} the new enemy ids (empty if there was no wave to bring in)
 */
export function advanceWave() {
  const battle = currentRpgBattle.value;
  if (!battle || !hasPendingWave()) return [];

  battle.waveIndex++;
  const { ids, spawned } = spawnEnemies(battle.waves[battle.waveIndex]);
  if (ids.length === 0) return [];

  battle.enemyParty.push(...ids);
  battle.spawnedEnemies.push(...spawned);
  for (const id of ids) {
    battle.charState[id] = { side: 'enemy', battleIndex: 0, abilities: {}, defeated: false, bonusUsed: 0 };
  }

  for (const id of ids) initCombatantTracking(id);

  const insertAt = Math.min(Math.max(battle.actorTurn + 1, 0), battle.turnOrder.length);
  battle.turnOrder.splice(insertAt, 0, ...ids);
  resortRemainingTurnOrder();

  pushLog(null, game.getLine('log_next_wave', { wave: battle.waveIndex + 1 }));
  // Emitter: battle_wave_start — a wave other than the first has taken the field.
  game.trigger('battle_wave_start', battle.waveIndex, ids);
  return ids;
}

/**
 * Check if battle should end.
 * @returns {boolean}
 */
export function checkBattleEnd() {
  const battle = currentRpgBattle.value;
  if (!battle || isFinished(battle)) return true;

  // Supports can't die — counting them here would make defeat unreachable.
  const playersAlive = battle.playerParty.some(id => !isSupport(id) && isCharAlive(id));
  const enemiesAlive = battle.enemyParty.some(id => isCharAlive(id));

  // A cleared field with a wave still queued is NOT a victory — bring the next one on.
  // Defeat is checked first: a party wiped by the last enemy's dying blow loses, rather
  // than being handed another wave to fail against.
  if (!enemiesAlive && playersAlive && hasPendingWave()) {
    advanceWave();
    return false;
  }

  if (!enemiesAlive) {
    battle.result = 'victory';
    battle.phase = 'finished';
    // Mark defeated at the moment of victory (not at teardown) so battle_defeated listeners
    // (defeat rewards) run before the result overlay renders.
    if (battle.battleId) game.getService('rpg_battle').addDefeated(battle.battleId);
    game.setMusic('victory');
    game.trigger('battle_finished', 'victory', battle.battleId || null);
    return true;
  }
  if (!playersAlive) {
    battle.result = 'defeat';
    battle.phase = 'finished';
    game.trigger('battle_finished', 'defeat', battle.battleId || null);
    return true;
  }
  return false;
}

