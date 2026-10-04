import { Schema, SchemaToType } from '../utility/schema';

export const SoundSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the sound effect.' },
    id: { type: 'string', required: true, tooltip: 'Sound effect ID used to reference this sound in game.' },
    files: { type: 'file[]', fileType: 'audio', tooltip: 'Audio files for this sound effect. They play in sequence, one after another – or, with random on, one picked at random per play.' },
    loop: { type: 'boolean', defaultValue: false, tooltip: 'Repeat this sound continuously. All files play in sequence, then restart from the first. Stop it with {sound: "!id"}. Playing it again while it runs leaves it running. A loop started inside a scene ends with that scene; one started from a room or dungeon enter action keeps playing across the map, and resumes after loading a save.' },
    random: { type: 'boolean', defaultValue: false, tooltip: 'Play ONE file picked at random each time instead of the whole sequence – a pool of variations, e.g. footsteps or hits, so a sound played over and over does not repeat the same take. With loop on, the files follow each other in random order.' },
    channel: { type: 'string', tooltip: 'Sounds sharing a channel replace each other: starting one stops whatever else is playing on that channel, each over its own fade_out. Use it for a scene\'s ambience or a voice, so a new one takes over instead of layering. Empty = plays alongside everything.' },
    volume: { type: 'number', defaultValue: 1, min: 0, max: 1, step: 0.05, tooltip: 'Gain 0–1, multiplied onto the player\'s sound slider. Override inline: {sound: "id(volume=0.4)"}.' },
    fade_in: { type: 'number', defaultValue: 0, min: 0, step: 0.1, tooltip: 'Seconds from silence to full gain when the sound starts. Override inline: {sound: "id(fade_in=2)"}.' },
    fade_out: { type: 'number', defaultValue: 0, min: 0, step: 0.1, tooltip: 'Seconds to silence when the sound is stopped – by {sound: "!id"}, by the scene ending, or by {sound: false}. 0 cuts. Override on the stop: {sound: "!id(fade_out=3)"}.' },
    delay: { type: 'number', defaultValue: 0, min: 0, step: 0.1, tooltip: 'Seconds to wait before the sound starts, to line it up with an asset\'s enter_delay or a beat. Override inline: {sound: "id(delay=0.8)"}.' },
} as const satisfies Schema;

export type SoundObject = SchemaToType<typeof SoundSchema>;