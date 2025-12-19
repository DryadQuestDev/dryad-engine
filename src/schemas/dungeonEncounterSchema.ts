import { Schema, SchemaToType } from '../utility/schema';

export const DungeonEncounterSchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the dungeon encounter.' },
  id: { type: 'string', required: true, tooltip: 'Encounter ID, should include room ID (e.g., room_id.encounter_id).' }, // should include room's id, e.g: room_id.encounter_id
  type: { type: 'chooseOne', defaultValue: 'encounter', options: ['encounter', 'prop'], tooltip: 'Type of dungeon object - encounter for interactive events, prop for decoration.' }, // TODO: implement prop
  image: { type: 'file', fileType: 'image', tooltip: 'Image to display for this encounter on the map.' },
  polygon: { type: 'string', show: { type: ['encounter'] }, tooltip: 'Polygon selection embedded into the map that will be used instead of image.' },
  x: { type: 'number', tooltip: 'X coordinate of the encounter on the map.' },
  y: { type: 'number', tooltip: 'Y coordinate of the encounter on the map.' },
  z: { type: 'number', defaultValue: 25, tooltip: "Z coordinate (layer depth) of the encounter. Should be greater than 3 to avoid being hidden under the map." },
  scale: { type: 'number', tooltip: 'Scale multiplier for the encounter image.' },
  rotation: { type: 'number', tooltip: 'Rotation angle in degrees for the encounter image.' },
} satisfies Schema;

export type DungeonEncounterObject = SchemaToType<typeof DungeonEncounterSchema>;