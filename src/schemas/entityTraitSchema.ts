import { Schema, SchemaToType } from '../utility/schema';
import { CustomValueSchema } from './schemaParts';

export const EntityTraitSchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the entity trait.' },
  id: { type: 'string', required: true, tooltip: 'Trait ID used to reference this trait in code.' },
  ...CustomValueSchema,
  order: { type: 'number', tooltip: 'Display order in the traits list (lower numbers appear first).' },
  is_persistent: { type: 'boolean', tooltip: 'If true, the trait value will be retrieved from the template instead of the live instance. Useful for mid-production updates and mod compatibility with save files.' },
  description: { type: 'textarea', tooltip: 'Description of what this trait represents.' },
  tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type EntityTraitObject = SchemaToType<typeof EntityTraitSchema>;