/// <reference path="../dtypes.d.ts" />

import { currentBattle } from '../battle-flow.mjs';
import { getTokenDefinitions } from '../battle-effects.mjs';

const { game, vue, floatingUi } = window.engine;
const { computed, defineComponent, ref } = vue;
const { useFloating, offset, flip, shift, autoUpdate } = floatingUi;

export const TokenBricks = defineComponent({
  props: ['character'],
  setup(/** @type {{ character: Character }} */ props) {
    // Expand each token instance into its own brick
    const tokenInstances = computed(() => {
      const battle = currentBattle.value;
      if (!battle || !props.character) return [];
      const charTokens = battle.tokens[props.character.id];
      if (!charTokens) return [];
      const defs = getTokenDefinitions();
      /** @type {{ tokenId: string, name: string, description: string, icon: string, polarity: string, stacks: number, duration: number }[]} */
      const result = [];
      for (const tokenId in charTokens) {
        const instances = charTokens[tokenId];
        const def = defs.get(tokenId);
        if (!def || !instances.length) continue;
        for (const inst of instances) {
          if (inst.stacks <= 0) continue;
          result.push({
            tokenId,
            name: def.name,
            description: def.description || '',
            icon: def.icon || '',
            polarity: def.polarity || 'neutral',
            stacks: Math.round(inst.stacks),
            duration: inst.duration != null ? inst.duration : 0,
          });
        }
      }
      return result;
    });

    // Hover popup state
    const hoveredToken = ref(null);
    const referenceRef = ref(null);
    const popupRef = ref(null);

    const { floatingStyles } = useFloating(referenceRef, popupRef, {
      placement: 'left-start',
      strategy: 'fixed',
      middleware: [offset(10), flip({ padding: 8 }), shift({ padding: 8 })],
      whileElementsMounted: autoUpdate,
    });

    function showPopup(event, token) {
      hoveredToken.value = token;
      referenceRef.value = event.currentTarget;
    }

    function hidePopup() {
      hoveredToken.value = null;
      referenceRef.value = null;
    }

    function polarityClass(token) {
      return {
        'polarity-positive': token.polarity === 'positive',
        'polarity-negative': token.polarity === 'negative',
        'polarity-neutral': token.polarity === 'neutral',
        'has-image': !!token.icon,
      };
    }

    return { tokenInstances, hoveredToken, popupRef, floatingStyles, showPopup, hidePopup, polarityClass };
  },
  template: /*html*/`
    <div v-for="(t, i) in tokenInstances" :key="i"
      class="token-brick" :class="polarityClass(t)"
      @mouseenter="showPopup($event, t)" @mouseleave="hidePopup">
      <img v-if="t.icon" :src="t.icon" :alt="t.name" class="token-brick-image" />
      <span v-else class="token-brick-name">{{ t.name }}</span>
      <span v-if="t.stacks > 1" class="token-brick-stacks">x{{ t.stacks }}</span>
      <span v-if="t.duration > 0" class="token-brick-duration">{{ Math.ceil(t.duration) }}</span>
    </div>

    <Teleport to="body">
      <div v-if="hoveredToken" ref="popupRef" class="token-brick-popup" :style="floatingStyles">
        <div class="token-brick-popup-header">
          <img v-if="hoveredToken.icon" :src="hoveredToken.icon" class="token-brick-popup-icon" />
          <h4>{{ hoveredToken.name }}</h4>
        </div>
        <div class="token-brick-popup-body">
          <div v-if="hoveredToken.description" class="token-brick-popup-desc" v-html="hoveredToken.description"></div>
          <div class="token-brick-popup-details">
            <span>Stacks: <b>{{ hoveredToken.stacks }}</b></span>
            <span v-if="hoveredToken.duration > 0">Duration: <b>{{ Math.ceil(hoveredToken.duration) }}</b> turns</span>
          </div>
        </div>
      </div>
    </Teleport>
  `
});
