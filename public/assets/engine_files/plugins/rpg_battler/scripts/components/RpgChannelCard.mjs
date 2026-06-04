/// <reference path="../dtypes.d.ts" />

const { game, vue } = window.engine;
const { computed, defineComponent } = vue;

import { endChannelsBy } from '../rpg-battle-effects.mjs';

// @ts-ignore - Vue overload resolution false positive in .mjs
export const RpgChannelCard = defineComponent({
  props: ['character'],
  setup(/** @type {{ character: Character }} */ props) {
    const activeChannel = computed(() => {
      const c = props.character;
      if (!c) return null;
      for (const st of c.getStatuses()) {
        if (st.meta?.is_channel) return { name: st.name, icon: st.image };
      }
      return null;
    });

    function onCancelChannel() {
      if (props.character) endChannelsBy(props.character.id);
    }

    return { game, activeChannel, onCancelChannel };
  },
  template: /*html*/`
    <div v-if="activeChannel" class="rpg-channel-card">
      <img v-if="activeChannel.icon" :src="activeChannel.icon" class="rpg-ability-icon" />
      <span class="rpg-ability-name">{{ activeChannel.name }}</span>
      <span class="rpg-channel-label">{{ game.getLine('ui_channeling') }}</span>
      <button class="rpg-btn rpg-btn-cancel" v-tooltip.top="game.getLine('ui_channel_cancel_tip')" @click="onCancelChannel">{{ game.getLine('ui_cancel') }}</button>
    </div>
  `,
});
