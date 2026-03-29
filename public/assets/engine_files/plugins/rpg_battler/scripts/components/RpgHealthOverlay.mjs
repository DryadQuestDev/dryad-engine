/// <reference path="../dtypes.d.ts" />

const { vue } = window.engine;
const { defineComponent, computed } = vue;

// @ts-ignore
export const RpgHealthOverlay = defineComponent({
  props: ['character'],
  setup(/** @type {{ character: Character }} */ props) {
    const healthLost = computed(() => {
      if (!props.character) return 0;
      /** @type {Character} */
      const character = props.character;
      const ratio = character.getResourceRatio('health');
      return Math.max(0, 1 - ratio);
    });
    return { healthLost };
  },
  template: /*html*/`
    <div class="rpg-health-lost-overlay"
      :style="{ height: (healthLost * 100) + '%' }">
    </div>`,
});
