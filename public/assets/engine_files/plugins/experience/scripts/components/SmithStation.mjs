/// <reference path="../dtypes.d.ts" />

const { game, vue } = window.engine;
const { defineComponent, ref, computed, watch } = vue;
const { ItemCard, ItemSlot } = window.engine.components;

import {
    STONE_ID, closeSmith, smithableItems, makeItemAtLevel, stoneCount, mcLevel, levelCap, wearerOf, wornSlotOf,
    upgradeItem, upgradeItems, planEquippedUpgrades, beatsWornGear, breakItems, breakYield, upgradeCost,
    rarityCost,
} from '../smith.mjs';
import { SmithConfirm } from './SmithConfirm.mjs';

// Smith Station overlay. Item bricks (engine ItemSlot, popup suppressed) grouped by category like the
// character sheet, highest level first and then rarest, with a search box and a how-to line per tab.
// Worn gear carries an equipped tag; a bag piece that beats what someone wears carries a ▲.
// Upgrade: the brick badge shows the stones needed for a FULL upgrade to the item's cap, a filter
// narrows to worn / bag gear, and a bottom bar reforges every worn piece at once. Clicking a brick
// swaps the whole list for a detail view: current vs upgraded ItemCards, the stats that change,
// stepper, forge, and a back button.
// Break down: worn gear is left out, bricks toggle into a selection (also by rarity or up to a
// level), and one button breaks the whole selection behind a single confirm (SmithConfirm, drawn
// inside the panel so the station's skin covers it).
// Feedback is a short non-blocking flash.

// Tab and filter outlive the overlay, so the station reopens the way the player left it.
const tab = ref('upgrade');
const filter = ref('all');

const FILTERS = ['all', 'equipped', 'unequipped'];

// Same rounding as the item card's stat lines (stat precision + 1).
function roundStat(/** @type {any} */ def, /** @type {number} */ value) {
    const factor = Math.pow(10, (def?.precision ?? 0) + 1);
    return Math.round(value * factor) / factor;
}

const signed = (/** @type {number} */ value) => (value > 0 ? '+' : '') + value;

// A game names its tiers through `rarity_<tier>` lines (as the item card reads them); otherwise
// the raw id is capitalized.
function rarityLabel(/** @type {string} */ rarity) {
    const line = game.getLine('rarity_' + rarity);
    return line === `[rarity_${rarity}]` ? rarity.charAt(0).toUpperCase() + rarity.slice(1) : line;
}

export const SmithStation = defineComponent({
    components: { ItemCard, ItemSlot, SmithConfirm },
    setup() {
        const search = ref('');
        const selectedUid = ref(null);
        const marked = ref(/** @type {string[]} */ ([]));
        const levels = ref(1);
        const preview = ref(null);
        const flashing = ref(false);
        const listFlashing = ref(false);
        const upToLevel = ref(0);

        const stones = computed(() => stoneCount());
        const cap = computed(() => mcLevel());
        const stoneIcon = computed(() => {
            const template = game.getData('item_templates', true)?.get(STONE_ID);
            return template?.traits?.image || '';
        });

        const all = computed(() => smithableItems().map(item => {
            const level = item.getTrait('item_level') || 0;
            const coef = rarityCost(item);
            const itemCap = levelCap(item);
            return {
                item,
                level,
                coef,
                rarity: item.getRarity() || '',
                cap: itemCap,
                wearer: wearerOf(item),
                better: beatsWornGear(item),
                maxed: level >= itemCap,
                toFull: Math.max(0, itemCap - level) * coef,
                stones: breakYield(item),
            };
        }));

        const visible = computed(() => {
            const query = search.value.trim().toLowerCase();
            let list = all.value;
            if (tab.value === 'break') list = list.filter(e => e.stones > 0 && !e.item.isEquipped);
            if (tab.value === 'upgrade') {
                if (filter.value === 'equipped') list = list.filter(e => e.item.isEquipped);
                if (filter.value === 'unequipped') list = list.filter(e => !e.item.isEquipped);
            }
            if (query) list = list.filter(e => (e.item.traits?.name || e.item.id).toLowerCase().includes(query));
            // Maxed pieces stay on the Upgrade tab, after everything that can still be reforged.
            const maxedLast = (/** @type {{ maxed: boolean }} */ e) => (tab.value === 'upgrade' && e.maxed ? 1 : 0);
            return [...list].sort((a, b) => maxedLast(a) - maxedLast(b) ||
                b.level - a.level || b.coef - a.coef || a.item.getName().localeCompare(b.item.getName()));
        });

        // Category groups, character-sheet style: only groups that have items, in category order.
        const groups = computed(() => {
            const categories = [...(game.getData('item_categories', true)?.values() || [])]
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const result = [];
            for (const category of categories) {
                const items = visible.value.filter(e => e.item.category === category.id);
                if (items.length) result.push({ id: category.id, name: category.name, items });
            }
            return result;
        });

        // ── upgrade: detail view ──

        const selected = computed(() => all.value.find(e => e.item.uid === selectedUid.value) || null);
        const maxAffordable = computed(() => {
            if (!selected.value) return 0;
            const byLevel = selected.value.cap - selected.value.level;
            const byStones = Math.floor(stones.value / selected.value.coef);
            return Math.max(0, Math.min(byLevel, byStones));
        });
        const totalCost = computed(() => selected.value ? upgradeCost(selected.value.item, levels.value) : 0);
        const canForge = computed(() =>
            !!selected.value && levels.value >= 1 &&
            selected.value.level + levels.value <= selected.value.cap &&
            totalCost.value <= stones.value);

        // The preview is a fresh bag copy, so it is read as it would be in the slot the piece is
        // worn in: a game whose item stats depend on the slot then shows the forge's real result.
        const selectedSlot = computed(() => selected.value ? wornSlotOf(selected.value.item) : null);

        const statChanges = computed(() => {
            if (!selected.value || !preview.value) return [];
            const before = game.getItemStats(selected.value.item);
            const after = game.getItemStats(preview.value, selectedSlot.value, selected.value.wearer);
            const defs = game.getData('character_stats', true);
            /** @type {SmithStatChange[]} */
            const rows = [];
            for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
                const def = defs?.get(id);
                if (def?.is_hidden) continue;
                const from = roundStat(def, before[id] || 0);
                const to = roundStat(def, after[id] || 0);
                if (from === to) continue;
                rows.push({
                    id,
                    name: def?.name || id,
                    from: signed(from),
                    to: signed(to),
                    good: def?.reduction_is_good ? to < from : to > from,
                });
            }
            return rows;
        });

        function rebuildPreview() {
            const entry = selected.value;
            preview.value = (entry && tab.value === 'upgrade' && !entry.maxed && levels.value >= 1)
                ? makeItemAtLevel(entry.item.id, entry.level + levels.value)
                : null;
        }
        watch([selectedUid, levels, () => selected.value?.level, tab], rebuildPreview);

        // ── upgrade: every worn piece at once ──

        const wornBelowCap = computed(() => all.value.filter(e => e.item.isEquipped && !e.maxed).length);
        const equippedPlan = computed(() => planEquippedUpgrades(stones.value));
        const equippedPlanCost = computed(() => equippedPlan.value.reduce((sum, p) => sum + p.cost, 0));

        async function confirmUpgradeEquipped() {
            const plan = equippedPlan.value;
            if (!plan.length) return;
            const list = plan.map(p => {
                const from = p.item.getTrait('item_level') || 0;
                return t('smith_upgrade_all_entry', { item: p.item.getName(), from, to: from + p.levels });
            }).join(', ');
            const ok = await ask({
                tone: 'upgrade',
                header: t('smith_tab_upgrade'),
                message: t('smith_upgrade_all_warning', { amount: equippedPlanCost.value, list }),
                acceptLabel: t('smith_button_upgrade'),
                rejectLabel: t('smith_button_cancel'),
            });
            if (!ok) return;
            if (upgradeItems(plan).length) flash(listFlashing);
        }

        // ── break: selection ──

        // Marks survive the search box, so a selection can be built across several searches.
        const markedEntries = computed(() =>
            all.value.filter(e => marked.value.includes(e.item.uid) && e.stones > 0 && !e.item.isEquipped));
        const markedStones = computed(() => markedEntries.value.reduce((sum, e) => sum + e.stones, 0));

        const rarityChips = computed(() => {
            if (tab.value !== 'break') return [];
            const byRarity = new Map();
            for (const e of visible.value) {
                if (!e.rarity) continue;
                if (!byRarity.has(e.rarity)) byRarity.set(e.rarity, { id: e.rarity, coef: e.coef, uids: [] });
                byRarity.get(e.rarity).uids.push(e.item.uid);
            }
            return [...byRarity.values()]
                .sort((a, b) => a.coef - b.coef)
                .map(chip => ({
                    ...chip,
                    label: rarityLabel(chip.id),
                    active: chip.uids.every(uid => marked.value.includes(uid)),
                }));
        });

        // The level stepper walks the levels actually on the list, not every integer.
        const breakLevels = computed(() =>
            tab.value === 'break' ? [...new Set(visible.value.map(e => e.level))].sort((a, b) => a - b) : []);
        const upTo = computed(() => {
            const list = breakLevels.value;
            if (!list.length) return 0;
            return list.filter(l => l <= upToLevel.value).pop() ?? list[0];
        });

        function select(entry) {
            if (tab.value === 'break') {
                toggleMark(entry);
                return;
            }
            selectedUid.value = entry.item.uid;
            levels.value = Math.max(1, maxAffordable.value);
        }

        function toggleMark(entry) {
            const uid = entry.item.uid;
            marked.value = marked.value.includes(uid)
                ? marked.value.filter(u => u !== uid)
                : [...marked.value, uid];
        }

        function addMarks(/** @type {string[]} */ uids) {
            marked.value = [...new Set([...marked.value, ...uids])];
        }

        function markAll() {
            addMarks(visible.value.map(e => e.item.uid));
        }

        function toggleRarity(chip) {
            if (chip.active) marked.value = marked.value.filter(uid => !chip.uids.includes(uid));
            else addMarks(chip.uids);
        }

        function stepUpTo(/** @type {number} */ delta) {
            const list = breakLevels.value;
            const index = list.indexOf(upTo.value);
            upToLevel.value = list[Math.min(list.length - 1, Math.max(0, index + delta))] ?? 0;
        }

        function markUpTo() {
            addMarks(visible.value.filter(e => e.level <= upTo.value).map(e => e.item.uid));
        }

        function clearMarks() {
            marked.value = [];
        }

        async function confirmBreak() {
            const entries = markedEntries.value;
            if (!entries.length) return;
            const ok = await ask({
                tone: 'break',
                header: t('smith_tab_break'),
                message: entries.length === 1
                    ? t('smith_break_warning', { item: entries[0].item.getName(), amount: markedStones.value })
                    : t('smith_break_warning_many', { count: entries.length, amount: markedStones.value }),
                acceptLabel: t('smith_break_button'),
                rejectLabel: t('smith_button_cancel'),
            });
            if (!ok) return;
            breakItems(entries.map(e => e.item));
            marked.value = [];
        }

        // ── shared ──

        /** @type {import('vue').Ref<(SmithConfirmOptions & { resolve: (ok: boolean) => void }) | null>} */
        const confirmBox = ref(null);

        /** Open the confirm box; resolves true on accept, false on reject. */
        function ask(/** @type {SmithConfirmOptions} */ options) {
            // A hover item card floats above the panel and would cover the box — drop it first.
            window.engine.popups?.closeAll?.();
            return new Promise(resolve => { confirmBox.value = { ...options, resolve }; });
        }

        function answer(/** @type {boolean} */ ok) {
            const box = confirmBox.value;
            confirmBox.value = null;
            box?.resolve(ok);
        }

        function flash(/** @type {any} */ target) {
            target.value = true;
            setTimeout(() => { target.value = false; }, 300);
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
            flash(flashing);
        }

        watch(tab, () => {
            cancel();
            clearMarks();
        });

        const t = (id, params) => game.getLine(id, params);

        return {
            tab, filter, filters: FILTERS, search, selectedUid, marked, levels, preview, flashing, listFlashing,
            stones, cap, stoneIcon, groups, selected, selectedSlot, maxAffordable, totalCost, canForge, statChanges,
            wornBelowCap, equippedPlan, equippedPlanCost, confirmUpgradeEquipped,
            markedEntries, markedStones, rarityChips, breakLevels, upTo,
            select, markAll, toggleRarity, stepUpTo, markUpTo, clearMarks, confirmBreak, confirmBox, answer,
            cancel, step, setMax, doUpgrade, close: closeSmith, t,
        };
    },
    template: /*html*/`
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
                <div class="smith-main">
                    <div class="smith-subbar">
                        <div class="smith-hint">{{ t(tab === 'upgrade' ? 'smith_hint_upgrade' : 'smith_hint_break') }}</div>
                        <div v-if="tab === 'upgrade'" class="smith-filter">
                            <button v-for="f in filters" :key="f" :class="{ active: filter === f }" @click="filter = f">{{ t('smith_filter_' + f) }}</button>
                        </div>
                        <div v-else-if="breakLevels.length" class="smith-quick">
                            <button v-for="chip in rarityChips" :key="chip.id" class="smith-rarity-chip" :class="['rarity_' + chip.id, { active: chip.active }]"
                                @click="toggleRarity(chip)">{{ chip.label }}</button>
                            <div class="smith-upto">
                                <button class="smith-upto-step" :disabled="upTo <= breakLevels[0]" @click="stepUpTo(-1)">−</button>
                                <button class="smith-upto-select" @click="markUpTo">{{ t('smith_select_up_to', { level: upTo }) }}</button>
                                <button class="smith-upto-step" :disabled="upTo >= breakLevels[breakLevels.length - 1]" @click="stepUpTo(1)">+</button>
                            </div>
                        </div>
                    </div>
                    <div class="smith-body" :class="{ flashing: listFlashing }">
                        <div v-if="!groups.length" class="smith-empty">{{ t('smith_empty') }}</div>
                        <div v-for="group in groups" :key="group.id" class="smith-group">
                            <div class="smith-group-title">{{ group.name }}</div>
                            <div class="smith-bricks">
                                <div v-for="entry in group.items" :key="entry.item.uid" class="smith-brick"
                                    :class="{ equipped: entry.item.isEquipped, maxed: tab === 'upgrade' && entry.maxed, marked: tab === 'break' && marked.includes(entry.item.uid) }">
                                    <ItemSlot :item="entry.item" :popup-no-choices="true" :popup-dismiss-on-click="true" @click="select(entry)" />
                                    <span v-if="entry.item.isEquipped" class="smith-brick-equipped">{{ t('smith_equipped_tag') }}</span>
                                    <span v-if="tab === 'break' && marked.includes(entry.item.uid)" class="smith-brick-check">✓</span>
                                    <span v-if="entry.better" class="smith-brick-better">▲</span>
                                    <span v-if="tab === 'upgrade' && entry.maxed" class="smith-brick-badge max">{{ t('smith_max_badge') }}</span>
                                    <span v-else-if="tab === 'upgrade'" class="smith-brick-badge">{{ entry.toFull }}<span class="smith-stone-glyph">◆</span></span>
                                    <span v-else class="smith-brick-badge break">+{{ entry.stones }}<span class="smith-stone-glyph">◆</span></span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div v-if="tab === 'upgrade' && wornBelowCap" class="smith-bar">
                        <span class="smith-bar-note">{{ equippedPlan.length ? t('smith_equipped_below_cap', { count: wornBelowCap }) : t('smith_need_stones') }}</span>
                        <button class="smith-forge" :disabled="!equippedPlan.length" @click="confirmUpgradeEquipped">
                            {{ t('smith_upgrade_all_button') }} · {{ equippedPlanCost }}<span class="smith-stone-glyph">◆</span>
                        </button>
                    </div>
                    <div v-if="tab === 'break'" class="smith-bar">
                        <button class="smith-select-button" :disabled="!groups.length" @click="markAll">{{ t('smith_select_all') }}</button>
                        <button class="smith-select-button" :disabled="!markedEntries.length" @click="clearMarks">{{ t('smith_select_clear') }}</button>
                        <span class="smith-bar-note">{{ t('smith_selected_count', { count: markedEntries.length }) }}</span>
                        <button class="smith-break-button" :disabled="!markedEntries.length" @click="confirmBreak">
                            {{ t('smith_break_button') }} · +{{ markedStones }}<span class="smith-stone-glyph">◆</span>
                        </button>
                    </div>
                </div>
            </template>

            <!-- detail mode: fixed controls column left, scrolling card columns right -->
            <div v-else class="smith-detail">
                <div class="smith-detail-controls">
                    <div v-if="selected.wearer" class="smith-worn-note">{{ t('smith_equipped_by', { name: selected.wearer.getName() }) }}</div>
                    <template v-if="!selected.maxed">
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
                        <div v-if="statChanges.length" class="smith-changes">
                            <div v-for="row in statChanges" :key="row.id" class="smith-change">
                                <span class="smith-change-name">{{ row.name }}</span>
                                <span class="smith-change-values">{{ row.from }} <span class="smith-change-arrow">➜</span> <span :class="row.good ? 'good' : 'bad'">{{ row.to }}</span></span>
                            </div>
                        </div>
                    </template>
                    <div v-else class="smith-maxed-note">{{ t('smith_max_badge') }}</div>
                    <button class="smith-cancel" @click="cancel">{{ t('smith_button_cancel') }}</button>
                </div>
                <div class="smith-detail-cards" :class="{ flashing: flashing }">
                    <ItemCard :item="selected.item" :character-id="selected.wearer?.id" />
                    <div v-if="preview" class="smith-arrow">➜</div>
                    <ItemCard v-if="preview" :item="preview" :character-id="selected.wearer?.id" :in-slot="selectedSlot" />
                </div>
            </div>

            <SmithConfirm v-if="confirmBox" :tone="confirmBox.tone" :header="confirmBox.header" :message="confirmBox.message"
                :accept-label="confirmBox.acceptLabel" :reject-label="confirmBox.rejectLabel"
                @accept="answer(true)" @reject="answer(false)" />
        </div>
    </div>`,
});

game.addComponent({ id: 'smith-station', slot: 'overlay', component: SmithStation });
