/// <reference path="../dtypes.d.ts" />

const { game, vue } = window.engine;
const { computed, defineComponent, ref, watch } = vue;

import { partySelectRequest, confirmPartySelect, cancelPartySelect } from '../main.mjs';

const CharacterFace = window.engine.components.CharacterFace;

// Pre-battle party picker. Opens when more eligible party members exist than max_battle_units:
// battle_always members are locked in (shown selected, not toggleable), the rest toggle on
// click. Fight enables once the roster is legal (all locked + at most `max` total).
// @ts-ignore - Vue overload resolution false positive in .mjs
export const RpgPartySelect = defineComponent({
    components: { CharacterFace },
    setup() {
        const request = partySelectRequest;
        const selected = ref(/** @type {Set<string>} */ (new Set()));

        // Preselect locked members + fill remaining slots in party order on every new request.
        watch(request, (r) => {
            if (!r) return;
            const pick = new Set(r.locked);
            for (const id of r.eligible) {
                if (pick.size >= r.max) break;
                pick.add(id);
            }
            selected.value = pick;
        }, { immediate: true });

        const roster = computed(() => {
            const r = request.value;
            if (!r) return [];
            return r.eligible
                .map(id => game.getCharacter(id))
                .filter(Boolean)
                .map(c => ({
                    character: c,
                    locked: r.locked.includes(c.id),
                    picked: selected.value.has(c.id),
                }));
        });

        const max = computed(() => request.value?.max ?? 0);
        const count = computed(() => selected.value.size);
        const canFight = computed(() => count.value > 0 && count.value <= max.value);

        function toggle(/** @type {any} */ entry) {
            if (entry.locked) return;
            const next = new Set(selected.value);
            if (next.has(entry.character.id)) next.delete(entry.character.id);
            else if (next.size < max.value) next.add(entry.character.id);
            selected.value = next;
        }

        function onFight() {
            if (!canFight.value) return;
            // Preserve party order rather than click order
            const order = request.value?.eligible.filter(id => selected.value.has(id)) || [];
            confirmPartySelect(order);
        }

        return { request, roster, max, count, canFight, toggle, onFight, cancelPartySelect, line: (/** @type {string} */ id, /** @type {any} */ p) => game.getLine(id, p) };
    },
    template: `
    <div class="rpg-party-select" v-if="request">
      <h2>{{ line('rpg_party_select_title') }}</h2>
      <p class="rps-hint">{{ line('rpg_party_select_hint', { count, max }) }}</p>
      <button class="rps-fight" :disabled="!canFight" @click="onFight">{{ line('rpg_party_select_fight') }}</button>
      <div class="rps-faces">
        <div v-for="entry in roster" :key="entry.character.id"
             class="rps-face" :class="{ picked: entry.picked, locked: entry.locked }"
             @click="toggle(entry)">
          <character-face :character="entry.character" :showName="true" nameStyle="badge" />
          <i v-if="entry.locked" class="pi pi-lock rps-lock"></i>
          <i v-else-if="entry.picked" class="pi pi-check-circle rps-check"></i>
        </div>
      </div>
    </div>`,
});

game.addComponent({
    id: 'rpg_party_select',
    slot: 'popup',
    component: RpgPartySelect,
});
