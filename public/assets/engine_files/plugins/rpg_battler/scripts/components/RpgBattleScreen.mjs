/// <reference path="../dtypes.d.ts" />

const { game, vue, components } = window.engine;
const { computed, ref, watch, onMounted, nextTick, defineComponent } = vue;
const { CharacterSlot, BackgroundAsset, CharacterViewerPopup, CustomComponentContainer } = components;

import { currentRpgBattle, getSpeedMult, getBattleDisplayName } from '../rpg-battle-state.mjs';
import { battleSceneGate, isBattleScenePauseActive } from '../rpg-battle-scenes.mjs';
import { endRpgBattle } from '../main.mjs';
import { executeAction, advanceToNextTurn, tickActiveCharacter, canUseAbility, processDeaths, refireChannels, consumeStun, flashAbilityName, consumeBattleConsumable } from '../rpg-battle-flow.mjs';
import { isCharAlive, getStatusStacks, expandSplashTargets, resolveAbility, getAliveEnemies, getAliveAllies, consumeFreeAction, isSupport, isAIControlled } from '../rpg-battle-effects.mjs';
import { decideAction, getValidTargets } from '../rpg-battle-ai.mjs';
import { animateCast, animateEffects, setIdleState, prepSummon, animateSummonIn } from '../rpg-battle-anims.mjs';
/** @param {RpgBattle} b */
function isBattleFinished(b) { return b.phase === 'finished'; }

const BASE_ACTION_DELAY = 600;
const BASE_CHAIN_DELAY = 500;
const BASE_ROUND_START_DELAY = 1500;

function getActionDelay() { return BASE_ACTION_DELAY * getSpeedMult(); }
function getChainDelay() { return BASE_CHAIN_DELAY * getSpeedMult(); }

/**
 * How long a round's opening banner holds before its first combatant acts. The round has already
 * rolled initiative and sorted, so this is the beat where the lineup is readable — and where an
 * enemy who won initiative is watchable instead of landing a hit the player never saw coming.
 * Scaled by the battle-speed setting like every other pause; 0 disables the beat.
 */
function getRoundStartDelay() {
  const ms = game.getData('plugins_data/rpg_battler/battle_config')?.round_start_delay;
  return (typeof ms === 'number' ? ms : BASE_ROUND_START_DELAY) * getSpeedMult();
}

import { RpgAbilityPanel } from './RpgAbilityPanel.mjs';
import { RpgTurnOrder } from './RpgTurnOrder.mjs';
import { RpgFloatingText } from './RpgFloatingText.mjs';
import { RpgBattleLog } from './RpgBattleLog.mjs';
import { RpgCharOverlay } from './RpgCharOverlay.mjs';
import { RpgSupportFace } from './RpgSupportFace.mjs';
import { RpgWaveTracker } from './RpgWaveTracker.mjs';

/**
 * Build slot objects for an array of character IDs.
 */

// @ts-ignore - Vue overload resolution false positive in .mjs
export const RpgBattleScreen = defineComponent({
  components: { CharacterSlot, BackgroundAsset, RpgAbilityPanel, RpgTurnOrder, RpgFloatingText, RpgBattleLog, RpgCharOverlay, RpgSupportFace, RpgWaveTracker, CharacterViewerPopup, CustomComponentContainer },
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
    // There is nobody to zoom TO until the first turn begins — activeCharId is null for the whole
    // battle-start window. The party row is v-shown only for the zoomed-to character, so counting
    // that as zoomed-in hides the entire player side (and pushes the camera in on the enemies)
    // while the banner holds, which is the opposite of a beat meant for reading the field.
    const zoomedIn = computed(() => isPlayerTurn.value && !!battle.value?.activeCharId && !forceZoomOut.value);
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

    // Splash preview (yellow neighbours). hoveredTargetId is pure mouse-over state, set UNCONDITIONALLY:
    // battlePhase only flips to 'choosing_target' ~500ms after selecting an ability (the ZOOM_MS zoom), and a
    // fast mouseenter lands before the flip — gate the hover on isTargeting and it gets swallowed, and
    // mouseenter never re-fires for a mouse already inside the slot (the "no highlight until re-hover" bug).
    // The watch recomputes the preview on hover change AND on the phase flip AND on ability change, so a
    // remembered hover lights up the moment targeting actually begins. getAbility() (the reliable fresh merge —
    // the getAbilities() ref is stale) runs only on those transitions, never per render: no churn.
    const hoveredTargetId = ref(null);
    const splashTargetIds = ref([]);

    function computeSplashPreview() {
      const hovered = hoveredTargetId.value;
      const b = battle.value;
      if (!hovered || !b?.activeCharId || !isTargeting.value) return [];
      const hoveredIsEnemy = b.enemyParty.includes(hovered);
      if (hoveredIsEnemy ? !targetsEnemies.value : !targetsAllies.value) return [];
      const ab = activeChar.value?.getAbility(selectedAbilityId.value);
      let count = 0;
      if (ab?.effects) for (const eid in ab.effects) count += ab.effects[eid].splash_count || 0;
      if (count <= 0) return [];
      return expandSplashTargets(b.activeCharId, [hovered], count).filter(id => id !== hovered);
    }
    watch([hoveredTargetId, isTargeting, selectedAbilityId], () => {
      splashTargetIds.value = computeSplashPreview();
    });

    function onTargetHover(charId) {
      hoveredTargetId.value = charId;
    }
    function onTargetLeave() {
      hoveredTargetId.value = null;
    }

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
      // Supports never get a battlefield slot — their acting face is RpgSupportFace.
      return b.playerParty.filter(id => !b.charState[id]?.defeated && !b.charState[id]?.support);
    });

    // The acting support combatant (if any) — suppresses the zoom-in and the camera dev
    // buttons that a normal player turn would show.
    const activeSupportChar = computed(() => {
      const b = battle.value;
      if (!b?.activeCharId || !b.charState[b.activeCharId]?.support) return null;
      return game.getCharacter(b.activeCharId);
    });

    // ── Support portrait slide ──
    // The card is driven by driveTurns rather than by activeCharId, so both legs of the
    // slide can be awaited: the support glides in from off-screen left, acts, then glides
    // back out before the next combatant takes over. The classless state IS the off-screen
    // one, so a single flag runs the transition in both directions.
    // Fixed, like the camera's ZOOM_MS — a presentation beat rather than action pacing, so
    // it reads the same at every battle speed. The CSS duration is bound from this constant
    // so the awaited time and the transition can't drift apart.
    const supportSlideMs = 900;
    const supportFaceChar = ref(null);
    const supportFaceIn = ref(false);

    function waitSupportSlide() {
      // A small tail past the transition so the card has fully settled before the turn moves on.
      return new Promise(resolve => setTimeout(resolve, supportSlideMs + 100));
    }

    async function showSupportFace(charId) {
      supportFaceChar.value = game.getCharacter(charId);
      supportFaceIn.value = false;
      // Mount off-screen first — a transition only runs if the start state got a frame.
      // Double rAF (what Vue's own Transition does): a single one can land in the same
      // style recalc as the insert, and the card would just appear at rest.
      await nextTick();
      requestAnimationFrame(() => requestAnimationFrame(() => { supportFaceIn.value = true; }));
      await waitSupportSlide();
    }

    async function hideSupportFace() {
      if (!supportFaceChar.value) return;
      supportFaceIn.value = false;
      await waitSupportSlide();
      supportFaceChar.value = null;
    }

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
      // `free_action` refunds the turn the same way a bonus_action ability does, but it is granted
      // per-effect and may have ridden a `chance` roll, so it is read from the resolution rather than
      // from the ability's meta. Read once — it clears on read.
      const freeAction = consumeFreeAction();
      const isBonus = isBonusAction(abilityId);
      if ((isBonus || freeAction) && !consumeStun(b.activeCharId)) {
        // `free_action` means the cast costs no action of any kind: on a main action it refunds the
        // turn and leaves the bonus untouched; on a bonus_action it also refunds the bonus slot, so
        // the caster keeps both. Without it, a bonus_action spends its one-per-turn slot as usual.
        if (isBonus && !freeAction) b.charState[b.activeCharId].bonusUsed++;
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
        // Restoring the zoom for a slotless support would hide the whole party row
        // (zoomedIn hides every slot but the active one, and a support has none).
        if (delayed && !isSupport(casterId)) forceZoomOut.value = false;
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

    // ── Waves ──
    // A wave spawns inside checkBattleEnd (via processDeaths) the moment the field clears, so
    // the screen learns about it by watching waveIndex around every processDeaths call rather
    // than by subscribing to the emitter — no listener to leak across battles.
    const WAVE_BANNER_MS = 1100;
    const waveBanner = ref(null);

    // The round banner holds for the whole opening beat, so its fade is driven by that duration
    // rather than a fixed keyframe length like the wave banner's.
    const roundBanner = ref(null);
    const roundBannerMs = ref(0);

    /**
     * Open a round: announce it and hold before anyone acts. advanceToNextTurn has already
     * incremented the turn, re-rolled initiative and re-sorted, so the lineup behind the banner
     * is the one about to play. Battle start is just round 1 — no separate opening case.
     * @param {boolean} wasZoomed whether the previous actor's zoom still needs unwinding
     */
    async function announceRound(wasZoomed) {
      const b = battle.value;
      const ms = getRoundStartDelay();
      if (!b || ms <= 0) return;
      // Camera out for the announcement: a zoomed-in party row shows only the acting member,
      // and the whole point of the beat is reading the field.
      forceZoomOut.value = true;
      if (wasZoomed) await waitZoom();
      roundBannerMs.value = ms;
      roundBanner.value = game.getLine('ui_turn_start', { turn: b.turn });
      await new Promise(resolve => setTimeout(resolve, ms));
      roundBanner.value = null;
    }

    async function processDeathsAndWaves() {
      const b = battle.value;
      const prevWave = b?.waveIndex ?? 0;
      const prevEnemyCount = b?.enemyParty.length ?? 0;
      processDeaths();
      if (!b || b.waveIndex === prevWave) return;

      // The field just emptied and refilled: announce it, then walk the newcomers in with
      // the same entrance summons use. Without the banner a cleared field reads as a win
      // that failed to fire.
      const newIds = b.enemyParty.slice(prevEnemyCount);
      await nextTick();
      for (const id of newIds) prepSummon(id);
      if (isPlayerTurn.value) { forceZoomOut.value = true; await waitZoom(); }
      waveBanner.value = `${game.getLine('ui_wave')} ${b.waveIndex + 1}`;
      await new Promise(resolve => setTimeout(resolve, WAVE_BANNER_MS));
      for (const id of newIds) await animateSummonIn(id);
      waveBanner.value = null;
    }

    // Resolve an ability on a target with full caster+effect animation, then run any flurry
    // strikes and bounces. Shared by player (auto + targeted) and AI paths so both behave
    // identically everywhere.
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
      await processDeathsAndWaves();
      await runFlurry(casterId, abilityId, targetType, targetId ?? casterId);
      await runBounces(casterId, abilityId, targetType, targetId ?? casterId, landPos);
      // Action + its animations are fully done — distinct from battle_action_end (pre-animation).
      game.trigger('battle_action_complete', game.getCharacter(casterId), abilityId, results);
      // Scenes queued by this action's events (hits, defeats, summon barks) play now,
      // after the animations — holds the flow until the player clicks through. Runs
      // even when the action just finished the battle, so a final-blow scene displays.
      await battleSceneGate();
      return true;
    }

    // flurry aspect: TOTAL strike count on the SAME target — the primary cast counts, so only
    // flurry-1 extra strikes run here (1 or less adds nothing), with a chain delay each.
    // Fizzles when the target dies (or the battle ends) — remaining strikes are lost.
    // Strikes share the bounce re-resolution rules (resolveAbility isBounce): no cost/cooldown
    // re-pay, no battle_action_start/end re-fire. On an AoE/self target the whole target set
    // simply re-resolves and the fizzle check falls to the caster.
    async function runFlurry(casterId, abilityId, targetType, targetId) {
      const ability = game.getCharacter(casterId)?.getAbility(abilityId);
      if (!ability || !targetId) return;
      let flurry = 0;
      for (const eid in ability.effects) flurry += ability.effects[eid].flurry || 0;
      const extra = flurry - 1;
      if (extra <= 0) return;
      for (let i = 0; i < extra; i++) {
        const b = battle.value;
        if (!b || isBattleFinished(b)) break;
        if (!isCharAlive(targetId)) break;
        await new Promise(resolve => setTimeout(resolve, getChainDelay()));
        // Melee re-lunges per strike; ranged refires from the caster. Caster pose stays
        // suppressed like on bounces — the wind-up already played on the primary cast.
        await animateCast(casterId, targetId, targetType, ability, { casterPose: false });
        const res = resolveAbility(casterId, abilityId, targetId, { isBounce: true });
        await animateEffects(res);
        await processDeathsAndWaves();
      }
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
        await processDeathsAndWaves();
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
        // A script can tear the battle down mid-await (rpg_battle.end(), a scripted win):
        // `b` still points at the old object, but everything reading the live state —
        // advanceToNextTurn, getSide, isSupport — would find null.
        if (currentRpgBattle.value !== b) break;
        // Retire the previous support's card here rather than at the end of its own turn:
        // this covers every way a turn can end, including the stunned/dead `continue`s and
        // a manually played support handing control back through onEndTurn.
        await hideSupportFace();
        let wasZoomed = zoomedIn.value && !!b.activeCharId;
        const prevTurn = b.turn;
        const charId = advanceToNextTurn();
        if (!charId || isBattleFinished(b)) break;
        // A wrap into a new round happened inside advanceToNextTurn — announce it first; the
        // banner already unwinds the previous actor's zoom for us.
        if (b.turn !== prevTurn) { await announceRound(wasZoomed); wasZoomed = false; }
        // Turn-start scenes (battle_turn_start barks) play after the round banner, before the
        // zoom/panel — the round is announced, then its story beat lands.
        await battleSceneGate();
        const isPlayer = b.activeSide === 'player';
        const supportTurn = isSupport(charId);
        // Only a MANUALLY played party member zooms in. A support has no back-sprite to
        // zoom to (its floating portrait renders instead), and an AI-controlled member
        // never passes through onSelectAbility's zoom-out for ally-targeted casts — either
        // one zoomed in would hide the rest of the party row mid-action.
        const spotlight = isPlayer && !supportTurn && !isAIControlled(charId);

        if (spotlight) { forceZoomOut.value = false; await waitZoom(); }
        else {
          if (isPlayer) forceZoomOut.value = true;
          if (wasZoomed) await waitZoom();
        }

        // Camera settles first, then the support glides in.
        if (supportTurn) await showSupportFace(charId);

        const { canAct, dotResults } = tickActiveCharacter(charId);
        if (dotResults.length > 0) await animateEffects(dotResults);
        await processDeathsAndWaves();
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
        await processDeathsAndWaves();
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

        // battle_ai player chars (and all enemies) fall through to the AI action path.
        if (isPlayer && !isAIControlled(charId)) {
          b.battlePhase = 'choosing_ability';
          abilityPanelRef.value?.show();
          turnBusy.value = false;
          return;
        }

        b.battlePhase = 'enemy_turn';
        await runAIAction(charId);
        if (isBattleFinished(b)) break;
        await new Promise(resolve => setTimeout(resolve, getActionDelay()));
      }

      // Battle over (or torn down) — drop the card outright; the result overlay is coming
      // up and there is no next turn to slide out for.
      supportFaceChar.value = null;
      turnBusy.value = false;
    }

    // Drives every AI-controlled actor: enemies, battle_ai party members, supports.
    async function runAIAction(charId) {
      const b = battle.value;
      const action = decideAction(charId);
      if (!action) return;
      const caster = game.getCharacter(charId);
      const ability = caster?.getAbility(action.abilityId);
      const targetType = ability?.meta?.target || 'enemy';
      const ok = await performAbility(charId, action.abilityId, action.targetId, targetType);
      if (ok) consumeBattleConsumable(caster, action.abilityId);
      const aiFreeAction = consumeFreeAction();
      const aiIsBonus = !!ability?.meta?.bonus_action;
      if ((aiIsBonus || aiFreeAction) && !isBattleFinished(b) && isCharAlive(charId)) {
        if (aiIsBonus && !aiFreeAction) b.charState[charId].bonusUsed++;
        await new Promise(resolve => setTimeout(resolve, getChainDelay()));
        await runAIAction(charId);
      }
    }

    onMounted(() => { driveTurns(); });

    // ── Actions ──

    function winBattle() {
      // Dev force-win goes through the NORMAL victory finish (same as checkBattleEnd):
      // result overlay + reward/progression panel render, Continue then tears down.
      const b = battle.value;
      if (!b || b.phase === 'finished') return;
      b.result = 'victory';
      b.phase = 'finished';
      if (b.battleId) game.getService('rpg_battle').addDefeated(b.battleId);
      game.setMusic('victory');
      game.trigger('battle_finished', 'victory', b.battleId || null);
    }

    // Result-overlay Continue: ends with the battle's actual result so defeat
    // reaches battle_end/battle_closed_before listeners (winBattle is the dev force-win only).
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
      battle, activeChar, activeSupportChar, supportFaceChar, supportFaceIn, supportSlideMs, waveBanner,
      roundBanner, roundBannerMs,
      backgroundAsset, enemySlots, playerSlots, getBattleDisplayName, worldCam,
      zoomedIn, isPlayerTurn, forceZoomOut, showZone,
      battlePhase, selectedAbilityName, activeBattleState, isBattleOver,
      isTargeting, targetsEnemies, targetsAllies, targetIncludesSelf,
      hoveredTargetId, isSplashTarget, onTargetHover, onTargetLeave,
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
                @mouseenter="onTargetHover(es.charId)"
                @mouseleave="onTargetLeave()"
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
                @mouseenter="onTargetHover(ps.charId)"
                @mouseleave="onTargetLeave()"
                @click="isTargeting && targetsAllies && (targetIncludesSelf || ps.charId !== battle.activeCharId) ? selectTarget(ps.charId) : onSlotClick(ps.charId, 'player')" />
            </div>

            <!-- Acting support: floating portrait above the party row instead of a slot;
                 carries the data-rpg-char-id anchor, so projectiles launch from it. -->
            <RpgSupportFace v-if="supportFaceChar" :character="supportFaceChar"
              :class="{ 'is-in': supportFaceIn }"
              :style="{ '--rpg-support-slide': supportSlideMs + 'ms' }" />

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

            <!-- Wave announcement: the field just emptied and refilled, which without a
                 beat here reads as a victory that failed to fire. -->
            <div v-if="waveBanner" class="rpg-wave-banner">{{ waveBanner }}</div>
            <div v-if="roundBanner" class="rpg-round-banner"
              :style="{ '--rpg-round-banner-ms': roundBannerMs + 'ms' }">{{ roundBanner }}</div>

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
            <button v-if="isPlayerTurn && !activeSupportChar" class="rpg-btn rpg-btn-zoom" @click="toggleZoom">
              {{ forceZoomOut ? 'Zoom In' : 'Zoom Out' }}
            </button>
            <button v-if="isPlayerTurn && !activeSupportChar" class="rpg-btn" @click="cycleBattleState">
              State: {{ activeBattleState }}
            </button>
          </div>

          <RpgWaveTracker />
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
