/// <reference path="../dtypes.d.ts" />

const { game, vue } = window.engine;
const { computed, defineComponent } = vue;

// @ts-ignore - Vue overload resolution false positive in .mjs
const XpBar = defineComponent({
    props: ['character'],
    setup(/** @type {{ character: Character }} */ props) {
        const char = computed(() => props.character);

        const hasLevel = computed(() => (char.value?.getTrait('level') || 0) > 0);
        const level = computed(() => char.value?.getTrait('level') || 0);
        const currentXp = computed(() => char.value?.getResource('xp') || 0);
        const maxXp = computed(() => char.value?.getStat('xp') || 1);
        const lblLevel = game.getLine('xp_label_level') || 'Lv.';

        return { hasLevel, level, currentXp, maxXp, lblLevel };
    },
    template: /*html*/`
        <div v-if="hasLevel" class="xp-bar-container">
            <span class="xp-level-badge">{{ lblLevel }} {{ level }}</span>
            <div class="xp-bar-track">
                <div class="xp-bar-fill" :style="{ width: (currentXp / maxXp * 100) + '%' }"></div>
                <span class="xp-bar-text">{{ currentXp }} / {{ maxXp }}</span>
            </div>
        </div>
    `,
});

game.addComponent({
    id: 'xp_bar',
    slot: 'character-sheet-top',
    component: XpBar,
    order: 0,
});
