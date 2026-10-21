import { Schema, SchemaToType } from '../utility/schema';

export const EncyclopediaTreeSchema = {
    uid: { type: 'uid', required: true },
    id: { type: 'string', required: true, tooltip: 'Encyclopedia tree ID.' },
    tab: { type: 'string', required: true, tooltip: 'Tab badge label shown in the encyclopedia sidebar.' },
    order: { type: 'number', defaultValue: 0, tooltip: 'Lower values appear first.' },
    hide_undiscovered_groups: { type: 'boolean', defaultValue: false, tooltip: 'If true, a group stays out of the sidebar until one of its records is discovered, so its name gives nothing away. If false, a group with no discovered records shows its name and ??? entries.' },
    groups: {
        type: 'schema[]', tooltip: 'Groups of records inside this tab. Order is preserved.', objects: {
            uid: { type: 'uid' },
            id: { type: 'string' },
            name: { type: 'string', required: true, tooltip: 'Group display name.' },
            records: {
                type: 'schema[]', tooltip: 'Records in this group. Order is preserved.', objects: {
                    uid: { type: 'uid' },
                    record: { type: 'chooseOne', fromFile: 'records', required: true, tooltip: 'Reference to a record.' },
                }
            }
        }
    }
} as const satisfies Schema;

export type EncyclopediaTreeObject = SchemaToType<typeof EncyclopediaTreeSchema>;
