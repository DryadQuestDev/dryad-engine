<script setup lang="ts">
import { computed } from 'vue';
import DatePicker from 'primevue/datepicker';
import { parseCalendarDate, formatCalendarDate } from '../../../utility/calendarDate';

// A `date` field is stored as a calendar date string ("2026-11-05"): readable in JSON, sorts as
// text, and carries no time zone.
const props = defineProps<{
  modelValue?: string | null;
  inputId?: string;
}>();

const emit = defineEmits(['update:modelValue']);

const date = computed<Date | null>({
  get: () => parseCalendarDate(props.modelValue),
  set: (value) => emit('update:modelValue', value ? formatCalendarDate(value) : null),
});
</script>

<template>
  <DatePicker v-model="date" :inputId="inputId" dateFormat="yy-mm-dd" showIcon iconDisplay="input"
    showButtonBar class="w-full" />
</template>
