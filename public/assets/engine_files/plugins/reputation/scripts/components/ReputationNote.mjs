/// <reference path="../dtypes.d.ts" />

// "|name| will remember that." under the dialogue text, where the player is reading. The notes belong
// to the paragraph that made the change: scene_play fires once the next paragraph is committed and
// before its own actions run, so clearing there never drops a note that paragraph adds.
// Styles in css/reputation.css.

const { game, vue } = window.engine;
const { defineComponent, computed } = vue;
const { CharacterFace } = window.engine.components;

import { store } from '../store.mjs';

function config() {
    try {
        return game.getData('plugins_data/reputation/config');
    } catch (e) {
        return null;
    }
}

const clear = () => { if (store.notes.length) store.notes.splice(0); };
game.on('scene_play', clear);
game.on('scene_exit_before', clear);

const ReputationNote = defineComponent({
    components: { CharacterFace },
    setup() {
        const notes = computed(() => {
            const showDirection = !!config()?.show_direction;
            return store.notes.map((n) => {
                const character = game.getCharacter(n.id);
                if (!character) return null;
                return {
                    id: n.id,
                    character,
                    text: game.getLine('reputation_remember', { name: character.getTrait('name') || character.id }),
                    direction: showDirection && n.delta ? (n.delta > 0 ? 'up' : 'down') : '',
                };
            }).filter(Boolean);
        });
        return { notes };
    },
    template: `
    <div v-if="notes.length" class="rep-notes">
      <div v-for="n in notes" :key="n.id" class="rep-note" :class="n.direction && 'rep-' + n.direction">
        <CharacterFace :character="n.character" :size="26" borderRadius="6px" noWrapper />
        <span class="rep-text">{{ n.text }}</span>
        <span v-if="n.direction" class="rep-arrow">{{ n.direction === 'up' ? '▲' : '▼' }}</span>
      </div>
    </div>`,
});

game.addComponent({ id: 'reputation-note', slot: 'scene-content-bottom', component: ReputationNote });
