import {Schema, SchemaToType} from '../utility/schema';

export const DevEncountersDefaultSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the default encounter.' },
    id: { type: 'string', required: true, tooltip: 'ID reference for the default encounter.' },
    image: { type: 'file', fileType: 'image', tooltip: 'Default image used for this encounter type.' },
} as const satisfies Schema;

export type DevEncountersDefaultObject = SchemaToType<typeof DevEncountersDefaultSchema>;