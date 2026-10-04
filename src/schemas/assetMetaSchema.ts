import { Schema, SchemaToType } from '../utility/schema';
import { CustomValueSchema } from './schemaParts';

export const AssetMetaSchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the asset meta field.' },
  id: { type: 'string', required: true, tooltip: 'Key used to reference this meta field in code (asset.meta[id]).' },
  ...CustomValueSchema,
  order: { type: 'number', tooltip: 'Display order in the meta fields list (lower numbers appear first).' },
  description: { type: 'textarea', tooltip: 'Description of what this meta field represents.' },
  tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type AssetMetaObject = SchemaToType<typeof AssetMetaSchema>;
