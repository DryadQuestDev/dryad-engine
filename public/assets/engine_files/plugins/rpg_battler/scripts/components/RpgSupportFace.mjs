/// <reference path="../dtypes.d.ts" />

const { vue, components } = window.engine;
const { defineComponent, ref, onMounted } = vue;
const { CharacterFace } = components;

import { getBattleDisplayName } from '../rpg-battle-state.mjs';

// Cut-in band for the acting support combatant. Supports have no battlefield slot, so on
// their turn a slanted band sweeps in from the left carrying their face in a window. The
// root carries the [data-rpg-char-id] anchor and the window is the .character-content —
// projectiles, floating text and hit flashes resolve it exactly like a slot (getCharEl),
// so bullets fire from the face with no animation-code changes.
// The slide lives on .rpg-support-portrait, never on .character-content: GSAP leaves an
// inline transform on that after a lunge, which would pin the window on screen.
// @ts-ignore - Vue overload resolution false positive in .mjs
export const RpgSupportFace = defineComponent({
  components: { CharacterFace },
  props: ['character'],
  setup() {
    const rootEl = ref(null);
    // CharacterFace sizes in px; read the viewport so the face scales with it like the
    // cqh-sized band around it.
    const faceSize = ref(0);
    onMounted(() => {
      const vp = rootEl.value?.closest('.rpg-viewport');
      faceSize.value = Math.round((vp?.clientHeight || 600) * 0.14);
    });
    return { rootEl, faceSize, getBattleDisplayName };
  },
  template: /*html*/`
    <div ref="rootEl" class="rpg-support-face" :data-rpg-char-id="character.id">
      <div class="rpg-support-band"></div>
      <div class="rpg-support-row">
        <div class="rpg-support-portrait">
          <div class="character-content">
            <div class="rpg-support-plate"></div>
            <div class="rpg-support-window" :style="{ width: faceSize + 'px', height: faceSize + 'px' }">
              <CharacterFace v-if="faceSize" :character="character" :size="faceSize" :noWrapper="true"
                :borderRadius="0" :borderColor="'transparent'" :static-face-force="true" />
            </div>
          </div>
        </div>
        <div class="rpg-support-face-name">{{ getBattleDisplayName(character.id) }}</div>
      </div>
    </div>
  `
});
