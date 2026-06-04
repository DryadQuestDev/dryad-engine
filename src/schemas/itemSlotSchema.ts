import { Schema, SchemaToType } from '../utility/schema';

export const ItemSlotSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the item slot.' },
    id: { type: 'string', required: true, tooltip: 'Slot ID used to reference this slot type in code (e.g., "weapon", "helmet", "ring").' },
    name: { type: 'string', tooltip: "Slot's display name shown to users in the UI." },
    image: { type: 'file', fileType: 'image', tooltip: 'Background image displayed when the slot is empty.' },
    max_stack: { type: 'number', tooltip: 'Optional cap on item quantity equipped in this slot. When equipping more, only this many transfer to the slot and the remainder stays as an unequipped stack of the same id. 0 / empty = unlimited (current behavior).' },
} as const satisfies Schema;

export type ItemSlotObject = SchemaToType<typeof ItemSlotSchema>;