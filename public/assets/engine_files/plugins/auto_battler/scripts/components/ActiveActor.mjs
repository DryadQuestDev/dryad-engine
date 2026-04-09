/// <reference path="../dtypes.d.ts" />

const { game, vue } = window.engine;
const { computed, defineComponent } = vue;

import { currentBattle, canUseAbility } from '../battle-flow.mjs';

export const ActiveActor = defineComponent({
  setup() {
    const actor = computed(() => {
      const battle = currentBattle.value;
      if (!battle || battle.phase !== 'active') return null;
      return battle.initiative.find(a => a.characterId === battle.activeActorId) || null;
    });

    const character = computed(() => {
      if (!actor.value) return null;
      return game.getCharacter(actor.value.characterId);
    });

    const speed = computed(() => {
      if (!character.value) return 0;
      return character.value.getStat('speed');
    });

    const abilities = computed(() => {
      const battle = currentBattle.value;
      const char = character.value;
      if (!battle || !char) return [];

      const charId = char.id;
      const abilitiesMap = char.getAbilities();
      const result = [];

      for (const abilityId in abilitiesMap) {
        const ability = abilitiesMap[abilityId];
        const state = battle.abilitiesState[charId]?.[abilityId];
        result.push({
          id: abilityId,
          name: ability.meta.name || abilityId,
          icon: ability.meta.icon || null,
          cooldown: state?.cooldown || 0,
          charges: state?.charges ?? -1,
          usable: canUseAbility(charId, abilityId),
        });
      }

      return result;
    });

    const chosenAbilityId = computed(() => {
      return currentBattle.value?.chosenAction?.abilityId || null;
    });

    function getLine(id) { return game.getLine(id); }

    return { actor, character, speed, abilities, chosenAbilityId, getLine };
  },
  template: /*html*/`
    <div class="active-actor" v-if="character">
      <div class="active-actor-info">
        <span class="active-actor-name">{{ character.getName() }}</span>
        <span class="active-actor-speed">{{ getLine('stat_speed_short') }} {{ speed }}</span>
      </div>
      <div class="active-actor-abilities">
        <div v-for="ab in abilities" :key="ab.id"
          class="ability-chip" :class="{ disabled: !ab.usable, chosen: ab.id === chosenAbilityId }">
          <img v-if="ab.icon" :src="ab.icon" class="ability-chip-icon"
            @error="(e) => e.target.style.display = 'none'" />
          <span class="ability-chip-name">{{ ab.name }}</span>
          <span v-if="ab.cooldown > 0" class="ability-chip-badge cd-badge">{{ ab.cooldown }}</span>
          <span v-if="ab.charges >= 0" class="ability-chip-badge charge-badge">{{ ab.charges }}</span>
        </div>
      </div>
    </div>
  `
});
