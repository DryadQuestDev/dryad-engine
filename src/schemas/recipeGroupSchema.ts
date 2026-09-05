import { Schema, SchemaToType } from '../utility/schema';

export const RecipeGroupSchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the recipe group.' },
  id: { type: 'string', required: true, tooltip: 'Group ID used to reference this group from an inventory.' },
  name: { type: 'string', tooltip: 'Group name, e.g. "Cooking" or "Alchemy".' },
  description: { type: 'htmlarea', tooltip: 'What this group of recipes is for.' },
  tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type RecipeGroupObject = SchemaToType<typeof RecipeGroupSchema>;
