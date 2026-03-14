const { vue } = window.engine;
const { defineComponent, computed } = vue;

/**
 * Red bar overlay growing from bottom as health is lost.
 * Injected into the 'character-list-item' slot via CharacterFace overlaySlot.
 */
export const HealthOverlay = defineComponent({
    props: ['character'],
    setup(props) {
        const healthLost = computed(() => {
            if (!props.character) return 0;
            /** @type {Character} */
            const character = props.character;
            const ratio = character.getResourceRatio('health');
            return Math.max(0, 1 - ratio);
        });
        return { healthLost };
    },
    template: /*html*/`
    <div class="health-lost-overlay"
        :style="{ height: (healthLost * 100) + '%' }">
    </div>`
});
