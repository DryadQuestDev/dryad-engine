import { Schema, SchemaToType } from '../utility/schema';

export const PoolDefinitionSchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the pool definition.' },
  id: { type: 'string', required: true, tooltip: 'Pool ID used to reference this pool in code.' },
  source: { type: 'chooseOne', fromLogic: 'available_sources', tooltip: 'The data source to draw from (e.g., item_templates, character_templates).' },
  filter_fields: { type: 'string[]', tooltip: 'Field keys from source schema to use as filters (e.g., "name", "traits.rarity", "properties.level").' },
  tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering pools.' },
} as const satisfies Schema;

export type PoolDefinitionObject = SchemaToType<typeof PoolDefinitionSchema>;
