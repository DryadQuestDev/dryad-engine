import { Schema, SchemaToType } from '../utility/schema';

export const DevSettingsSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the settings.' },
    asset_folders: { type: 'string[]', tooltip: "A place where your assets are located in the 'assets/games_assets' folder. Only assets located in these folders will be included when exporting the game/mod. \n e.g: 'my_game/_core'. \n Note: you don't need to add engine_assets as they are part of the engine." },
    narrow_file_search: { type: 'boolean', tooltip: 'Only search files in the folders that are listed in asset_folders.' },
    ignore_engine_assets: { type: 'boolean', tooltip: 'Don\'t search for files located in the \'engine_assets\' folder.' },
} as const satisfies Schema;

export type DevSettingsObject = SchemaToType<typeof DevSettingsSchema>;