import { Schema, SchemaToType } from '../utility/schema';

export const SoundSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the sound effect.' },
    id: { type: 'string', required: true, tooltip: 'Sound effect ID used to reference this sound in game.' },
    files: { type: 'file[]', fileType: 'audio', tooltip: 'Audio files for this sound effect. Multiple files can be provided as variations.' },
} as const satisfies Schema;

export type SoundObject = SchemaToType<typeof SoundSchema>;