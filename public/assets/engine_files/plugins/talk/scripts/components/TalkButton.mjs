/// <reference path="../dtypes.d.ts" />

const { game, vue } = window.engine;
const { computed, defineComponent } = vue;

// @ts-ignore - Vue overload resolution false positive in .mjs
const TalkButton = defineComponent({
    props: ['character'],
    setup(/** @type {{ character: Character }} */ props) {
        const char = computed(() => props.character);
        const dialogue = computed(() => char.value?.getTrait('dialogue') || '');
        const disabled = computed(() => !game.canUseItems());
        const label = game.getLine('talk_button_label') || 'Talk';

        const openDialogue = () => {
            if (!dialogue.value || disabled.value) return;
            game.playScene(dialogue.value);
        };

        return { dialogue, disabled, label, openDialogue };
    },
    template: /*html*/`
        <button v-if="dialogue" class="talk-button" :disabled="disabled" @click="openDialogue">
            <i class="pi pi-comments"></i>
            <span>{{ label }}</span>
        </button>
    `,
});

game.addComponent({
    id: 'talk_button',
    slot: 'character-sheet-top',
    component: TalkButton,
    order: -1,
});
