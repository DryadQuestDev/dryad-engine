import { Schema, SchemaToType } from '../utility/schema';

export const DungeonRoomSchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the dungeon room.' },
  id: { type: 'string', required: true, tooltip: 'Room ID used to reference this room in code.' },
  x: { type: 'number', tooltip: 'X coordinate of the room on the dungeon map.' },
  y: { type: 'number', tooltip: 'Y coordinate of the room on the dungeon map.' },
  doors: { type: 'string[]', tooltip: 'List of door IDs connecting this room to other rooms.' },
  default_assets: { type: 'chooseMany', fromFile: 'assets', tooltip: 'Assets (images/decorations) displayed by default when entering this room.' },
  fog: {
    type: 'schema', tooltip: 'Fog of war configuration for this room.', objects: {
      shape: { type: 'chooseOne', options: ['polygon', 'circle'], tooltip: 'Shape of the fog visibility area.' }, //, 'sector'

      // polygon
      points: {
        type: 'string', show: {
          shape: ['polygon']
        }, tooltip: 'Polygon points, separated by commas.'
      },

      // circle
      radius: {
        type: 'number', show: {
          shape: ['circle']
        }, tooltip: 'Circle radius for the fog visibility area.'
      },
      center_x: {
        type: 'number', show: {
          shape: ['circle']
        }, tooltip: 'Circle center X coordinate. If not set, the room center will be used.'
      },
      center_y: {
        type: 'number', show: {
          shape: ['circle']
        }, tooltip: 'Circle center Y coordinate. If not set, the room center will be used.'
      },
      shadow_coef: {
        type: 'number', show: {
          shape: ['circle']
        }, tooltip: 'Shadow gradient multiplier for the fog edge. Higher values create softer transitions.'
      },
      neighbor_shadow: {
        type: 'boolean', show: {
          shape: ['circle']
        }, tooltip: 'If true, the fog shadow will extend into neighboring rooms.'
      },

      // sector
      // start_angle: {type: 'number', tooltip: 'Sector start angle'},
      // end_angle: {type: 'number', tooltip: 'Sector end angle'},
    }
  },
  actions: {
    type: 'schema', tooltip: 'Action scripts triggered by room events.', objects: {
      room_enter_before: { type: 'textarea', tooltip: 'Script executed before the room is entered.' },
      room_enter_after: { type: 'textarea', tooltip: 'Script executed after the room is entered.' },
    }
  },
} satisfies Schema;

export type DungeonRoomObject = SchemaToType<typeof DungeonRoomSchema>;