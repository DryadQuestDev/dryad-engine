/// <reference path="../dtypes.d.ts" />

const { game, vue, components } = window.engine;
const { computed, defineComponent } = vue;
const { ProgressBar, CustomComponentContainer } = components;

import { currentRpgBattle, getBattleDisplayName } from '../rpg-battle-state.mjs';
import { getTokenDefinitions } from '../rpg-battle-effects.mjs';

// @ts-ignore
export const RpgCharOverlay = defineComponent({
  components: { ProgressBar, CustomComponentContainer },
  props: ['character', 'slotScale'],
  setup(/** @type {{ character: Character, slotScale: number }} */ props) {
    const battle = computed(() => currentRpgBattle.value);
    const name = computed(() => props.character ? getBattleDisplayName(props.character.id) : '');
    const health = computed(() => props.character?.getResource('health') || 0);
    const maxHealth = computed(() => props.character?.getStat('health') || 1);

    // Scale overlay proportionally with character zoom (0.8 at scale 0.2, 1.6 at scale 1.0)
    const overlayStyle = computed(() => {
      const s = props.slotScale || 0.4;
      const zoom = 0.6 + s;
      return {
        transform: `scale(${zoom})`,
      };
    });

    const healthColor = computed(() => {
      const statsData = game.getData('character_stats', true);
      const healthStat = statsData?.get('health');
      const c = healthStat?.color || 'c0392b';
      return c.startsWith('#') ? c : '#' + c;
    });

    // Battle-tagged statuses
    const battleStatuses = computed(() => {
      if (!props.character) return [];
      const statusDefs = game.getData('character_statuses', true);
      return props.character.getStatuses()
        .filter(s => s.tags?.includes('battle') && !s.isHidden)
        .map(s => {
          const def = statusDefs?.get(s.id);
          return {
            id: s.id,
            name: s.name || def?.name || s.id,
            image: s.image || def?.image || null,
            stacks: s.isStackable() ? s.currentStacks : 0,
            polarity: def?.polarity || 'neutral',
          };
        });
    });

    // Token display
    const tokens = computed(() => {
      const b = battle.value;
      if (!b || !props.character) return [];
      const charTokens = b.charState?.[props.character.id]?.tokens;
      if (!charTokens) return [];
      const defs = getTokenDefinitions();
      const result = [];
      for (const tokenId in charTokens) {
        const instances = charTokens[tokenId];
        if (!instances?.length) continue;
        const def = defs.get(tokenId);
        if (!def) continue;
        const totalStacks = Math.round(instances.reduce((s, i) => s + i.stacks, 0));
        if (totalStacks <= 0) continue;
        result.push({
          id: tokenId,
          name: def.name,
          icon: def.icon || null,
          stacks: totalStacks,
          polarity: def.polarity || 'neutral',
        });
      }
      return result;
    });

    return { game, name, health, maxHealth, healthColor, battleStatuses, tokens, overlayStyle };
  },
  template: /*html*/ `
    <div v-if="character" class="rpg-char-overlay" :style="overlayStyle">
      <CustomComponentContainer :slot="'rpg-char-overlay-top'" :context="{ character }" />
      <div class="rpg-char-overlay-name">{{ name }}</div>
      <ProgressBar :current="health" :max="maxHealth" :barColor="healthColor"
        bgColor="rgba(0,0,0,0.5)" width="120px" height="18px" :hideMax="true" />
      <div v-if="battleStatuses.length || tokens.length" class="rpg-char-tokens">
        <div v-for="s in battleStatuses" :key="'s_' + s.id" class="rpg-token" :class="[s.polarity]">
          <img v-if="s.image" :src="s.image" class="rpg-token-icon" />
          <span v-if="s.stacks > 0" class="rpg-token-stacks">{{ s.stacks }}</span>
        </div>
        <div v-for="t in tokens" :key="'t_' + t.id" class="rpg-token" :class="[t.polarity]">
          <img v-if="t.icon" :src="t.icon" class="rpg-token-icon" />
          <span class="rpg-token-stacks">{{ t.stacks }}</span>
        </div>
      </div>
      <CustomComponentContainer :slot="'rpg-char-overlay-bottom'" :context="{ character }" />
    </div>
  `,
});
