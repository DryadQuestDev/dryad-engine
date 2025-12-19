import { Schema, SchemaToType } from '../utility/schema';

export const EntityStatSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the entity stat.' },
    id: { type: 'string', required: true, tooltip: 'Stat ID used to reference this stat in code.' },
    order: { type: 'number', tooltip: 'Display order in the stats list (lower numbers appear first).' },
    name: { type: 'string', tooltip: 'Display name of the stat shown to users.' },
    description: { type: 'textarea', tooltip: 'Description of what this stat represents(inside Editor).' },
    ingame_description: { type: 'htmlarea', tooltip: 'In-game description of the stat.' },
    precision: { type: 'number', tooltip: 'Number of decimal places to display (e.g., 0 for integers, 2 for values like 99.99).' },
    is_hidden: { type: 'boolean', tooltip: 'If true, this stat is hidden from the UI but still exists in data.' },
    is_resource: { type: 'boolean', tooltip: 'If true, this stat acts as a resource with current/max values (e.g., health, mana).' },
    is_replenishable: { type: 'boolean', show: { is_resource: [true] }, tooltip: 'If true, the resource will be replenished by the amount of value added to the stat.' },
    is_safe_removal: { type: 'boolean', show: { is_replenishable: [true] }, tooltip: 'If true, the resource will be set to 1 instead of 0 when a status is removed. Useful for resources like health to avoid auto death when unequpping an item.' },
    can_overflow: { type: 'boolean', show: { is_resource: [true] }, tooltip: 'If true, the current value can exceed the maximum value.' },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type EntityStatObject = SchemaToType<typeof EntityStatSchema>;