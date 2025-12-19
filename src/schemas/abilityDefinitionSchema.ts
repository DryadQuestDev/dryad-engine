import { Schema, SchemaToType } from '../utility/schema';
import { CustomValueSchema } from './schemaParts';

export const AbilityDefinitionSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the ability definition.' },
    id: { type: 'string', required: true, tooltip: 'Trait ID used to reference this definition in code.' },
    role: { type: 'chooseOne', options: ['meta', 'aspect'], defaultValue: 'aspect', tooltip: 'Meta describes the ability meta data like name, icon, etc.\n Aspect describes the ability effect aspects when used like damage, healing, summoning, etc.' },
    ...CustomValueSchema,
    order: { type: 'number', tooltip: 'Display order in the definition list (lower numbers appear first).' },
    description: { type: 'textarea', tooltip: 'Description of what this definition represents.' },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type AbilityDefinitionObject = SchemaToType<typeof AbilityDefinitionSchema>;