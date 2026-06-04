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
  emits: ['select-ability'],
  setup(props, { emit }) {
    const abilityPanelRef = ref(null);
    const panelAnimKey = ref(0);
    const panelVisible = ref(false);
    const panelExiting = ref(false);
    const activeTab = ref('');

    // ── Abilities ──

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
        const state = props.battle?.charState?.[charId]?.abilities[id];
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
          isBonus: !!ab.meta.bonus_action,
          cooldown: state?.cooldown || 0,
          charges: state?.charges ?? -1,
          costs,
        });
      }
      return list;
    });

    // ── Data-driven ability groups (from Character.getGroupedAbilities) ──

    const grouped = computed(() => {
      /** @type {Character} */
      const char = props.activeChar;
      if (!char) return { useGroups: false, groups: [] };
      return char.getGroupedAbilities();
    });

    const useGroups = computed(() => grouped.value.useGroups);

    const availableGroups = computed(() => {
      if (!useGroups.value) return [];
      return grouped.value.groups;
    });

    const displayedAbilities = computed(() => {
      const abs = activeAbilities.value;
      if (!useGroups.value) return abs;
      const currentGroup = grouped.value.groups.find(g => g.id === activeTab.value);
      if (!currentGroup) return abs;
      const groupIds = new Set(currentGroup.abilityIds);
      return abs.filter(a => groupIds.has(a.id));
    });

    function getTabPrefs() {
      return game.getState('rpg_ability_tabs') || {};
    }

    function setTab(tab) {
      activeTab.value = tab;
      const charId = props.activeChar?.id;
      if (charId) {
        const prefs = { ...getTabPrefs(), [charId]: tab };
        game.setState('rpg_ability_tabs', prefs);
      }
    }

    function restoreTab() {
      const charId = props.activeChar?.id;
      const preferred = charId ? getTabPrefs()[charId] : '';
      const groups = availableGroups.value;
      if (preferred && groups.some(g => g.id === preferred)) {
        activeTab.value = preferred;
      } else if (groups.length > 0) {
        activeTab.value = groups[0].id;
      }
    }

    // Restore tab whenever the active character or their groups change
    watch([() => props.activeChar?.id, availableGroups], () => {
      if (availableGroups.value.length > 0) restoreTab();
    }, { immediate: true });

    let hideTimer = null;

    function show() {
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      panelExiting.value = false;
      panelAnimKey.value++;
      panelVisible.value = true;
    }

    function hide(cb) {
      if (!panelVisible.value) { if (cb) cb(); return; }
      panelExiting.value = true;
      const panel = abilityPanelRef.value;
      if (!panel) { panelVisible.value = false; if (cb) cb(); return; }
      const items = panel.querySelectorAll('.rpg-ability-item');
      const maxDelay = items.length * 30 + 250;
      hideTimer = setTimeout(() => {
        hideTimer = null;
        panelVisible.value = false;
        panelExiting.value = false;
        if (cb) cb();
      }, maxDelay);
    }

    function onSelectAbility(/** @type {string} */ abilityId) {
      const ab = activeAbilities.value.find(a => a.id === abilityId);
      if (!ab?.usable) return;
      emit('select-ability', abilityId, hide);
    }

    function tooltipBinding(/** @type {string} */ abilityId) {
      if (panelExiting.value) return null;
      return {
        component: AbilityCard,
        props: { abilityId, characterId: props.battle?.activeCharId },
        placement: 'right-start',
        dismissOnClick: true,
      };
    }

    return {
      game, activeAbilities, displayedAbilities,
      abilityPanelRef, panelAnimKey, panelVisible, panelExiting,
      activeTab, useGroups, availableGroups,
      show, hide, onSelectAbility, setTab, tooltipBinding,
    };
  },
  template: /*html*/`
    <template v-if="panelVisible">
      <div :key="panelAnimKey" ref="abilityPanelRef"
        class="rpg-ability-panel" :class="{ 'panel-exit': panelExiting }">
        <CustomComponentContainer :slot="'rpg-ability-panel-top'" :context="{ character: activeChar }" />
        <div v-if="useGroups" class="rpg-ability-tabs">
          <button v-for="g in availableGroups" :key="g.id"
            class="rpg-ability-tab" :class="{ active: activeTab === g.id }"
            @click="setTab(g.id)">{{ g.name }}</button>
        </div>
        <div v-for="(ab, idx) in displayedAbilities" :key="ab.id"
          class="rpg-ability-item" :class="{ disabled: !ab.usable, 'on-cooldown': ab.cooldown > 0, 'no-charges': ab.charges === 0 }"
          :style="{ '--i': idx }"
          v-popover="tooltipBinding(ab.id)"
          @click="onSelectAbility(ab.id)">
          <img v-if="ab.meta.icon" :src="ab.meta.icon" class="rpg-ability-icon" />
          <span class="rpg-ability-name">{{ ab.meta.name || ab.id }}</span>
          <span class="rpg-ability-aside">
            <span v-if="ab.costs.length" class="rpg-ability-costs">
              <span v-for="c in ab.costs" :key="c.statId" class="rpg-ability-cost" :class="{ insufficient: c.insufficient }" :style="!c.insufficient && c.color ? { color: c.color } : {}">
                {{ c.amount }}<img v-if="c.icon" :src="c.icon" class="rpg-cost-icon" /><template v-else>&nbsp;{{ c.name }}</template>
              </span>
            </span>
            <span class="rpg-ability-badges">
              <span v-if="ab.cooldown > 0" class="rpg-ability-cd" :title="ab.cooldown + ' turns'">{{ ab.cooldown }}</span>
              <span v-if="ab.charges >= 0" class="rpg-ability-charges" :class="{ empty: ab.charges === 0 }" :title="ab.charges + ' charges'">{{ ab.charges }}</span>
            </span>
          </span>
        </div>
        <CustomComponentContainer :slot="'rpg-ability-panel-bottom'" :context="{ character: activeChar }" />
      </div>
    </template>
  `
});
