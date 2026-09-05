/// <reference path="../dtypes.d.ts" />

const { vue, components } = window.engine;
const { defineComponent } = vue;
const { CharacterFace } = components;

import { getBattleDisplayName } from '../rpg-battle-state.mjs';

// Floating portrait for the acting support combatant. Supports have no battlefield slot,
// so on their turn this card appears above the party row carrying the [data-rpg-char-id]
// anchor with a .character-content inner — projectiles, floating text and hit flashes
// resolve it exactly like a slot (getCharEl), so bullets fire from the portrait with no
// animation-code changes.
// @ts-ignore - Vue overload resolution false positive in .mjs
export const RpgSupportFace = defineComponent({
  components: { CharacterFace },
  props: ['character'],
  setup() {
    return { getBattleDisplayName };
  },
  template: /*html*/`
    <div class="rpg-support-face" :data-rpg-char-id="character.id">
      <div class="rpg-support-face-inner">
        <div class="character-content">
          <CharacterFace :character="character" :size="84" :borderRadius="10"
            :borderColor="'rgba(250, 204, 21, 0.7)'" :static-face-force="true" />
        </div>
        <div class="rpg-support-face-name">{{ getBattleDisplayName(character.id) }}</div>
      </div>
    </div>
  `
});
