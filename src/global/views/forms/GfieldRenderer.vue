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
import { Game } from '../../../game/game';

const global = Global.getInstance();

// Resolve a localized label for a chooseOne/chooseMany option value (convention `<settingId>.<value>`).
// In-game, read the merged game/plugin locale via game.getLine (guarded so the Game singleton is
// never instantiated on the landing/editor); otherwise the engine locale; otherwise the raw value.
function resolveOptionLabel(settingId: string, value: string): string {
  const key = `${settingId}.${value}`;
  if (global.engineState.value === 'game') {
    const gl = Game.getInstance().getLine(key);
    if (gl && gl !== `[${key}]`) return gl;
  }
  const ev = global.getString(key);
  if (ev && ev !== `[${key}]`) return ev;
  return value;
}

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

    // If localizeValues flag is set, resolve a localized label for each value
    // (game locale in-game, engine locale otherwise, raw value fallback).
    if (props.option.localizeValues) {
      return values.map(value => ({
        label: resolveOptionLabel(props.option.id, value),
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
      panelClass="dark-mode-dropdown"
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
      panelClass="dark-mode-dropdown"
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
/* Fixed label column + flexible control column, so every row's title and control
   start at the same x regardless of label length or field type. Width comes from
   .gform so all rows in a form share one track. */
.g-field-renderer {
  display: grid;
  grid-template-columns: var(--gfield-label-width, 130px) minmax(0, 1fr);
  align-items: center;
  column-gap: 0.75rem;
  width: 100%;
}

.g-field-label {
  font-weight: 500;
  text-align: left;
  min-width: 0;
  overflow-wrap: anywhere; /* long labels wrap inside the column instead of widening it */
  line-height: 1.3;
}

/* min-width: 0 keeps a chip-filled MultiSelect or a long selected value from
   bulging past the control track. */
.g-field-input {
  width: 100%;
  min-width: 0;
}

/* Small controls sit at the control column's start edge rather than stretching. */
.g-field-boolean-wrapper {
  display: flex;
  align-items: center;
  justify-self: start;
}

.g-field-color-picker {
  justify-self: start;
}

@media (max-width: 480px) {
  .g-field-renderer {
    grid-template-columns: 1fr;
    row-gap: 0.35rem;
  }
}

</style>
