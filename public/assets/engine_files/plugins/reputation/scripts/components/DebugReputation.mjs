/// <reference path="../dtypes.d.ts" />

// Debug tab: every character that tracks reputation (value, starting value from the template, ±1
// through the normal action so the note shows) and this session's changes. Styles in css/reputation.css.

const { game, vue } = window.engine;
const { defineComponent, computed } = vue;
const { CharacterFace } = window.engine.components;

import { store } from '../store.mjs';

const ReputationTab = defineComponent({
    components: { CharacterFace },
    setup() {
        const rep = game.getService('reputation');

        const rows = computed(() => {
            // touch the log so a change re-renders the table
            void store.log.length;
            const templates = game.getData('character_templates', true);
            return rep.getTracked().map((c) => ({
                character: c,
                id: c.id,
                name: c.getTrait('name') || c.id,
                value: rep.get(c.id),
                start: Number(templates?.get?.(c.templateId)?.traits?.reputation ?? 0),
                last: store.log.find((e) => e.id === c.id) || null,
            })).sort((a, b) => a.name.localeCompare(b.name));
        });
        const bounds = computed(() => rep.getBounds());
        const nudge = (id, delta) => game.execute({ reputation: `${id} ${delta > 0 ? '+=' : '-='} ${Math.abs(delta)}` });
        const reset = (id, start) => game.execute({ reputation: `${id} = ${start}` });
        const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
        const ago = (t) => {
            const s = Math.round((Date.now() - t) / 1000);
            return s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
        };

        return { rows, bounds, log: computed(() => store.log), nudge, reset, signed, ago };
    },
    template: `
    <div class="rep-panel">
      <div class="rep-summary">{{ rows.length }} tracked · range {{ bounds.min }} to {{ bounds.max }}</div>
      <p v-if="!rows.length" class="rep-empty">No character tracks reputation yet. Set a <code>reputation</code> trait on a template, or change one with the <code>reputation</code> action.</p>
      <table v-else class="rep-table">
        <thead><tr><th></th><th>Character</th><th>Now</th><th>Start</th><th>Last change</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td><CharacterFace :character="r.character" :size="30" borderRadius="6px" noWrapper /></td>
            <td>{{ r.name }} <span class="rep-id">{{ r.id }}</span></td>
            <td class="rep-value" :class="{ pos: r.value > 0, neg: r.value < 0 }">{{ signed(r.value) }}</td>
            <td class="rep-start">{{ signed(r.start) }}</td>
            <td class="rep-last"><template v-if="r.last">{{ signed(r.last.delta) }} <span class="rep-id">{{ r.last.scene || 'script' }} · {{ ago(r.last.time) }}</span></template><template v-else>—</template></td>
            <td class="rep-btns">
              <button @click="nudge(r.id, -1)" title="−1 (shows the note)">−1</button>
              <button @click="nudge(r.id, 1)" title="+1 (shows the note)">+1</button>
              <button @click="reset(r.id, r.start)" title="Back to the starting value">↺</button>
            </td>
          </tr>
        </tbody>
      </table>
      <template v-if="log.length">
        <div class="rep-summary">This session</div>
        <ul class="rep-log">
          <li v-for="(e, i) in log" :key="i"><b>{{ e.name }}</b> {{ signed(e.before) }} → {{ signed(e.after) }} <span class="rep-id">{{ e.scene || 'script' }} · {{ ago(e.time) }}</span></li>
        </ul>
      </template>
    </div>`,
});

game.addComponent({ id: 'debug-reputation', slot: 'debug-tabs', title: 'Reputation', component: ReputationTab, order: 30 });
