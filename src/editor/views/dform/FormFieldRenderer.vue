<script setup lang="ts">
import { PropType, computed, ref, watch, onMounted } from 'vue';
import { Schemable, Schema } from '../../../utility/schema';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import FloatLabel from 'primevue/floatlabel';
import ToggleSwitch from 'primevue/toggleswitch';
import Textarea from 'primevue/textarea';
import Editor from 'primevue/editor';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import Button from 'primevue/button';
import ColorPicker from 'primevue/colorpicker';
import Dialog from 'primevue/dialog';
import { useSortable } from '@vueuse/integrations/useSortable'
import { Editor as AppEditor } from '../../../editor/editor'; // Adjust the relative path based on your project structure
import { Global } from '../../../global/global';
import NestedSchemaRenderer from './NestedSchemaRenderer.vue';
import { watchDebounced } from '@vueuse/core';
import TriStateSwitch from './TriStateSwitch.vue';
import FileInput from './FileInput.vue';
import RangeInput from './RangeInput.vue';
import StringArrayInput from './StringArrayInput.vue';
import { preserveScroll } from './preserveScrollDirective';
import { useGeneratedFields } from './useGeneratedFields';
import Quill from 'quill';

// Override Quill's Image blot to accept relative paths without URL sanitization
const ImageBlot = Quill.import('formats/image') as any;
class CustomImage extends ImageBlot {
  static sanitize(url: string) {
    return url; // Accept all URLs without sanitization
  }
}
Quill.register(CustomImage, true);

// Get editor instance
const editor = AppEditor.getInstance();
const global = Global.getInstance();

// Register custom directive
const vPreserveScroll = preserveScroll;

// Prompt dialog state for image URL
const promptDialog = ref({
  visible: false,
  value: '',
  resolve: null as ((value: string | null) => void) | null
});

function showPrompt(message: string, defaultValue: string = ''): Promise<string | null> {
  return new Promise((resolve) => {
    promptDialog.value = {
      visible: true,
      value: defaultValue,
      resolve
    };
  });
}

function submitPrompt(value: string | null) {
  if (promptDialog.value.resolve) {
    promptDialog.value.resolve(value);
  }
  promptDialog.value.visible = false;
  promptDialog.value.resolve = null;
}





// MOVE defineProps UP
const props = defineProps({
  modelValue: [String, Number, Boolean, Array, Object, null] as any,
  baseFieldSchema: { type: Object as () => Schemable, required: true },
  fieldKey: { type: String, required: true },
  itemData: { type: Object, required: true },
  rootSchema: { type: Object as () => Schema, required: true },
  fieldId: { type: String, required: true },
  isCore: { type: Boolean, default: false },
  parentIsArray: { type: Boolean, default: false },
  labelContext: {
    type: String,
    default: ''
  },
  isArrayItemId: {
    type: Boolean,
    default: false
  },
  parentCoreDataItem: {
    type: Object as PropType<Record<string, any> | null>,
    default: null
  },
  formData: {
    type: Object as PropType<Record<string, any> | null>,
    default: null
  }
});

// NOW DEFINE THE WATCHER AND OTHER LOGIC THAT USES PROPS
const dynamicImageSchemaObjects = ref<Record<string, Schemable> | null>(null);
const dynamicMaskSchemaObjects = ref<Record<string, Schemable> | null>(null);

// Watcher for itemData to update dynamicImageSchemaObjects and dynamicMaskSchemaObjects
watch(() => props.itemData, (newItemData, oldItemData) => { // Watch props.itemData directly
  // Current props.fieldKey and props.rootSchema will be used from the component's scope
  if (
    (props.fieldKey === 'images' || props.fieldKey === 'masks') &&
    typeof props.rootSchema === 'object' && props.rootSchema && props.rootSchema.attributes &&
    (props.rootSchema.attributes as Schemable).logic === 'build_images' &&
    typeof newItemData === 'object' && newItemData
  ) {
    // Merge attributes from _core and mod to account for all images
    let selectedAttributes: string[] = [];

    // Start with mod's attributes if they exist
    if (newItemData.attributes && Array.isArray(newItemData.attributes)) {
      selectedAttributes = [...newItemData.attributes];
    }

    // If _core has attributes, use them as the base (prepend)
    if (props.parentCoreDataItem &&
      props.parentCoreDataItem.attributes &&
      Array.isArray(props.parentCoreDataItem.attributes)) {
      // Prepend _core attributes to preserve order (_core first, then mod)
      selectedAttributes = [
        ...props.parentCoreDataItem.attributes,
        ...selectedAttributes
      ];
    }

    const newDynamicImageObjects: Record<string, Schemable> = {};
    const newDynamicMaskObjects: Record<string, Schemable> = {};
    let attributesObjects = editor.skinAttributes.value;
    //console.warn("attributesObjects:", attributesObjects);
    if (selectedAttributes.length > 0 && attributesObjects && attributesObjects.length > 0) {
      let valuesCollection: any[] = [];

      selectedAttributes.forEach(attrId => {
        // console.warn("attrId:", attrId);
        let values = attributesObjects.find((attr: { id: string }) => attr.id === attrId)?.values;
        if (values && Array.isArray(values)) {
          valuesCollection.push(values);
        } else {
          console.warn(`[FormFieldRenderer] Attribute '${attrId}' not found in attributesObjects or has no values array`);
        }
      });
      //console.error("valuesCollection:", valuesCollection);

      const ids = valuesCollection.reduce(
        (acc: any, curr: any) =>
          acc.flatMap((prefix: any) =>
            curr.map((word: any) => (prefix ? `${prefix}_${word}` : word))
          ),
        ['']                // start with an empty prefix
      );

      for (let id of ids) {
        let idFinal = props.itemData.id + "_" + id;
        // Build image schema
        newDynamicImageObjects[idFinal] = {
          type: 'file',
          fileType: 'image',
        };
        // Build mask schema (polygon strings)
        newDynamicMaskObjects[idFinal] = {
          type: 'string',
        };
      }


    }
    if (JSON.stringify(dynamicImageSchemaObjects.value) !== JSON.stringify(newDynamicImageObjects)) {
      dynamicImageSchemaObjects.value = newDynamicImageObjects;
    }
    if (JSON.stringify(dynamicMaskSchemaObjects.value) !== JSON.stringify(newDynamicMaskObjects)) {
      dynamicMaskSchemaObjects.value = newDynamicMaskObjects;
    }
  } else if (props.fieldKey === 'images') {
    // This condition means fieldKey is 'images' but other conditions for building dynamic schema failed
    if (dynamicImageSchemaObjects.value !== null) {
      dynamicImageSchemaObjects.value = null;
    }
  } else if (props.fieldKey === 'masks') {
    // This condition means fieldKey is 'masks' but other conditions for building dynamic schema failed
    if (dynamicMaskSchemaObjects.value !== null) {
      dynamicMaskSchemaObjects.value = null;
    }
  }
}, { deep: true, immediate: true });

const emit = defineEmits(['update:modelValue', 'validate']);

// Computed property to handle the two-way binding via emit
const internalValue = ref(props.modelValue);

const fieldCoreValue = computed(() => {
  // Add check to ensure parentCoreDataItem is an object
  if (props.parentCoreDataItem && typeof props.parentCoreDataItem === 'object' &&
    props.fieldKey in props.parentCoreDataItem) {
    return props.parentCoreDataItem[props.fieldKey as string];
  }
  return null;
});

function displayCoreValue(value: any): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2); // Pretty print objects/arrays
  }
  return String(value);
}

const label = computed(() => {
  if (props.parentIsArray && props.fieldId === 'id') {
    return ''; // No label for 'id' field directly in an array item form
  }
  const baseLabel = props.baseFieldSchema.label || props.fieldKey.toString();
  return props.labelContext ? `${baseLabel} ${props.labelContext}` : baseLabel;
});

const fieldId = computed(() => {
  // Create a unique ID, especially important for arrays
  return `${props.fieldKey.toString()}${props.labelContext.replace(/[^a-zA-Z0-9]/g, '')}`;
})


// --- State for Schema Switch ---
const isNestedSchemaEnabled = ref(false);

// Watch modelValue to set initial switch state
watch(() => props.modelValue, (newVal) => {
  if (props.baseFieldSchema.type === 'schema') {
    isNestedSchemaEnabled.value = newVal != null && typeof newVal === 'object';
  }
}, { immediate: true });

// Watch switch state to create/null the object
watch(isNestedSchemaEnabled, (enabled) => {
  if (props.baseFieldSchema.type === 'schema') {
    const currentValue = props.modelValue;
    if (enabled && (currentValue === null || typeof currentValue !== 'object')) {
      // console.log('Enabling nested schema, creating empty object');
      emit('update:modelValue', {}); // Create empty object
    } else if (!enabled && currentValue !== null) {
      // console.log('Disabling nested schema, setting to null');
      emit('update:modelValue', null); // Set to null
    }
  }
});
// --- End State for Schema Switch ---

// HTML mode state for Quill Editor
const isHtmlMode = ref(false);
const htmlContent = ref('');

// Define Quill Editor toolbar configuration
const editorModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    ['bold', 'italic', 'underline', 'strike'],        // toggled buttons
    ['blockquote'],                            // custom button values
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'indent': '-1' }, { 'indent': '+1' }],          // outdent/indent
    [{ 'align': [] }],
    [{ 'color': [] }],                             // font color
    ['clean'],                                         // remove formatting button
    ['link', 'image']                                // link and image
  ]
};

// Toggle between HTML and visual mode
function toggleHtmlMode() {
  if (isHtmlMode.value) {
    // Switching from HTML to visual mode
    internalValue.value = htmlContent.value;
    isHtmlMode.value = false;
  } else {
    // Switching from visual to HTML mode
    htmlContent.value = internalValue.value || '';
    isHtmlMode.value = true;
  }
}

// Watch for changes in HTML mode textarea
watch(htmlContent, (newHtml) => {
  if (isHtmlMode.value) {
    internalValue.value = newHtml;
  }
});

// Clean HTML content by replacing consecutive &nbsp; with regular spaces
function cleanHtmlContent(html: string): string {
  if (!html) return html;

  // Replace &nbsp; with regular spaces, but keep single ones that might be intentional
  // This replaces multiple consecutive &nbsp; or &nbsp; between words with regular spaces
  return html
    .replace(/(&nbsp;){2,}/g, ' ') // Replace 2+ consecutive &nbsp; with single space
    .replace(/(\w)&nbsp;(\w)/g, '$1 $2'); // Replace &nbsp; between words with regular space
}

// Custom handler for editor initialization and image button
function onEditorInit({ instance }: { instance: any }) { // PrimeVue passes 'instance', not 'editor'
  const toolbar = instance.getModule('toolbar');
  toolbar.addHandler('image', async () => {
    const url = await showPrompt('Enter image URL:');
    if (url) {
      const range = instance.getSelection(true);
      // Insert the image at the current cursor position or the beginning
      instance.insertEmbed(range ? range.index : 0, 'image', url, 'user');
    }
  });
}

// String Array Logic is now handled by StringArrayInput.vue component

// --- Number Array Logic ---
const numberListContainer = ref<HTMLElement | null>(null);
const localNumberArray = ref<(number | null)[]>([]); // Use number | null

// Sync prop changes to local number state
watch(() => props.modelValue, (newVal) => {
  if (props.baseFieldSchema.type === 'number[]') {
    if (Array.isArray(newVal)) {
      // Filter out non-numbers just in case, though ideally prop type should be correct
      const numbersOnly = newVal.filter(v => typeof v === 'number');

      // Ensure at least one null placeholder if array is empty or last item is not null
      const needsNullField = numbersOnly.length === 0 || numbersOnly[numbersOnly.length - 1] !== null;
      const newState: (number | null)[] = needsNullField ? [...numbersOnly, null] : [...numbersOnly];

      // Update only if structurally different from current local state
      if (JSON.stringify(newState) !== JSON.stringify(localNumberArray.value)) {
        localNumberArray.value = newState;
      }
    } else {
      // Initialize if not an array
      if (localNumberArray.value.length === 0 || localNumberArray.value[0] !== null) {
        localNumberArray.value = [null];
      }
    }
  }
}, { immediate: true, deep: true });

// Watch local number state for changes (user input, sorting, deletion) and auto-add/emit
watch(localNumberArray, (newList) => {
  if (props.baseFieldSchema.type === 'number[]') {
    // Auto-add new null field if the last one is filled (not null)
    if (newList.length > 0 && newList[newList.length - 1] !== null) {
      localNumberArray.value.push(null);
    }
    // Remove duplicate null field at the end
    else if (newList.length > 1 && newList[newList.length - 1] === null && newList[newList.length - 2] === null) {
      localNumberArray.value.pop();
      // Don't emit immediately after pop, wait for next tick or explicit change
      return;
    }

    // Emit changes back to parent, but ALWAYS filter out the trailing null
    // This ensures the emitted value matches what gets saved to the file
    const listToEmit = [...localNumberArray.value];
    const listWithoutTrailingNull = listToEmit.length > 0 && listToEmit[listToEmit.length - 1] === null
      ? listToEmit.slice(0, -1)
      : listToEmit;

    // Emit only if the array content has actually changed from the prop
    const currentPropValue = Array.isArray(props.modelValue) ? props.modelValue : [];
    if (JSON.stringify(listWithoutTrailingNull) !== JSON.stringify(currentPropValue)) {
      emit('update:modelValue', listWithoutTrailingNull);
    }
  }
}, { deep: true });

// Setup sorting for numbers
useSortable(numberListContainer, localNumberArray, {
  handle: '.drag-handle',
  animation: 150,
  filter: '.non-draggable-empty', // Ignore drag attempts on null items
  preventOnFilter: false, // Allow focus/click
});

function deleteNumberItem(index: number) {
  // Prevent deleting the last null item
  if (localNumberArray.value.length === 1 && localNumberArray.value[0] === null) return;

  localNumberArray.value.splice(index, 1);

  // Ensure there's always at least one (potentially null) field
  if (localNumberArray.value.length === 0) {
    localNumberArray.value.push(null);
  }
}
// --- End Number Array Logic ---

// --- Schema Array Logic ---
const schemaListContainer = ref<HTMLElement | null>(null);
const localSchemaArray = ref<Record<string, any>[]>([]); // Array of objects

// Sync prop changes to local schema array state
watch(() => props.modelValue, (newVal) => {
  if (props.baseFieldSchema.type === 'schema[]') {
    if (Array.isArray(newVal)) {
      // Ensure only actual objects are in the array initially
      const validObjects = newVal.filter(item => item !== null && typeof item === 'object');
      // Ensure all items have a uid for proper Vue key tracking
      validObjects.forEach(item => {
        if (!item.uid) {
          item.uid = editor.createUid();
        }
      });
      // Update only if different from current local state
      if (JSON.stringify(validObjects) !== JSON.stringify(localSchemaArray.value)) {
        localSchemaArray.value = validObjects;
      }
    } else {
      // If prop is not an array, initialize local state as empty
      if (localSchemaArray.value.length > 0) {
        localSchemaArray.value = [];
      }
    }
  }
}, { immediate: true, deep: true });

// Watch local schema array for deep changes (add, delete, reorder, internal modification)
watch(localSchemaArray, (newList, oldList) => {
  if (props.baseFieldSchema.type === 'schema[]') {
    // Emit changes back to parent if the array structure or content differs from the prop
    // Use deep comparison to detect internal object changes
    if (JSON.stringify(newList) !== JSON.stringify(props.modelValue || [])) {
      emit('update:modelValue', newList);
    }
  }
}, { deep: true });

// Add a new empty object item
function addSchemaItem() {
  localSchemaArray.value.push({ uid: editor.createUid() });
  // The watcher will emit the update
}

// Setup sorting for schema array
useSortable(schemaListContainer, localSchemaArray, {
  handle: '.drag-handle',
  animation: 150,
});

function deleteSchemaItem(index: number) {
  localSchemaArray.value.splice(index, 1);
  // The watcher will emit the update
}
// --- End Schema Array Logic ---

// Computed property to determine if the ID field should be disabled
const isIdDisabled = computed(() => {
  return props.fieldKey === 'id' && editor.disableId.value;
});

const isVisible = computed(() => {
  const conditions = effectiveFieldSchema.value?.show; // Use effectiveFieldSchema here
  if (!conditions || Object.keys(conditions).length === 0) {
    return true; // Always show if no 'show' conditions
  }
  if (!props.formData) {
    // console.warn(`[FormFieldRenderer] formData is null for field '${props.fieldKey.toString()}', cannot evaluate 'show' condition. Field will be hidden.`);
    return false; // Hide if formData is not available to check conditions
  }

  for (const dependentFieldKey in conditions) { // Iterate over conditions from effectiveFieldSchema
    const expectedValues = conditions[dependentFieldKey];
    let actualValue = props.formData[dependentFieldKey];

    // Fall back to core data if mod data is undefined or null
    if ((actualValue === undefined || actualValue === null) && props.parentCoreDataItem && typeof props.parentCoreDataItem === 'object') {
      actualValue = props.parentCoreDataItem[dependentFieldKey];
    }

    if (!Array.isArray(expectedValues)) {
      // console.warn(`[FormFieldRenderer] Expected values for '${dependentFieldKey}' in 'show' condition of '${props.fieldKey.toString()}' is not an array. Field will be hidden.`);
      return false;
    }

    if (!expectedValues.includes(actualValue)) {
      return false;
    }
  }
  return true;
});

// --- Dynamic Filter Schema for build_filters logic ---
// When pool field has logic: 'build_filters', generate dynamic schema for filters_include/filters_exclude
const buildFiltersConfig = computed(() => {
  if (!props.rootSchema?.pool) return null;
  const poolSchema = props.rootSchema.pool as Schemable;
  if (poolSchema.logic !== 'build_filters') return null;

  // Return config for useGeneratedFields
  return {
    refField: 'pool',
    refFile: 'pool_definitions',
    sourceField: 'source',
    fieldsPath: 'filter_fields'
  };
});

// Use itemData (top-level item) instead of formData for pool lookup
// This ensures nested entities[] items can still find the pool reference
const itemDataRef = computed(() => props.itemData);
const { dynamicFilterSchema, isLoading: isLoadingDynamicSchema } = useGeneratedFields(buildFiltersConfig, itemDataRef);

// Computing the effective schema to be used for rendering this field
const effectiveFieldSchema = computed<Schemable | null>(() => {
  const base = props.baseFieldSchema;
  if (!base) return null;

  // Handle build_filters logic for filters_include field
  if (
    props.fieldKey === 'filters_include' &&
    props.rootSchema?.pool &&
    (props.rootSchema.pool as Schemable).logic === 'build_filters' &&
    dynamicFilterSchema.value
  ) {
    return {
      ...base,
      objects: dynamicFilterSchema.value
    };
  }

  // Handle build_filters logic for filters_exclude field
  if (
    props.fieldKey === 'filters_exclude' &&
    props.rootSchema?.pool &&
    (props.rootSchema.pool as Schemable).logic === 'build_filters' &&
    dynamicFilterSchema.value
  ) {
    return {
      ...base,
      objects: dynamicFilterSchema.value
    };
  }

  // Handle build_images logic for images field
  if (
    props.fieldKey === 'images' &&
    props.rootSchema &&
    props.rootSchema.attributes &&
    (props.rootSchema.attributes as Schemable).logic === 'build_images' &&
    dynamicImageSchemaObjects.value
  ) {
    return {
      ...base,
      objects: dynamicImageSchemaObjects.value
    };
  }

  // Handle build_images logic for masks field
  if (
    props.fieldKey === 'masks' &&
    props.rootSchema &&
    props.rootSchema.attributes &&
    (props.rootSchema.attributes as Schemable).logic === 'build_images' &&
    dynamicMaskSchemaObjects.value
  ) {
    return {
      ...base,
      objects: dynamicMaskSchemaObjects.value
    };
  }

  // Fallback for non-dynamic fields
  return base;
});

// --- Computed properties for rendering ---
const fieldType = computed(() => effectiveFieldSchema.value?.type);
const tooltip = computed(() => effectiveFieldSchema.value?.tooltip || '');
const options = computed(() => effectiveFieldSchema.value?.options || []);
const optionLabel = computed(() => effectiveFieldSchema.value?.optionLabel || undefined);
const optionValue = computed(() => effectiveFieldSchema.value?.optionValue || undefined);
const fileType = computed(() => effectiveFieldSchema.value?.fileType || 'any');
const objectsSchema = computed(() => effectiveFieldSchema.value?.objects || {}); // Used by DSchema and DSchemaArray
//const schemaLogic = computed(() => effectiveFieldSchema.value?.logic);
//const isRequired = computed(() => effectiveFieldSchema.value?.required || false);
//const componentType = computed(() => (effectiveFieldSchema.value as any)?.component);
const stepValue = computed(() => effectiveFieldSchema.value?.step || 1);
const minValue = computed(() => effectiveFieldSchema.value?.min);
const maxValue = computed(() => effectiveFieldSchema.value?.max);

// Watch for visibility changes and delete the field from formData when it becomes hidden
watch(isVisible, (visible) => {
  if (!visible && props.formData && props.fieldKey) {
    // Delete the field from formData when it becomes invisible
    delete props.formData[props.fieldKey as string];
  }
}, { immediate: true });

// Watch for external changes to modelValue to update internalValue
watch(() => props.modelValue, (newValue) => {
  // TODO: make this only for primitives
  // Check if the new value is different from the current internalValue
  // This helps prevent infinite loops if internalValue update also triggers modelValue update
  // We also need to consider that objects and arrays might be new instances but deep equal
  // A simple strict equality check might not be enough for objects/arrays if they are recreated
  // For now, we assume that if they are different instances, it's a meaningful change.
  if (newValue !== internalValue.value) {
    if (typeof newValue === 'object' && newValue !== null) {
      try {
        internalValue.value = JSON.parse(JSON.stringify(newValue));
      } catch (e) {
        console.error("Error cloning modelValue:", e);
        internalValue.value = newValue; // Fallback to direct assignment
      }
    } else {
      internalValue.value = newValue;
    }
  }
}, { deep: true });

// Initialize internalValue from modelValue if it's different
if (JSON.stringify(props.modelValue) !== JSON.stringify(internalValue.value)) {
  if (typeof props.modelValue === 'object' && props.modelValue !== null) {
    try {
      internalValue.value = JSON.parse(JSON.stringify(props.modelValue));
    } catch (e) {
      console.error("Error cloning initial modelValue:", e);
      internalValue.value = props.modelValue;
    }
  } else {
    internalValue.value = props.modelValue;
  }
}

// Watch for internal changes to emit update and validate
watchDebounced(internalValue, (newValue, oldValue) => {
  // ---- START DEBUG LOG for attributes field ----
  //if (props.fieldKey === 'attributes') {
  //  console.log(`[FFR attributes] internalValue watcher. Current New:`, JSON.parse(JSON.stringify(newValue === undefined ? null : newValue)), `Current Old:`, JSON.parse(JSON.stringify(oldValue === undefined ? null : oldValue)));
  //}
  // ---- END DEBUG LOG ----

  let processedNewValue = newValue;

  // Clean HTML content for htmlarea fields
  if (fieldType.value === 'htmlarea' && typeof newValue === 'string') {
    processedNewValue = cleanHtmlContent(newValue);
  }

  if (fieldType.value === 'chooseMany' && Array.isArray(newValue) && Array.isArray(options.value)) {
    const currentOptions = options.value as any[];

    const isOptionObject = currentOptions.length > 0 && typeof currentOptions[0] === 'object' && currentOptions[0] !== null;
    // Adjust key based on typical PrimeVue structures (often 'value' for value, or fallback to direct match for primitives)
    // If your options are {label: 'Name', code: 'ID'}, and 'code' is the v-model value, then use 'code'.
    // For this example, assuming simple primitive options or objects where the option itself is the value, or it has a 'value' property.
    // A more robust solution would inspect `optionValue` prop of MultiSelect if it were available here.
    // Given we only have `options`, we make a best guess.
    const getOptionIdentifier = (opt: any) => {
      if (isOptionObject) {
        // Common patterns: option itself, option.value, option.id, option.code
        // This needs to match how v-model values are derived from your options array.
        // If `optionValue` prop is used on MultiSelect, this logic should align with it.
        // Assuming `internalValue` stores the actual values (e.g., IDs or primitive values from options).
        if (opt && typeof opt === 'object') {
          if (opt.hasOwnProperty('value')) return opt.value;
          if (opt.hasOwnProperty('id')) return opt.id; // A common case for object options
          // If it's an object without a clear 'value' or 'id', and it's what's stored in `internalValue`,
          // then direct object comparison might be intended, but that's tricky with reactivity.
          // For now, let's assume primitive values or objects with 'value'/'id' are in `internalValue`.
          return opt; // Fallback to the object itself if no specific key, implies `internalValue` stores these objects.
        }
      }
      return opt; // Primitive option
    };

    const sortedArray = [...newValue].sort((a, b) => {
      const indexA = currentOptions.findIndex(opt => getOptionIdentifier(opt) === a);
      const indexB = currentOptions.findIndex(opt => getOptionIdentifier(opt) === b);
      return (indexA === -1 ? Infinity : indexA) - (indexB === -1 ? Infinity : indexB);
    });

    if (JSON.stringify(sortedArray) !== JSON.stringify(newValue)) {
      processedNewValue = sortedArray;
      // If we assign to internalValue.value = sortedArray here, it could cause an infinite loop
      // if not handled carefully, as this watcher would be re-triggered.
      // The purpose of this block is to ensure the `emit` below uses the sorted value.
    }
  }

  // Compare with current prop value, not oldValue - this prevents unnecessary emits
  // after save when debounced watcher fires late
  if (JSON.stringify(processedNewValue) !== JSON.stringify(props.modelValue)) {
    if (props.fieldKey === 'attributes') {
      console.log(`[FFR attributes] Values differ from prop, emitting update:modelValue:`, JSON.parse(JSON.stringify(processedNewValue === undefined ? null : processedNewValue)));
    }
    emit('update:modelValue', processedNewValue);

  } else {
    if (props.fieldKey === 'attributes') {
      console.log(`[FFR attributes] Values same as current prop, NOT emitting.`);
    }
  }
}, { deep: true, debounce: 300 });

onMounted(() => {

});
</script>

<template>
  <div v-if="isVisible" class="form-field-renderer">

    <!-- UID Input -->
    <div v-if="fieldType === 'uid'">
      <input type="hidden" v-model="internalValue" />
    </div>

    <!-- String Input -->
    <div v-else-if="fieldType === 'string'" class="field-container">
      <FloatLabel variant="on" class="p-float-label-variant-on input-wrapper">

        <InputText v-model="internalValue" :disabled="isIdDisabled" class="w-full" v-tooltip.left="tooltip" />
        <label :for="fieldId">{{ label }}</label>
      </FloatLabel>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">
        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- Number Input -->
    <div v-else-if="fieldType === 'number'" class="field-container">
      <FloatLabel variant="on" class="p-float-label-variant-on input-wrapper">

        <InputNumber v-model="internalValue" :step="stepValue" :min="minValue" :max="maxValue" showButtons class="w-full" mode="decimal"
          :maxFractionDigits="2" v-tooltip.left="tooltip" @input="(event) => internalValue = event.value" />
        <label :for="fieldId">{{ label }}</label>
      </FloatLabel>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">
        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- Range Input -->
    <div v-else-if="fieldType === 'range'" class="field-container">
      <div v-tooltip.left="tooltip" class="input-wrapper">
        <label class="range-label">{{ label }}</label>
        <RangeInput v-model="internalValue" :step="stepValue" />
      </div>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">
        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- Color Picker -->
    <div v-else-if="fieldType === 'color'" class="field-container p-field flex items-center gap-2">
      <div v-tooltip.left="tooltip" class="input-wrapper flex items-center gap-2">
        <ColorPicker :inputId="fieldId" v-model="internalValue" defaultColor="ffffff"
          :class="{ 'color-is-null': !internalValue }" />
        <InputText v-model="internalValue" class="color-hex-input" />
        <label :for="fieldId" class="ml-1">{{ label }}</label>
        <Button icon="pi pi-times" text rounded severity="secondary" aria-label="Reset Color"
          @click="internalValue = null" v-tooltip.bottom="'Reset Color'" :disabled="internalValue === null"
          class="p-button-sm ml-1" />
      </div>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">
        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- Boolean Three-State Switch (true/false/undefined for mod system) -->
    <div v-else-if="fieldType === 'boolean'" class="field-container p-field flex items-center gap-2">

      <div v-tooltip.left="tooltip" class="input-wrapper flex items-center gap-2">
        <TriStateSwitch v-model="internalValue" :inputId="fieldId" />
        <label>{{ label }}</label>
      </div>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">
        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- Textarea Input -->
    <div v-else-if="fieldType === 'textarea'" class="field-container">
      <FloatLabel variant="on" class="p-float-label-variant-on input-wrapper">

        <Textarea v-model="internalValue" autoResize v-tooltip.left="tooltip" class="w-full" v-preserve-scroll />
        <label :for="fieldId">{{ label }}</label>
      </FloatLabel>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">
        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- HTML Area Input -->
    <div v-else-if="fieldType === 'htmlarea'" class="field-container html-area-field">
      <div class="input-wrapper">
        <div class="flex items-center justify-between mb-2">
          <label :for="fieldId" class="block">{{ label }}</label>
          <Button :icon="isHtmlMode ? 'pi pi-eye' : 'pi pi-code'" :label="isHtmlMode ? 'Visual' : 'HTML'"
            @click="toggleHtmlMode" size="small" severity="secondary" outlined
            v-tooltip.top="isHtmlMode ? 'Switch to Visual Editor' : 'View HTML Source'" />
        </div>

        <Editor v-if="!isHtmlMode" v-model="internalValue" :modules="editorModules" @load="onEditorInit"
          v-tooltip.left="tooltip" editorStyle="height: 200px" class="w-full" />

        <Textarea v-else v-model="htmlContent" autoResize v-tooltip.left="tooltip" class="w-full html-source-editor"
          :style="{ minHeight: '200px', fontFamily: 'var(--font-family-mono)', fontSize: '0.875rem' }"
          v-preserve-scroll />
      </div>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">
        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- Choose One (Dropdown) -->

    <div v-else-if="fieldType === 'chooseOne'" class="field-container">

      <FloatLabel variant="on" class="p-float-label-variant-on input-wrapper">

        <Select :inputId="fieldId" v-model="internalValue" :options="options" :optionLabel="optionLabel"
          :optionValue="optionValue" filter class="w-full" :resetFilterOnHide="true" v-tooltip.left="tooltip"
          showClear />
        <label :for="fieldId">{{ label }}</label>
      </FloatLabel>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">
        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- Choose Many (MultiSelect) -->
    <div v-else-if="fieldType === 'chooseMany'" class="field-container">
      <FloatLabel variant="on" class="p-float-label-variant-on input-wrapper">

        <div v-tooltip.left="tooltip">
          <MultiSelect :inputId="fieldId" v-model="internalValue" :options="options" :optionLabel="optionLabel"
            :optionValue="optionValue" filter display="chip" :resetFilterOnHide="true" class="w-full" />
        </div>
        <label :for="fieldId">{{ label }}</label>
      </FloatLabel>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">
        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- String Array -->
    <div v-else-if="fieldType === 'string[]'" class="field-container string-array-field">
      <div v-tooltip.left="tooltip" class="input-wrapper">
        <StringArrayInput
          :model-value="internalValue"
          @update:model-value="val => internalValue = val"
          :label="label"
          :tooltip="tooltip"
          :allow-and-mode="effectiveFieldSchema?.allowAndMode"
        />
      </div>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">
        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- Number Array -->
    <div v-else-if="fieldType === 'number[]'" class="field-container number-array-field">

      <div v-tooltip.left="tooltip" class="input-wrapper">
        <label class="block mb-2 font-medium">{{ label }}</label>
        <div ref="numberListContainer" class="space-y-2">
          <div v-for="(item, index) in localNumberArray" :key="index" class="flex items-center gap-2 number-array-item"
            :class="{ 'non-draggable-empty': index === localNumberArray.length - 1 && item === null }">
            <Button icon="pi pi-bars" text rounded class="drag-handle cursor-move p-button-sm"
              aria-label="Drag to reorder" />
            <InputNumber :step="stepValue" showButtons v-model="localNumberArray[index]" mode="decimal"
              :maxFractionDigits="2" class="flex-grow"
              @input="(event) => localNumberArray[index] = typeof event.value === 'number' ? event.value : null" />
            <Button icon="pi pi-trash" severity="danger" class="p-button-sm" aria-label="Remove Item"
              @click="deleteNumberItem(index)"
              :disabled="localNumberArray.length === 1 && localNumberArray[0] === null" />
          </div>
        </div>
      </div>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">

        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- File Field (Single) -->
    <div v-else-if="fieldType === 'file'" class="field-container file-field">
      <div class="input-wrapper">
        <FileInput v-model="internalValue"
          :file-type="fileType as 'image' | 'video' | 'asset' | 'atlas' | 'json' | 'spine_skeleton' | 'audio' | 'css' | 'js'"
          :label="label" :tooltip="tooltip" :field-id="fieldId" />
      </div>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">
        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- File Array -->
    <div v-else-if="fieldType === 'file[]'" class="field-container file-array-field">
      <div class="input-wrapper">
        <FileInput v-model="internalValue"
          :file-type="fileType as 'image' | 'video' | 'asset' | 'atlas' | 'json' | 'spine_skeleton' | 'audio' | 'css' | 'js'"
          :label="label" :tooltip="tooltip" :field-id="fieldId" :multiple="true" />
      </div>
      <div class="core-data-display" v-if="parentCoreDataItem !== null">
        <pre>{{ displayCoreValue(fieldCoreValue) }}</pre>
      </div>
    </div>

    <!-- Schema (Nested Object - Single) -->
    <div v-else-if="fieldType === 'schema'" class="field-container nested-schema-field">
      <div class="input-wrapper">

        <div v-tooltip.left="tooltip" class="schema-header">
          <ToggleSwitch v-model="isNestedSchemaEnabled" :inputId="fieldId + '-switch'" />
          <label>{{ label }}</label>
          <InputText v-if="isNestedSchemaEnabled"
            :modelValue="editor.schemaKeyFilters.value[fieldKey] ?? ''"
            @update:modelValue="val => editor.schemaKeyFilters.value[fieldKey] = val ?? ''"
            placeholder="Filter keys..."
            size="small"
            class="schema-key-filter-input" />
          <Button v-if="isNestedSchemaEnabled && editor.schemaKeyFilters.value[fieldKey]"
            icon="pi pi-times"
            size="small"
            severity="secondary"
            text
            @click="editor.schemaKeyFilters.value[fieldKey] = ''" />
        </div>
        <NestedSchemaRenderer v-if="isNestedSchemaEnabled && objectsSchema" :schema="objectsSchema"
          :modelValue="internalValue" @update:modelValue="emit('update:modelValue', $event)"
          :core-data-for-nested-schema="fieldCoreValue" :item-data="props.itemData" :root-schema="props.rootSchema"
          :field-id-prefix="fieldId" :filter-key="fieldKey" />
      </div>
    </div>

    <!-- Schema Array -->
    <div v-else-if="fieldType === 'schema[]'" class="field-container schema-array-field">
      <div class="input-wrapper">

        <div v-tooltip.left="tooltip" class="nested_top_wrapper">
          <label class="block mb-2 font-medium">{{ label }}</label>
        </div>

        <!-- List Container -->
        <div ref="schemaListContainer" class="space-y-4">
          <div v-for="(item, index) in localSchemaArray" :key="item.uid"
            class="flex items-start gap-2 schema-array-item relative p-3 border-round border-1 border-surface-200">
            <!-- Drag Handle (Positioned Top-Left for block element) -->
            <Button icon="pi pi-bars" text rounded
              class="drag-handle cursor-move p-button-sm absolute top-0 left-0 mt-1 ml-1"
              aria-label="Drag to reorder" />

            <!-- Nested Renderer takes full width -->
            <NestedSchemaRenderer :schema="objectsSchema || {}" v-model="localSchemaArray[index]" class="flex-grow pt-4"
              :core-data-for-nested-schema="fieldCoreValue && Array.isArray(fieldCoreValue) && item.id ? fieldCoreValue.find(coreItem => coreItem.id === item.id) : null"
              :item-data="props.itemData" :root-schema="props.rootSchema" :field-id-prefix="`${fieldId}-${index}`" />

            <!-- Delete Button (Positioned Top-Right) -->
            <Button icon="pi pi-trash" severity="danger" class="p-button-sm absolute top-0 right-0 mt-1 mr-1"
              aria-label="Remove Item" @click="deleteSchemaItem(index)" />
          </div>
        </div>

        <!-- Add Item Button -->
        <div class="mt-3">
          <Button label="Add" icon="pi pi-plus" @click="addSchemaItem" size="small" />
        </div>
      </div>
    </div>

    <!-- Incorrect Field (for non-existent filter field paths) -->
    <div v-else-if="fieldType === 'incorrect'" class="field-container incorrect-field">
      <div class="incorrect-field-warning">
        <i class="pi pi-exclamation-triangle"></i>
        <span class="incorrect-field-label">{{ label }}</span>
        <span class="incorrect-field-message">{{ tooltip }}</span>
      </div>
    </div>

    <div v-else class="unsupported-field">
      Unsupported type: {{ fieldType }} for field {{ fieldKey }}
    </div>

    <!-- Prompt Dialog for Image URL -->
    <Dialog v-model:visible="promptDialog.visible" header="Enter Image URL" :modal="true" :closable="false"
      :style="{ width: '450px' }">
      <div @keydown.enter="submitPrompt(promptDialog.value)">
        <InputText v-model="promptDialog.value" style="width: 100%;" />
      </div>
      <template #footer>
        <Button label="Cancel" @click="submitPrompt(null)" severity="secondary" />
        <Button label="OK" @click="submitPrompt(promptDialog.value)" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.form-field-renderer {
  width: 100%;
  /* Ensure it takes full width */
}

.field-container {
  display: flex;
  gap: 1rem;
  /* Space between input and core data */
  align-items: center;
  /* Align items to the top */
  margin-bottom: 1rem;
  /* Consistent spacing between fields */
}

.input-wrapper {
  flex: 2;
  /* Input takes more space */
  min-width: 0;
  /* Prevent overflow in flex container */
}

.core-data-display {
  flex: 1;
  /* Core data takes less space */
  background-color: var(--p-surface-50);
  border: 1px solid var(--p-surface-200);
  padding: 0.5rem;
  border-radius: var(--p-border-radius);
  font-size: 0.875rem;
  overflow-x: auto;
  /* Allow horizontal scroll for long content */
  max-height: 300px;
  /* Limit height for very long JSON */
}

.core-data-display pre {
  margin: 0;
  white-space: pre-wrap;
  /* Wrap long lines */
  word-break: break-all;
  /* Break words to prevent overflow */
}

.core-data-display em {
  color: var(--p-text-color-secondary);
}

/* Color Picker Hex Input */
.color-hex-input {
  width: 120px;
  font-family: var(--font-family-mono);
  font-size: 0.9rem;
  text-transform: uppercase;
}

/* Range input label */
.range-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

/* Schema field header */
.schema-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.schema-header label {
  font-weight: 500;
}

.schema-key-filter-input {
  max-width: 200px;
}

/* Styles from Dform that apply per field */
.unsupported-field {
  color: var(--p-red-500);
  font-style: italic;
}

.p-float-label-variant-on>label {
  background: var(--p-surface-ground);
  padding: 0 0.25rem;
}

.w-full {
  width: 100%;
}

.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.gap-2 {
  gap: 0.5rem;
}

/* Add styles for label positioning if needed */
.block {
  display: block;
}

.mb-2 {
  margin-bottom: 0.5rem;
}

/* String Array Styles */
.string-array-field .font-medium {
  font-weight: 500;
  /* Or use PrimeVue variables */
}

.string-array-item .p-button-sm {
  /* Adjust button size if needed */
  height: 2rem;
  width: 2rem;
}

.space-y-2> :not([hidden])~ :not([hidden]) {
  --tw-space-y-reverse: 0;
  margin-top: calc(0.5rem * calc(1 - var(--tw-space-y-reverse)));
  margin-bottom: calc(0.5rem * var(--tw-space-y-reverse));
}

.flex-grow {
  flex-grow: 1;
}

.cursor-move {
  cursor: move;
}

/* Number Array Styles (can share with string array or be specific) */
.number-array-field .font-medium {
  font-weight: 500;
}

.number-array-item .p-button-sm {
  height: 2rem;
  width: 2rem;
}


/* Styles for nested schema */
.nested-schema-field .font-medium {
  font-weight: 500;
}

/* Face Picker Button */
.face-picker-button {
  flex-shrink: 0;
  margin-right: 0.5rem;
}

/* Schema Array Styles */
.schema-array-field .font-medium {
  font-weight: 500;
}

.schema-array-item .p-button-sm {
  height: 2rem;
  /* width: 2rem; */
  flex-shrink: 0;
}

.schema-array-item .flex-grow {
  flex-grow: 1;
}

.space-y-4> :not([hidden])~ :not([hidden]) {
  --tw-space-y-reverse: 0;
  margin-top: calc(1rem * calc(1 - var(--tw-space-y-reverse)));
  /* Corresponds to space-y-4 */
  margin-bottom: calc(1rem * var(--tw-space-y-reverse));
}

/* HTML Source Editor Styles */
.html-source-editor {
  background-color: var(--p-surface-100);
  border: 1px solid var(--p-surface-300);
  border-radius: var(--p-border-radius);
  padding: 0.75rem;
}

.html-source-editor:focus {
  border-color: var(--p-primary-color);
  box-shadow: 0 0 0 0.2rem var(--p-primary-100);
}

.justify-between {
  justify-content: space-between;
}

/* Incorrect Field Warning Styles */
.incorrect-field-warning {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background-color: var(--p-yellow-50);
  border: 1px solid var(--p-yellow-300);
  border-radius: var(--p-border-radius);
  color: var(--p-yellow-700);
  font-size: 0.875rem;
}

.incorrect-field-warning i {
  color: var(--p-yellow-600);
  font-size: 1rem;
}

.incorrect-field-label {
  font-weight: 500;
  font-family: var(--font-family-mono);
}

.incorrect-field-message {
  color: var(--p-yellow-600);
}
</style>