<script setup lang="ts">
import { computed } from 'vue';
import { SettingsObject } from '../../../schemas/settingsSchema'; // Assuming SettingsObject can be used here
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import ToggleSwitch from 'primevue/toggleswitch';
import ColorPicker from 'primevue/colorpicker';
import { Global } from '../../global';

const global = Global.getInstance();

const props = defineProps<{
  option: SettingsObject; // Type for the field's schema/options
  modelValue: any; // Value of the field
}>();

const emit = defineEmits(['update:modelValue']);

const internalValue = computed({
  get: () => props.modelValue,
  set: (value) => {
    emit('update:modelValue', value);
  }
});

const fieldId = computed(() => `gfield-${props.option.id}`);

// For options that should display localized labels
const displayOptions = computed(() => {
  if (props.option.type === 'chooseOne' || props.option.type === 'chooseMany') {
    const values = props.option.values || [];

    // If localizeValues flag is set, use getString for each value
    // Convention: option_id.value (e.g., "typing_speed.slow")
    if (props.option.localizeValues) {
      return values.map(value => ({
        label: global.getString(`${props.option.id}.${value}`),
        value: value
      }));
    }

    // Otherwise, use values directly
    return values.map(value => ({
      label: value,
      value: value
    }));
  }
  return [];
});

</script>

<template>
  <div class="g-field-renderer" v-tooltip.left="props.option.tooltip">
    <label :for="fieldId" class="g-field-label">{{ props.option.label }}</label>

    <!-- String Input -->
    <!-- @vue-ignore-->
    <InputText
      v-if="props.option.type === 'string'"
      :id="fieldId"
      v-model="internalValue"
      class="g-field-input"
    />

    <!-- Number Input -->
    <InputNumber
      v-else-if="props.option.type === 'number'"
      :inputId="fieldId"
      v-model="internalValue"
      mode="decimal"
      :maxFractionDigits="2"
      class="g-field-input"
      showButtons
    />

    <!-- Boolean Switch -->
    <div v-else-if="props.option.type === 'boolean'" class="g-field-boolean-wrapper">
      <ToggleSwitch
        :inputId="fieldId"
        v-model="internalValue"
      />
    </div>

    <!-- Choose One (Dropdown/Select) -->
    <Select
      v-else-if="props.option.type === 'chooseOne'"
      :inputId="fieldId"
      v-model="internalValue"
      :options="displayOptions"
      optionLabel="label"
      optionValue="value"
      class="g-field-input"
      filter
    />

    <!-- Choose Many (MultiSelect) -->
    <MultiSelect
      v-else-if="props.option.type === 'chooseMany'"
      :inputId="fieldId"
      v-model="internalValue"
      :options="displayOptions"
      optionLabel="label"
      optionValue="value"
      class="g-field-input"
      display="chip"
      filter
    />

    <!-- Color Picker -->
    <ColorPicker
      v-else-if="props.option.type === 'color'"
      :inputId="fieldId"
      v-model="internalValue"
      class="g-field-color-picker"
      appendTo="body"
      
    />

  </div>
</template>

<style scoped>
.g-field-renderer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  text-align: right;
}

.g-field-label {
  font-weight: 500;
  min-width: 120px; /* Adjust as needed */
  flex-shrink: 0;
}

.g-field-input {
  width: 100%;
  flex-grow: 1;
}
.g-field-input .p-inputtext {  /* Target PrimeVue's inner input if needed */
    width: 100%;
}
.g-field-input.p-select, .g-field-input.p-multiselect { /* Target PrimeVue's Select/MultiSelect */
    width: 100%;
}

.g-field-boolean-wrapper {
  display: flex;
  align-items: center;
}

.unsupported-field {
  color: red;
  font-style: italic;
  padding: 0.5rem 0;
}

</style>
