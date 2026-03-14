/// <reference path="../dtypes.d.ts" />

const { game, vue } = window.engine;
const { computed, defineComponent } = vue;
const { CharacterFace } = window.engine.components;

import { currentBattle, computeTurnPreview } from '../battle-flow.mjs';

const PREVIEW_COUNT = 10;

export const InitiativeBar = defineComponent({
  components: { CharacterFace },
  emits: ['select'],
  setup() {
    const currentTurn = computed(() => currentBattle.value?.turn ?? 1);

    const activeActor = computed(() => {
      const battle = currentBattle.value;
      if (!battle || !battle.activeActorId) return null;
      return battle.initiative.find(a => a.characterId === battle.activeActorId) || null;
    });

    const activeCharacter = computed(() => {
      if (!activeActor.value) return null;
      return game.getCharacter(activeActor.value.characterId);
    });

    // Preview of next actors + turn markers in the ATB queue
    const preview = computed(() => {
      const battle = currentBattle.value;
      if (!battle || battle.phase !== 'active') return [];
      return computeTurnPreview(PREVIEW_COUNT - 1);
    });

    // Combined queue: current turn marker + current actor + preview entries
    const queue = computed(() => {
      const result = [];

      // Current turn marker (always first)
      result.push({ type: 'turn', turn: currentTurn.value, isCurrent: true });

      // Current actor
      const actor = activeActor.value;
      if (actor) {
        result.push({
          type: 'actor',
          characterId: actor.characterId,
          side: actor.side,
          character: activeCharacter.value,
          isCurrent: true,
        });
      }

      // Preview entries (actors + turn markers)
      for (const entry of preview.value) {
        if (entry.type === 'turn') {
          result.push({ type: 'turn', turn: entry.turn, isCurrent: false });
        } else {
          result.push({
            type: 'actor',
            characterId: entry.characterId,
            side: entry.side,
            character: game.getCharacter(entry.characterId),
            isCurrent: false,
          });
        }
      }

      return result;
    });

    return { queue };
  },
  template: /*html*/`
    <div class="initiative-bar">
      <template v-for="(entry, index) in queue" :key="index">
        <div v-if="entry.type === 'turn'"
          class="initiative-turn-marker" :class="{ 'active': entry.isCurrent }">
          {{ entry.turn }}
        </div>
        <div v-else
          class="initiative-actor"
          :class="{ 'active': entry.isCurrent }"
          @click="$emit('select', entry)">
          <CharacterFace v-if="entry.character" :character="entry.character"
            :size="entry.isCurrent ? 60 : 48" :borderRadius="6" :showName="true" nameStyle="overlay"
            :borderColor="entry.side === 'player' ? 'rgba(66, 185, 131, 0.6)' : 'rgba(239, 68, 68, 0.6)'" />
        </div>
      </template>
    </div>
  `
});
