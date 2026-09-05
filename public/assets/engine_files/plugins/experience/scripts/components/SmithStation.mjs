/// <reference path="../dtypes.d.ts" />

const { game, vue } = window.engine;
const { defineComponent, ref, computed, watch } = vue;
const { ItemCard, ItemSlot } = window.engine.components;

import {
    STONE_ID, closeSmith, smithableItems, makeItemAtLevel, stoneCount, mcLevel,
    upgradeItem, breakItem, breakYield, upgradeCost, rarityCost,
} from '../smith.mjs';

// Smith Station overlay. List mode: item bricks (engine ItemSlot, popup suppressed) grouped by
// category like the character sheet, with a search box; the brick badge shows the stones needed
// for a FULL upgrade to the MC's level (or the break refund on the Break tab). Clicking a brick
// swaps the whole list for a detail view: current vs upgraded ItemCards, stepper, forge/break,
// and a cancel button back to the bricks. Feedback is a short non-blocking flash.
export const SmithStation = defineComponent({
    components: { ItemCard, ItemSlot },
    setup() {
        const tab = ref('upgrade');
        const search = ref('');
        const selectedUid = ref(null);
        const levels = ref(1);
        const preview = ref(null);
        const flashing = ref(false);

        const stones = computed(() => stoneCount());
        const cap = computed(() => mcLevel());
        const stoneIcon = computed(() => {
            const template = game.getData('item_templates', true)?.get(STONE_ID);
            return template?.traits?.image || '';
        });

        const all = computed(() => smithableItems().map(item => {
            const level = item.getTrait('item_level') || 0;
            const coef = rarityCost(item);
            return {
                item,
                level,
                coef,
                maxed: level >= cap.value,
                toFull: (cap.value - level) * coef,
                stones: breakYield(item),
            };
        }));

        // Category groups, character-sheet style: only groups that have items, in category order.
        const groups = computed(() => {
            const query = search.value.trim().toLowerCase();
            let list = all.value;
            if (tab.value === 'break') list = list.filter(e => e.stones > 0);
            if (tab.value === 'upgrade') list = list.filter(e => !e.maxed);
            if (query) list = list.filter(e => (e.item.traits?.name || e.item.id).toLowerCase().includes(query));
            const categories = [...(game.getData('item_categories', true)?.values() || [])]
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const result = [];
            for (const category of categories) {
                const items = list.filter(e => e.item.category === category.id);
                if (items.length) result.push({ id: category.id, name: category.name, items });
            }
            return result;
        });

        const selected = computed(() => all.value.find(e => e.item.uid === selectedUid.value) || null);
        const maxAffordable = computed(() => {
            if (!selected.value) return 0;
            const byLevel = cap.value - selected.value.level;
            const byStones = Math.floor(stones.value / selected.value.coef);
            return Math.max(0, Math.min(byLevel, byStones));
        });
        const totalCost = computed(() => selected.value ? upgradeCost(selected.value.item, levels.value) : 0);
        const canForge = computed(() =>
            !!selected.value && levels.value >= 1 &&
            selected.value.level + levels.value <= cap.value &&
            totalCost.value <= stones.value);

        function rebuildPreview() {
            const entry = selected.value;
            preview.value = (entry && tab.value === 'upgrade' && !entry.maxed && levels.value >= 1)
                ? makeItemAtLevel(entry.item.id, entry.level + levels.value)
                : null;
        }
        watch([selectedUid, levels, () => selected.value?.level, tab], rebuildPreview);

        function select(entry) {
            if (tab.value === 'break') {
                confirmBreak(entry);
                return;
            }
            selectedUid.value = entry.item.uid;
            levels.value = Math.max(1, maxAffordable.value);
        }

        async function confirmBreak(entry) {
            // A hover item card can float above the modal and steal its clicks — drop it first.
            window.engine.popups?.closeAll?.();
            const ok = await window.engine.showConfirm({
                header: t('smith_tab_break'),
                message: t('smith_break_warning', { item: entry.item.getName(), amount: entry.stones }),
                acceptLabel: t('smith_break_button'),
                rejectLabel: t('smith_button_cancel'),
            });
            if (ok) breakItem(entry.item);
        }

        function cancel() {
            selectedUid.value = null;
            levels.value = 1;
        }

        function step(delta) {
            levels.value = Math.min(Math.max(1, levels.value + delta), Math.max(1, maxAffordable.value));
        }

        function setMax() {
            levels.value = Math.max(1, maxAffordable.value);
        }

        function doUpgrade() {
            const entry = selected.value;
            if (!entry || !canForge.value) return;
            const live = upgradeItem(entry.item, levels.value);
            if (!live) return;
            selectedUid.value = live.uid;
            levels.value = 1;
            flashing.value = true;
            setTimeout(() => { flashing.value = false; }, 300);
        }

        watch(tab, cancel);

        const t = (id, params) => game.getLine(id, params);

        return {
            tab, search, selectedUid, levels, preview, flashing,
            stones, cap, stoneIcon, groups, selected, maxAffordable, totalCost, canForge,
            select, cancel, step, setMax, doUpgrade, close: closeSmith, t,
        };
    },
    template: `
    <div id="smith-station" class="smith-station overlay-hoist">
        <div class="smith-panel">
            <div class="smith-header">
                <div class="smith-title">{{ t('smith_title') }}</div>
                <div class="smith-cap">{{ t('smith_level_cap', { level: cap }) }}</div>
                <div class="smith-stones">
                    <img v-if="stoneIcon" :src="stoneIcon" alt="">
                    <span v-else class="smith-stone-glyph">◆</span>
                    <span class="smith-stone-count">{{ stones }}</span>
                </div>
                <button class="smith-close" @click="close">✕</button>
            </div>

            <!-- list mode -->
            <template v-if="!selected">
                <div class="smith-toolbar">
                    <div class="smith-tabs">
                        <button :class="{ active: tab === 'upgrade' }" @click="tab = 'upgrade'">{{ t('smith_tab_upgrade') }}</button>
                        <button class="smith-tab-break" :class="{ active: tab === 'break' }" @click="tab = 'break'">{{ t('smith_tab_break') }}</button>
                    </div>
                    <div class="smith-search-wrap">
                        <input class="smith-search" type="text" v-model="search" :placeholder="t('smith_search')">
                        <button v-if="search" class="smith-search-clear" @click="search = ''">✕</button>
                    </div>
                </div>
                <div class="smith-body">
                    <div v-if="!groups.length" class="smith-empty">{{ t('smith_empty') }}</div>
                    <div v-for="group in groups" :key="group.id" class="smith-group">
                        <div class="smith-group-title">{{ group.name }}</div>
                        <div class="smith-bricks">
                            <div v-for="entry in group.items" :key="entry.item.uid" class="smith-brick">
                                <ItemSlot :item="entry.item" :popup-no-choices="true" :popup-dismiss-on-click="true" @click="select(entry)" />
                                <span class="smith-brick-level">Lv {{ entry.level }}</span>
                                <span v-if="tab === 'upgrade'" class="smith-brick-badge">{{ entry.toFull }}<span class="smith-stone-glyph">◆</span></span>
                                <span v-else class="smith-brick-badge break">+{{ entry.stones }}<span class="smith-stone-glyph">◆</span></span>
                            </div>
                        </div>
                    </div>
                </div>
            </template>

            <!-- detail mode: fixed controls column left, scrolling card columns right -->
            <div v-else class="smith-detail">
                <div class="smith-detail-controls">
                    <template v-if="tab === 'upgrade' && !selected.maxed">
                        <div class="smith-stepper-row">
                            <button class="smith-step" @click="step(-1)" :disabled="levels <= 1">−</button>
                            <span class="smith-levels">+{{ levels }}</span>
                            <button class="smith-step" @click="step(1)" :disabled="levels >= maxAffordable">+</button>
                            <button class="smith-max-button" @click="setMax">{{ t('smith_button_max') }}</button>
                        </div>
                        <button class="smith-forge" :disabled="!canForge" @click="doUpgrade">
                            {{ t('smith_button_upgrade') }} · {{ totalCost }}<span class="smith-stone-glyph">◆</span>
                        </button>
                        <div v-if="maxAffordable < 1" class="smith-short">{{ t('smith_need_stones') }}</div>
                    </template>
                    <div v-if="tab === 'upgrade' && selected.maxed" class="smith-maxed-note">{{ t('smith_max_badge') }}</div>
                    <button class="smith-cancel" @click="cancel">{{ t('smith_button_cancel') }}</button>
                </div>
                <div class="smith-detail-cards" :class="{ flashing: flashing }">
                    <ItemCard :item="selected.item" />
                    <div v-if="tab === 'upgrade' && preview" class="smith-arrow">➜</div>
                    <ItemCard v-if="tab === 'upgrade' && preview" :item="preview" />
                </div>
            </div>
        </div>
    </div>`,
});

game.addComponent({ id: 'smith-station', slot: 'overlay', component: SmithStation });
