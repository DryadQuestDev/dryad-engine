<script setup lang="ts">
import { Game } from '../game';
import { computed } from 'vue';

const props = defineProps<{
  slot: string;
}>();

const game = Game.getInstance();
const components = computed(() => game.coreSystem.getComponentsBySlot(props.slot));

// For navigation-toolbar slot, filter components based on minimized state
const visibleComponents = computed(() => {
  if (props.slot === 'navigation-toolbar' && game.dungeonSystem.toolbarMinimized.value) {
    // When minimized, only show the minimize button
    return components.value.filter(comp => comp.id === 'toolbar-minimize');
  }
  return components.value;
});
</script>

<template>
  <component v-for="comp in visibleComponents" :key="comp.id" :is="comp.component" v-bind="comp.props" />
</template>
