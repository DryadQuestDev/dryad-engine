<script setup lang="ts">
import { computed } from 'vue';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import Button from 'primevue/button';
import type { Schemable } from '../../../../utility/schema';
import { idLabel } from './fieldHelpers';

// A `schema` field whose sub-fields are all numbers (ability costs): one row per key that is
// set, and a picker for the keys that are not.
const props = defineProps<{
  field: Schemable;
  modelValue: Record<string, number> | null | undefined;
  label?: string;
  labels?: Map<string, string>;
  tooltip?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: Record<string, number> | undefined] }>();

const current = computed<Record<string, number>>(() => (props.modelValue && typeof props.modelValue === 'object') ? props.modelValue : {});
const keys = computed(() => Object.keys(props.field.objects ?? {}));
const setKeys = computed(() => Object.keys(current.value));
const addOptions = computed(() => keys.value
  .filter(key => !(key in current.value))
  .map(key => ({ label: idLabel(key, props.labels?.get(key)), value: key })));

function write(next: Record<string, number>) {
  emit('update:modelValue', Object.keys(next).length ? next : undefined);
}

function setValue(key: string, value: number | null) {
  const next = { ...current.value };
  next[key] = value ?? 0;
  write(next);
}

function remove(key: string) {
  const next = { ...current.value };
  delete next[key];
  write(next);
}

function add(key: string | null) {
  if (!key) return;
  write({ ...current.value, [key]: 0 });
}
</script>

<template>
  <div class="number-map">
    <span v-if="label" class="nm-label" v-tooltip.top="tooltip">{{ label }}</span>
    <div class="nm-rows">
      <span v-for="key in setKeys" :key="key" class="nm-row">
        <span class="nm-key" v-tooltip.top="labels?.get(key) || undefined">{{ key }}</span>
        <InputNumber :modelValue="current[key]" @update:modelValue="(v: number | null) => setValue(key, v)"
          @input="(e: any) => typeof e.value === 'number' && setValue(key, e.value)" size="small"
          :useGrouping="false" :maxFractionDigits="3" inputClass="nm-input" />
        <Button icon="pi pi-times" text rounded size="small" severity="secondary" class="nm-remove" @click="remove(key)" />
      </span>
      <Select v-if="addOptions.length" :modelValue="null" @update:modelValue="add" :options="addOptions"
        optionLabel="label" optionValue="value" placeholder="+ add" size="small" filter appendTo="body"
        class="nm-add" />
    </div>
  </div>
</template>

<style scoped>
.number-map {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.nm-label {
  font-size: 0.75rem;
  color: var(--editor-text-muted);
}

.nm-rows {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.nm-row {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.1rem 0.1rem 0.1rem 0.45rem;
  border: 1px solid var(--editor-border);
  border-radius: 4px;
  background: var(--editor-surface);
}

.nm-key {
  font-family: var(--font-family-mono);
  font-size: 0.8rem;
  color: var(--editor-text);
}

.nm-row :deep(.nm-input) {
  width: 4.5rem;
  padding: 0.2rem 0.4rem;
}

.nm-remove {
  width: 1.6rem !important;
  height: 1.6rem !important;
}

.nm-add {
  min-width: 7rem;
}
</style>
