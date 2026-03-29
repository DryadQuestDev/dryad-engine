/// <reference path="../dtypes.d.ts" />

const { vue, gsap } = window.engine;
const { watch, nextTick, defineComponent } = vue;

import { floatingTexts, removeFloatingText, getSpeedMult } from '../rpg-battle-state.mjs';

const processedIds = new Set();
const BASE_FLOAT_DURATION = 2.0;
const BASE_FLOAT_DELAY = 0.5;

// @ts-ignore
export const RpgFloatingText = defineComponent({
  setup() {
    watch(() => floatingTexts.value.length, () => {
      nextTick(() => {
        for (const ft of floatingTexts.value) {
          if (processedIds.has(ft.id)) continue;
          processedIds.add(ft.id);
          spawnFloat(ft);
        }
      });
    });

    return {};
  },
  template: /*html*/`<div class="rpg-floating-text-layer"></div>`
});

/**
 * @param {RpgFloatingText} ft
 */
function spawnFloat(ft) {
  // Find the character's DOM element
  const charEl = document.querySelector(`[data-rpg-char-id="${ft.characterId}"] .character-content`);
  if (!charEl) {
    removeFloatingText(ft.id);
    return;
  }

  const rect = charEl.getBoundingClientRect();
  const sameCharCount = floatingTexts.value.filter(f => f.characterId === ft.characterId && processedIds.has(f.id) && f.id !== ft.id).length;

  // Create floating element
  const el = document.createElement('div');
  el.className = `rpg-floating-text ${ft.cssClass}`;
  if (ft.color) el.style.setProperty('--float-color', `#${ft.color}`);

  if (ft.icon) {
    const img = document.createElement('img');
    img.src = ft.icon;
    img.className = 'rpg-floating-icon';
    el.appendChild(img);
  }

  const span = document.createElement('span');
  span.textContent = ft.text;
  el.appendChild(span);

  el.style.position = 'fixed';
  el.style.left = `${rect.left + rect.width / 2}px`;
  el.style.top = `${rect.top + rect.height * 0.4 + sameCharCount * 25}px`;
  el.style.zIndex = '200';

  document.body.appendChild(el);

  const mult = getSpeedMult();
  gsap.to(el, {
    y: -30,
    opacity: 0,
    duration: BASE_FLOAT_DURATION * mult,
    delay: BASE_FLOAT_DELAY * mult,
    ease: 'power2.out',
    onComplete: () => {
      el.remove();
      removeFloatingText(ft.id);
      processedIds.delete(ft.id);
    },
  });
}
