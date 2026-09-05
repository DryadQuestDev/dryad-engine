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
  },
  // The main tab list shares its ID field with Dbookmarks via editor.idFilter (per-tab
  // persisted). Embedded standalone instances (e.g. inside a popup sifting a different
  // file's entities) must opt out, or their ID filter corrupts the host tab's.
  syncSharedIdFilter: {
    type: Boolean,
    default: true,
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
const stringArraySchemaFields = ref<{ path: string }[]>([]);
const combinedTagFieldsForTemplate = ref<{ path: string; options: { value: string | number; label: string }[]; isStringArray: boolean }[]>([]);
// Filter checkboxes only show values present in at least one entry — schema option
// lists (e.g. every status id via fromFile) stay intact for the form UI
const visibleChooseOneFields = ref<{ path: string; options: { value: any; label: string }[] }[]>([]);
const usedFilterValues = ref<Record<string, Set<string>>>({});
// string[] options come from the data alone, so a checked value that vanishes can't be
// recovered from its dot-mangled control name — remember the raw value while it's checked
const stringArrayValueMemory: Record<string, Map<string, string>> = {};

// Lazy-compute: track accordion state and stale data-derived options
const openPanels = ref<string[]>([]);
const optionDataStale = ref(true);

function onPanelsUpdate(val: any) {
    openPanels.value = Array.isArray(val) ? [...val] : [];
}

const formState = reactive({
  id: '',
  search: '',
  key: '',
  range: {} as Record<string, { min: number | null; max: number | null }>,
  selected: {} as Record<string, Record<string, boolean>>,
  tag: {} as Record<string, { logic: boolean; values: Record<string, boolean> }>,
});

// --- Two-way sync with shared editor.idFilter (Dbookmarks search box) ---
watch(() => editor.idFilter.value, (v) => {
  if (props.syncSharedIdFilter && formState.id !== v) formState.id = v;
}, { immediate: true });

watch(() => formState.id, (v) => {
  if (props.syncSharedIdFilter && editor.idFilter.value !== v) editor.idFilter.value = v;
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

// Single pass over the tab's entries collecting the values actually used per filter path
function updateUsedFilterValues(data: any[]): void {
  const sets: Record<string, Set<string>> = {};
  const scalarPaths = chooseOneSchemaFields.value.map(f => f.path);
  const chooseManyPaths = chooseManySchemaFields.value.map(f => f.path);
  const stringArrayPaths = stringArraySchemaFields.value.map(f => f.path);
  [...scalarPaths, ...chooseManyPaths, ...stringArrayPaths].forEach(path => { sets[path] = new Set<string>(); });

  (data || []).forEach(item => {
    scalarPaths.forEach(path => {
      const value = getProperty(item, path);
      if (value !== undefined && value !== null && value !== '') sets[path].add(String(value));
    });
    chooseManyPaths.forEach(path => {
      const values = getProperty(item, path);
      if (Array.isArray(values)) {
        values.forEach(val => {
          if (val !== undefined && val !== null && val !== '') sets[path].add(String(val));
        });
      }
    });
    stringArrayPaths.forEach(path => {
      const values = getProperty(item, path);
      if (Array.isArray(values)) {
        values.forEach(val => {
          if (typeof val === 'string' && val.trim() !== '') sets[path].add(val.trim());
        });
      }
    });
  });
  usedFilterValues.value = sets;
}

// An option the user has checked stays visible even once no entry uses it — editing away
// the last usage must never leave a filter applied with no checkbox to switch it off
function isSelectionChecked(path: string, value: any): boolean {
  return formState.selected[path]?.[getControlName(value)] === true;
}

function isTagChecked(path: string, value: any): boolean {
  return formState.tag[path]?.values?.[getControlName(value)] === true;
}

// Combine chooseMany and stringArray fields for the tag filter UI, keeping only
// options used by at least one entry and dropping groups left empty
function updateCombinedTagFieldsForTemplate(): void {
  const chooseManyMapped = chooseManySchemaFields.value.map(f => ({
          path: f.path,
    options: (f.options?.map(opt => ({
        value: opt.value !== undefined ? opt.value : opt,
        label: opt.label !== undefined ? opt.label : String(opt.value !== undefined ? opt.value : opt),
    })) ?? []).filter(opt => usedFilterValues.value[f.path]?.has(String(opt.value)) || isTagChecked(f.path, opt.value))
      .sort((a, b) => a.label.localeCompare(b.label)),
    isStringArray: false,
  }));

  const stringArrayMapped = stringArraySchemaFields.value.map(f => {
    const used = Array.from(usedFilterValues.value[f.path] ?? []);
    const memory = stringArrayValueMemory[f.path] ?? (stringArrayValueMemory[f.path] = new Map<string, string>());
    used.forEach(val => memory.set(getControlName(val), val));

    const values = new Set(used);
    const checked = formState.tag[f.path]?.values ?? {};
    for (const key in checked) {
      if (checked[key] === true && memory.has(key)) values.add(memory.get(key)!);
    }
    memory.forEach((val, key) => { if (!values.has(val)) memory.delete(key); });

    return {
      path: f.path,
      options: Array.from(values).map(val => ({ value: val, label: String(val) })).sort((a, b) => a.label.localeCompare(b.label)),
      isStringArray: true,
    };
  });

  combinedTagFieldsForTemplate.value = [...chooseManyMapped, ...stringArrayMapped]
    .filter(f => f.options.length > 0)
    .sort((a,b) => a.path.localeCompare(b.path));
}

function rebuildVisibleFilterOptions(): void {
  visibleChooseOneFields.value = chooseOneSchemaFields.value
    .map(f => ({
      path: f.path,
      options: f.options.filter((opt: any) =>
        usedFilterValues.value[f.path]?.has(String(opt.value)) || isSelectionChecked(f.path, opt.value)),
    }))
    .filter(f => f.options.length > 0);
  updateCombinedTagFieldsForTemplate();
}

function recomputeFilterOptions(): void {
  updateUsedFilterValues(props.data || []);
  rebuildVisibleFilterOptions();
  optionDataStale.value = false;
}

function isFilterPanelOpen(): boolean {
  return openPanels.value.includes('tags') || openPanels.value.includes('selections');
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
    visibleChooseOneFields.value.forEach(field => {
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
        for (const path in stringArrayValueMemory) delete stringArrayValueMemory[path];

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
        // Init tag groups from the RAW schema lists — the visible (filtered) lists may be
        // empty while stale, and the template's v-models need the group objects to exist
        chooseManySchemaFields.value.forEach(field => {
            formState.tag[field.path] = { logic: false, values: {} };
             field.options.forEach(opt => {
                formState.tag[field.path].values[getControlName(opt.value)] = false;
            });
        });
        stringArraySchemaFields.value.forEach(field => {
            if (!formState.tag[field.path]) formState.tag[field.path] = { logic: false, values: {} };
        });
        // Defer the expensive entry scan until a filter panel is open
        optionDataStale.value = true;
        if (isFilterPanelOpen()) {
            recomputeFilterOptions();
        } else {
            visibleChooseOneFields.value = [];
            combinedTagFieldsForTemplate.value = [];
        }

         clearFilters(); // Reset form values but keep structure
         // Re-apply the per-tab persisted ID filter (restored into editor.idFilter by Dform
         // before the async schema load completes) — schema change must not wipe it
         if (props.syncSharedIdFilter) formState.id = editor.idFilter.value;
    } else {
        // Clear everything if schema is null
        showIdField.value = false;
        numericSchemaKeys.value = [];
        chooseOneSchemaFields.value = [];
        chooseManySchemaFields.value = [];
        stringArraySchemaFields.value = [];
        combinedTagFieldsForTemplate.value = [];
        visibleChooseOneFields.value = [];
        usedFilterValues.value = {};
        for (const path in stringArrayValueMemory) delete stringArrayValueMemory[path];
        clearFilters(); // Also clear values
        if (props.syncSharedIdFilter) formState.id = editor.idFilter.value; // Keep persisted ID filter through null-schema transitions
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

    // Recompute data-derived filter options — only while a filter panel is open; a closed
    // panel just goes stale, and checked options survive the rebuild either way
    const hasFilterFields = chooseOneSchemaFields.value.length > 0
        || chooseManySchemaFields.value.length > 0
        || stringArraySchemaFields.value.length > 0;
    if (hasFilterFields) {
        if (isFilterPanelOpen()) {
            recomputeFilterOptions();
        } else {
            optionDataStale.value = true;
        }
    }
    applySift(); // Re-apply filter when data source changes OR when it becomes null/empty
}, { deep: true, immediate: true });


// Watch accordion panels — recompute data-derived options when a filter panel opens if stale
watch(openPanels, (panels) => {
    if ((panels.includes('tags') || panels.includes('selections')) && optionDataStale.value) {
        recomputeFilterOptions();
    }
});

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
// immediate: the persisted ID filter is restored during setup, so isFormDirty can start out
// true without ever changing — without an initial emit the parent keeps a stale false and
// its activeObject watcher resets filteredItems to the full list on save
watch(isFormDirty, (newValue) => {
  emit('update:isDirty', newValue);
}, { immediate: true });

// --- Watcher to trigger clear ---
watch(() => props.triggerClear, (newValue, oldValue) => {
  // Only trigger if the value actually changes (and is not the initial mount)
  if (newValue !== oldValue && oldValue !== undefined) {
    clearFilters();
    // An explicit reset should also drop options that were only listed because they
    // were checked — an individual uncheck leaves them until the next rebuild, so the
    // checkbox never vanishes from under the cursor that just clicked it
    if (isFilterPanelOpen()) recomputeFilterOptions();
    else optionDataStale.value = true;
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
    <Accordion :multiple="true" :value="openPanels" @update:value="onPanelsUpdate">
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
                 <div v-for="field in visibleChooseOneFields" :key="field.path" class="selection-group"> <!-- Replaced mb-3 -->
                    <p class="group-header">{{ field.path }}</p> <!-- Kept custom class, removed font-medium mb-2 -->
                    <div class="options-container"> <!-- Replaced flex flex-wrap gap-3 -->
                         <div v-for="option in field.options" :key="getControlName(option.value)" class="option-item"> <!-- Replaced flex align-items-center -->
                            <Checkbox
                                v-model="formState.selected[field.path][getControlName(option.value)]"
                                :inputId="`select-${field.path}-${getControlName(option.value)}`"
                                binary />
                            <label :for="`select-${field.path}-${getControlName(option.value)}`" class="option-label"> {{ option.label }} </label> <!-- Replaced ml-2 -->
                        </div>
                    </div>
                </div>
                <small v-if="visibleChooseOneFields.length === 0" class="no-options-text">
                    No values present in the current data for any selection field.
                </small>
            </AccordionContent>
        </AccordionPanel>

        <!-- Tag Filters -->
        <!-- v-if on RAW lists: the filtered list is lazily computed on panel open, so
             gating on it would hide the panel before it could ever be opened -->
        <AccordionPanel v-if="chooseManySchemaFields.length > 0 || stringArraySchemaFields.length > 0" value="tags">
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
                    </div>
                </div>
                <small v-if="combinedTagFieldsForTemplate.length === 0" class="no-options-text">
                    No values present in the current data for any tag field.
                </small>
            </AccordionContent>
        </AccordionPanel>
    </Accordion>

</div>
</template>

<style scoped src="./dsearch.component.css"></style>