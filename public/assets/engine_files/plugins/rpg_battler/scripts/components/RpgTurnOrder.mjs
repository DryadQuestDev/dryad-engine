/// <reference path="../dtypes.d.ts" />

const { game, vue, components } = window.engine;
const { computed, defineComponent } = vue;
const { CharacterFace } = components;

import { isCharAlive } from '../rpg-battle-effects.mjs';

// @ts-ignore - Vue overload resolution false positive in .mjs
export const RpgTurnOrder = defineComponent({
  components: { CharacterFace },
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
      <div v-for="entry in turnOrderChars" :key="entry.char.id"
        class="rpg-turn-order-entry" :class="{ active: entry.isActive }"
        style="cursor: pointer" @click="onSelect(entry)">
        <CharacterFace :character="entry.char"
          :size="entry.isActive ? 56 : 44" :borderRadius="6"
          :borderColor="entry.side === 'player' ? 'rgba(66, 185, 131, 0.6)' : 'rgba(239, 68, 68, 0.6)'" />
      </div>
    </div>
  `
});
