/// <reference path="../dtypes.d.ts" />

const { game, vue, components } = window.engine;
const { computed, ref, watch, defineComponent } = vue;
const { AbilityCard, CustomComponentContainer } = components;

import { currentRpgBattle } from '../rpg-battle-state.mjs';
import { canUseAbility } from '../rpg-battle-flow.mjs';

// @ts-ignore - Vue overload resolution false positive in .mjs
export const RpgAbilityPanel = defineComponent({
  components: { AbilityCard, CustomComponentContainer },
  props: ['battle', 'activeChar', 'isPlayerTurn'],
  emits: ['select-ability', 'end-turn'],
  setup(props, { emit }) {
    const abilityPanelRef = ref(null);
    const panelAnimKey = ref(0);
    const panelVisible = ref(false);
    const panelExiting = ref(false);
    const hoveredAbilityId = ref(null);

    const activeAbilities = computed(() => {
      if (props.battle?.activeSide !== 'player') return [];
      /** @type {Character} */
      const char = props.activeChar;
      if (!char) return [];
      const charId = char.id;
      const abilities = char.getAbilities();
      const list = [];
      for (const id in abilities) {
        const ab = abilities[id];
        if (ab.meta.is_hidden) continue;
        const usable = canUseAbility(charId, id);
        const state = props.battle?.abilitiesState?.[charId]?.[id];
        const costs = [];
        if (ab.meta.costs) {
          for (const statId in ab.meta.costs) {
            const stat = game.characterSystem.statsMap.get(statId);
            const amount = ab.meta.costs[statId];
            const current = char.getResource(statId);
            costs.push({
              statId,
              amount,
              icon: stat?.icon,
              name: stat?.name || statId,
              color: stat?.color ? '#' + stat.color : null,
              insufficient: current < amount,
            });
          }
        }
        list.push({
          id,
          meta: ab.meta,
          effects: ab.effects,
          usable,
          cooldown: state?.cooldown || 0,
          charges: state?.charges ?? -1,
          costs,
        });
      }
      list.sort((a, b) => (a.meta.order ?? 0) - (b.meta.order ?? 0));
      return list;
    });

    const isPlayerTurn = computed(() => props.isPlayerTurn);

    watch(isPlayerTurn, (val) => {
      if (val && !panelVisible.value) show();
    }, { immediate: true });

    function show() {
      panelExiting.value = false;
      panelAnimKey.value++;
      panelVisible.value = true;
    }

    function hide(cb) {
      if (!panelVisible.value) { if (cb) cb(); return; }
      panelExiting.value = true;
      const panel = abilityPanelRef.value;
      if (!panel) { panelVisible.value = false; if (cb) cb(); return; }
      const items = panel.querySelectorAll('.rpg-ability-item, .rpg-btn-end-turn');
      const maxDelay = items.length * 30 + 250;
      setTimeout(() => {
        panelVisible.value = false;
        panelExiting.value = false;
        if (cb) cb();
      }, maxDelay);
    }

    function onSelectAbility(abilityId) {
      const ab = activeAbilities.value.find(a => a.id === abilityId);
      if (!ab?.usable) return;
      emit('select-ability', abilityId, hide);
    }

    function onEndTurn() {
      emit('end-turn', hide);
    }

    return {
      game, activeAbilities, hoveredAbilityId,
      abilityPanelRef, panelAnimKey, panelVisible, panelExiting,
      show, hide, onSelectAbility, onEndTurn,
    };
  },
  template: /*html*/`
    <template v-if="panelVisible">
      <div :key="panelAnimKey" ref="abilityPanelRef"
        class="rpg-ability-panel" :class="{ 'panel-exit': panelExiting }">
        <CustomComponentContainer :slot="'rpg-ability-panel-top'" :context="{ character: activeChar }" />
        <div v-for="(ab, idx) in activeAbilities" :key="ab.id"
          class="rpg-ability-item" :class="{ disabled: !ab.usable, 'on-cooldown': ab.cooldown > 0, 'no-charges': ab.charges === 0 }"
          :style="{ '--i': idx }"
          @click="onSelectAbility(ab.id)"
          @mouseenter="hoveredAbilityId = ab.id"
          @mouseleave="hoveredAbilityId = null">
          <img v-if="ab.meta.icon" :src="ab.meta.icon" class="rpg-ability-icon" />
          <span class="rpg-ability-name">{{ ab.meta.name || ab.id }}</span>
          <span class="rpg-ability-badges">
            <span v-if="ab.cooldown > 0" class="rpg-ability-cd" :title="ab.cooldown + ' turns'">{{ ab.cooldown }}</span>
            <span v-if="ab.charges >= 0" class="rpg-ability-charges" :class="{ empty: ab.charges === 0 }" :title="ab.charges + ' charges'">{{ ab.charges }}</span>
          </span>
          <span v-if="ab.costs.length" class="rpg-ability-costs">
            <span v-for="c in ab.costs" :key="c.statId" class="rpg-ability-cost" :class="{ insufficient: c.insufficient }" :style="!c.insufficient && c.color ? { color: c.color } : {}">
              {{ c.amount }}<img v-if="c.icon" :src="c.icon" class="rpg-cost-icon" /><template v-else>{{ c.name }}</template>
            </span>
          </span>
        </div>
        <button class="rpg-btn rpg-btn-end-turn" :style="{ '--i': activeAbilities.length }" @click="onEndTurn">{{ game.getLine('ui_end_turn') }}</button>
        <CustomComponentContainer :slot="'rpg-ability-panel-bottom'" :context="{ character: activeChar }" />
        <div v-if="hoveredAbilityId" class="rpg-ability-tooltip">
          <AbilityCard :abilityId="hoveredAbilityId" :characterId="battle?.activeCharId" />
        </div>
      </div>
    </template>
  `
});
