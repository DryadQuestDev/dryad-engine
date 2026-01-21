<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useSortable } from '@vueuse/integrations/useSortable';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';

// Value can be string[] (OR mode) or { $all: string[] } (AND mode)
export type StringArrayValue = string[] | { $all: string[] } | null | undefined;

const props = defineProps<{
  modelValue?: StringArrayValue;
  label?: string;
  tooltip?: string;
  allowAndMode?: boolean;
}>();

const emit = defineEmits(['update:modelValue']);

// Local state
const listContainer = ref<HTMLElement | null>(null);
const localStringArray = ref<string[]>([]);
const isAndMode = ref(false);

// Detect incoming value format and sync to local state
watch(() => props.modelValue, (newVal) => {
  // Detect $all format (AND mode)
  if (newVal && typeof newVal === 'object' && !Array.isArray(newVal) && '$all' in newVal) {
    isAndMode.value = true;
    const arr = newVal.$all || [];
    const needsEmptyField = arr.length === 0 || arr[arr.length - 1] !== '';
    const newState = needsEmptyField ? [...arr, ''] : [...arr];
    if (JSON.stringify(newState) !== JSON.stringify(localStringArray.value)) {
      localStringArray.value = newState;
    }
  } else if (Array.isArray(newVal)) {
    isAndMode.value = false;
    const needsEmptyField = newVal.length === 0 || newVal[newVal.length - 1] !== '';
    const newState = needsEmptyField ? [...newVal, ''] : [...newVal];
    if (JSON.stringify(newState) !== JSON.stringify(localStringArray.value)) {
      localStringArray.value = newState;
    }
  } else {
    isAndMode.value = false;
    localStringArray.value = [''];
  }
}, { immediate: true, deep: true });

// Emit changes with proper format based on AND mode
function emitValue() {
  const listToEmit = [...localStringArray.value];
  const filtered = listToEmit.length > 0 && listToEmit[listToEmit.length - 1] === ''
    ? listToEmit.slice(0, -1)
    : listToEmit;

  // Transform based on AND mode
  const output = isAndMode.value ? { $all: filtered } : filtered;

  // Compare with current prop value
  const currentPropValue = props.modelValue;
  if (JSON.stringify(output) !== JSON.stringify(currentPropValue)) {
    emit('update:modelValue', output);
  }
}

// Watch local state for changes (user input, sorting, deletion) and auto-add/emit
watch(localStringArray, (newList) => {
  // Auto-add new field if the last one is filled
  if (newList.length > 0 && newList[newList.length - 1] !== '') {
    localStringArray.value.push('');
  }
  // Remove duplicate empty field at the end
  else if (newList.length > 1 && newList[newList.length - 1] === '' && newList[newList.length - 2] === '') {
    localStringArray.value.pop();
    return;
  }

  emitValue();
}, { deep: true });

// Watch AND mode changes and re-emit with new format
watch(isAndMode, () => {
  emitValue();
});

// Setup sorting
useSortable(listContainer, localStringArray, {
  handle: '.drag-handle',
  animation: 150,
  filter: '.non-draggable-empty',
  preventOnFilter: false,
});

function deleteStringItem(index: number) {
  if (localStringArray.value.length === 1 && localStringArray.value[0] === '') return;
  localStringArray.value.splice(index, 1);
  if (localStringArray.value.length === 0) {
    localStringArray.value.push('');
  }
}

const canDelete = computed(() => {
  return !(localStringArray.value.length === 1 && localStringArray.value[0] === '');
});
</script>

<template>
  <div class="string-array-input">
    <div class="string-array-header">
      <label v-if="label" class="block font-medium">{{ label }}</label>
      <div v-if="allowAndMode" class="and-mode-toggle">
        <ToggleSwitch v-model="isAndMode" inputId="and-mode-switch" />
        <label for="and-mode-switch" class="text-sm">Match All</label>
      </div>
    </div>
    <div ref="listContainer" class="space-y-2">
      <div v-for="(item, index) in localStringArray" :key="index" class="flex items-center gap-2 string-array-item"
        :class="{ 'non-draggable-empty': index === localStringArray.length - 1 && item === '' }">
        <Button icon="pi pi-bars" text rounded class="drag-handle cursor-move p-button-sm"
          aria-label="Drag to reorder" />
        <InputText :model-value="localStringArray[index]"
          @update:model-value="val => localStringArray[index] = val ?? ''" class="flex-grow" />
        <Button icon="pi pi-trash" severity="danger" class="p-button-sm" aria-label="Remove Item"
          @click="deleteStringItem(index)" :disabled="!canDelete" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.string-array-input {
  width: 100%;
}

.string-array-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.and-mode-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.and-mode-toggle label {
  color: var(--p-text-color-secondary);
  cursor: pointer;
}

.string-array-item {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
}
</style>
