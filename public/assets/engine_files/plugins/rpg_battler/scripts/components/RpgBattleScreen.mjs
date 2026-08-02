/// <reference path="../dtypes.d.ts" />

const { game, vue, components } = window.engine;
const { computed, ref, onMounted, nextTick, defineComponent } = vue;
const { CharacterSlot, BackgroundAsset, CharacterViewerPopup, CustomComponentContainer } = components;

import { currentRpgBattle, getSpeedMult, getBattleDisplayName } from '../rpg-battle-state.mjs';
import { battleSceneGate, isBattleScenePauseActive } from '../rpg-battle-scenes.mjs';
import { endRpgBattle } from '../main.mjs';
import { executeAction, advanceToNextTurn, tickActiveCharacter, canUseAbility, processDeaths, refireChannels, consumeStun, flashAbilityName, consumeBattleConsumable } from '../rpg-battle-flow.mjs';
import { isCharAlive, getStatusStacks, expandSplashTargets, resolveAbility, getAliveEnemies, getAliveAllies } from '../rpg-battle-effects.mjs';
import { decideAction, getValidTargets } from '../rpg-battle-ai.mjs';
import { animateCast, animateEffects, setIdleState, prepSummon, animateSummonIn } from '../rpg-battle-anims.mjs';
/** @param {RpgBattle} b */
function isBattleFinished(b) { return b.phase === 'finished'; }

const BASE_ACTION_DELAY = 600;
const BASE_CHAIN_DELAY = 500;

function getActionDelay() { return BASE_ACTION_DELAY * getSpeedMult(); }
function getChainDelay() { return BASE_CHAIN_DELAY * getSpeedMult(); }

import { RpgAbilityPanel } from './RpgAbilityPanel.mjs';
import { RpgTurnOrder } from './RpgTurnOrder.mjs';
import { RpgFloatingText } from './RpgFloatingText.mjs';
import { RpgBattleLog } from './RpgBattleLog.mjs';
import { RpgCharOverlay } from './RpgCharOverlay.mjs';

/**
 * Build slot objects for an array of character IDs.
 */

// @ts-ignore - Vue overload resolution false positive in .mjs
export const RpgBattleScreen = defineComponent({
  components: { CharacterSlot, BackgroundAsset, RpgAbilityPanel, RpgTurnOrder, RpgFloatingText, RpgBattleLog, RpgCharOverlay, CharacterViewerPopup, CustomComponentContainer },
  setup() {
    const battle = computed(() => currentRpgBattle.value);
    const forceZoomOut = ref(false);
    const abilityPanelRef = ref(null);
    const turnBusy = ref(false);
    const ZOOM_MS = 500;
    function waitZoom() { return new Promise(resolve => setTimeout(resolve, ZOOM_MS)); }
    const viewerCharacters = ref(null);
    const viewerInitialIndex = ref(0);

    const activeChar = computed(() => {
      if (!battle.value?.activeCharId) return null;
      return game.getCharacter(battle.value.activeCharId);
    });

    const isPlayerTurn = computed(() => battle.value?.activeSide === 'player');
    const zoomedIn = computed(() => isPlayerTurn.value && !forceZoomOut.value);
    const showZone = computed(() => game.coreSystem.getDebugSetting('events_zone'));

    const battlePhase = computed(() => battle.value?.battlePhase || 'enemy_turn');
    const selectedAbilityId = computed(() => battle.value?.selectedAbilityId || null);
    const isTargeting = computed(() => battlePhase.value === 'choosing_target');
    const isBattleOver = computed(() => battle.value?.phase === 'finished');

    const selectedAbilityTarget = computed(() => {
      const id = selectedAbilityId.value;
      if (!id) return null;
      const char = activeChar.value;
      if (!char) return null;
      const ab = char.getAbility(id);
      return ab?.meta?.target || 'enemy';
    });

    const targetsEnemies = computed(() => {
      const t = selectedAbilityTarget.value;
      return t === 'enemy' || t === 'all_enemies' || t === 'any';
    });

    const targetsAllies = computed(() => {
      const t = selectedAbilityTarget.value;
      return t === 'ally' || t === 'self_and_ally' || t === 'all_allies' || t === 'any';
    });

    const targetIncludesSelf = computed(() => {
      const t = selectedAbilityTarget.value;
      return t === 'self_and_ally' || t === 'any';
    });

    // Splash preview: highlight neighbors when hovering a target
    const hoveredTargetId = ref(null);

    const maxSplash = computed(() => {
      const id = selectedAbilityId.value;
      if (!id) return 0;
      const char = activeChar.value;
      if (!char) return 0;
      const ab = char.getAbility(id);
      if (!ab?.effects) return 0;
      let max = 0;
      for (const effectId in ab.effects) {
        const s = ab.effects[effectId].splash;
        if (s > max) max = s;
      }
      return max;
    });

    const splashTargetIds = computed(() => {
      const hovered = hoveredTargetId.value;
      const splash = maxSplash.value;
      if (!hovered || !splash || !battle.value?.activeCharId) return [];
      const expanded = expandSplashTargets(battle.value.activeCharId, [hovered], splash);
      return expanded.filter(id => id !== hovered);
    });

    function isSplashTarget(charId) {
      return splashTargetIds.value.includes(charId);
    }

    // Valid targets for the selected ability (respects taunt, health thresholds, etc.)
    const validTargetIds = computed(() => {
      const abId = selectedAbilityId.value;
      const charId = activeChar.value?.id;
      if (!abId || !charId) return [];
      return getValidTargets(charId, abId);
    });

    function isEnemyTargetable(charId) {
      return validTargetIds.value.includes(charId);
    }

    const selectedAbilityName = computed(() => {
      const id = selectedAbilityId.value;
      if (!id) return '';
      const char = activeChar.value;
      if (!char) return '';
      const ab = char.getAbility(id);
      return ab?.meta?.name || id;
    });

    // ── Background asset ──

    const backgroundAsset = computed(() => {
      const assetId = battle.value?.backgroundAssetId;
      if (!assetId) return null;
      const assets = game.getData('assets', true);
      return assets?.get(assetId) || null;
    });

    // ── Character alive filter ──
    // Use defeated arrays (not health) so elements stay in DOM until processDeaths() runs after animations.

    const aliveEnemies = computed(() => {
      const b = battle.value;
      if (!b) return [];
      return b.enemyParty.filter(id => !b.charState[id]?.defeated);
    });

    const alivePlayers = computed(() => {
      const b = battle.value;
      if (!b) return [];
      return b.playerParty.filter(id => !b.charState[id]?.defeated);
    });

    // ── Slot generation ──
    // Overlay rendering is delegated to CharacterSlot via overlaySlot="rpg-battle-char-overlay".
    // CharacterSlot anchors the overlay to the slot (art_dx/dy center the body's pixels on it)
    // above the body-box top — no manual positioning math here.

    // World camera: background + enemies live in one wrapper that scales together via a single
    // GPU transform (see .rpg-world-camera). worldCam = the zoom factor (1 out, WORLD_ZOOM_IN in).
    // Enemy slots are STATIC (base positions/scale) — the wrapper transform does the camera, so no
    // per-slot left/top animation (which thrashes layout and flickers with many canvas slots).
    // The player character is intentionally NOT in the wrapper (its own front-center pop).
    const WORLD_ZOOM_IN = 1.12;
    const worldCam = computed(() => zoomedIn.value ? WORLD_ZOOM_IN : 1);

    const enemySlots = computed(() => {
      const enemies = aliveEnemies.value;
      if (enemies.length === 0) return [];

      const startX = 0, dx = 15, dy = 25, cols = 3;
      // Front/bottom row sits on the floor line; deeper rows stack upward. Positive =
      // lower on screen — keeps the back row's overlay clear of the viewport top edge.
      const floorY = 2;
      const baseScale = 0.35; // up from 0.2
      // Fake perspective: each row farther back is smaller (size only — a slot filter would
      // also dim the HP-bar overlay).
      const DEPTH_SCALE = 0.8;

      return enemies.map((id, i) => {
        const row = Math.floor(i / cols);
        return {
          charId: id,
          slot: {
            char: id,
            x: startX + (i % cols) * dx,
            y: floorY - row * dy,
            z: -row,
            scale: baseScale * Math.pow(DEPTH_SCALE, row),
          },
        };
      });
    });

    // Player slots: single set, position changes based on zoom state
    const outStartX = -35, outDx = 20, outY = 31, outScale = 0.39;
    const inX = -30, inY = 5, inScale = 1;

    const playerSlots = computed(() => {
      const party = alivePlayers.value;
      if (party.length === 0) return [];

      return party.map((id, i) => {
        const isActive = zoomedIn.value && id === battle.value?.activeCharId;
        return {
          charId: id,
          slot: {
            char: id,
            x: isActive ? inX : outStartX + i * outDx,
            y: isActive ? inY : outY,
            scale: isActive ? inScale : outScale,
          },
        };
      });
    });

    // ── Ability resolution helpers ──

    /** Check if an ability is a bonus action. */
    function isBonusAction(abilityId) {
      const char = activeChar.value;
      return char?.getAbility(abilityId)?.meta?.bonus_action === true;
    }

    /** After ability resolves: bonus → stay, main → end turn. */
    function handlePostResolve(b, abilityId) {
      // A bonus action re-opens the panel; if the bonus just stunned the caster (self-stagger, etc.),
      // consume the stun and end the turn — it forfeits this turn's main action, not also the next.
      // A main action is short-circuited (not a bonus) → ends the turn with its stun left to skip the
      // next turn normally.
      if (isBonusAction(abilityId) && !consumeStun(b.activeCharId)) {
        b.charState[b.activeCharId].bonusUsed++;
        b.battlePhase = 'choosing_ability';
      } else {
        onEndTurn(null);
      }
    }

    // ── Ability panel events ──

    async function finishPlayerCast(b, casterId, abilityId, targetId, targetType, delayed) {
      const caster = game.getCharacter(casterId);
      const ok = await performAbility(casterId, abilityId, targetId, targetType);
      const consume = () => { if (ok) consumeBattleConsumable(caster, abilityId); };

      if (isBattleFinished(b)) { consume(); return; }
      if (!isCharAlive(b.activeCharId)) { onEndTurn(null); consume(); return; }

      const finish = () => {
        if (delayed) forceZoomOut.value = false;
        handlePostResolve(b, abilityId);
        consume();
        if (b.battlePhase === 'choosing_ability') abilityPanelRef.value?.show();
      };
      if (delayed) {
        const delay = forceZoomOut.value ? getActionDelay() : 0;
        setTimeout(finish, delay);
      } else {
        finish();
      }
    }

    // Resolve an ability on a target with full caster+effect animation, then run any bounces.
    // Shared by player (auto + targeted) and AI paths so bounce behaves identically everywhere.
    // Returns true if the cast resolved, false if executeAction returned null (veto / guard).
    async function performAbility(casterId, abilityId, targetId, targetType) {
      const ability = game.getCharacter(casterId)?.getAbility(abilityId);
      const landPos = await animateCast(casterId, targetId ?? casterId, targetType, ability,
        { onCast: () => flashAbilityName(casterId, abilityId) });
      const results = executeAction(abilityId, targetId);
      if (results === null) return false;

      const summonIds = results.filter(r => r.type === 'summon').map(r => r.targetId);
      if (summonIds.length) {
        await nextTick();
        for (const id of summonIds) prepSummon(id);
        if (isPlayerTurn.value) { forceZoomOut.value = true; await waitZoom(); }
        for (const id of summonIds) await animateSummonIn(id);
      }

      await animateEffects(results);
      processDeaths();
      await runBounces(casterId, abilityId, targetType, targetId ?? casterId, landPos);
      // Action + its animations are fully done — distinct from battle_action_end (pre-animation).
      game.trigger('battle_action_complete', game.getCharacter(casterId), abilityId, results);
      // Scenes queued by this action's events (hits, defeats, summon barks) play now,
      // after the animations — holds the flow until the player clicks through. Runs
      // even when the action just finished the battle, so a final-blow scene displays.
      await battleSceneGate();
      return true;
    }

    // bounce aspect: re-resolve the whole ability on N random same-side targets, with a chain
    // delay each. Bounces skip cost/cooldown (resolveAbility isBounce) and don't re-fire
    // battle_action_start/end (no double rage/semen bookkeeping). bounce_same (default false)
    // controls whether two consecutive hops may land on the same target.
    async function runBounces(casterId, abilityId, targetType, originTargetId, originPos) {
      const ability = game.getCharacter(casterId)?.getAbility(abilityId);
      if (!ability) return;
      let bounce = 0;
      let bounceSame = false;
      for (const eid in ability.effects) {
        bounce += ability.effects[eid].bounce || 0;
        if (ability.effects[eid].bounce_same) bounceSame = true;
      }
      if (bounce <= 0) return;
      const allySide = ['ally', 'all_allies', 'self', 'self_and_ally'].includes(targetType);
      let prevTarget = originTargetId;
      let fromPos = originPos;
      for (let i = 0; i < bounce; i++) {
        const b = battle.value;
        if (!b || isBattleFinished(b)) break;
        const pool = (allySide ? getAliveAllies(casterId) : getAliveEnemies(casterId))
          .filter(id => bounceSame || id !== prevTarget);
        if (!pool.length) break;
        const rt = pool[Math.floor(Math.random() * pool.length)];
        await new Promise(resolve => setTimeout(resolve, getChainDelay()));
        // Melee lunges (animateCast ignores casterPose); a projectile launches from the previous
        // landing position and suppresses the caster pose on bounces.
        const landPos = await animateCast(casterId, rt, targetType, ability, { originId: prevTarget, originPos: fromPos, casterPose: false });
        if (landPos) fromPos = landPos;
        prevTarget = rt;
        const res = resolveAbility(casterId, abilityId, rt, { isBounce: true });
        await animateEffects(res);
        processDeaths();
      }
    }

    function onSelectAbility(abilityId, hidePanel) {
      const b = battle.value;
      if (!b || b.battlePhase !== 'choosing_ability') return;
      // The scene dialogue overlay doesn't cover the whole screen — block battle input under it.
      if (isBattleScenePauseActive()) return;

      const char = activeChar.value;
      if (!char) return;
      const ab = char.getAbility(abilityId);
      if (!ab) return;

      if (!canUseAbility(b.activeCharId, abilityId)) return;

      const target = ab.meta.target || 'enemy';

      // Auto-execute abilities that don't need target selection
      if (target === 'self' || target === 'all_enemies' || target === 'all_allies') {
        b.battlePhase = 'resolving';
        hidePanel?.();
        const targetId = target === 'self' ? b.activeCharId : undefined;
        finishPlayerCast(b, b.activeCharId, abilityId, targetId, target, false);
        return;
      }

      const needsZoomOut = target === 'ally' || target === 'self_and_ally' || target === 'all_allies' || target === 'any';

      if (needsZoomOut) {
        hidePanel(() => {
          b.selectedAbilityId = abilityId;
          b.battlePhase = 'choosing_target';
          forceZoomOut.value = true;
        });
      } else {
        // Enemy target — stay zoomed in
        hidePanel(() => {
          b.selectedAbilityId = abilityId;
          b.battlePhase = 'choosing_target';
        });
      }
    }

    function onEnemyTargetClick(charId) {
      if (isBattleScenePauseActive()) return;
      if (!isEnemyTargetable(charId)) {
        // Determine reason for invalid target
        const abId = selectedAbilityId.value;
        const char = activeChar.value;
        const ab = char?.getAbility(abId);
        const taunters = aliveEnemies.value.filter(id => getStatusStacks(id, 'taunt') > 0);
        if (taunters.length > 0 && !taunters.includes(charId)) {
          game.showNotification(game.getLine('ui_taunt_blocked'));
        } else if (ab?.meta?.target_min_health) {
          game.showNotification(game.getLine('ui_target_hp_too_high'));
        } else if (ab?.meta?.target_max_health) {
          game.showNotification(game.getLine('ui_target_hp_too_low'));
        }
        return;
      }
      selectTarget(charId);
    }

    function selectTarget(charId) {
      const b = battle.value;
      if (!b || b.battlePhase !== 'choosing_target') return;
      if (isBattleScenePauseActive()) return;

      const abilityId = b.selectedAbilityId;
      if (!abilityId) return;

      b.battlePhase = 'resolving';
      b.selectedAbilityId = null;

      const casterId = b.activeCharId;
      const ability = game.getCharacter(casterId)?.getAbility(abilityId);
      const targetType = ability?.meta?.target || 'enemy';

      finishPlayerCast(b, casterId, abilityId, charId, targetType, true);
    }

    function cancelTarget() {
      const b = battle.value;
      if (!b) return;
      b.selectedAbilityId = null;
      b.battlePhase = 'choosing_ability';
      forceZoomOut.value = false;
      abilityPanelRef.value?.show();
    }

    // ── Turn management ──

    function onEndTurn(hidePanel) {
      const b = battle.value;
      if (!b || isBattleFinished(b)) return;
      // Block only the player's end-turn button under a scene — internal calls
      // (handlePostResolve, death paths) pass null and must keep the flow moving.
      if (hidePanel && isBattleScenePauseActive()) return;
      const go = () => driveTurns();
      if (hidePanel) hidePanel(go); else go();
    }

    // ── Turn pipeline ──

    // Unified driver: advance one character at a time. Player turns zoom in, tick DoT/stun
    // (flash + death awaited), and either slide in the panel (can act → stop for input) or
    // zoom out and skip (dead/stunned). Enemies run the same pipeline minus zoom/panel.
    // Resumed by onEndTurn after the player's main action.
    async function driveTurns() {
      const b = battle.value;
      if (!b || isBattleFinished(b) || turnBusy.value) return;
      turnBusy.value = true;

      while (b.phase === 'active' && !isBattleFinished(b)) {
        const wasZoomed = zoomedIn.value && !!b.activeCharId;
        const charId = advanceToNextTurn();
        if (!charId || isBattleFinished(b)) break;
        // Turn-start scenes (battle_turn_start barks) play before the zoom/panel.
        await battleSceneGate();
        const isPlayer = b.activeSide === 'player';

        if (isPlayer) { forceZoomOut.value = false; await waitZoom(); }
        else if (wasZoomed) { await waitZoom(); }

        const { canAct, dotResults } = tickActiveCharacter(charId);
        if (dotResults.length > 0) await animateEffects(dotResults);
        processDeaths();
        // Scenes queued by DoT ticks/deaths play before the turn proceeds.
        await battleSceneGate();
        if (isBattleFinished(b)) break;

        if (!canAct) {
          if (isPlayer) { forceZoomOut.value = true; await waitZoom(); }
          continue;
        }

        // Channel autocast: re-fire active channels with flash + animation, awaited; the caster still acts after.
        const channelResults = refireChannels(charId);
        if (channelResults.length > 0) await animateEffects(channelResults);
        processDeaths();
        // Scenes queued by channel hits/deaths play before control is handed over.
        await battleSceneGate();
        if (isBattleFinished(b)) break;

        // A channel's self-stagger can cross the stun threshold mid-autocast (and a thorns reflect could
        // kill the caster). Re-check before handing over control — otherwise the turn proceeds with the
        // panel up but every ability greyed by the stun gate. Consume the stun now so it forfeits THIS
        // turn's action (not also the next); death short-circuits before the consume.
        if (!isCharAlive(charId) || consumeStun(charId)) {
          if (isPlayer) { forceZoomOut.value = true; await waitZoom(); }
          continue;
        }

        if (isPlayer) {
          b.battlePhase = 'choosing_ability';
          abilityPanelRef.value?.show();
          turnBusy.value = false;
          return;
        }

        b.battlePhase = 'enemy_turn';
        await runEnemyAction(charId);
        if (isBattleFinished(b)) break;
        await new Promise(resolve => setTimeout(resolve, getActionDelay()));
      }

      turnBusy.value = false;
    }

    async function runEnemyAction(charId) {
      const b = battle.value;
      const action = decideAction(charId);
      if (!action) return;
      const caster = game.getCharacter(charId);
      const ability = caster?.getAbility(action.abilityId);
      const targetType = ability?.meta?.target || 'enemy';
      const ok = await performAbility(charId, action.abilityId, action.targetId, targetType);
      if (ok) consumeBattleConsumable(caster, action.abilityId);
      if (ability?.meta?.bonus_action && !isBattleFinished(b) && isCharAlive(charId)) {
        b.charState[charId].bonusUsed++;
        await new Promise(resolve => setTimeout(resolve, getChainDelay()));
        await runEnemyAction(charId);
      }
    }

    onMounted(() => { driveTurns(); });

    // ── Actions ──

    function winBattle() {
      endRpgBattle('victory');
    }

    // Result-overlay Continue: ends with the battle's actual result so defeat
    // reaches battle_end/battle_closed listeners (winBattle is the dev force-win only).
    function closeBattle() {
      endRpgBattle(battle.value?.result || 'victory');
    }

    function toggleZoom() {
      if (forceZoomOut.value) {
        forceZoomOut.value = false;
        if (battlePhase.value === 'choosing_ability') abilityPanelRef.value?.show();
      } else {
        const panel = abilityPanelRef.value;
        if (panel) {
          panel.hide(() => { forceZoomOut.value = true; });
        } else {
          forceZoomOut.value = true;
        }
      }
    }

    const battleStates = computed(() => {
      const attrs = game.getData('character_attributes', true);
      const attr = attrs?.get('battle_state');
      return attr?.values || [];
    });

    function cycleBattleState() {
      const char = activeChar.value;
      const states = battleStates.value;
      if (!char || states.length === 0) return;
      const current = char.attributes['battle_state'] || states[0];
      const idx = states.indexOf(current);
      const next = states[(idx + 1) % states.length];
      char.setAttribute('battle_state', next);
    }

    const activeBattleState = computed(() => {
      const states = battleStates.value;
      return activeChar.value?.attributes['battle_state'] || states[0] || '';
    });

    // ── Character Viewer ──

    function openViewer(characterId, side) {
      if (isTargeting.value) return;
      const b = battle.value;
      if (!b) return;
      const pool = side === 'player' ? b.playerParty : b.enemyParty;
      const characters = pool.map(id => game.getCharacter(id)).filter(c => c && isCharAlive(c.id));
      if (characters.length === 0) return;
      const index = characters.findIndex(c => c.id === characterId);
      viewerCharacters.value = characters;
      viewerInitialIndex.value = Math.max(index, 0);
    }

    function closeViewer() {
      viewerCharacters.value = null;
    }

    function onSlotClick(charId, side) {
      if (isTargeting.value) {
        // The template routes correct-side clicks to onEnemyTargetClick / selectTarget.
        // Anything reaching onSlotClick while targeting = wrong-side click — surface it
        // instead of silently swallowing. Targeting state is left intact so the player
        // can click a valid target next.
        game.showNotification(game.getLine('ui_incorrect_target'));
        return;
      }
      openViewer(charId, side);
    }

    return {
      battle, activeChar, backgroundAsset, enemySlots, playerSlots, getBattleDisplayName, worldCam,
      zoomedIn, isPlayerTurn, forceZoomOut, showZone,
      battlePhase, selectedAbilityName, activeBattleState, isBattleOver,
      isTargeting, targetsEnemies, targetsAllies, targetIncludesSelf,
      hoveredTargetId, isSplashTarget, maxSplash,
      abilityPanelRef, viewerCharacters, viewerInitialIndex,
      isEnemyTargetable, onEnemyTargetClick,
      onSelectAbility, selectTarget, cancelTarget, onSlotClick, closeViewer,
      winBattle, closeBattle, onEndTurn, toggleZoom, cycleBattleState, game,
    };
  },
  template: /*html*/`
    <div v-if="battle" class="rpg-battle-screen">
      <!-- Full-screen background, scaled by worldCam so it zooms with the enemies. -->
      <div class="rpg-bg-camera" :style="{ transform: 'scale(' + worldCam + ') translateZ(0)' }">
        <BackgroundAsset v-if="backgroundAsset" :asset="backgroundAsset" />
      </div>

      <div class="rpg-battle-body">
        <div class="rpg-battle-arena">
          <!-- Battle Log: top-left corner -->
          <RpgBattleLog @select="(charId, side) => onSlotClick(charId, side)" />

          <div class="rpg-viewport" :class="{ 'events-zone': showZone }">
            <!-- Enemy camera: enemy slots scale together via ONE GPU transform on this
                 wrapper (same worldCam as the bg). No per-slot animation → no flicker.
                 Players + UI live OUTSIDE it. -->
            <div class="rpg-world-camera" :style="{ transform: 'scale(' + worldCam + ') translateZ(0)' }">
            <!-- Enemies. Overlay (name + HP + tokens) is rendered by CharacterSlot
                 via overlaySlot="rpg-battle-char-overlay" — anchored to the slot
                 (art_dx/dy center the body's pixels on it); battle_overlay_x/y_offset
                 fine-adjust from there. -->
            <div v-for="es in enemySlots" :key="'e_' + es.charId" :data-rpg-char-id="es.charId">
              <CharacterSlot
                :character="game.getCharacter(es.charId)" :slot="es.slot"
                :interactive="true" :instantLayers="true"
                overlaySlot="rpg-battle-char-overlay"
                :overlayOffsetX="game.getCharacter(es.charId)?.getTrait('battle_overlay_x_offset') || 0"
                :overlayOffsetY="game.getCharacter(es.charId)?.getTrait('battle_overlay_y_offset') || 0"
                :class="{
                  'rpg-targetable-hostile': isTargeting && targetsEnemies && isEnemyTargetable(es.charId),
                  'rpg-splash-highlight': isTargeting && isSplashTarget(es.charId),
                }"
                @mouseenter="isTargeting && targetsEnemies && maxSplash ? hoveredTargetId = es.charId : null"
                @mouseleave="hoveredTargetId = null"
                @click="isTargeting && targetsEnemies ? onEnemyTargetClick(es.charId) : onSlotClick(es.charId, 'enemy')" />
            </div>
            </div>
            <!-- /.rpg-world-camera -->

            <!-- Players. view="back" → the back spine entry's art_dx/dy center its
                 pixels on the slot; the overlay stays slot-anchored. -->
            <div v-for="ps in playerSlots" :key="'p_' + ps.charId" :data-rpg-char-id="ps.charId"
              v-show="!zoomedIn || ps.charId === battle.activeCharId"
              :style="{ '--overlay-zoom': ps.charId === battle.activeCharId ? worldCam : 1 }">
              <CharacterSlot
                :character="game.getCharacter(ps.charId)" :slot="ps.slot" view="back"
                :interactive="true" :instantLayers="true"
                overlaySlot="rpg-battle-char-overlay"
                :overlayOffsetX="game.getCharacter(ps.charId)?.getTrait('battle_overlay_x_offset') || 0"
                :overlayOffsetY="game.getCharacter(ps.charId)?.getTrait('battle_overlay_y_offset') || 0"
                :class="{
                  'rpg-targetable-friendly': isTargeting && targetsAllies && (targetIncludesSelf || ps.charId !== battle.activeCharId),
                  'rpg-splash-highlight': isTargeting && isSplashTarget(ps.charId),
                }"
                @mouseenter="isTargeting && targetsAllies && maxSplash ? hoveredTargetId = ps.charId : null"
                @mouseleave="hoveredTargetId = null"
                @click="isTargeting && targetsAllies && (targetIncludesSelf || ps.charId !== battle.activeCharId) ? selectTarget(ps.charId) : onSlotClick(ps.charId, 'player')" />
            </div>

            <!-- Ability panel -->
            <RpgAbilityPanel ref="abilityPanelRef"
              :battle="battle" :activeChar="activeChar" :isPlayerTurn="isPlayerTurn"
              @select-ability="onSelectAbility" />

            <!-- Target selection overlay -->
            <div v-if="battlePhase === 'choosing_target'" class="rpg-target-overlay">
              <div class="rpg-target-message">
                <div>{{ game.getLine('ui_choose_target') }}</div>
                <div class="rpg-target-message-for">{{ selectedAbilityName }}</div>
              </div>
              <button class="rpg-btn rpg-btn-cancel" @click="cancelTarget">{{ game.getLine('ui_cancel') }}</button>
            </div>

            <!-- Floating combat text -->
            <RpgFloatingText />
          </div>
        </div>

        <div class="rpg-sidebar">
          <CustomComponentContainer :slot="'rpg-sidebar-top'" :context="{ character: activeChar }" />
          <div v-if="game.isDevMode()" class="rpg-battle-info">
            <span>{{ game.getLine('ui_turn') }} {{ battle.turn }}</span>
            <div v-if="activeChar" class="rpg-active-name">{{ getBattleDisplayName(activeChar.id) }}</div>
            <div class="rpg-zoom-label">{{ zoomedIn ? 'Zoomed In' : 'Zoomed Out' }}</div>
          </div>

          <div v-if="game.isDevMode()" class="rpg-battle-controls">
            <button class="rpg-btn rpg-btn-win" @click="winBattle">{{ game.getLine('ui_win_battle') }}</button>
            <button v-if="isPlayerTurn" class="rpg-btn rpg-btn-zoom" @click="toggleZoom">
              {{ forceZoomOut ? 'Zoom In' : 'Zoom Out' }}
            </button>
            <button v-if="isPlayerTurn" class="rpg-btn" @click="cycleBattleState">
              State: {{ activeBattleState }}
            </button>
          </div>

          <RpgTurnOrder :battle="battle" @select="(charId, side) => onSlotClick(charId, side)" />
          <CustomComponentContainer :slot="'rpg-sidebar-bottom'" :context="{ character: activeChar }" />
        </div>
      </div>

      <!-- Character Viewer Popup -->
      <CharacterViewerPopup v-if="viewerCharacters"
        :characters="viewerCharacters" :initialIndex="viewerInitialIndex"
        @close="closeViewer" />

      <!-- Battle result overlay. The rpg-battle-result slot lets other plugins/scripts render
           result content into it (e.g. a rewards panel on victory). -->
      <div v-if="isBattleOver" class="rpg-battle-result-overlay">
        <div class="rpg-battle-result" :class="battle.result">
          <div class="rpg-battle-result-text">{{ battle.result === 'victory' ? game.getLine('ui_victory') : game.getLine('ui_defeat') }}</div>
          <CustomComponentContainer :slot="'rpg-battle-result'" :context="{ result: battle.result }" />
          <button class="rpg-btn" @click="closeBattle">Continue</button>
        </div>
      </div>
    </div>
  `
});
