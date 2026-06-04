/// <reference path="../dtypes.d.ts" />

const { game, vue, gsap, components } = window.engine;
const { computed, watch, nextTick, ref, reactive, defineComponent } = vue;
const { CharacterFace } = components;

import { currentRpgBattle, getBattleDisplayName } from '../rpg-battle-state.mjs';
import { getStatusDefinitions, getSide } from '../rpg-battle-effects.mjs';

// @ts-ignore
export const RpgBattleLog = defineComponent({
  components: { CharacterFace },
  emits: ['select'],
  setup(_, { emit }) {
    const battle = computed(() => currentRpgBattle.value);
    const logRef = ref(null);

    // Stable incremental data — never rebuilt from scratch
    const turns = reactive([]);
    let currentTurn = null;
    let processedCount = 0;
    let lineIdCounter = 0;
    const animatedLineIds = new Set();

    function sideColor(side) {
      return side === 'player' ? 'rgba(66, 185, 131, 0.6)' : 'rgba(239, 68, 68, 0.6)';
    }

    // Process new log entries incrementally
    watch(() => battle.value?.log?.length, (newLen) => {
      const raw = battle.value?.log;
      if (!raw) return;

      // Log was cleared (new turn) — reset and reprocess all
      if (raw.length < processedCount) {
        processedCount = 0;
        turns.length = 0;
        currentTurn = null;
        animatedLineIds.clear();
      }

      for (let i = processedCount; i < raw.length; i++) {
        processEntry(raw[i]);
      }
      processedCount = raw.length;

      // Animate new elements and scroll to top
      nextTick(() => {
        const el = logRef.value;
        if (!el) return;
        el.scrollTop = 0;
        const allItems = el.querySelectorAll('[data-line-id]');
        const newItems = [];
        for (const item of allItems) {
          const lid = item.getAttribute('data-line-id');
          if (lid && !animatedLineIds.has(lid)) {
            animatedLineIds.add(lid);
            newItems.push(item);
          }
        }
        if (newItems.length) {
          gsap.from(newItems, { opacity: 0, x: -30, duration: 0.4, ease: 'back.out(1.4)', stagger: 0.06 });
        }
      });
    }, { immediate: true });

    // Reset when battle changes
    watch(() => battle.value?.id, () => {
      turns.length = 0;
      currentTurn = null;
      processedCount = 0;
    });

    function processEntry(entry) {
      if (entry.type === 'turn_start') {
        currentTurn = reactive({ turn: entry.turn, text: entry.text, actors: [] });
        turns.unshift(currentTurn);
        return;
      }

      if (!currentTurn) {
        const t = battle.value?.turn || 1;
        currentTurn = reactive({ turn: t, text: game.getLine('log_turn_start', { turn: t }), actors: [] });
        turns.unshift(currentTurn);
      }

      const actorId = entry.actorId || '_system';

      // Find or create actor group
      let actorGroup = currentTurn.actors.find(a => a.actorId === actorId);
      if (!actorGroup) {
        const side = actorId !== '_system' ? getSide(actorId) : 'enemy';
        const char = game.getCharacter(actorId);
        actorGroup = reactive({
          actorId,
          character: char,
          name: getBattleDisplayName(actorId),
          side,
          lines: [],
        });
        // Insert at top of this turn's actors (newest first)
        currentTurn.actors.unshift(actorGroup);
      }

      if (entry.type === 'char_turn_start') return;

      if (entry.abilityId) {
        const char = game.getCharacter(entry.actorId);
        const ability = char?.getAbility(entry.abilityId);
        const icon = ability?.meta?.icon;
        const name = ability?.meta?.name || entry.abilityId;
        const iconHtml = icon ? `<img src="${icon}" class="rpg-log-inline-icon" />` : '';
        actorGroup.lines.push({ lid: lineIdCounter++, html: `${iconHtml}<b>${name}</b>`, isAbility: true, targetChar: null, targetSide: null });
      } else if (entry.effect) {
        const html = effectText(entry.effect);
        const targetChar = entry.effect.targetId ? game.getCharacter(entry.effect.targetId) : null;
        const targetSide = entry.effect.targetId ? getSide(entry.effect.targetId) : null;
        const targetName = entry.effect.targetId ? getBattleDisplayName(entry.effect.targetId) : '';
        if (html) {
          actorGroup.lines.push({ lid: lineIdCounter++, html, isAbility: false, targetChar, targetSide, targetName });
        }
      } else if (entry.text) {
        const targetChar = entry.targetId ? game.getCharacter(entry.targetId) : null;
        const targetSide = entry.targetId ? getSide(entry.targetId) : null;
        const targetName = entry.targetId ? getBattleDisplayName(entry.targetId) : '';
        actorGroup.lines.push({ lid: lineIdCounter++, html: entry.text, isAbility: false, targetChar, targetSide, targetName });
      }
    }

    /**
     * @param {RpgEffectResult} e
     * @returns {string}
     */
    function effectText(e) {
      const defeated = e.defeated ? game.getLine('log_defeated') : '';
      const damageType = e.damageType || 'physical';
      const statusDef = e.statusId ? getStatusDefinitions()?.get(e.statusId) : null;
      const statusIcon = statusDef?.image ? `<img src="${statusDef.image}" class="rpg-log-inline-icon" />` : '';

      const params = {
        amount: e.amount || 0,
        damageType,
        stacks: e.stacks || 0,
        statusName: e.statusName || statusDef?.name || e.statusId || '',
        statusIcon,
        duration: e.duration || 0,
      };

      const lineId = {
        damage: e.isCrit ? 'log_damage_crit' : 'log_damage',
        heal: 'log_heal',
        steal: 'log_steal',
        dodge: 'log_dodge',
        status_apply: e.duration ? 'log_status_apply_duration' : 'log_status_apply',
        status_remove: 'log_status_removed',
        status_dot: 'log_status_dot',
        status_hot: 'log_status_hot',
        status_dot_heal: 'log_status_hot',
        cleanse: 'log_cleanse',
        thorns: 'log_thorns',
      }[e.type];

      if (!lineId) return '';
      return game.getLine(lineId, params) + defeated;
    }

    function getCharTurnText(name) {
      return game.getLine('log_char_turn', { name });
    }

    function onFaceClick(charId, side) {
      emit('select', charId, side);
    }

    const minimized = computed(() => game.getState('rpg_battle_log_minimized'));

    function toggleMinimize() {
      game.setState('rpg_battle_log_minimized', !minimized.value);
    }

    return { turns, logRef, sideColor, getCharTurnText, onFaceClick, minimized, toggleMinimize };
  },
  template: /*html*/`
    <div ref="logRef" class="rpg-battle-log" :class="{ 'rpg-log-minimized': minimized }">
      <button class="rpg-log-minimize-btn" @click="toggleMinimize">
        {{ minimized ? '▼' : '▲' }}
      </button>
      <div v-if="minimized && turns.length" class="rpg-log-turn-sep">{{ turns[0].text }}</div>
      <template v-if="!minimized" v-for="turn in turns" :key="'t' + turn.turn">
        <div class="rpg-log-turn-sep">{{ turn.text }}</div>

        <div v-for="actor in turn.actors" :key="actor.actorId" class="rpg-log-actor">
          <div class="rpg-log-actor-header">
            <CharacterFace v-if="actor.character"
              :character="actor.character" :size="40" :borderRadius="4"
              :borderColor="sideColor(actor.side)"
              :static-face-force="true"
              style="cursor: pointer; pointer-events: auto"
              @click="onFaceClick(actor.actorId, actor.side)" />
            <span class="rpg-log-actor-name" v-html="getCharTurnText(actor.name)"></span>
          </div>

          <div v-if="actor.lines.length" class="rpg-log-lines">
            <div v-for="line in actor.lines" :key="line.lid"
              :data-line-id="line.lid"
              class="rpg-log-line" :class="{ 'rpg-log-line-ability': line.isAbility }">
              <CharacterFace v-if="line.targetChar"
                :character="line.targetChar" :size="22" :borderRadius="3"
                :borderColor="sideColor(line.targetSide || 'enemy')"
                :static-face-force="true"
                style="cursor: pointer; pointer-events: auto; flex-shrink: 0"
                @click="onFaceClick(line.targetChar.id, line.targetSide || 'enemy')" />
              <span v-html="line.html"></span>
            </div>
          </div>
        </div>
      </template>
    </div>
  `
});
