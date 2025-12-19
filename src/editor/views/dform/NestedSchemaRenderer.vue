<script setup lang="ts">
import { computed } from 'vue';
import type { PropType } from 'vue';
import type { Schema, Schemable } from '../../../utility/schema';
import FormFieldRenderer from './FormFieldRenderer.vue'; // Assuming FormFieldRenderer is in the same directory

const props = defineProps({
  schema: {
    type: Object as PropType<Schema>,
    required: true
  },
  modelValue: {
    type: Object as PropType<Record<string, any>>,
    required: true
  },
  fieldIdPrefix: { // For creating unique IDs for nested fields
    type: String,
    default: 'nested'
  },
  coreDataForNestedSchema: { // Core data relevant to this nested structure
    type: Object as PropType<Record<string, any> | null>,
    default: null
  },
  // ADD NEW PROPS
  itemData: { // The full data object for the top-level item this nested schema is part of
    type: Object as PropType<Record<string, any>>,
    required: true
  },
  rootSchema: { // The schema for the full top-level item
    type: Object as PropType<Schema>,
    required: true
  }
});

const emit = defineEmits(['update:modelValue']);

const internalObject = computed(() => props.modelValue || {});

function updateNestedField(key: string | number | symbol, value: any) {
  const newObject = { ...internalObject.value, [key as string]: value };
  emit('update:modelValue', newObject);
}

</script>

<template>
  <div class="nested-schema-renderer">
    <div v-if="!props.schema || Object.keys(props.schema).length === 0" class="text-orange-500">
      No schema defined for this nested object, or schema is empty.
    </div>
    <div v-for="(fieldSchema, fieldKey) in schema" :key="fieldKey.toString()" class="form-field-wrapper">
      <FormFieldRenderer
        :base-field-schema="fieldSchema" 
        :field-key="fieldKey.toString()"
        :item-data="props.itemData"
        :root-schema="props.rootSchema"
        :field-id="`${props.fieldIdPrefix}-${fieldKey.toString()}`"
        :model-value="internalObject[fieldKey.toString()]" 
        @update:model-value="newValue => updateNestedField(fieldKey.toString(), newValue)"
        :parent-core-data-item="coreDataForNestedSchema"
        :form-data="internalObject" 
        :parent-is-array="false" 
      />
    </div>
  </div>
</template>

<style scoped>
.nested-schema-renderer {
  background-color: var(--p-surface-50); /* Or another suitable background from your theme */
  border: 1px solid var(--p-surface-200);
  border-left: 4px solid var(--p-primary-color); /* Accent left border */
  border-radius: var(--p-border-radius);
  padding: 1rem;
  margin-top: 0.5rem; /* Optional: space above the nested block */
  /* Ensure other utility classes like p-3, bg-surface-50, border-round, etc. 
     are removed from the root div in the template if they conflict or are redundant 
     with these explicit styles. For now, we assume this CSS block takes precedence or combines. 
     The template already has "nested-schema-renderer" class. */
}

.form-field-wrapper {
  /* If you need to adjust spacing for fields *inside* the nested renderer: */
  /* margin-bottom: 0.75rem; */
}

.text-orange-500 {
  color: var(--p-orange-500);
  margin-bottom: 0.5rem; /* Add some space if schema is empty */
}
</style> 