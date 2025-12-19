import { Schema, SchemaToType } from '../utility/schema';

export const MusicSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the music track.' },
    id: { type: 'string', required: true, tooltip: 'Music track ID used to reference this track in game.' },
    files: { type: 'file[]', fileType: 'audio', tooltip: 'Audio files for this music track. Multiple files can be provided as variations.' },
} as const satisfies Schema;

export type MusicObject = SchemaToType<typeof MusicSchema>;
