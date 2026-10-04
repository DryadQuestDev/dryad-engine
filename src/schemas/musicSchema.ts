import { Schema, SchemaToType } from '../utility/schema';

export const MusicSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the music track.' },
    id: { type: 'string', required: true, tooltip: 'Music track ID used to reference this track in game.' },
    files: { type: 'file[]', fileType: 'audio', tooltip: 'Audio files for this music track. Multiple files can be provided as variations.' },
    volume: { type: 'number', defaultValue: 1, min: 0, max: 1, step: 0.05, tooltip: 'Gain 0–1, multiplied onto the player\'s music slider. Override inline: {music: "id(volume=0.5)"}.' },
    fade_in: { type: 'number', defaultValue: 0, min: 0, step: 0.1, tooltip: 'Seconds from silence to full gain when the track starts. Override inline: {music: "id(fade_in=3)"}.' },
    fade_out: { type: 'number', defaultValue: 1, min: 0, step: 0.1, tooltip: 'Seconds to silence when this track is replaced or stopped. 0 cuts. Override on the switch, {music: "next(fade_out=3)"}, or on the stop, {music: "!(fade_out=3)"}.' },
    shuffle: { type: 'boolean', defaultValue: true, tooltip: 'Play the files in random order, reshuffling each pass. Off plays them in the listed order.' },
} as const satisfies Schema;

export type MusicObject = SchemaToType<typeof MusicSchema>;
