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
  landing_bg_asset: { type: 'chooseOne', fromFile: 'assets', tooltip: 'Asset rendered behind the landing page. Stacks with other active manifests — base game at the bottom, mods on top in load order. Use a transparent overlay to augment, an opaque image to replace.' },
  landing_soundtrack: { type: 'chooseOne', fromFile: 'music', tooltip: 'Music id for the landing page. Last active manifest with a value wins. Crossfades into the first in-game track on Play.' },
  theme: {
    type: 'schema',
    tooltip: 'Per-game brand colors. Applied globally — landing page, in-game menu, popups, accents — overriding the engine default cyan. Last non-empty value per sub-field wins across active manifests.',
    objects: {
      primary: { type: 'color', tooltip: 'Primary brand color for the game.' },
      accent: { type: 'color', tooltip: 'Accent color used to tint glass surfaces (Continue button, dropdown highlights, etc.).' },
    }
  },
  landing_css: { type: 'file[]', fileType: 'css', tooltip: 'CSS stylesheets applied only on the landing page (loaded on game/mod select, unloaded on switch). Separate from `css` so game-time styles do not leak while browsing.' },
  disable_engine_link: { type: 'boolean', defaultValue: false, tooltip: 'Hide the link on the Dryad Engine logo (logo still shown). For SFW releases that do not want to link to the 18+ engine site. Any active manifest setting this to true wins.' },
  scripts: { type: 'file[]', fileType: 'js', tooltip: 'JavaScript files to load and execute for this game/mod. \n Note: It is strongly recommended to use .mjs extension for better IDE support.' },
  css: { type: 'file[]', fileType: 'css', tooltip: 'CSS stylesheets to load for this game/mod.' },
  nsfw: { type: 'boolean', tooltip: 'Whether the game/mod is NSFW(only for website).', defaultValue: false, }
} satisfies Schema;

export type ManifestObject = SchemaToType<typeof ManifestSchema>;
