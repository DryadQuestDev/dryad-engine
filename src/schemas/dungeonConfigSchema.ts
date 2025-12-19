import { Schema, SchemaToType } from '../utility/schema';

export const DungeonConfigSchema = {
  uid: { type: 'uid', required: true },
  id: { type: 'string', required: true, tooltip: 'Dungeon ID used to reference this dungeon in the game.' },
  order: { type: 'number', tooltip: 'Order of the dungeon in the list. Lower numbers appear first.' },
  //obj:{type:"schema", objects:{test:{type:"string"}}},
  dungeon_type: { type: 'chooseOne', options: ['map', 'screen', 'text'], tooltip: 'Type of dungeon presentation: map for explorable 2D map, screen for static image with clickable areas, text for text-based exploration.' },
  image: { type: 'file', fileType: 'image', show: { dungeon_type: ['map', 'screen'] }, tooltip: 'Background image for the dungeon.' },
  image_scaling: { type: 'number', step: 0.1, show: { dungeon_type: ['map', 'screen'] }, tooltip: 'Scale multiplier for the dungeon background image.' },
  padding: { type: 'number', show: { dungeon_type: ['map'] }, tooltip: 'Padding in pixels around the map edges.' },
  indent: { type: 'number', show: { dungeon_type: ['screen'] }, tooltip: 'Indentation offset of the screen content relative to the background image.' },
  map_width: { type: 'number', show: { dungeon_type: ['text'] }, defaultValue: 1000, tooltip: 'Width of the map in pixels.' },
  map_height: { type: 'number', show: { dungeon_type: ['text'] }, defaultValue: 1000, tooltip: 'Height of the map in pixels.' },
  fog_default: { type: 'number', tooltip: "Default visibility radius for fog of war in pixels. Set to 0 to disable fog.", show: { dungeon_type: ['map'] }, defaultValue: 200 },
  fog_shadow_coef: { type: 'number', step: 0.1, defaultValue: 1.5, tooltip: "Shadow gradient multiplier for fog edges. 1 = no gradient, higher values = softer transitions.", show: { dungeon_type: ['map'] } },
  fog_image: { type: 'file', fileType: 'image', tooltip: 'Custom fog mask image. If not set, the default image will be used.', show: { dungeon_type: ['map'] } },
  music: { type: 'chooseOne', fromFile: 'music', tooltip: 'Background music to play in this dungeon.' },
  actions: {
    type: 'schema', tooltip: 'Action scripts triggered by dungeon events.', objects: {
      dungeon_create: { type: 'textarea', tooltip: 'Script executed when the dungeon is created, including when loading from a save file (dungeons are not serialized).' },
      dungeon_enter: { type: 'textarea', tooltip: 'Script executed after entering the dungeon.' },
    }
  },
  gdoc_id: { type: 'string', tooltip: 'Google Doc document ID to import content into dungeon_content field. WARNING: Players can access this link - use view-only permissions!' },
  dungeon_content: { type: 'textarea', tooltip: 'Dungeon content markup with special syntax: ^rooms, @encounters, !choices, and #events.' },
} satisfies Schema;

export type DungeonConfigObject = SchemaToType<typeof DungeonConfigSchema>;