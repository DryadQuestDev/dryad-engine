/// <reference path="../dtypes.d.ts" />

const { game, vue } = window.engine;
const { computed, defineComponent } = vue;

import { currentRpgBattle } from '../rpg-battle-state.mjs';

// "How much of this fight is left" for a multi-wave battle. Renders NOTHING for the ordinary
// single-wave case — a counter that always reads "1/1" is pure clutter.
//
// Pips rather than "Wave 1 of 2" text: the count is small and fixed, and a row of dots is read
// at a glance instead of parsed, which is the whole point of secondary combat UI. Cleared waves
// stay filled so the row doubles as progress, and the current pip is ringed + brighter so the
// eye lands on it first.
// @ts-ignore - Vue overload resolution false positive in .mjs
export const RpgWaveTracker = defineComponent({
  setup() {
    const battle = computed(() => currentRpgBattle.value);

    const waveCount = computed(() => battle.value?.waves?.length || 1);
    const currentWave = computed(() => battle.value?.waveIndex ?? 0);
    const show = computed(() => waveCount.value > 1);

    const pips = computed(() =>
      Array.from({ length: waveCount.value }, (_, i) => ({
        index: i,
        cleared: i < currentWave.value,
        current: i === currentWave.value,
      })));

    const label = computed(() => `${game.getLine('ui_wave')} ${currentWave.value + 1}/${waveCount.value}`);

    return { show, pips, label };
  },
  template: /*html*/`
    <div v-if="show" class="rpg-wave-tracker" :title="label">
      <div class="rpg-wave-label">{{ label }}</div>
      <div class="rpg-wave-pips">
        <span v-for="p in pips" :key="p.index"
          class="rpg-wave-pip"
          :class="{ cleared: p.cleared, current: p.current }"></span>
      </div>
    </div>
  `
});
