/// <reference path="../dtypes.d.ts" />

const { game, vue } = window.engine;
const { computed, defineComponent } = vue;

import { getEffectivePower } from '../rpg-battle-effects.mjs';

// @ts-ignore - Vue overload resolution false positive in .mjs
export const RpgCombatStats = defineComponent({
  props: ['character', 'power'],
  setup(/** @type {{ character: Character, power?: number }} */ props) {
    const char = computed(() => props.character);

    const displayPower = computed(() => {
      if (props.power !== undefined && props.power !== null) return props.power;
      const c = char.value;
      if (!c) return 0;
      return Math.round(getEffectivePower(c, undefined));
    });

    const critChance = computed(() => char.value?.getStat('crit_chance') ?? undefined);
    const critMulti = computed(() => char.value?.getStat('crit_multi') ?? undefined);

    const lblPower = game.getLine('combat_power') || 'Power';
    const lblCrit = game.getLine('combat_crit_chance') || 'Crit';
    const lblCritMulti = game.getLine('combat_crit_multi') || 'Crit ×';

    return { displayPower, critChance, critMulti, lblPower, lblCrit, lblCritMulti };
  },
  template: /*html*/`
    <div class="rpg-combat-stats">
      <div class="rpg-combat-stat">
        <span class="rpg-combat-stat-label">{{ lblPower }}</span>
        <span class="rpg-combat-stat-value">{{ displayPower }}</span>
      </div>
      <div v-if="critChance !== undefined" class="rpg-combat-stat">
        <span class="rpg-combat-stat-label">{{ lblCrit }}</span>
        <span class="rpg-combat-stat-value">{{ critChance }}%</span>
      </div>
      <div v-if="critMulti !== undefined" class="rpg-combat-stat">
        <span class="rpg-combat-stat-label">{{ lblCritMulti }}</span>
        <span class="rpg-combat-stat-value">{{ (1 + critMulti / 100).toFixed(1) }}×</span>
      </div>
    </div>
  `,
});
