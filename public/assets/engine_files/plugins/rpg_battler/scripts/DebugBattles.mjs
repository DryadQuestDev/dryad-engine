/// <reference path="./dtypes.d.ts" />

// Debug tab: lists every battle from plugins_data/rpg_battler/battles with a Start button that
// triggers it (game.getService('rpg_battle').start({ battleId })). Includes an id/name search.
// Styles in css/debug-battles.css (auto-loaded with the plugin's css).

const { game, vue } = window.engine;
const { defineComponent, ref, computed } = vue;

const BattlesTab = defineComponent({
    setup() {
        const search = ref('');
        let rpg = null; try { rpg = game.getService('rpg_battle'); } catch (e) { /* service optional */ }

        const all = computed(() => {
            const m = game.getData('plugins_data/rpg_battler/battles', true);
            const entryText = (e) => (e.is_live_instance
                ? (e.live_character_ids || []).join(' + ') + ' (live)'
                : (e.amount > 1 ? e.amount + '× ' : '') + e.character_id);
            const waveText = (entries) => (entries || []).map(entryText).join(', ');
            return (m ? [...m.values()] : []).map(b => {
                // every enemies* wave, in authoring order — same sweep getThreat uses
                const waves = Object.keys(b).filter(k => /^enemies\d*$/.test(k)).sort()
                    .map(k => waveText(b[k])).filter(Boolean);
                return {
                    id: b.id,
                    name: b.name || b.id,
                    // service getThreat covers both authoring styles (battle field + template sums)
                    threat: rpg?.getThreat?.(b.id) ?? (b.threat || 0),
                    enemies: waves.map((w, n) => (waves.length > 1 ? `W${n + 1}: ` : '') + w).join('  ▸  ') || '—',
                };
            });
        });
        const battles = computed(() => {
            const q = search.value.trim().toLowerCase();
            return all.value.filter(b => !q || b.id.toLowerCase().includes(q) || b.name.toLowerCase().includes(q));
        });
        const active = computed(() => !!rpg?.isActive?.());

        const start = async (id) => {
            if (!rpg?.start) { game.showNotification?.('rpg_battle service unavailable'); return; }
            const r = await rpg.start({ battleId: id });
            // party_select_pending is the picker opening, not a failure — stay quiet for it.
            if (r && r.ok === false && r.reason !== 'party_select_pending') game.showNotification?.(`Battle "${id}": ${r.reason}`);
        };

        return { search, battles, total: computed(() => all.value.length), active, start };
    },
    template: `
    <div class="db-panel">
      <div class="db-controls">
        <label>Search <input type="text" v-model="search" class="db-search" placeholder="battle id or name" /></label>
        <span class="db-summary">{{ battles.length }} / {{ total }} battles<span v-if="active" class="db-active"> · battle active</span></span>
      </div>
      <table class="db-table">
        <thead><tr><th></th><th>Battle</th><th>Threat</th><th>Enemies</th></tr></thead>
        <tbody>
          <tr v-for="b in battles" :key="b.id">
            <td><button class="db-start" :disabled="active" @click="start(b.id)" title="Start this battle">▶</button></td>
            <td>{{ b.name }} <span class="db-id">{{ b.id }}</span></td>
            <td class="db-threat">{{ b.threat }}</td>
            <td class="db-enemies">{{ b.enemies }}</td>
          </tr>
        </tbody>
      </table>
    </div>`,
});

game.addComponent({ id: 'debug-battles', slot: 'debug-tabs', title: 'Battles', component: BattlesTab, order: 25 });
