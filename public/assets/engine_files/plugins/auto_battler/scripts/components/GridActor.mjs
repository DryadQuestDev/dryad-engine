/// <reference path="../dtypes.d.ts" />

import { currentBattle } from '../battle-flow.mjs';
import { getTokenDefinitions } from '../battle-effects.mjs';

const { game, vue } = window.engine;
const { computed, defineComponent } = vue;
const { CharacterFace, ProgressBar } = window.engine.components;

// Health bar color from stat definition (constant)
const healthStatColor = (() => {
  const stat = game.getData("character_stats", true)?.get("health");
  return stat?.color ? `#${stat.color}` : '#c0392b';
})();

export const GridActor = defineComponent({
  components: { CharacterFace, ProgressBar },
  props: ['character', 'isActive', 'borderColor'],
  setup(/** @type {{ character: Character, isActive: boolean, borderColor: string }} */ props) {
    const health = computed(() => props.character.getResource('health'));
    const maxHealth = computed(() => props.character.getStat('health'));
    const isDead = computed(() => health.value <= 0);

    // Battle statuses (tagged 'battle')
    const battleStatuses = computed(() => {
      if (!props.character) return [];
      const statusDefs = game.getData("character_statuses", true);
      return props.character.getStatuses()
        .filter(s => s.tags?.includes('battle') && !s.isHidden)
        .map(s => {
          const obj = statusDefs?.get(s.id);
          return {
            id: s.id,
            name: s.name || obj?.name || s.id,
            image: s.image || obj?.image,
            stacks: s.isStackable() ? s.currentStacks : 0,
            polarity: s.polarity || obj?.polarity || 'neutral'
          };
        });
    });

    const tokens = computed(() => {
      const battle = currentBattle.value;
      if (!battle || !props.character) return [];
      const charTokens = battle.tokens[props.character.id];
      if (!charTokens) return [];
      const defs = getTokenDefinitions();
      return Object.keys(charTokens).filter(id => charTokens[id].length > 0 && defs.has(id)).map(id => {
        const def = defs.get(id);
        const instances = charTokens[id];
        const totalStacks = Math.round(instances.reduce((s, i) => s + i.stacks, 0));
        return { id, name: def.name, icon: def.icon, stacks: totalStacks, polarity: def.polarity };
      }).filter(t => t.stacks > 0);
    });

    return { health, maxHealth, healthStatColor, isDead, battleStatuses, tokens };
  },
  template: /*html*/`
    <div class="grid-actor" :class="{ active: isActive, dead: isDead }">
      <CharacterFace :character="character"
        :size="100" :showName="true" nameStyle="overlay" :borderRadius="8"
        :borderColor="borderColor"
        :static-face-force="true"
        />
      <div class="grid-actor-overlay">
        <div class="grid-actor-health">
          <ProgressBar :current="health" :max="maxHealth"
            :barColor="healthStatColor" bgColor="rgba(0,0,0,0.5)"
            width="100%" height="16px" :hideMax="true" />
        </div>
        <div v-if="battleStatuses.length > 0 || tokens.length > 0" class="grid-actor-tokens">
          <div v-for="s in battleStatuses" :key="'s_' + s.id" class="grid-actor-token"
            :class="[s.polarity]" :title="s.name">
            <img v-if="s.image" :src="s.image" class="token-icon" />
            <span v-if="s.stacks > 0" class="token-stacks">{{ s.stacks }}</span>
          </div>
          <div v-for="t in tokens" :key="'t_' + t.id" class="grid-actor-token"
            :class="[t.polarity]" :title="t.name + ' x' + t.stacks">
            <img v-if="t.icon" :src="t.icon" class="token-icon" />
            <span class="token-stacks">{{ t.stacks }}</span>
          </div>
        </div>
      </div>
    </div>
  `
});
