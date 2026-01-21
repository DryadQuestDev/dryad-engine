import { type Ref, ref, watch } from 'vue';
import { Editor } from '../../editor';
import { Global } from '../../../global/global';
import type { Schemable, Schema } from '../../../utility/schema';

/**
 * Configuration for generating dynamic filter fields from a pool definition.
 */
export interface BuildFiltersConfig {
  refField: string;       // Field in current item that references the pool, e.g., "pool"
  refFile: string;        // File containing pool definitions, e.g., "pool_definitions"
  sourceField: string;    // Field in pool definition containing source schema ID, e.g., "source"
  fieldsPath: string;     // Path to filter_fields array in pool definition, e.g., "filter_fields"
}

/**
 * Composable for generating dynamic schema from a pool definition's filter_fields.
 * Used by pool entries to generate filters_include/filters_exclude fields.
 * Returns a Schema object that can be used with NestedSchemaRenderer.
 *
 * @param config - Configuration for building filters (refField, refFile, sourceField, fieldsPath)
 * @param formData - Reactive form data containing the pool reference
 */
export function useGeneratedFields(
  config: Ref<BuildFiltersConfig | null | undefined>,
  formData: Ref<Record<string, any> | null | undefined>
) {
  const editor = Editor.getInstance();

  // Cache for loaded reference data
  const refDataCache = ref<Record<string, any[]>>({});
  const isLoading = ref(false);

  // Load reference data when needed
  async function loadRefData(refFile: string): Promise<any[]> {
    if (refDataCache.value[refFile]) {
      return refDataCache.value[refFile];
    }

    try {
      isLoading.value = true;
      const data = await editor.loadFullData(refFile);
      refDataCache.value[refFile] = data || [];
      return refDataCache.value[refFile];
    } catch (error) {
      console.warn(`[useGeneratedFields] Failed to load ref data for ${refFile}:`, error);
      return [];
    } finally {
      isLoading.value = false;
    }
  }

  // Get schema for a source file from editor tabs
  function getSchemaForSource(sourceId: string): Schema | null {
    const allTabs = editor.getAllTabs();
    for (const tab of allTabs) {
      for (const subtab of tab.subtabs) {
        if (subtab.file === sourceId || subtab.id === sourceId) {
          return subtab.schema || null;
        }
      }
    }
    return null;
  }

  // Convert a loaded data item (e.g., trait/attribute definition) to a Schemable
  // Note: For filter fields, 'number' maps to 'range', 'chooseOne' maps to 'chooseMany'
  function dataItemToSchemable(item: any): Schemable {
    const typeMap: Record<string, Schemable> = {
      'number': { type: 'range' },  // Use range for filtering numeric fields
      'string': { type: 'string' },
      'boolean': { type: 'boolean' },
      'textarea': { type: 'textarea' },
      'htmlarea': { type: 'htmlarea' },
      'color': { type: 'color' },
      'image': { type: 'file', fileType: 'image' },
      'video': { type: 'file', fileType: 'video' },
      'chooseOne': { type: 'chooseMany', options: item.values || [] },  // chooseOne → chooseMany for filters
      'chooseMany': { type: 'chooseMany', options: item.values || [] },
      'array': { type: 'string[]', allowAndMode: true },  // Enable AND/OR toggle for filter fields
    };

    let schemable: Schemable;

    if (item.type && typeMap[item.type]) {
      // Use explicit type if provided
      schemable = { ...typeMap[item.type] };
    } else if (item.values && Array.isArray(item.values)) {
      // If item has values array (like attributes), treat as chooseMany for filtering
      schemable = { type: 'chooseMany', options: item.values };
    } else {
      // Default fallback
      schemable = { type: 'string' };
    }

    if (item.description) {
      schemable.tooltip = item.description;
    }
    return schemable;
  }

  // Transform a Schemable for filter purposes (e.g., number → range, string[] → allowAndMode)
  function toFilterSchemable(schema: Schemable): Schemable {
    // Number fields should use range for min/max filtering
    if (schema.type === 'number') {
      return { ...schema, type: 'range' };
    }
    // String array fields should have AND/OR toggle in filters
    if (schema.type === 'string[]') {
      return { ...schema, allowAndMode: true };
    }
    return schema;
  }

  // Convert fromFileType to a Schemable (for schema fields with uniform child types)
  // For chooseOne/chooseMany, we need the data item to get its values array
  // Note: chooseOne → chooseMany for filters (allow selecting multiple possible values)
  function fromFileTypeToSchemable(fromFileType: string, dataItem?: any): Schemable {
    // For selection types, we need the actual values from the data item
    // chooseOne becomes chooseMany for filtering (match any of selected values)
    if (fromFileType === 'chooseOne' || fromFileType === 'chooseMany') {
      const options = dataItem?.values || [];
      return { type: 'chooseMany', options };
    }

    const typeMap: Record<string, Schemable> = {
      'number': { type: 'range' },  // Use range for filtering numeric fields
      'string': { type: 'string' },
      'boolean': { type: 'boolean' },
    };
    return typeMap[fromFileType] || { type: 'string' };
  }

  // Process chooseOne/chooseMany fields with fromFile - load options from the file
  async function processChooseFieldWithFromFile(field: Schemable): Promise<Schemable> {
    if (!field.fromFile) return field;
    if (field.type !== 'chooseOne' && field.type !== 'chooseMany') return field;

    // Load data from the referenced file
    const refData = await editor.loadFullData(field.fromFile);
    if (!refData || !Array.isArray(refData)) {
      return { type: 'chooseMany', options: [] };
    }

    // Extract IDs as options
    const options = refData.map((item: any) => item.id).filter(Boolean);
    // For filters, always use chooseMany (allow multi-select)
    return { type: 'chooseMany', options };
  }

  // Navigate nested schema using dot notation (e.g., "traits.rarity")
  // Handles dynamic fromFile schemas by loading data from files (including plugins)
  async function getNestedSchema(schema: Schema | null, path: string): Promise<Schemable | null> {
    if (!schema) return null;

    const parts = path.split('.');
    let current: any = schema;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!current) return null;

      // Handle nested schema objects
      if (current.objects) {
        current = current.objects;
      }

      const field = current[part];
      if (!field) return null;

      // Check if this is a schema field with fromFile (dynamic nested schema)
      if (field.type === 'schema' && field.fromFile && i < parts.length - 1) {
        // Load the data from the referenced file (includes plugins, _core, mod)
        const refData = await editor.loadFullData(field.fromFile);
        if (!refData || !Array.isArray(refData)) return null;

        // The next path segment should be an ID in the loaded data
        const nextPart = parts[i + 1];
        const dataItem = refData.find((item: any) => item.id === nextPart);
        if (!dataItem) return null;

        // If this is the last segment, return the Schemable for this data item
        if (i + 1 === parts.length - 1) {
          // If the parent schema has a specific fromFileType (not 'custom'), use that
          // e.g., price: { type: 'schema', fromFile: 'item_templates', fromFileType: 'number' }
          // 'custom' means "use the item's own type field"
          if (field.fromFileType && field.fromFileType !== 'custom') {
            return fromFileTypeToSchemable(field.fromFileType, dataItem);
          }
          return dataItemToSchemable(dataItem);
        }

        // Continue with remaining path segments (for deeply nested paths)
        i++; // Skip the next part as we've already processed it
        // If fromFileType is specified (not 'custom'), use it; otherwise infer from data item
        current = (field.fromFileType && field.fromFileType !== 'custom')
          ? fromFileTypeToSchemable(field.fromFileType, dataItem)
          : dataItemToSchemable(dataItem);
      } else {
        current = field;
      }
    }

    // If the final field is a chooseOne/chooseMany with fromFile, load the options
    if (current && (current.type === 'chooseOne' || current.type === 'chooseMany') && current.fromFile) {
      return processChooseFieldWithFromFile(current);
    }

    return current ?? null;
  }

  // Reactive dynamic schema (instead of GeneratedField[])
  const dynamicFilterSchema = ref<Schema | null>(null);

  // Track previous pool reference to only run cleanup when pool changes
  const previousRefId = ref<string | null>(null);

  // Watch for changes and regenerate schema
  watch(
    [() => config.value, () => formData.value],
    async ([cfg, data]) => {
      if (!cfg) {
        dynamicFilterSchema.value = null;
        return;
      }

      const { refField, refFile, sourceField, fieldsPath } = cfg;

      // Get the referenced item ID from form data
      const refId = data?.[refField];
      if (!refId) {
        dynamicFilterSchema.value = null;
        return;
      }

      // Load reference data
      const refData = await loadRefData(refFile);
      const refItem = refData.find(item => item.id === refId);
      if (!refItem) {
        dynamicFilterSchema.value = null;
        return;
      }

      // Get the source schema ID and schema
      const sourceSchemaId = refItem[sourceField];
      const sourceSchema = getSchemaForSource(sourceSchemaId);

      // Get filter field keys (string[])
      const keys: string[] = refItem[fieldsPath] || [];

      // Build the Schema object
      const builtSchema: Schema = {};

      for (const key of keys) {
        const sourceFieldSchema = await getNestedSchema(sourceSchema, key);

        if (sourceFieldSchema) {
          // Transform for filter use (e.g., number → range) and set label
          const filterSchema = toFilterSchemable(sourceFieldSchema);
          builtSchema[key] = {
            ...filterSchema,
            label: filterSchema.label || key
          };
        } else {
          // Field not found - use 'incorrect' type to show a warning
          builtSchema[key] = {
            type: 'incorrect',
            label: key,
            tooltip: `Field "${key}" not found in ${sourceSchemaId} schema`
          };
        }
      }

      dynamicFilterSchema.value = Object.keys(builtSchema).length > 0 ? builtSchema : null;

      // Only clean orphan filter fields when the pool selection changes (not on every form change)
      const poolChanged = refId !== previousRefId.value;
      previousRefId.value = refId;

      if (poolChanged && data?.entities && Array.isArray(data.entities)) {
        const validFields = new Set(keys);
        let removedCount = 0;

        for (const entity of data.entities) {
          // Clean filters_include
          if (entity.filters_include && typeof entity.filters_include === 'object') {
            for (const key in entity.filters_include) {
              if (!validFields.has(key)) {
                delete entity.filters_include[key];
                removedCount++;
              }
            }
          }
          // Clean filters_exclude
          if (entity.filters_exclude && typeof entity.filters_exclude === 'object') {
            for (const key in entity.filters_exclude) {
              if (!validFields.has(key)) {
                delete entity.filters_exclude[key];
                removedCount++;
              }
            }
          }
        }

        if (removedCount > 0) {
          editor.hasUnsavedChanges.value = true;
          Global.getInstance().addNotificationId('pool_entries_cleaned', { count: removedCount });
        }
      }
    },
    { immediate: true, deep: true }
  );

  return {
    dynamicFilterSchema,
    isLoading
  };
}
