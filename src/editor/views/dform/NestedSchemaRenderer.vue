<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import type { PropType } from 'vue';
import type { Schema, Schemable } from '../../../utility/schema';
import FormFieldRenderer from './FormFieldRenderer.vue';
import { Editor } from '../../../editor/editor';

const editor = Editor.getInstance();


// --- Progressive field rendering ---
const FIELD_BATCH = 8;
const renderedFieldCount = ref(FIELD_BATCH);

const props = defineProps({
  schema: {
    type: Object as PropType<Schema>,
    required: true
  },
  modelValue: {
    type: Object as PropType<Record<string, any>>,
    default: () => ({})
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
  },
  filterKey: { // Key to look up filter text in editor.schemaKeyFilters
    type: String,
    default: ''
  },
  hideEmpty: {
    type: Boolean,
    default: false
  },
  forceActive: {
    type: Boolean,
    default: false
  },
  toggleIdPrefix: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['update:modelValue']);

const internalObject = computed(() => props.modelValue || {});

function isEmpty(value: any): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

const filteredSchema = computed(() => {
  const filterText = props.filterKey ? editor.schemaKeyFilters.value[props.filterKey] : '';
  if (!filterText && !props.hideEmpty) {
    return props.schema;
  }
  const filtered: Schema = {};
  for (const key in props.schema) {
    if (filterText && !key.toLowerCase().includes(filterText.toLowerCase())) continue;
    if (!filterText && props.hideEmpty && isEmpty(internalObject.value[key])) continue;
    filtered[key] = props.schema[key];
  }
  return filtered;
});

// Progressive field rendering: render fields in batches to avoid blocking
const schemaEntries = computed(() => Object.entries(filteredSchema.value));
const visibleEntries = computed(() => schemaEntries.value.slice(0, renderedFieldCount.value));
let _rafId: number | null = null;

function startProgressiveFieldRender(total: number) {
  if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
  renderedFieldCount.value = Math.min(FIELD_BATCH, total);

  if (renderedFieldCount.value < total) {
    function renderNextBatch() {
      if (renderedFieldCount.value >= total) {
        _rafId = null;
        return;
      }
      renderedFieldCount.value = Math.min(renderedFieldCount.value + FIELD_BATCH, total);
      _rafId = requestAnimationFrame(renderNextBatch);
    }
    _rafId = requestAnimationFrame(renderNextBatch);
  }
}

watch(schemaEntries, (entries) => {
  startProgressiveFieldRender(entries.length);
}, { immediate: true });

onUnmounted(() => {
  if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
});

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
    <div v-for="([fieldKey, fieldSchema]) in visibleEntries" :key="fieldKey" class="form-field-wrapper">
      <FormFieldRenderer
        :base-field-schema="fieldSchema"
        :field-key="fieldKey"
        :item-data="props.itemData"
        :root-schema="props.rootSchema"
        :field-id="`${props.fieldIdPrefix}-${fieldKey}`"
        :toggle-id-prefix="props.toggleIdPrefix ? `${props.toggleIdPrefix}-${fieldKey}` : ''"
        :model-value="internalObject[fieldKey]"
        @update:model-value="newValue => updateNestedField(fieldKey, newValue)"
        :parent-core-data-item="coreDataForNestedSchema"
        :form-data="internalObject"
        :parent-is-array="false"
        :force-active="props.forceActive"
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