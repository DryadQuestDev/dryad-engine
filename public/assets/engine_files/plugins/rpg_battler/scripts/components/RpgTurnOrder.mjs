/// <reference path="../dtypes.d.ts" />

const { game, vue, components } = window.engine;
const { computed, defineComponent, TransitionGroup } = vue;
const { CharacterFace } = components;

import { isCharAlive } from '../rpg-battle-effects.mjs';

// @ts-ignore - Vue overload resolution false positive in .mjs
export const RpgTurnOrder = defineComponent({
  components: { CharacterFace, TransitionGroup },
  props: ['battle'],
  emits: ['select'],
  setup(props, { emit }) {
    const turnOrderChars = computed(() => {
      const b = props.battle;
      if (!b) return [];
      const playerSet = new Set(b.playerParty);
      return b.turnOrder
        .filter(id => isCharAlive(id))
        .map(id => {
          const char = game.getCharacter(id);
          if (!char) return null;
          return {
            char,
            id,
            side: playerSet.has(id) ? 'player' : 'enemy',
            support: !!b.charState[id]?.support,
            isActive: id === b.activeCharId,
          };
        }).filter(Boolean);
    });

    function onSelect(entry) {
      emit('select', entry.id, entry.side);
    }

    return { turnOrderChars, onSelect };
  },
  template: /*html*/`
    <div class="rpg-turn-order">
      <TransitionGroup name="rpg-turn-order" tag="div" class="rpg-turn-order-list">
        <div v-for="entry in turnOrderChars" :key="entry.char.id"
          class="rpg-turn-order-entry" :class="{ active: entry.isActive }"
          style="cursor: pointer" @click="onSelect(entry)">
          <CharacterFace :character="entry.char"
            :size="44" :borderRadius="6"
            :borderColor="entry.support ? 'rgba(250, 204, 21, 0.7)' : entry.side === 'player' ? 'rgba(66, 185, 131, 0.6)' : 'rgba(239, 68, 68, 0.6)'"
            :static-face-force="true"
            />
        </div>
      </TransitionGroup>
    </div>
  `
});
