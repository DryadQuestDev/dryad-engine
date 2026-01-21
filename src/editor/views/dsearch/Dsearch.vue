<script setup lang="ts">
import { ref, reactive, watch, computed, onUnmounted, PropType } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { Editor } from '../../editor';
import { Global } from '../../../global/global';
import { SifterManager, Sifter } from '../../../utility/sifterManager';
import { Schema } from '../../../utility/schema'; // Assuming Schema type is defined here

// PrimeVue Components
import InputText from 'primevue/inputtext';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import InputNumber from 'primevue/inputnumber';
import Checkbox from 'primevue/checkbox';
import ToggleSwitch from 'primevue/toggleswitch';
import Button from 'primevue/button';
import FloatLabel from 'primevue/floatlabel'; // For better input styling

// Define Props and Emits
const props = defineProps({
  schema: {
    type: Object as PropType<Schema | null>,
    default: null,
  },
  data: {
    type: Array as PropType<any[] | null>,
    default: null,
  },
  triggerClear: {
    type: Number,
    required: true,
  }
});

const emit = defineEmits<{
  (e: 'update:siftedData', data: any[]): void;
  (e: 'update:isDirty', value: boolean): void;
}>();

// --- State and Dependencies ---
const editor = Editor.getInstance(); 
const global = Global.getInstance();
const sifterManager = new SifterManager<any>();

const showIdField = ref(false);
const numericSchemaKeys = ref<string[]>([]);
const chooseOneSchemaFields = ref<{ path: string; options: any[] }[]>([]);
const chooseManySchemaFields = ref<{ path: string; options: any[] }[]>([]);
const stringArraySchemaFields = ref<{ path: string; uniqueValues?: Set<string | number> }[]>([]);
const combinedTagFieldsForTemplate = ref<{ path: string; options: { value: string | number; label: string }[]; isStringArray: boolean }[]>([]);

const formState = reactive({
  id: '',
  search: '',
  key: '',
  range: {} as Record<string, { min: number | null; max: number | null }>,
  selected: {} as Record<string, Record<string, boolean>>,
  tag: {} as Record<string, { logic: boolean; values: Record<string, boolean> }>,
});

// --- Helper Functions ---

// Safely get nested properties (can be moved to a utility file)
function getProperty(obj: any, path: string): any {
  return path.split('.').reduce((o, key) => (o && o[key] !== undefined && o[key] !== null ? o[key] : undefined), obj);
}

// Recursive functions to find keys based on schema type (similar to Angular version)
function findNumericKeysRecursive(schema: any, currentPath: string = '', keys: string[] = []): string[] {
    if (!schema || typeof schema !== 'object') return keys;
    for (const key in schema) {
        if (Object.prototype.hasOwnProperty.call(schema, key)) {
            const fieldSchema = schema[key];
            const newPath = currentPath ? `${currentPath}.${key}` : key;
            if (fieldSchema && typeof fieldSchema === 'object') {
                if (fieldSchema.type === 'number') keys.push(newPath);
                else if (fieldSchema.type === 'schema' && fieldSchema.objects) findNumericKeysRecursive(fieldSchema.objects, newPath, keys);
            }
        }
    }
    return keys;
  }

function findChooseOneKeysRecursive(schema: any, currentPath: string = '', fields: { path: string, options: any[] }[] = []): { path: string, options: any[] }[] {
    if (!schema || typeof schema !== 'object') return fields;
    for (const key in schema) {
        if (Object.prototype.hasOwnProperty.call(schema, key)) {
            const fieldSchema = schema[key];
            const newPath = currentPath ? `${currentPath}.${key}` : key;
            if (fieldSchema && typeof fieldSchema === 'object') {
                if (fieldSchema.type === 'chooseOne' && Array.isArray(fieldSchema.options)) {
                    const optionsWithValue = fieldSchema.options.map((opt: any) => ({
                        value: opt.value !== undefined ? opt.value : opt,
                        label: opt.label !== undefined ? opt.label : String(opt.value !== undefined ? opt.value : opt),
                    }));
                    fields.push({ path: newPath, options: optionsWithValue });
                } else if (fieldSchema.type === 'schema' && fieldSchema.objects) {
                    findChooseOneKeysRecursive(fieldSchema.objects, newPath, fields);
                }
            }
        }
    }
    return fields;
  }

function findChooseManyKeysRecursive(schema: any, currentPath: string = '', fields: { path: string, options: any[] }[] = []): { path: string, options: any[] }[] {
     if (!schema || typeof schema !== 'object') return fields;
    for (const key in schema) {
        if (Object.prototype.hasOwnProperty.call(schema, key)) {
            const fieldSchema = schema[key];
            const newPath = currentPath ? `${currentPath}.${key}` : key;
            if (fieldSchema && typeof fieldSchema === 'object') {
                if (fieldSchema.type === 'chooseMany' && Array.isArray(fieldSchema.options)) {
                    const optionsWithValue = fieldSchema.options.map((opt: any) => ({
                         value: opt.value !== undefined ? opt.value : opt,
                         label: opt.label !== undefined ? opt.label : String(opt.value !== undefined ? opt.value : opt),
                    }));
                    fields.push({ path: newPath, options: optionsWithValue });
                } else if (fieldSchema.type === 'schema' && fieldSchema.objects) {
                    findChooseManyKeysRecursive(fieldSchema.objects, newPath, fields);
                }
            }
        }
    }
    return fields;
  }

function findStringArrayKeysRecursive(schema: any, currentPath: string = '', keys: string[] = []): string[] {
    if (!schema || typeof schema !== 'object') return keys;
    for (const key in schema) {
        if (Object.prototype.hasOwnProperty.call(schema, key)) {
            const fieldSchema = schema[key];
            const newPath = currentPath ? `${currentPath}.${key}` : key;
            if (fieldSchema && typeof fieldSchema === 'object') {
                if (fieldSchema.type === 'string[]') keys.push(newPath);
                 else if (fieldSchema.type === 'schema' && fieldSchema.objects) findStringArrayKeysRecursive(fieldSchema.objects, newPath, keys);
            }
        }
    }
    return keys;
  }

// Update unique values for string arrays (used in tags)
function updateStringArrayUniqueValues(data: any[]): void {
  stringArraySchemaFields.value.forEach(field => {
          const uniqueValues = new Set<string>();
    (data || []).forEach(item => {
      const values = getProperty(item, field.path);
              if (Array.isArray(values)) {
                  values.forEach(val => {
                      if (typeof val === 'string' && val.trim() !== '') {
                          uniqueValues.add(val.trim());
                      } 
                  });
              }
          });
          field.uniqueValues = uniqueValues;
      });
  }

// Combine chooseMany and stringArray fields for the tag filter UI
function updateCombinedTagFieldsForTemplate(): void {
  const chooseManyMapped = chooseManySchemaFields.value.map(f => ({
          path: f.path,
    options: (f.options?.map(opt => ({
        value: opt.value !== undefined ? opt.value : opt,
        label: opt.label !== undefined ? opt.label : String(opt.value !== undefined ? opt.value : opt),
    })) ?? []).sort((a, b) => a.label.localeCompare(b.label)),
    isStringArray: false,
  }));

  const stringArrayMapped = stringArraySchemaFields.value.map(f => ({
          path: f.path,
          options: Array.from(f.uniqueValues ?? []).map(val => ({ value: val, label: String(val) })).sort((a, b) => a.label.localeCompare(b.label)),
    isStringArray: true,
  }));

  combinedTagFieldsForTemplate.value = [...chooseManyMapped, ...stringArrayMapped].sort((a,b) => a.path.localeCompare(b.path));
}

// Helper to get a safe string representation for keys/control names
function getControlName(value: any): string {
  return String(value).replace(/\./g, '_'); // Replace dots to avoid issues if values contain them
}

// --- Filtering Logic ---

const applySift = () => {
    if (!props.data) {
        emit('update:siftedData', []);
        return;
    }

    const sifter: Sifter = {};

    // Basic Filters
    if (formState.id && formState.id.trim() !== '') sifter.id = formState.id.trim();
    if (formState.search && formState.search.trim() !== '') sifter.search = formState.search.trim();
    if (formState.key && formState.key.trim() !== '') sifter.key = formState.key.trim();

    // Range Filters
    sifter.range = [];
    numericSchemaKeys.value.forEach(path => {
        const rangeData = formState.range[path];
        if (rangeData && (rangeData.min !== null || rangeData.max !== null)) {
            const rangeCondition: { key: string; min?: number; max?: number } = { key: path };
            if (rangeData.min !== null && !isNaN(Number(rangeData.min))) rangeCondition.min = Number(rangeData.min);
            if (rangeData.max !== null && !isNaN(Number(rangeData.max))) rangeCondition.max = Number(rangeData.max);
             if (rangeCondition.min !== undefined || rangeCondition.max !== undefined) {
                 sifter.range?.push(rangeCondition);
            }
        }
    });
    if (sifter.range.length === 0) delete sifter.range;


    // Selection Filters
     sifter.selected = [];
    chooseOneSchemaFields.value.forEach(field => {
        const selectionGroup = formState.selected[field.path];
        if (selectionGroup) {
            let selectedValues: (string | number)[] = [];
            field.options.forEach(option => {
                const optionControlName = getControlName(option.value);
                const isSelected = selectionGroup[optionControlName];

                if (isSelected === true) {
                   const valueToPush = option.value;
                   selectedValues = [...selectedValues, valueToPush];
                }
            });

             if (selectedValues.length > 0) {
                 sifter.selected?.push({ key: field.path, values: selectedValues });
             }
         }
     });
    if (sifter.selected.length === 0) delete sifter.selected;

    // Tag Filters
     sifter.tag = [];
    combinedTagFieldsForTemplate.value.forEach(field => {
        const tagGroup = formState.tag[field.path];
        if (tagGroup) {
             const selectedValues: (string | number)[] = [];
            const valuesSubGroup = tagGroup.values;
             Object.keys(valuesSubGroup).forEach(optionControlName => {
                 if (valuesSubGroup[optionControlName] === true) {
                     const originalOption = field.options.find(opt =>
                        getControlName(opt.value) === optionControlName
                    );
                     if (originalOption) {
                        selectedValues.push(originalOption.value);
                         }
                     }
                 });

             if (selectedValues.length > 0) {
                 sifter.tag?.push({ 
                     key: field.path, 
                    logic: tagGroup.logic ? 'and' : 'or',
                    values: selectedValues,
                 });
             }
         }
     });
     if (sifter.tag.length === 0) delete sifter.tag;

    // Perform Sift and Emit
    try {
    } catch (e) {
    }
    const filteredData = sifterManager.sift(sifter);
    emit('update:siftedData', filteredData);
};

// Debounced version of applySift triggered by form changes
const debouncedApplySift = useDebounceFn(applySift, 300);

// --- Form Building and Reactivity ---

// Watch schema changes to rebuild form structure and derive filterable keys
watch(() => props.schema, (newSchema) => {
    if (newSchema) {
        showIdField.value = !!(newSchema['id'] && newSchema['id'].type !== 'schema');
        numericSchemaKeys.value = findNumericKeysRecursive(newSchema);
        chooseOneSchemaFields.value = findChooseOneKeysRecursive(newSchema).sort((a,b) => a.path.localeCompare(b.path));
        chooseManySchemaFields.value = findChooseManyKeysRecursive(newSchema).sort((a,b) => a.path.localeCompare(b.path));
        stringArraySchemaFields.value = findStringArrayKeysRecursive(newSchema).map(path => ({ path })).sort((a,b) => a.path.localeCompare(b.path));

        // Reset parts of formState that depend on the schema structure
        formState.range = {};
        formState.selected = {};
        formState.tag = {};

        // Initialize formState structure based on new schema keys
        numericSchemaKeys.value.forEach(path => {
            formState.range[path] = { min: null, max: null };
        });
        chooseOneSchemaFields.value.forEach(field => {
            formState.selected[field.path] = {};
            field.options.forEach(opt => {
                formState.selected[field.path][getControlName(opt.value)] = false;
            });
        });
        // Initialize tags based on combined list (needs unique values first)
        updateStringArrayUniqueValues(props.data || []); // Ensure unique values are ready
        updateCombinedTagFieldsForTemplate(); // Now create combined list
        combinedTagFieldsForTemplate.value.forEach(field => {
            formState.tag[field.path] = { logic: false, values: {} };
             field.options.forEach(opt => {
                formState.tag[field.path].values[getControlName(opt.value)] = false;
            });
        });

         clearFilters(); // Reset form values but keep structure
    } else {
        // Clear everything if schema is null
        showIdField.value = false;
        numericSchemaKeys.value = [];
        chooseOneSchemaFields.value = [];
        chooseManySchemaFields.value = [];
        stringArraySchemaFields.value = [];
        combinedTagFieldsForTemplate.value = [];
        clearFilters(); // Also clear values
    }
}, { immediate: true });


// Watch data changes to update SifterManager and unique values
watch(() => props.data, (newData, oldData) => {
    try {
    } catch(e) {
    }

    if (newData) { // Only call setObj if newData is truthy
        sifterManager.setObj(newData); // No need for || [] if we check truthiness
    } else {
        sifterManager.setObj([]); // Ensure it's cleared if data becomes null
    }

    // Update unique values needed for tag filters if data changes
    if (stringArraySchemaFields.value.length > 0) {
        updateStringArrayUniqueValues(newData || []);
        updateCombinedTagFieldsForTemplate(); // Rebuild combined list as options might change
    }
    applySift(); // Re-apply filter when data source changes OR when it becomes null/empty
}, { deep: true, immediate: true });


// Watch the entire form state for changes (Calls debounced version)
watch(formState, () => {
    debouncedApplySift();
}, { deep: true });


// --- Clear Filters ---
function clearFilters(): void {
  formState.id = '';
  formState.search = '';
  formState.key = '';

  // Reset ranges
  Object.keys(formState.range).forEach(key => {
    formState.range[key].min = null;
    formState.range[key].max = null;
  });

  // Reset selected checkboxes
  Object.keys(formState.selected).forEach(key => {
    Object.keys(formState.selected[key]).forEach(optKey => {
      formState.selected[key][optKey] = false;
    });
  });

  // Reset tag checkboxes and logic
  Object.keys(formState.tag).forEach(key => {
    formState.tag[key].logic = false; // Default to OR
    Object.keys(formState.tag[key].values).forEach(optKey => {
      formState.tag[key].values[optKey] = false;
    });
  });
}

// --- Computed Property for Dirty State ---
const defaultFormState = {
  id: '',
  search: '',
  key: '',
  range: {},
  selected: {},
  tag: {},
};

const isFormDirty = computed(() => {
  // Basic check: compare stringified current state to default
  // More sophisticated checks could compare each property individually
  // Need to handle dynamic keys added to range/selected/tag based on schema
  const currentStateString = JSON.stringify(formState);
  
  // Create a default structure matching the current dynamic keys
  const currentDefaultState = {
      id: '',
      search: '',
      key: '',
      range: Object.keys(formState.range).reduce((acc, key) => ({ ...acc, [key]: { min: null, max: null } }), {}),
      selected: Object.keys(formState.selected).reduce((acc, key) => ({ ...acc, [key]: Object.keys(formState.selected[key]).reduce((iacc, ikey) => ({ ...iacc, [ikey]: false }), {}) }), {}),
      tag: Object.keys(formState.tag).reduce((acc, key) => ({ ...acc, [key]: { logic: false, values: Object.keys(formState.tag[key].values).reduce((iacc, ikey) => ({ ...iacc, [ikey]: false }), {}) } }), {}),
  };
  const defaultStateString = JSON.stringify(currentDefaultState);

  return currentStateString !== defaultStateString;
});

// --- Emit dirty state changes ---
watch(isFormDirty, (newValue) => {
  emit('update:isDirty', newValue);
});

// --- Watcher to trigger clear ---
watch(() => props.triggerClear, (newValue, oldValue) => {
  // Only trigger if the value actually changes (and is not the initial mount)
  if (newValue !== oldValue && oldValue !== undefined) {
    clearFilters();
  }
});

// --- Lifecycle ---
// onUnmounted(() => {
//   // Cleanup if needed, e.g., cancel debounced function
//   debouncedApplySift.cancel();
// });

</script>

<template>
  <div class="dsearch-container p-fluid"> <!-- Keep p-fluid, removed mb-4 -->
    <div class="form-grid basic-filters-grid"> <!-- Replaced p-formgrid grid with custom grid classes -->

      <!-- Basic Filters -->
      <div v-if="showIdField" class="field id-field"> <!-- Added specific field class -->
        <FloatLabel variant="on">
            <InputText v-model="formState.id" />
            <label for="dsearch-id">ID contains</label>
        </FloatLabel>
      </div>

      <div class="field search-field"> <!-- Added specific field class -->
        <FloatLabel variant="on">
            <InputText v-model="formState.search" />
            <label for="dsearch-search">Search any value</label>
        </FloatLabel>
      </div>

      <div class="field key-field"> <!-- Added specific field class -->
        <FloatLabel variant="on">
            <InputText v-model="formState.key" />
            <label for="dsearch-key">Key appears(! if does not)</label>
        </FloatLabel>
      </div>

    </div>

    <!-- Accordion for Advanced Filters -->
    <Accordion :multiple="true" :value="[]"> <!-- Use empty array for value to start closed -->
        <!-- Range Filters -->
        <AccordionPanel v-if="numericSchemaKeys.length > 0" value="ranges">
            <AccordionHeader>
                <!-- Removed flex, align-items-center, gap-2, w-full -->
                <span>
                    <i class="pi pi-sliders-h"></i>
                    <span class="header-text">Numeric Range Filters</span> <!-- Replaced font-bold white-space-nowrap -->
                </span>
            </AccordionHeader>
            <AccordionContent>
                 <div class="form-grid range-filters-grid"> <!-- Replaced p-formgrid grid -->
                    <div v-for="keyPath in numericSchemaKeys" :key="keyPath" class="field">
                        <label :for="`range-min-${keyPath}`" class="label-block group-header">{{ keyPath }}</label> <!-- Replaced block mb-1 font-medium -->
                        <div class="p-inputgroup">
                            <InputNumber
                                :inputId="`range-min-${keyPath}`"
                                v-model="formState.range[keyPath].min"
                                mode="decimal"
                                placeholder="Min"
                                :showButtons="true"
                                class="p-inputgroup-addon"
                                
                                 />
                            <span class="p-inputgroup-addon">-</span>
                            <InputNumber
                                :inputId="`range-max-${keyPath}`"
                                v-model="formState.range[keyPath].max"
                                mode="decimal"
                                placeholder="Max"
                                :showButtons="true"
                                class="p-inputgroup-addon" />
                        </div>
                    </div>
                  </div>
            </AccordionContent>
        </AccordionPanel>

        <!-- Selection Filters -->
        <AccordionPanel v-if="chooseOneSchemaFields.length > 0" value="selections">
             <AccordionHeader>
                 <!-- Removed flex, align-items-center, gap-2, w-full -->
                <span>
                    <i class="pi pi-check-square"></i>
                    <span class="header-text">Selection Filters</span> <!-- Replaced font-bold white-space-nowrap -->
                </span>
            </AccordionHeader>
            <AccordionContent>
                 <div v-for="field in chooseOneSchemaFields" :key="field.path" class="selection-group"> <!-- Replaced mb-3 -->
                    <p class="group-header">{{ field.path }}</p> <!-- Kept custom class, removed font-medium mb-2 -->
                    <div class="options-container"> <!-- Replaced flex flex-wrap gap-3 -->
                         <div v-for="option in field.options" :key="getControlName(option.value)" class="option-item"> <!-- Replaced flex align-items-center -->
                            <Checkbox
                                v-model="formState.selected[field.path][getControlName(option.value)]"
                                :inputId="`select-${field.path}-${getControlName(option.value)}`"
                                binary />
                            <label :for="`select-${field.path}-${getControlName(option.value)}`" class="option-label"> {{ option.label }} </label> <!-- Replaced ml-2 -->
                        </div>
                         <!-- Add message if no options available -->
                        <small v-if="!field.options || field.options.length === 0" class="no-options-text"> <!-- Replaced text-color-secondary -->
                            No unique values found in current data for this selection field.
                        </small>
                    </div>
                </div>
            </AccordionContent>
        </AccordionPanel>

        <!-- Tag Filters -->
        <AccordionPanel v-if="combinedTagFieldsForTemplate.length > 0" value="tags">
             <AccordionHeader>
                 <!-- Removed flex, align-items-center, gap-2, w-full -->
                <span>
                     <i class="pi pi-tags"></i>
                     <span class="header-text">Tag Filters</span> <!-- Replaced font-bold white-space-nowrap -->
                 </span>
            </AccordionHeader>
            <AccordionContent>
                <div v-for="field in combinedTagFieldsForTemplate" :key="field.path" class="tag-filter-group"> <!-- Replaced mb-4 -->
                     <div class="tag-group-header"> <!-- Replaced flex justify-content-between align-items-center mb-2 -->
                        <p class="group-header" style="margin-bottom: 0;">{{ field.path }}</p> <!-- Kept custom class, removed font-medium mb-0, added inline style override -->
                        <div class="tag-logic-container"> <!-- Replaced flex align-items-center -->
                             <label :for="`tag-logic-${field.path}`" class="tag-logic-label"> {{ formState.tag[field.path]?.logic ? 'AND' : 'OR' }} Logic </label> <!-- Replaced mr-2 text-sm -->
                             <ToggleSwitch v-model="formState.tag[field.path].logic" :inputId="`tag-logic-${field.path}`" />
                        </div>
                     </div>
                    <div class="options-container"> <!-- Replaced flex flex-wrap gap-3 -->
                         <div v-for="option in field.options" :key="getControlName(option.value)" class="option-item"> <!-- Replaced flex align-items-center -->
                             <Checkbox
                                v-model="formState.tag[field.path].values[getControlName(option.value)]"
                                :inputId="`tag-${field.path}-${getControlName(option.value)}`"
                                binary />
                             <label :for="`tag-${field.path}-${getControlName(option.value)}`" class="option-label"> {{ option.label }} </label> <!-- Replaced ml-2 -->
                        </div>
                         <small v-if="!field.options || field.options.length === 0" class="no-options-text"> <!-- Replaced text-color-secondary -->
                            No unique values found in current data for this tag field.
                        </small>
                    </div>
                </div>
            </AccordionContent>
        </AccordionPanel>
    </Accordion>

</div>
</template>

<style scoped src="./dsearch.component.css"></style>