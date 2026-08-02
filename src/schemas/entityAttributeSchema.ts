import { Schema, SchemaToType } from '../utility/schema';

export const EntityAttributeSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the entity attribute.' },
    id: { type: 'string', required: true, tooltip: 'Attribute ID used to reference this attribute in code.' },
    values: { type: 'string[]', tooltip: 'List of possible values for this attribute (e.g., for "emotion": ["happy", "sad", "angry"]).' },
    order: { type: 'number', tooltip: 'Sort position in the attributes list (ascending; unset = 0). Skin layers watching several attributes compose their image/mask/spine keys in this order (applied when the layer is saved in the editor).' },
    description: { type: 'textarea', tooltip: 'A description of what this attribute represents.' },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type EntityAttributeObject = SchemaToType<typeof EntityAttributeSchema>;