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
</script>

<template>
    <div class="overlay-container">
        <component :is="overlayComponent" v-if="overlayComponent" />
    </div>
</template>

<style scoped>
.overlay-container {
    pointer-events: auto;
}
</style>
