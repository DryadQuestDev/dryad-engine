/**
 * Represents the definition for a single field within a schema.
 */
export interface Schemable {
  type: 'uid' | 'string' | 'number' | 'boolean' | 'textarea' | 'htmlarea' | 'chooseOne' | 'chooseMany' | 'string[]' | 'number[]' | 'file' | 'file[]' | 'schema' | 'schema[]' | 'color';
  label?: string;
  tooltip?: string;
  options?: any[];
  optionLabel?: string; // Property name to use as label when options are objects (e.g., 'name' or 'label')
  optionValue?: string; // Property name to use as value when options are objects (e.g., 'id' or 'value')
  fromFile?: string;
  isFromPlugins?: boolean; // if true, the field's values are loaded from plugin folders
  logic?: string; //special logic for the field
  // 'chooseOne' refers to 'values' field in the file
  fromFileType?: 'string' | 'number' | 'boolean' | 'chooseOne' | 'custom';
  fromFileTypeAnd?: Record<string, any>; // Object mapping property paths to required values
  fromFileTypeOr?: Record<string, any>; // Object mapping property paths to required values (at least one must match)
  defaultValue?: any;
  required?: boolean;
  fileType?: string;
  step?: number; // for number fields
  show?: {
    [key: string]: any[];
  }
  objects?: Schema; // Optional: Holds the nested schema definition when type is 'schema'
  // Add other potential constraints like min, max, pattern etc. if needed
}

export type Schema = Record<string, Schemable>;

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