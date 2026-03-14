/// <reference path="../dtypes.d.ts" />

const { game, vue, components, gsap } = window.engine;
const { computed, defineComponent, watch, nextTick, ref } = vue;
const { AbilityCard, CharacterFace } = components;

import { currentBattle, CLOCK_TURN_ACTOR } from '../battle-flow.mjs';
import { getTokenDefinitions } from '../battle-effects.mjs';

const MAX_VISIBLE_TURNS = 10;

export const BattleLog = defineComponent({
  components: { AbilityCard, CharacterFace },
  emits: ['select', 'continue'],
  setup(_, { emit }) {
    const rawLog = computed(() => currentBattle.value?.log ?? []);
    const entriesEl = ref(null);

    const activeActorId = computed(() => {
      const battle = currentBattle.value;
      if (!battle || battle.phase !== 'active') return null;
      return battle.activeActorId;
    });

    // Group entries into turns, each containing actor blocks
    const groupedLog = computed(() => {
      const raw = rawLog.value;
      if (!raw.length) return [];

      const battle = currentBattle.value;
      const isActive = battle && battle.phase === 'active';

      // During active battle, only process recent turns to keep DOM small
      let startIdx = 0;
      if (isActive) {
        let turnCount = 0;
        for (let i = raw.length - 1; i >= 0; i--) {
          if (raw[i].type === 'turn_start') {
            turnCount++;
            if (turnCount >= MAX_VISIBLE_TURNS) { startIdx = i; break; }
          }
        }
      }

      const turns = [];
      let currentTurn = null;
      let blockId = 0;

      for (let i = startIdx; i < raw.length; i++) {
        const entry = raw[i];
        if (entry.type === 'turn_start') {
          currentTurn = { turn: entry.turn, text: entry.text, blocks: [] };
          turns.push(currentTurn);
          continue;
        }

        if (!currentTurn) continue;

        const lastBlock = currentTurn.blocks[currentTurn.blocks.length - 1];
        if (lastBlock && lastBlock.actorId === entry.actorId) {
          lastBlock.entries.push(entry);
        } else {
          currentTurn.blocks.push({ id: blockId++, actorId: entry.actorId, entries: [entry], isActive: false, snapshot: [] });
        }
      }

      // Reverse turns (newest first) and blocks within each turn (newest first)
      turns.reverse();
      for (const turn of turns) {
        turn.blocks.reverse();
        for (const block of turn.blocks) {
          // Extract ability snapshot per block
          const snapshotEntry = block.entries.find(e => e.abilitiesSnapshot);
          if (snapshotEntry) block.snapshot = snapshotEntry.abilitiesSnapshot;

          // Sub-group entries into actions (ability card + its effect lines)
          const actions = [];
          for (const entry of block.entries) {
            if (entry.abilityId) {
              actions.push({ abilityId: entry.abilityId, actorId: entry.actorId, effects: [] });
            } else if (entry.effect || entry.text) {
              const item = entry.effect || entry.text;
              if (actions.length > 0) {
                actions[actions.length - 1].effects.push(item);
              } else {
                actions.push({ abilityId: null, actorId: entry.actorId, effects: [item] });
              }
            }
          }
          block.actions = actions;
        }
      }

      // Mark only the latest block for the active actor
      const activeId = activeActorId.value;
      if (activeId && turns.length > 0) {
        for (const block of turns[0].blocks) {
          if (block.actorId === activeId) {
            block.isActive = true;
            break;
          }
        }
      }

      return turns;
    });

    function getCharacter(actorId) {
      return game.getCharacter(actorId);
    }

    function getActorSide(actorId) {
      const battle = currentBattle.value;
      if (!battle) return 'enemy';
      for (const key in battle.playerGrid) {
        if (battle.playerGrid[key] === actorId) return 'player';
      }
      if (battle.defeatedPlayer.includes(actorId)) return 'player';
      if (battle.retreated.includes(actorId)) return 'player';
      return 'enemy';
    }

    function isDefeated(actorId) {
      const battle = currentBattle.value;
      if (!battle) return false;
      return battle.defeatedPlayer.includes(actorId) || battle.defeatedEnemy.includes(actorId);
    }

    function isRetreated(actorId) {
      const battle = currentBattle.value;
      if (!battle) return false;
      return battle.retreated.includes(actorId);
    }

    // Track animated blocks by stable ID (survives DOM recreation from culling)
    const animatedBlocks = new Set();
    // Track effect lines by DOM ref (they arrive after their block, within visible window)
    const animatedLines = new WeakSet();

    // Scroll to top + animate new elements
    watch(() => rawLog.value.length, () => {
      nextTick(() => {
        const el = entriesEl.value;
        if (!el) return;
        el.scrollTop = 0;

        // Animate new blocks
        for (const blockEl of el.querySelectorAll('[data-block-id]')) {
          const blockId = Number(blockEl.dataset.blockId);
          if (animatedBlocks.has(blockId)) continue;
          animatedBlocks.add(blockId);
          gsap.from(blockEl, { opacity: 0, y: -30, duration: 0.6, ease: 'back.out(1.7)' });
        }

        // Animate new effect lines (may arrive after their block)
        const newLines = [];
        for (const line of el.querySelectorAll('.log-effect-line')) {
          if (animatedLines.has(line)) continue;
          animatedLines.add(line);
          newLines.push(line);
        }
        if (newLines.length) {
          gsap.from(newLines, { opacity: 0, x: 40, scale: 0.85, duration: 0.7, ease: 'back.out(2)', stagger: 0.12 });
        }
      });
    });

    /** @param {EffectResult | string} effect */
    function effectText(effect) {
      if (typeof effect === 'string') return effect;
      const name = game.getCharacter(effect.targetId)?.getName() || '';
      const suffix = effect.defeated ? game.getLine('log_defeat_suffix') : '';
      if (effect.type === 'damage') {
        const mitigated = (effect.rawAmount && effect.rawAmount > effect.amount) ? effect.rawAmount - effect.amount : 0;
        let key;
        if (mitigated > 0 && effect.shieldAbsorbed) key = 'log_damage_mitigated_absorbed';
        else if (mitigated > 0) key = 'log_damage_mitigated';
        else if (effect.shieldAbsorbed) key = 'log_damage_absorbed';
        else key = 'log_damage';
        return game.getLine(key, { name, amount: effect.amount, raw: effect.rawAmount, type: game.getLine(effect.damageType), damageType: effect.damageType, absorbed: effect.shieldAbsorbed, mitigated }) + suffix;
      }
      if (effect.type === 'heal') {
        const diff = (effect.rawAmount != null && effect.rawAmount !== effect.amount) ? effect.amount - effect.rawAmount : 0;
        if (diff !== 0) {
          return game.getLine('log_heal_modified', { name, amount: effect.amount, raw: effect.rawAmount, sign: diff > 0 ? '+' : '-', diff: Math.abs(diff) });
        }
        return game.getLine('log_heal', { name, amount: effect.amount });
      }
      if (effect.type === 'shield') return game.getLine('log_shield', { name, amount: effect.amount });
      if (effect.type === 'steal') return game.getLine('log_steal', { name, amount: effect.amount });
      if (effect.type === 'move') return game.getLine('log_move');
      if (effect.type === 'token_apply') {
        const def = getTokenDefinitions().get(effect.tokenId);
        const tokenName = def?.name || effect.tokenId;
        const icon = def?.icon ? `<img src="${def.icon}" class="log-inline-icon" />` : '';
        let text = game.getLine('log_token_apply', { name, stacks: effect.stacks, tokenName: icon + tokenName });
        if (effect.duration) text += ` for ${effect.duration} turns`;
        return text;
      }
      if (effect.type === 'token_dot') {
        const tokenName = getTokenDefinitions().get(effect.tokenId)?.name || effect.tokenId;
        const dmgType = effect.damageType || 'absolute';
        const diff = (effect.rawAmount != null && effect.rawAmount !== effect.amount) ? effect.amount - effect.rawAmount : 0;
        if (diff !== 0) {
          return game.getLine('log_token_dot_modified', { name, amount: effect.amount, raw: effect.rawAmount, sign: diff > 0 ? '+' : '-', diff: Math.abs(diff), damageType: dmgType, tokenName });
        }
        return game.getLine('log_token_dot', { name, amount: effect.amount, damageType: dmgType, tokenName });
      }
      if (effect.type === 'token_hot') {
        const tokenName = getTokenDefinitions().get(effect.tokenId)?.name || effect.tokenId;
        const diff = (effect.rawAmount != null && effect.rawAmount !== effect.amount) ? effect.amount - effect.rawAmount : 0;
        if (diff !== 0) {
          return game.getLine('log_token_hot_modified', { name, amount: effect.amount, raw: effect.rawAmount, sign: diff > 0 ? '+' : '-', diff: Math.abs(diff), tokenName });
        }
        return game.getLine('log_token_hot', { name, amount: effect.amount, tokenName });
      }
      if (effect.type === 'death_defiance') return game.getLine('log_death_defiance', { name });
      if (effect.type === 'cleanse') return game.getLine('log_cleanse', { name });
      if (effect.type === 'thorns') return game.getLine('log_thorns', { name, amount: effect.amount });
      if (effect.type === 'status_apply') {
        const statusDefs = game.getData("character_statuses", true);
        const def = statusDefs?.get(effect.statusId);
        const icon = def?.image ? `<img src="${def.image}" class="log-inline-icon" />` : '';
        const statusName = icon + (effect.statusName || effect.statusId);
        let text = game.getLine('log_status_apply', { name, statusName });
        if (effect.duration) text += ` for ${effect.duration} turns`;
        return text;
      }
      return '';
    }

    /** @param {EffectResult | string} effect */
    function getEffectTargetId(effect) {
      return typeof effect === 'object' ? effect.targetId : null;
    }

    const battleResult = computed(() => {
      const battle = currentBattle.value;
      if (!battle || battle.phase !== 'finished') return null;
      return battle.result; // 'victory' | 'defeat' | 'retreat'
    });

    const battleResultText = computed(() => {
      if (!battleResult.value) return '';
      const key = { victory: 'log_victory', retreat: 'log_retreat_result', defeat: 'log_defeat' }[battleResult.value] || 'log_defeat';
      return game.getLine(key);
    });

    // Animate battle result banner (one-time)
    let resultAnimated = false;
    watch(battleResult, (result) => {
      if (!result || resultAnimated) return;
      resultAnimated = true;
      nextTick(() => {
        const el = entriesEl.value?.querySelector('.log-battle-result');
        if (el) {
          gsap.from(el, { opacity: 0, scale: 0.5, duration: 0.8, ease: 'back.out(1.7)' });
          gsap.from(el.querySelector('.log-battle-result-line'), { scaleX: 0, duration: 0.6, delay: 0.4, ease: 'power2.out' });
        }
      });
    });

    function getLine(id) { return game.getLine(id); }

    function selectCharacter(characterId) {
      const char = getCharacter(characterId);
      if (char) emit('select', char, getActorSide(characterId));
    }

    function isClockTurn(actorId) {
      return actorId === CLOCK_TURN_ACTOR;
    }

    function emitContinue() { emit('continue'); }

    return { groupedLog, getCharacter, getActorSide, isDefeated, isRetreated, effectText, getEffectTargetId, entriesEl, battleResult, battleResultText, getLine, selectCharacter, isClockTurn, currentBattle, emitContinue };
  },
  template: /*html*/`
    <div class="battle-log">
      <button v-if="battleResult" class="log-continue-btn" @click="emitContinue">{{ getLine('battle_continue') }}</button>
      <div class="battle-log-header">{{ getLine('battle_log_header') }}</div>
      <div class="battle-log-entries" ref="entriesEl">
        <div v-if="battleResult" class="log-battle-result" :class="battleResult">
          <div class="log-battle-result-label">{{ battleResultText }}</div>
          <div class="log-battle-result-line"></div>
          <div class="log-battle-result-stats">
            <span class="log-battle-stat">{{ getLine('battle_turns') }} {{ currentBattle.turn }}</span>
            <span class="log-battle-stat">{{ getLine('battle_lost') }} {{ currentBattle.defeatedPlayer.length }}</span>
            <span class="log-battle-stat">{{ getLine('battle_defeated') }} {{ currentBattle.defeatedEnemy.length }}</span>
            <span v-if="currentBattle.retreated.length" class="log-battle-stat">{{ getLine('battle_retreated') }} {{ currentBattle.retreated.length }}</span>
          </div>
        </div>
        <template v-for="(turnGroup, ti) in groupedLog" :key="ti">
          <div class="log-turn-separator"><span>{{ turnGroup.text }}</span></div>

          <div v-for="block in turnGroup.blocks" :key="block.id"
            :data-block-id="block.id"
            class="log-actor-block" :class="{ active: block.isActive }">
            <div class="log-actor-header">
              <template v-if="isClockTurn(block.actorId)">
                <div class="log-clock-turn-icon"></div>
              </template>
              <template v-else>
                <CharacterFace :character="getCharacter(block.actorId)"
                  :showName="true" nameStyle="overlay" :borderRadius="0" :size="80"
                  :class="{ defeated: isDefeated(block.actorId), retreated: isRetreated(block.actorId) }"
                  :borderColor="getActorSide(block.actorId) === 'player' ? 'rgba(66, 185, 131, 0.6)' : 'rgba(239, 68, 68, 0.6)'"
                  style="cursor: pointer" @click="selectCharacter(block.actorId)" />
                <div class="log-actor-chips">
                  <div v-for="ab in block.snapshot" :key="ab.id"
                    class="ability-chip" :class="{ disabled: !ab.usable, chosen: ab.chosen }">
                    <img v-if="ab.icon" :src="ab.icon" class="ability-chip-icon"
                      @error="(e) => e.target.style.display = 'none'" />
                    <span class="ability-chip-name">{{ ab.name }}</span>
                    <span v-if="ab.cooldown > 0" class="ability-chip-badge cd-badge">{{ ab.cooldown }}</span>
                    <span v-if="ab.charges >= 0" class="ability-chip-badge charge-badge">{{ ab.charges }}</span>
                  </div>
                </div>
              </template>
            </div>
            <div class="log-actor-entries">
              <template v-for="(action, ai) in block.actions" :key="ai">
                <div v-if="action.effects.length" class="log-effects-group">
                  <div v-for="(effect, ei) in action.effects" :key="ei" class="log-effect-line">
                    <CharacterFace v-if="getEffectTargetId(effect) && getCharacter(getEffectTargetId(effect))"
                      :character="getCharacter(getEffectTargetId(effect))" :size="40" :borderRadius="4"
                      :class="{ defeated: isDefeated(getEffectTargetId(effect)), retreated: isRetreated(getEffectTargetId(effect)) }"
                      :borderColor="getActorSide(getEffectTargetId(effect)) === 'player' ? 'rgba(66,185,131,0.6)' : 'rgba(239,68,68,0.6)'"
                      style="cursor: pointer" @click="selectCharacter(getEffectTargetId(effect))" />
                    <span v-html="effectText(effect)"></span>
                  </div>
                </div>
                <AbilityCard v-if="action.abilityId"
                  :ability-id="action.abilityId"
                  :character-id="action.actorId" />
              </template>
            </div>
          </div>
        </template>
      </div>
    </div>
  `
});
