import { Schema, SchemaToType } from '../utility/schema';

export const ManifestSchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the manifest.' },
  id: { type: 'string', required: true, tooltip: 'Manifest ID used to reference this game/mod.' },
  name: { type: 'string', tooltip: 'Display name of the game or mod.' },
  author: { type: 'string', tooltip: 'Author of the game/mod.' },
  version: { type: 'string', tooltip: 'Version number should be in the format of a.b.c (e.g., 0.3.42).' },
  engine_version_min: { type: 'string', tooltip: 'Minimum engine version required to run this game/mod.' },
  load_order: { type: 'number', tooltip: 'Load priority order. Lower numbers load first.', defaultValue: -9999999 }, // -9999999 for _core
  plugins: { type: 'chooseMany', isFromPlugins: true, tooltip: 'Plugins to enable for this game/mod.', defaultValue: ['global_essentials'] },
  starting_dungeon_id: { type: 'string', tooltip: 'ID of the dungeon where the game starts.' },
  starting_dungeon_room_id: { type: 'string', tooltip: 'ID of the room within the starting dungeon where the game starts.' },
  starting_state: { type: 'chooseOne', options: ['exploration', 'custom'], tooltip: 'Initial game state when starting.', defaultValue: 'exploration' },
  starting_custom_state: { type: 'string', tooltip: 'Custom state name if starting_state is set to "custom".', show: { starting_state: ['custom'] } },
  description: { type: 'htmlarea', tooltip: 'Rich text description of the game/mod shown to players.' },
  cover_assets: { type: 'file[]', fileType: 'asset', tooltip: 'Cover images or videos displayed on the game/mod selection screen.' },
  scripts: { type: 'file[]', fileType: 'js', tooltip: 'JavaScript files to load and execute for this game/mod. \n Note: It is strongly recommended to use .mjs extension for better IDE support.' },
  css: { type: 'file[]', fileType: 'css', tooltip: 'CSS stylesheets to load for this game/mod.' },

} as const satisfies Schema;

export type ManifestObject = SchemaToType<typeof ManifestSchema>;
