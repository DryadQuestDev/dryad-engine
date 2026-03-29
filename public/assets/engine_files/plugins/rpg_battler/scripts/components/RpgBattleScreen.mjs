/// <reference path="../dtypes.d.ts" />

const { game, vue, components } = window.engine;
const { computed, ref, watch, defineComponent } = vue;
const { CharacterSlot, BackgroundAsset, CharacterViewerPopup, CustomComponentContainer } = components;

import { currentRpgBattle, getSpeedMult } from '../rpg-battle-state.mjs';
import { endRpgBattle } from '../main.mjs';
import { executeAction, advanceToNextTurn, canUseAbility, processDeaths } from '../rpg-battle-flow.mjs';
import { isCharAlive, getTokenStacks } from '../rpg-battle-effects.mjs';
import { decideAction } from '../rpg-battle-ai.mjs';
import { animateCaster, animateEffects, setIdleState } from '../rpg-battle-anims.mjs';
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
    const enemyTurnRunning = ref(false);
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

    // Taunt: if any alive enemy has taunt, only those are targetable
    const tauntedEnemyIds = computed(() => {
      if (!battle.value) return [];
      return aliveEnemies.value.filter(id => getTokenStacks(id, 'taunt') > 0);
    });

    function isEnemyTargetable(charId) {
      if (tauntedEnemyIds.value.length === 0) return true;
      return tauntedEnemyIds.value.includes(charId);
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
      return b.enemyParty.filter(id => !b.defeatedEnemy.includes(id));
    });

    const alivePlayers = computed(() => {
      const b = battle.value;
      if (!b) return [];
      return b.playerParty.filter(id => !b.defeatedPlayer.includes(id));
    });

    // ── Slot generation ──
    // CharacterSlot is 100% wide, art centered → visual center is at slot.x + 50%.
    // Overlay offset adjusts from that center (negative = left).
    const SLOT_CENTER = 50;
    const OVERLAY_X_OFFSET = -1;
    const OVERLAY_Y_OFFSET = -3;
    const overlayX = SLOT_CENTER + OVERLAY_X_OFFSET;

    const enemySlots = computed(() => {
      const enemies = aliveEnemies.value;
      if (enemies.length === 0) return [];

      const startX = 20, startY = -36, dx = 11, dy = 22, cols = 3;
      const scale = 0.20;

      return enemies.map((id, i) => ({
        charId: id,
        slot: {
          char: id,
          x: startX + (i % cols) * dx,
          y: startY + Math.floor(i / cols) * dy,
          scale,
        },
      }));
    });

    // Player slots: single set, position changes based on zoom state
    const outStartX = -35, outDx = 20, outY = 31, outScale = 0.39;
    const inX = -15, inY = 5, inScale = 1;

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

    // ── Ability panel events ──

    function onSelectAbility(abilityId, hidePanel) {
      const b = battle.value;
      if (!b || b.battlePhase !== 'choosing_ability') return;

      const char = activeChar.value;
      if (!char) return;
      const ab = char.getAbility(abilityId);
      if (!ab) return;

      if (!canUseAbility(b.activeCharId, abilityId)) return;

      const target = ab.meta.target || 'enemy';

      // Auto-execute abilities that don't need target selection
      if (target === 'self' || target === 'all_enemies' || target === 'all_allies') {
        b.battlePhase = 'resolving';
        const targetId = target === 'self' ? b.activeCharId : undefined;
        (async () => {
          await animateCaster(b.activeCharId, targetId || b.activeCharId, target);
          const results = executeAction(abilityId, targetId);
          await animateEffects(results);
          processDeaths();
          if (!isBattleFinished(b)) {
            if (!isCharAlive(b.activeCharId)) { onEndTurn(null); return; }
            b.battlePhase = 'choosing_ability';
          }
        })();
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
      if (!isEnemyTargetable(charId)) {
        game.showNotification(game.getLine('ui_taunt_blocked'));
        return;
      }
      selectTarget(charId);
    }

    function selectTarget(charId) {
      const b = battle.value;
      if (!b || b.battlePhase !== 'choosing_target') return;

      const abilityId = b.selectedAbilityId;
      if (!abilityId) return;

      b.battlePhase = 'resolving';
      b.selectedAbilityId = null;

      const casterId = b.activeCharId;
      const ability = game.getCharacter(casterId)?.getAbility(abilityId);
      const targetType = ability?.meta?.target || 'enemy';

      (async () => {
        await animateCaster(casterId, charId, targetType);
        const results = executeAction(abilityId, charId);
        await animateEffects(results);
        processDeaths();

        if (!isBattleFinished(b)) {
          if (!isCharAlive(b.activeCharId)) { onEndTurn(null); return; }
          const delay = forceZoomOut.value ? getActionDelay() : 0;
          setTimeout(() => {
            b.battlePhase = 'choosing_ability';
            forceZoomOut.value = false;
            abilityPanelRef.value?.show();
          }, delay);
        }
      })();
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

      const doAdvance = () => {
        const nextId = advanceToNextTurn();
        if (!nextId || isBattleFinished(b)) return;

        if (b.activeSide === 'player') {
          b.battlePhase = 'choosing_ability';
          forceZoomOut.value = false;
          abilityPanelRef.value?.show();
        } else {
          runEnemyTurns();
        }
      };

      if (hidePanel) {
        hidePanel(doAdvance);
      } else {
        doAdvance();
      }
    }

    function nextTurnSidebar() {
      const b = battle.value;
      if (!b || isBattleFinished(b)) return;

      const panel = abilityPanelRef.value;
      if (panel && isPlayerTurn.value) {
        panel.hide(() => {
          const nextId = advanceToNextTurn();
          if (!nextId || isBattleFinished(b)) return;
          if (b.activeSide === 'player') {
            forceZoomOut.value = false;
            abilityPanelRef.value?.show();
          } else {
            runEnemyTurns();
          }
        });
      } else {
        const nextId = advanceToNextTurn();
        if (!nextId || isBattleFinished(b)) return;
        if (b.activeSide === 'player') {
          forceZoomOut.value = false;
          abilityPanelRef.value?.show();
        } else {
          runEnemyTurns();
        }
      }
    }

    // ── Enemy AI ──

    function runEnemyTurns() {
      const b = battle.value;
      if (!b || isBattleFinished(b) || enemyTurnRunning.value) return;

      enemyTurnRunning.value = true;

      async function step() {
        if (!b || isBattleFinished(b) || b.activeSide !== 'enemy') {
          enemyTurnRunning.value = false;
          if (b && !isBattleFinished(b) && b.activeSide === 'player') {
            b.battlePhase = 'choosing_ability';
            forceZoomOut.value = false;
            abilityPanelRef.value?.show();
          }
          return;
        }

        b.battlePhase = 'enemy_turn';
        const charId = b.activeCharId;
        const action = decideAction(charId);

        if (action) {
          const ability = game.getCharacter(charId)?.getAbility(action.abilityId);
          const targetType = ability?.meta?.target || 'enemy';

          await animateCaster(charId, action.targetId, targetType);
          const results = executeAction(action.abilityId, action.targetId);
          await animateEffects(results);
          processDeaths();
        }

        if (isBattleFinished(b)) {
          enemyTurnRunning.value = false;
          return;
        }

        // Wait for floating text before advancing
        await new Promise(resolve => setTimeout(resolve, getActionDelay()));

        const nextId = advanceToNextTurn();
        if (!nextId || isBattleFinished(b)) {
          enemyTurnRunning.value = false;
          return;
        }

        if (b.activeSide === 'enemy') {
          setTimeout(step, getChainDelay());
        } else {
          enemyTurnRunning.value = false;
          b.battlePhase = 'choosing_ability';
          forceZoomOut.value = false;
          abilityPanelRef.value?.show();
        }
      }

      setTimeout(step, getActionDelay());
    }

    // Auto-run enemy turns when battle starts on enemy turn
    watch(isPlayerTurn, (val) => {
      if (!val && battle.value?.phase === 'active' && !enemyTurnRunning.value) {
        runEnemyTurns();
      }
    }, { immediate: true });

    // ── Actions ──

    function winBattle() {
      endRpgBattle('victory');
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
      if (isTargeting.value) return;
      openViewer(charId, side);
    }

    return {
      battle, activeChar, backgroundAsset, enemySlots, playerSlots, overlayX, OVERLAY_Y_OFFSET,
      zoomedIn, isPlayerTurn, forceZoomOut, showZone,
      battlePhase, selectedAbilityName, activeBattleState, isBattleOver,
      isTargeting, targetsEnemies, targetsAllies, targetIncludesSelf,
      abilityPanelRef, viewerCharacters, viewerInitialIndex,
      isEnemyTargetable, onEnemyTargetClick,
      onSelectAbility, selectTarget, cancelTarget, onSlotClick, closeViewer,
      winBattle, onEndTurn, nextTurnSidebar, toggleZoom, cycleBattleState, game,
    };
  },
  template: /*html*/`
    <div v-if="battle" class="rpg-battle-screen">
      <BackgroundAsset v-if="backgroundAsset" :asset="backgroundAsset" />

      <div class="rpg-battle-body">
        <div class="rpg-battle-arena">
          <!-- Battle Log: top-left corner -->
          <RpgBattleLog @select="(charId, side) => onSlotClick(charId, side)" />

          <div class="rpg-viewport" :class="{ 'events-zone': showZone }">
            <!-- Enemies -->
            <div v-for="es in enemySlots" :key="'e_' + es.charId" :data-rpg-char-id="es.charId">
              <CharacterSlot
                :character="game.getCharacter(es.charId)" :slot="es.slot"
                :interactive="true" :instantLayers="true"
                :class="{ 'rpg-targetable-hostile': isTargeting && targetsEnemies && isEnemyTargetable(es.charId) }"
                @click="isTargeting && targetsEnemies ? onEnemyTargetClick(es.charId) : onSlotClick(es.charId, 'enemy')" />
            </div>

            <!-- Players -->
            <div v-for="ps in playerSlots" :key="'p_' + ps.charId" :data-rpg-char-id="ps.charId"
              v-show="!zoomedIn || ps.charId === battle.activeCharId">
              <CharacterSlot
                :character="game.getCharacter(ps.charId)" :slot="ps.slot" view="back"
                :interactive="true" :instantLayers="true"
                :class="{ 'rpg-targetable-friendly': isTargeting && targetsAllies && (targetIncludesSelf || ps.charId !== battle.activeCharId) }"
                @click="isTargeting && targetsAllies && (targetIncludesSelf || ps.charId !== battle.activeCharId) ? selectTarget(ps.charId) : onSlotClick(ps.charId, 'player')" />
            </div>

            <!-- Character overlays — positioned at top of each character -->
            <div v-for="es in enemySlots" :key="'eo_' + es.charId"
              class="rpg-overlay-anchor" :style="{
                left: (es.slot.x + overlayX + (game.getCharacter(es.charId)?.getTrait('battle_overlay_x_offset') || 0) * es.slot.scale) + '%',
                top: (es.slot.y + 50 - es.slot.scale * 50 + OVERLAY_Y_OFFSET + (game.getCharacter(es.charId)?.getTrait('battle_overlay_y_offset') || 0) * es.slot.scale) + '%',
              }">
              <RpgCharOverlay :character="game.getCharacter(es.charId)" :slotScale="es.slot.scale" />
            </div>
            <div v-for="ps in playerSlots" :key="'po_' + ps.charId"
              class="rpg-overlay-anchor" :style="{
                left: (ps.slot.x + overlayX + (game.getCharacter(ps.charId)?.getTrait('battle_overlay_x_offset') || 0) * ps.slot.scale) + '%',
                top: (ps.slot.y + 50 - ps.slot.scale * 50 + OVERLAY_Y_OFFSET + (game.getCharacter(ps.charId)?.getTrait('battle_overlay_y_offset') || 0) * ps.slot.scale) + '%',
              }"
              v-show="!zoomedIn || ps.charId === battle.activeCharId">
              <RpgCharOverlay :character="game.getCharacter(ps.charId)" :slotScale="ps.slot.scale" />
            </div>

            <!-- Ability panel -->
            <RpgAbilityPanel ref="abilityPanelRef"
              :battle="battle" :activeChar="activeChar" :isPlayerTurn="isPlayerTurn"
              @select-ability="onSelectAbility" @end-turn="onEndTurn" />

            <!-- Target selection overlay -->
            <div v-if="battlePhase === 'choosing_target'" class="rpg-target-overlay">
              <div class="rpg-target-message">
                {{ game.getLine('ui_choose_target') }} <strong>{{ selectedAbilityName }}</strong>
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
            <div v-if="activeChar" class="rpg-active-name">{{ activeChar.getTrait('name') || activeChar.id }}</div>
            <div class="rpg-zoom-label">{{ zoomedIn ? 'Zoomed In' : 'Zoomed Out' }}</div>
          </div>

          <div v-if="game.isDevMode()" class="rpg-battle-controls">
            <button class="rpg-btn" @click="nextTurnSidebar">Next Turn</button>
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

      <!-- Battle result overlay -->
      <div v-if="isBattleOver" class="rpg-battle-result-overlay">
        <div class="rpg-battle-result" :class="battle.result">
          <div class="rpg-battle-result-text">{{ battle.result === 'victory' ? game.getLine('ui_victory') : game.getLine('ui_defeat') }}</div>
          <button class="rpg-btn" @click="winBattle">Continue</button>
        </div>
      </div>
    </div>
  `
});
