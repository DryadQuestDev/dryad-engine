import { Schema, SchemaToType } from '../utility/schema';

export const AbilityGroupSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for this ability group.' },
    id: { type: 'string', required: true, tooltip: 'Unique group identifier.' },
    name: { type: 'string', required: true, tooltip: 'Display name shown as tab label.' },
    order: { type: 'number', defaultValue: 0, tooltip: 'Sort order. Lower values appear first.' },
} as const satisfies Schema;

export type AbilityGroupObject = SchemaToType<typeof AbilityGroupSchema>;
