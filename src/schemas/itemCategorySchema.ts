import { Schema, SchemaToType } from '../utility/schema';

export const ItemCategorySchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the item category.' },
    id: { type: 'string', required: true, tooltip: 'Category id referenced by an item\'s category field.' },
    name: { type: 'string', tooltip: 'Tab label shown in the inventory filter bar.' },
    singular: { type: 'string', tooltip: 'Singular label shown on an item card (e.g. "Trinket"). The inventory tab uses the plural "name". Falls back to name if empty.' },
    icon: { type: 'file', fileType: 'image', tooltip: 'Tab icon image for this category in the inventory filter bar.' },
    order: { type: 'number', tooltip: 'Filter tab order (lower shows first).' },
} as const satisfies Schema;

export type ItemCategoryObject = SchemaToType<typeof ItemCategorySchema>;
