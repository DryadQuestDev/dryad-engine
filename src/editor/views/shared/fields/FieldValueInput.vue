<script setup lang="ts">
import { computed } from 'vue';
import InputNumber from 'primevue/inputnumber';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import SelectButton from 'primevue/selectbutton';
import ToggleSwitch from 'primevue/toggleswitch';
import Slider from 'primevue/slider';
import FloatLabel from 'primevue/floatlabel';
import type { Schema, Schemable } from '../../../../utility/schema';
import type { EditorLayoutHint } from '../../../editorLayouts';
import FormFieldRenderer from '../../dform/FormFieldRenderer.vue';
import NumberMapInput from './NumberMapInput.vue';
import { idLabel, isNumberMap, isSimpleField } from './fieldHelpers';

/**
 * One value of a definition-driven field (an ability meta field or an effect aspect), typed by
 * the processed schema field and shaped by the editor-layout hint. With `label` it renders as a
 * floating-label field like the regular form; without, as a compact inline input for sentence rows.
 * Types without a compact input fall back to the regular form's field renderer.
 */
const props = defineProps<{
  field: Schemable;
  fieldKey: string;
  modelValue: any;
  hint?: EditorLayoutHint;
  label?: string;
  placeholder?: string;
  /** id -> display name, for choice options. */
  labels?: Map<string, string>;
  inputId?: string;
  /** Object holding the value and its schema, for the form-renderer fallback. */
  holder?: Record<string, any>;
  holderSchema?: Schema;
  /** Hover text; defaults to the schema field's tooltip as the regular form shows it, '' hides it. */
  tooltip?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: any] }>();

type Kind = 'number' | 'slider' | 'boolean' | 'select' | 'buttons' | 'multi' | 'text' | 'textarea' | 'numberMap' | 'form';

const kind = computed<Kind>(() => {
  const field = props.field;
  const widget = props.hint?.widget ?? 'auto';
  if (!isSimpleField(field)) return 'form';
  if (isNumberMap(field)) return 'numberMap';
  switch (field.type) {
    case 'number':
      return widget === 'slider' && props.hint?.min !== undefined && props.hint?.max !== undefined ? 'slider' : 'number';
    case 'boolean':
      return 'boolean';
    case 'chooseOne':
      return widget === 'buttons' ? 'buttons' : 'select';
    case 'chooseMany':
      return 'multi';
    case 'textarea':
      return 'textarea';
    default:
      return 'text';
  }
});

const tip = computed(() => props.tooltip ?? props.field?.tooltip ?? '');

const id = computed(() => props.inputId ?? `ai-${props.fieldKey}-${Math.random().toString(36).slice(2, 8)}`);

const choiceOptions = computed(() => {
  const options = (props.field.options ?? []).map((option: any) => {
    if (option && typeof option === 'object') return { label: String(option.label ?? option.value ?? option.id), value: option.value ?? option.id };
    return { label: idLabel(String(option), props.labels?.get(String(option))), value: option };
  });
  // A value the options no longer offer still shows, marked, so it can be seen and replaced.
  const known = new Set(options.map(option => option.value));
  const values = Array.isArray(props.modelValue) ? props.modelValue : (props.modelValue === undefined || props.modelValue === null || props.modelValue === '' ? [] : [props.modelValue]);
  for (const value of values) {
    if (!known.has(value)) options.push({ label: `${value} (missing)`, value });
  }
  return options;
});

const suffix = computed(() => (props.hint?.suffix ? ` ${props.hint.suffix}` : undefined));
const numberWidth = computed(() => `calc(4.6rem + ${(suffix.value?.length ?? 0) * 0.52}em)`);
const showButtons = computed(() => props.hint?.widget === 'stepper');

function update(value: any) {
  emit('update:modelValue', value);
}
</script>

<template>
  <!-- Fallback: the regular form field (rich text, files, lists, nested schemas) -->
  <div v-if="kind === 'form'" class="ai-form">
    <FormFieldRenderer :base-field-schema="field" :field-key="fieldKey" :item-data="holder ?? {}"
      :root-schema="holderSchema ?? {}" :field-id="id" :modelValue="modelValue"
      @update:modelValue="update" :form-data="holder ?? null" :force-active="true" />
  </div>

  <NumberMapInput v-else-if="kind === 'numberMap'" :field="field" :modelValue="modelValue" :label="label"
    :labels="labels" :tooltip="tip" @update:modelValue="update" />

  <label v-else-if="kind === 'boolean'" class="ai-toggle" :class="{ labelled: !!label }" v-tooltip.top="tip">
    <ToggleSwitch :modelValue="!!modelValue" @update:modelValue="update" :inputId="id" />
    <span v-if="label" class="ai-toggle-label">{{ label }}</span>
  </label>

  <div v-else-if="kind === 'slider'" class="ai-slider" :class="{ labelled: !!label }" v-tooltip.top="tip">
    <span v-if="label" class="ai-slider-label">{{ label }}</span>
    <Slider :modelValue="typeof modelValue === 'number' ? modelValue : hint?.min ?? 0"
      @update:modelValue="(v: number | number[]) => update(Array.isArray(v) ? v[0] : v)"
      :min="hint?.min" :max="hint?.max" :step="hint?.step ?? 1" class="ai-slider-track" />
    <span class="ai-slider-value">{{ modelValue ?? '–' }}{{ suffix ?? '' }}</span>
  </div>

  <div v-else-if="kind === 'buttons'" class="ai-buttons" :class="{ labelled: !!label }" v-tooltip.top="tip">
    <span v-if="label" class="ai-slider-label">{{ label }}</span>
    <SelectButton :modelValue="modelValue" @update:modelValue="update" :options="choiceOptions"
      optionLabel="label" optionValue="value" size="small" />
  </div>

  <component :is="label ? FloatLabel : 'span'" v-else :variant="label ? 'on' : undefined" class="ai-wrap"
    :class="{ labelled: !!label, 'ai-inline': !label }" v-tooltip.top="tip">
    <InputNumber v-if="kind === 'number'" :modelValue="modelValue" @update:modelValue="update"
      @input="(e: any) => update(typeof e.value === 'number' ? e.value : null)" :inputId="id"
      :suffix="suffix" :step="hint?.step ?? 1" :min="hint?.min" :max="hint?.max" :showButtons="showButtons"
      :useGrouping="false" :maxFractionDigits="3" :placeholder="label ? undefined : placeholder" size="small"
      class="ai-number" :inputStyle="{ width: label ? '100%' : numberWidth }" />
    <Select v-else-if="kind === 'select'" :modelValue="modelValue" @update:modelValue="update" :inputId="id"
      :options="choiceOptions" optionLabel="label" optionValue="value" :filter="choiceOptions.length > 7" showClear
      :placeholder="label ? undefined : placeholder" size="small" appendTo="body" class="ai-select" />
    <MultiSelect v-else-if="kind === 'multi'" :modelValue="Array.isArray(modelValue) ? modelValue : []"
      @update:modelValue="update" :inputId="id" :options="choiceOptions" optionLabel="label" optionValue="value"
      filter display="chip" :placeholder="label ? undefined : placeholder" size="small" appendTo="body"
      class="ai-multi" />
    <Textarea v-else-if="kind === 'textarea'" :modelValue="modelValue ?? ''" @update:modelValue="update" :id="id"
      autoResize rows="2" class="ai-textarea" />
    <InputText v-else :modelValue="modelValue ?? ''" @update:modelValue="update" :id="id"
      :placeholder="label ? undefined : placeholder" size="small" class="ai-text" />
    <label v-if="label" :for="id">{{ label }}</label>
  </component>
</template>

<style scoped>
.ai-wrap.labelled {
  display: block;
  width: 100%;
}

.ai-wrap.labelled :deep(.p-inputnumber),
.ai-wrap.labelled :deep(.p-select),
.ai-wrap.labelled :deep(.p-multiselect),
.ai-wrap.labelled :deep(.p-inputtext) {
  width: 100%;
}

.ai-inline {
  display: inline-flex;
  vertical-align: middle;
}

.ai-select {
  min-width: 8rem;
}

.ai-multi {
  min-width: 10rem;
  max-width: 26rem;
}

.ai-text {
  width: 10rem;
}

.ai-textarea {
  width: 100%;
}

.ai-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
  vertical-align: middle;
}

.ai-toggle.labelled {
  min-height: 2.4rem;
}

.ai-toggle-label,
.ai-slider-label {
  font-size: 0.85rem;
  color: var(--editor-text);
}

.ai-slider {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  vertical-align: middle;
}

.ai-slider.labelled {
  display: flex;
  width: 100%;
  min-height: 2.4rem;
}

.ai-slider-track {
  width: 8rem;
}

.ai-slider.labelled .ai-slider-track {
  flex: 1;
}

.ai-slider-value {
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
  min-width: 3rem;
}

.ai-buttons {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  vertical-align: middle;
}

.ai-buttons.labelled {
  display: flex;
  flex-wrap: wrap;
  min-height: 2.4rem;
}

.ai-form {
  width: 100%;
}

.ai-form :deep(.field-container) {
  margin-bottom: 0;
}

/* File fields: the form's 150px preview would squeeze the path box to a sliver in a popup cell,
   so the preview shrinks to a thumbnail and the path box takes the rest of the width. */
.ai-form :deep(.inline-preview-wrapper) {
  width: 46px;
  height: 46px;
}

.ai-form :deep(.file-input--single > .input-wrapper) {
  width: 100%;
  min-width: 0;
}

.ai-form :deep(.file-input-container) {
  flex: 1 1 auto;
  min-width: 0;
}

.p-float-label-variant-on > label,
.ai-wrap.labelled > label {
  background: var(--editor-surface);
  padding: 0 0.25rem;
}
</style>
