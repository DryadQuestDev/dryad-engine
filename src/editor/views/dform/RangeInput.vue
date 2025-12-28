<script setup lang="ts">
import { computed } from 'vue';
import InputNumber, { type InputNumberInputEvent } from 'primevue/inputnumber';

const props = defineProps<{
  modelValue?: [number | null, number | null] | null;
  step?: number;
}>();

const step = computed(() => props.step ?? 1);

const emit = defineEmits(['update:modelValue']);

const minValue = computed(() => props.modelValue?.[0] ?? null);
const maxValue = computed(() => props.modelValue?.[1] ?? null);

function onMinInput(event: InputNumberInputEvent) {
  const val = typeof event.value === 'number' ? event.value : null;
  emit('update:modelValue', [val, maxValue.value]);
}

function onMaxInput(event: InputNumberInputEvent) {
  const val = typeof event.value === 'number' ? event.value : null;
  emit('update:modelValue', [minValue.value, val]);
}

function onMinBlur() {
  const min = minValue.value;
  const max = maxValue.value;
  // Clamp min to not exceed max
  if (max !== null && min !== null && min > max) {
    emit('update:modelValue', [max, max]);
  }
}

function onMaxBlur() {
  const min = minValue.value;
  const max = maxValue.value;
  // Clamp max to not be less than min
  if (min !== null && max !== null && max < min) {
    emit('update:modelValue', [min, min]);
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
