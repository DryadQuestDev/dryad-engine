/// <reference path="../dtypes.d.ts" />

const { game, vue, components } = window.engine;
const { computed, defineComponent } = vue;
const { ProgressBar, CustomComponentContainer } = components;

import { getBattleDisplayName } from '../rpg-battle-state.mjs';

// @ts-ignore
export const RpgCharOverlay = defineComponent({
  components: { ProgressBar, CustomComponentContainer },
  props: ['character', 'slotScale'],
  setup(/** @type {{ character: Character, slotScale: number }} */ props) {
    const name = computed(() => props.character ? getBattleDisplayName(props.character.id) : '');
    const health = computed(() => props.character?.getResource('health') || 0);
    const maxHealth = computed(() => props.character?.getStat('health') || 1);

    const healthColor = computed(() => {
      const statsData = game.getData('character_stats', true);
      const healthStat = statsData?.get('health');
      const c = healthStat?.color || 'c0392b';
      return `#${c}`;
    });

    // Battle statuses — status.meta.is_battle. Stagger is rendered separately as pips.
    // Definition map is still useful for display fallbacks (name/image/polarity), just not for meta.
    const battleStatuses = computed(() => {
      if (!props.character) return [];
      const statusDefs = game.getData('character_statuses', true);
      const out = [];
      for (const s of props.character.getStatuses()) {
        if (s.isHidden) continue;
        if (s.id === 'stagger') continue;
        if (!s.meta?.is_battle) continue;
        const def = statusDefs?.get(s.id);
        const polarity = s.polarity || def?.polarity || 'neutral';
        const image = s.displayImage || s.image || def?.image || null;
        if (s.multiStack) {
          const instances = s.getInstances();
          let stacks = 0, duration = 0;
          for (const inst of instances) {
            stacks += inst.stacks;
            duration = Math.max(duration, inst.duration || 0);
          }
          out.push({ key: s.id, id: s.id, name: s.name || def?.name || s.id, image, stacks, duration, maxStacks: s.maxStacks, polarity });
        } else {
          out.push({ key: s.id, id: s.id, name: s.name || def?.name || s.id, image, stacks: s.currentStacks, duration: s.duration, maxStacks: s.maxStacks, polarity });
        }
      }
      return out;
    });

    // Stagger pips
    const staggerStacks = computed(() => {
      return props.character?.getStatus('stagger')?.currentStacks ?? 0;
    });
    const staggerBase = computed(() => props.character?.getStat('stagger_threshold') || 0);
    const staggerBonus = computed(() => {
      const pct = props.character?.getStat('stagger_threshold_pct') || 0;
      return Math.ceil(staggerBase.value * pct / 100);
    });
    const staggerBonusFilled = computed(() => Math.min(staggerStacks.value, staggerBonus.value));
    const staggerBaseFilled = computed(() => Math.max(0, staggerStacks.value - staggerBonus.value));

    return { game, name, health, maxHealth, healthColor, battleStatuses, staggerStacks, staggerBase, staggerBonus, staggerBonusFilled, staggerBaseFilled };
  },
  template: /*html*/ `
    <div v-if="character" class="rpg-char-overlay">
      <CustomComponentContainer :slot="'rpg-char-overlay-top'" :context="{ character }" />
      <div class="rpg-char-overlay-name">{{ name }}</div>
      <ProgressBar :current="health" :max="maxHealth" :barColor="healthColor"
        bgColor="rgba(0,0,0,0.5)" width="13cqh" height="2cqh" :hideMax="true" />
      <div v-if="staggerStacks > 0 || staggerBase > 0" class="rpg-stagger-pips">
        <span v-for="i in staggerBonus" :key="'g_' + i"
              class="rpg-stagger-pip rpg-stagger-pip--bonus"
              :class="{ 'rpg-stagger-pip--filled': i <= staggerBonusFilled }"></span>
        <span v-for="i in staggerBase" :key="'b_' + i"
              class="rpg-stagger-pip"
              :class="{ 'rpg-stagger-pip--filled': i <= staggerBaseFilled }"></span>
      </div>
      <div v-if="battleStatuses.length" class="rpg-char-tokens">
        <div v-for="s in battleStatuses" :key="s.key" class="rpg-token" :class="[s.polarity]">
          <img v-if="s.image" :src="s.image" class="rpg-token-icon" />
          <span v-if="s.maxStacks !== 1" class="rpg-token-stacks">{{ s.stacks }}</span>
          <span v-else-if="s.duration > 0" class="rpg-token-duration">{{ s.duration }}</span>
        </div>
      </div>
      <CustomComponentContainer :slot="'rpg-char-overlay-bottom'" :context="{ character }" />
    </div>
  `,
});
