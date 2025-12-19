<script setup lang="ts">
import { computed } from 'vue';
import ToggleSwitch from 'primevue/toggleswitch';

const props = defineProps({
  modelValue: {
    type: [Boolean, null, undefined] as any,
    default: undefined
  },
  inputId: {
    type: String,
    default: undefined
  }
});

const emit = defineEmits(['update:modelValue']);

// Cycle through states: undefined → true → false → undefined
function cycleState() {
  const current = props.modelValue;

  if (current === undefined || current === null) {
    // From undefined → true
    emit('update:modelValue', true);
  } else if (current === true) {
    // From true → false
    emit('update:modelValue', false);
  } else {
    // From false → undefined (back to using core value)
    emit('update:modelValue', undefined);
  }
}

// Computed to show what state we're in for the icon
const stateIcon = computed(() => {
  const val = props.modelValue;
  if (val === undefined || val === null) return 'pi-minus'; // Indeterminate (use core)
  if (val === true) return 'pi-check'; // True (override true)
  return 'pi-times'; // False (override false)
});

// Compute CSS classes for visual state
const stateClass = computed(() => {
  const val = props.modelValue;
  if (val === undefined || val === null) return 'state-undefined';
  if (val === false) return 'state-false';
  return 'state-true';
});
</script>

<template>
  <div class="tri-state-switch" @click.stop="cycleState">
    <ToggleSwitch
      :inputId="inputId"
      :modelValue="modelValue === true"
      :class="stateClass"
      style="pointer-events: none;"
    >
      <template #handle>
        <i :class="['!text-xs pi', stateIcon]" />
      </template>
    </ToggleSwitch>
  </div>
</template>

<style scoped>
/* Three-State Boolean Switch Styles */
.tri-state-switch {
  cursor: pointer;
  display: inline-block;
}

/* State: undefined/null (use core value) - gray/neutral color */
.tri-state-switch :deep(.state-undefined .p-toggleswitch-slider) {
  background-color: var(--p-surface-400) !important;
}

/* State: false (override to false) - red/danger color */
.tri-state-switch :deep(.state-false .p-toggleswitch-slider) {
  background-color: var(--p-red-500) !important;
}

/* State: true (override to true) - default green color, no override needed */
</style>
