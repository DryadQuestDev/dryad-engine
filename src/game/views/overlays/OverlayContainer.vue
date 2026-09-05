<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';

const game = Game.getInstance();

const overlayComponent = computed(() => {
    const overlayState = game.coreSystem.getState<string>('overlay_state');
    if (overlayState) {
        const components = game.coreSystem.getComponentsBySlot('overlay');
        const component = components.find(c => c.id === overlayState);
        return component?.component;
    }
    return null;
});

const missingOverlayId = computed(() => {
    const overlayState = game.coreSystem.getState<string>('overlay_state');
    return overlayState && !overlayComponent.value ? overlayState : null;
});
</script>

<template>
    <div class="overlay-container">
        <component :is="overlayComponent" v-if="overlayComponent" />
        <!-- A set overlay_state with no matching component is a wiring bug — fail loudly like PopupContainer. -->
        <div v-else-if="missingOverlayId" class="overlay-missing">
            Overlay component not found for id: {{ missingOverlayId }}
        </div>
    </div>
</template>

<style scoped>
.overlay-container {
    pointer-events: auto;
}

.overlay-missing {
    position: absolute;
    top: 40%;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 20px;
    background: rgba(120, 20, 20, 0.9);
    color: #fff;
    border-radius: 8px;
    font-size: 14px;
    z-index: 600;
}
</style>
