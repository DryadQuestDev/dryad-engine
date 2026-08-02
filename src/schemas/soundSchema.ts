import { Schema, SchemaToType } from '../utility/schema';

export const SoundSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the sound effect.' },
    id: { type: 'string', required: true, tooltip: 'Sound effect ID used to reference this sound in game.' },
    files: { type: 'file[]', fileType: 'audio', tooltip: 'Audio files for this sound effect. Multiple files can be provided as variations.' },
    loop: { type: 'boolean', defaultValue: false, tooltip: 'Repeat this sound continuously. All files play in sequence, then restart from the first. Stop it with {sound: "!id"}. A loop started inside a scene ends with that scene; one started from a room or dungeon enter action keeps playing across the map, and resumes after loading a save.' },
} as const satisfies Schema;

export type SoundObject = SchemaToType<typeof SoundSchema>;