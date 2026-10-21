/**
 * Represents the definition for a single field within a schema.
 */
export interface Schemable {
  type: 'uid' | 'string' | 'number' | 'boolean' | 'textarea' | 'htmlarea' | 'chooseOne' | 'chooseMany' | 'string[]' | 'number[]' | 'file' | 'file[]' | 'schema' | 'schema[]' | 'color' | 'range' | 'incorrect';
  label?: string;
  tooltip?: string;
  options?: any[];
  optionLabel?: string; // Property name to use as label when options are objects (e.g., 'name' or 'label')
  optionValue?: string; // Property name to use as value when options are objects (e.g., 'id' or 'value')
  fromFile?: string;
  fromLogic?: string; // special logic for populating options dynamically (e.g., 'available_sources')
  isFromPlugins?: boolean; // if true, the field's values are loaded from plugin folders
  logic?: string; //special logic for the field
  // 'chooseOne' refers to 'values' field in the file
  fromFileType?: 'string' | 'number' | 'boolean' | 'chooseOne' | 'chooseMany' | 'custom' | 'values';
  fromFileTypeAnd?: Record<string, any>; // Object mapping property paths to required values
  fromFileTypeOr?: Record<string, any>; // Object mapping property paths to required values (at least one must match)
  defaultValue?: any;
  required?: boolean;
  fileType?: string;
  step?: number; // for number fields
  min?: number; // minimum value for number fields
  max?: number; // maximum value for number fields
  show?: {
    [key: string]: any[] | '$falsy' | '$truthy';
  }
  objects?: Schema; // Optional: Holds the nested schema definition when type is 'schema'
  allowAndMode?: boolean; // Show AND/OR toggle for string[] fields (used in filter fields)
  externalFile?: string; // If set, this field's value is stored in a sibling file with this name instead of inside the JSON
}

export type Schema = Record<string, Schemable>;

/**
 * Whether a field's `show` conditions hold for `data`: each names another field and the values
 * that show this one (`$truthy` / `$falsy` for any set or unset value). In a mod, an unset value
 * falls back to the core entry's. The form hides a field that fails, and drops its value.
 */
export function isFieldShown(show: Schemable['show'], data: Record<string, any> | null | undefined, coreData?: Record<string, any> | null): boolean {
  if (!show || Object.keys(show).length === 0) return true;
  if (!data) return false;
  for (const key in show) {
    const expected = show[key];
    let actual = data[key];
    if ((actual === undefined || actual === null) && coreData && typeof coreData === 'object') actual = coreData[key];
    if (expected === '$truthy') { if (!actual) return false; continue; }
    if (expected === '$falsy') { if (actual) return false; continue; }
    if (!Array.isArray(expected) || !expected.includes(actual)) return false;
  }
  return true;
}

/**
 * Delete the values of fields whose `show` conditions fail, as the form does when it renders
 * them; nested objects too. List items are left alone: the form only drops what it renders.
 */
export function dropHiddenFields(data: any, schema: Schema, coreData?: any): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  for (const key in schema) {
    const field = schema[key];
    if (!field) continue;
    if (field.show && !isFieldShown(field.show, data, coreData)) {
      delete data[key];
      continue;
    }
    if (field.type === 'schema' && field.objects) dropHiddenFields(data[key], field.objects, coreData?.[key]);
  }
}

// Helper types for the revised SchemaToType
// Find keys for required properties
type RequiredKeys<T extends Schema> = {
  [K in keyof T]: T[K]['required'] extends true ? K : never;
}[keyof T];

// Find keys for optional properties
type OptionalKeys<T extends Schema> = Exclude<keyof T, RequiredKeys<T>>;

// Map schema types to base types without considering required/optional yet
type MappedBaseType<T extends Schema> = {
  [K in keyof T]:
  T[K]['type'] extends 'uid' | 'string' | 'file' | 'textarea' | 'htmlarea' | 'chooseOne' | 'color' ? string :
  T[K]['type'] extends 'number' ? number :
  T[K]['type'] extends 'boolean' ? boolean :
  T[K]['type'] extends 'string[]' | 'file[]' | 'chooseMany' ? string[] :
  T[K]['type'] extends 'number[]' ? number[] :
  T[K]['type'] extends 'range' ? { min?: number; max?: number } : // Handle 'range' type as object
  T[K]['type'] extends 'schema' ? SchemaToType<NonNullable<T[K]['objects']>> : // Handle 'schema' type
  T[K]['type'] extends 'schema[]' ? SchemaToType<NonNullable<T[K]['objects']>>[] : // Handle 'schema[]' type
  never;
};

// Revised SchemaToType using Required/Partial/Pick
export type SchemaToType<T extends Schema> =
  // Make properties defined as required in the schema truly required
  Required<Pick<MappedBaseType<T>, RequiredKeys<T>>> &
  // Make properties not defined as required in the schema optional
  Partial<Pick<MappedBaseType<T>, OptionalKeys<T>>>;

export function createSchema<T extends Schema>(schema: T): T {
  return schema;
}

const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];
const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi'];

const fileTypeExtensions: Record<NonNullable<Schemable['fileType']>, string[]> = {
  image: imageExtensions,
  video: videoExtensions,
  atlas: ['atlas'],
  json: ['json'],
  spine_skeleton: ['json', 'skel'],
  asset: [...imageExtensions, ...videoExtensions],
  audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac'],
  css: ['css'],
  js: ['js', 'mjs'],
};

export function getFileExtensions(fileType: string): string[] {
  return fileTypeExtensions[fileType as NonNullable<Schemable['fileType']>] || [];
}