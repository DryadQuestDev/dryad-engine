/// <reference path="../dtypes.d.ts" />

const { vue } = window.engine;
const { defineComponent, ref, onMounted, onBeforeUnmount } = vue;

// The smith station's confirm box. It renders inside the station panel, so a game that skins
// #smith-station dresses it too: the accept button carries the station's own button class
// (`smith-forge` or `smith-break-button`, by tone) and the reject button is a `smith-cancel`.
// The accept button takes focus, so Enter confirms; Escape or a click outside the box rejects.
export const SmithConfirm = defineComponent({
    props: {
        header: { type: String, default: '' },
        message: { type: String, default: '' },
        acceptLabel: { type: String, default: '' },
        rejectLabel: { type: String, default: '' },
        /** 'upgrade' or 'break' — picks the accept button's look. */
        tone: { type: String, default: 'upgrade' },
    },
    emits: ['accept', 'reject'],
    setup(props, { emit }) {
        const acceptButton = ref(/** @type {HTMLButtonElement | null} */ (null));

        // Marked handled so the game does not also open its menu on this Escape.
        function onKey(/** @type {KeyboardEvent} */ event) {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            emit('reject');
        }

        onMounted(() => {
            acceptButton.value?.focus();
            document.addEventListener('keydown', onKey);
        });
        onBeforeUnmount(() => document.removeEventListener('keydown', onKey));

        return { acceptButton, emit };
    },
    template: /*html*/`
    <div class="smith-confirm-backdrop" @click.self="emit('reject')">
        <div class="smith-confirm" :class="tone" role="alertdialog" aria-modal="true">
            <div class="smith-confirm-header">{{ header }}</div>
            <div class="smith-confirm-message">{{ message }}</div>
            <div class="smith-confirm-actions">
                <button class="smith-cancel" @click="emit('reject')">{{ rejectLabel }}</button>
                <button ref="acceptButton" :class="tone === 'break' ? 'smith-break-button' : 'smith-forge'"
                    @click="emit('accept')">{{ acceptLabel }}</button>
            </div>
        </div>
    </div>`,
});
