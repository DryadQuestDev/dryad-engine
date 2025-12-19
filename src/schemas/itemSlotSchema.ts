import { Schema, SchemaToType } from '../utility/schema';

export const ItemSlotSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the item slot.' },
    id: { type: 'string', required: true, tooltip: 'Slot ID used to reference this slot type in code (e.g., "weapon", "helmet", "ring").' },
    name: { type: 'string', tooltip: "Slot's display name shown to users in the UI." },
    image: { type: 'file', fileType: 'image', tooltip: 'Background image displayed when the slot is empty.' },
} as const satisfies Schema;

export type ItemSlotObject = SchemaToType<typeof ItemSlotSchema>;