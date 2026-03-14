/// <reference path="../dtypes.d.ts" />

const { vue, gsap } = window.engine;
const { defineComponent, watch, nextTick } = vue;
import { floatingTexts, removeFloatingText } from '../battle-flow.mjs';

export const FloatingCombatText = defineComponent({
  setup() {
    const animated = new Set();

    watch(() => floatingTexts.value.length, () => {
      nextTick(() => {
        for (const entry of floatingTexts.value) {
          if (animated.has(entry.id)) continue;
          animated.add(entry.id);

          const el = document.querySelector(`[data-float-id="${entry.id}"]`);
          if (!el) continue;

          // Position over the character's grid-actor (follows lunge transform)
          const cell = document.querySelector(`[data-char-id="${entry.characterId}"]`);
          const anchor = cell?.querySelector('.grid-actor') || cell;
          if (anchor) {
            const sameCharCount = floatingTexts.value.filter(
              f => f.characterId === entry.characterId && animated.has(f.id) && f.id !== entry.id
            ).length;
            const rect = anchor.getBoundingClientRect();
            el.style.left = `${rect.left + rect.width / 2}px`;
            el.style.top = `${rect.top + rect.height * 0.55 + sameCharCount * 25}px`;
          }

          gsap.to(el, {
            y: -25,
            duration: 0.9,
            ease: 'power2.out',
            onComplete: () => removeFloatingText(entry.id),
          });
        }
      });
    });

    return { floatingTexts };
  },
  template: /*html*/`
    <div v-for="ft in floatingTexts" :key="ft.id"
      :data-float-id="ft.id"
      class="floating-combat-text"
      :class="ft.cssClass"
      :style="ft.color ? { color: '#' + ft.color } : {}">
      <img v-if="ft.icon" :src="ft.icon" class="floating-combat-icon" />
      <span>{{ ft.text }}</span>
    </div>
  `
});
