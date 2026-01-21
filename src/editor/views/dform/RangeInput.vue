<script setup lang="ts">
import { computed } from 'vue';
import InputNumber, { type InputNumberInputEvent } from 'primevue/inputnumber';

// Range value uses object format { min?: number, max?: number }
// This avoids issues with null values being stripped from arrays
export interface RangeValue {
  min?: number;
  max?: number;
}

const props = defineProps<{
  modelValue?: RangeValue | null;
  step?: number;
}>();

const step = computed(() => props.step ?? 1);

const emit = defineEmits(['update:modelValue']);

const minValue = computed(() => props.modelValue?.min ?? null);
const maxValue = computed(() => props.modelValue?.max ?? null);

// Emit object with only defined values, or null if both are unset
function emitRange(min: number | null, max: number | null) {
  if (min === null && max === null) {
    emit('update:modelValue', null);
  } else {
    const value: RangeValue = {};
    if (min !== null) value.min = min;
    if (max !== null) value.max = max;
    emit('update:modelValue', value);
  }
}

function onMinInput(event: InputNumberInputEvent) {
  const val = typeof event.value === 'number' ? event.value : null;
  emitRange(val, maxValue.value);
}

function onMaxInput(event: InputNumberInputEvent) {
  const val = typeof event.value === 'number' ? event.value : null;
  emitRange(minValue.value, val);
}

function onMinBlur() {
  const min = minValue.value;
  const max = maxValue.value;
  // Clamp min to not exceed max
  if (max !== null && min !== null && min > max) {
    emitRange(max, max);
  }
}

function onMaxBlur() {
  const min = minValue.value;
  const max = maxValue.value;
  // Clamp max to not be less than min
  if (min !== null && max !== null && max < min) {
    emitRange(min, min);
  }
}
</script>

<template>
  <div class="range-input">
    <InputNumber
      :modelValue="minValue"
      @input="onMinInput"
      @blur="onMinBlur"
      :step="step"
      showButtons
      mode="decimal"
      :maxFractionDigits="2"
      class="range-input-field"
    />
    <span class="range-separator">–</span>
    <InputNumber
      :modelValue="maxValue"
      @input="onMaxInput"
      @blur="onMaxBlur"
      :step="step"
      showButtons
      mode="decimal"
      :maxFractionDigits="2"
      class="range-input-field"
    />
  </div>
</template>

<style scoped>
.range-input {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.range-input-field {
  flex: 1;
  min-width: 0;
}

.range-separator {
  color: var(--p-text-color-secondary);
  font-weight: 500;
}
</style>
