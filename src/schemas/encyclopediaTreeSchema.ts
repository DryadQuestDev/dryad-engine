import { Schema, SchemaToType } from '../utility/schema';

export const EncyclopediaTreeSchema = {
    uid: { type: 'uid', required: true },
    id: { type: 'string', required: true, tooltip: 'Encyclopedia tree ID.' },
    tab: { type: 'string', required: true, tooltip: 'Tab badge label shown in the encyclopedia sidebar.' },
    order: { type: 'number', defaultValue: 0, tooltip: 'Lower values appear first.' },
    groups: {
        type: 'schema[]', tooltip: 'Groups of records inside this tab. Order is preserved.', objects: {
            uid: { type: 'uid', required: true },
            name: { type: 'string', required: true, tooltip: 'Group display name.' },
            records: {
                type: 'schema[]', tooltip: 'Records in this group. Order is preserved.', objects: {
                    uid: { type: 'uid', required: true },
                    record: { type: 'chooseOne', fromFile: 'records', required: true, tooltip: 'Reference to a record.' },
                }
            }
        }
    }
} as const satisfies Schema;

export type EncyclopediaTreeObject = SchemaToType<typeof EncyclopediaTreeSchema>;
