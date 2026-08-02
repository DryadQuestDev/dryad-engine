import { Schema, SchemaToType } from '../utility/schema';

export const DungeonEncounterSchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the dungeon encounter.' },
  id: { type: 'string', required: true, tooltip: 'Encounter ID, should include room ID (e.g., room_id.encounter_id).' }, // should include room's id, e.g: room_id.encounter_id
  type: { type: 'chooseOne', defaultValue: 'encounter', options: ['encounter', 'prop', 'collectable'], tooltip: 'Type of dungeon object - encounter for interactive events (authored in the content document), prop for decoration, collectable for a pick-up-an-item node that needs no content entry.' }, // TODO: implement prop
  // Collectable fields — directly under type, since picking `collectable` is what reveals them.
  collect_item: { type: 'chooseOne', fromFile: 'item_templates', show: { type: ['collectable'] }, tooltip: 'Item granted by the Collect choice. Needs no content document entry — the description falls back to the item\'s name and description. Write an @ line with the same id to override the prose or add if/discover gating.' },
  collect_quantity: { type: 'number', defaultValue: 1, show: { type: ['collectable'] }, tooltip: 'How many of the item one Collect grants.' },
  regrow: { type: 'number', show: { type: ['collectable'] }, tooltip: 'Turns until a collected encounter regrows. Consumed by the turn_system plugin (or any time plugin calling game.tickCollectables) — without one, collectables never regrow. 0/empty = one-time.' },
  collect_clue: { type: 'boolean', show: { type: ['collectable'] }, tooltip: 'Highlight the encounter on the map (clue glow) until it has been collected.' },
  image: { type: 'file', fileType: 'image', tooltip: 'Image to display for this encounter on the map.' },
  polygon: { type: 'string', show: { type: ['encounter'] }, tooltip: 'Polygon selection embedded into the map that will be used instead of image.' },
  x: { type: 'number', tooltip: 'X coordinate of the encounter on the map.' },
  y: { type: 'number', tooltip: 'Y coordinate of the encounter on the map.' },
  z: { type: 'number', defaultValue: 25, tooltip: "Z coordinate (layer depth) of the encounter. Should be greater than 3 to avoid being hidden under the map." },
  scale: { type: 'number', tooltip: 'Scale multiplier for the encounter image.' },
  rotation: { type: 'number', tooltip: 'Rotation angle in degrees for the encounter image.' },
} satisfies Schema;

export type DungeonEncounterObject = SchemaToType<typeof DungeonEncounterSchema>;