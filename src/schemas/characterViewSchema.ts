import { Schema, SchemaToType } from '../utility/schema';

export const CharacterViewSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the character view.' },
    id: { type: 'string', required: true, tooltip: 'View identifier (e.g. back, side).' },
    name: { type: 'string', tooltip: 'Display name for this view.' },
} as const satisfies Schema;

export type CharacterViewObject = SchemaToType<typeof CharacterViewSchema>;
