/// <reference path="../dtypes.d.ts" />

const { game, vue } = window.engine;
const { computed, defineComponent } = vue;

// The map toolbar's Wait button: one click, one turn. Statuses tick, collectables regrow and
// the discover scan re-runs, so waiting out a buff can uncover something without leaving the room.
// @ts-ignore - Vue overload resolution false positive in .mjs
const WaitButton = defineComponent({
    setup() {
        const turn = computed(() => game.getState('turn') || 0);

        const showCounter = computed(() =>
            !!game.getData('plugins_data/turn_system/config_turns')?.show_turn_counter);

        const tooltip = game.getLine('turn_wait_tooltip') || 'Wait a turn';

        function wait() {
            game.getService('turns').advance(1);
            game.showNotification(game.getLine('turn_waited'));
        }

        return { turn, showCounter, tooltip, wait };
    },
    template: /*html*/`
        <div class="toolbar-item icon_wait" v-tooltip.top="tooltip" @click="wait"></div>
        <div v-if="showCounter" class="toolbar-item turn-counter" v-tooltip.top="tooltip">
            <span class="turn-counter-text">{{ turn }}</span>
        </div>
    `,
});

// Order below 20 puts it in the toolbar's left group, beside the encounter controls —
// past 20 it would land among the map controls, right of the dungeon name.
game.addComponent({
    id: 'toolbar-wait',
    slot: 'navigation-toolbar',
    component: WaitButton,
    order: 4,
});
