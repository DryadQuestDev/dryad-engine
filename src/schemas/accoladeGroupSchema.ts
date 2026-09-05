import { Schema, SchemaToType } from '../utility/schema';

export const AccoladeGroupSchema = {
    uid: { type: 'uid', required: true },
    id: { type: 'string', required: true, tooltip: 'Group id referenced by accolades.' },
    name: { type: 'string', required: true, tooltip: 'Section heading shown on the Accolades tab.' },
    order: { type: 'number', defaultValue: 0, tooltip: 'Section order on the tab.' },
} as const satisfies Schema;

export type AccoladeGroupObject = SchemaToType<typeof AccoladeGroupSchema>;
