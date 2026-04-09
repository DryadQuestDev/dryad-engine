import { Schema, SchemaToType } from '../utility/schema';

export const PluginSchema = {
    uid: { type: 'uid', required: true },
    id: { type: 'string', required: true, tooltip: 'Unique identifier for the plugin' },
    name: { type: 'string', tooltip: 'Display name of the plugin' },
    description: { type: 'textarea', tooltip: 'Description of what the plugin does' },
    author: { type: 'string', tooltip: 'Author of the plugin' },
    version: { type: 'string', tooltip: 'Version number (e.g., 1.0.0)' },
    order: { type: 'number', tooltip: 'Display and load order (lower numbers load first, default: 0)', defaultValue: 0 },
    scripts: {
        type: 'string[]', tooltip: 'Array of script paths relative to scripts/ folder to load. Use this to specify entry point(s) when using ES6 imports (e.g., ["main.mjs"]). Only specified scripts will be loaded - imported modules should not be listed here.'
    },
    asset_folders: {
        type: 'string[]', tooltip: "Asset folders used by this plugin, relative to 'games_assets/'. Included in file search and game export automatically."
    },
    tabs: {
        type: 'schema[]', tooltip: 'Custom tabs added by this plugin', objects: {
            id: { type: 'string', tooltip: 'Unique identifier for the tab' },
            name: { type: 'string', tooltip: 'Display name for the tab (if empty, will use id)' },
            isArray: { type: 'boolean', tooltip: 'Whether this tab contains an array of items' },
            schema: {
                type: 'schema[]', tooltip: 'Schema definition for tab fields', objects: {
                    uid: { type: 'uid', required: true },
                    propertyId: { type: 'string', tooltip: 'Property name in the data object' },
                    tooltip: { type: 'textarea', tooltip: 'Help text shown on hover' },
                    type: {
                        type: 'chooseOne', tooltip: 'Field type', options: [
                            'string',
                            'number',
                            'range',
                            'boolean',
                            'textarea',
                            'htmlarea',
                            'chooseOne',
                            'chooseMany',
                            'string[]',
                            'number[]',
                            'file',
                            'file[]',
                            'schema',
                            'schema[]',
                            'color',
                        ],
                    },
                    options: { type: 'string[]', tooltip: 'Static options for dropdown/multi-select', show: { type: ['chooseOne', 'chooseMany'] } },
                    fromFile: { type: 'string', tooltip: 'File path to load options from (e.g., "character_traits")', show: { type: ['schema', 'schema[]', 'chooseOne', 'chooseMany'] } },
                    //optionLabel: { type: 'string', tooltip: 'Property name to use as label when loading options from file', show: { type: ['chooseOne', 'chooseMany'] } },
                    //optionValue: { type: 'string', tooltip: 'Property name to use as value when loading options from file', show: { type: ['chooseOne', 'chooseMany'] } },
                    fromFileType: {
                        type: 'chooseOne', tooltip: 'Type of options for schema when using fromFile', options: [
                            'string',
                            'number',
                            'boolean',
                            'chooseOne',
                            'chooseMany',
                            'custom',
                            'values',
                        ], show: { type: ['schema', 'schema[]', 'chooseOne', 'chooseMany'] }
                    },
                    fromFileTypeAnd: { type: 'textarea', tooltip: 'Filter options where ALL key-value pairs match (JSON object format, e.g., {"is_currency": true, "rarity": "rare"})', show: { type: ['schema', 'schema[]', 'chooseOne', 'chooseMany'] } },
                    fromFileTypeOr: { type: 'textarea', tooltip: 'Filter options where AT LEAST ONE key-value pair matches (JSON object format, e.g., {"type": "weapon", "type": "armor"})', show: { type: ['schema', 'schema[]', 'chooseOne', 'chooseMany'] } },
                    defaultValue: { type: 'string', tooltip: 'Default value for new items' },
                    fileType: { type: 'chooseOne', tooltip: 'Allowed file type', options: ['image', 'video', 'audio', 'asset', 'css', 'js'], show: { type: ['file', 'file[]'] } },
                    step: { type: 'number', tooltip: 'Step increment for number input', show: { type: ['number'] } },
                    objects: {
                        type: 'schema[]', tooltip: 'Nested schema for complex object fields', show: { type: ['schema', 'schema[]'] }, objects: {
                            uid: { type: 'uid', required: true },
                            propertyId: { type: 'string', tooltip: 'Property name in the nested object' },
                            tooltip: { type: 'textarea', tooltip: 'Help text shown on hover' },
                            type: {
                                type: 'chooseOne', tooltip: 'Field type', options: [
                                    'string',
                                    'number',
                                    'range',
                                    'boolean',
                                    'textarea',
                                    'htmlarea',
                                    'chooseOne',
                                    'chooseMany',
                                    'string[]',
                                    'number[]',
                                    'file',
                                    'file[]',
                                    'color',
                                ],
                            },
                            options: { type: 'string[]', tooltip: 'Static options for dropdown/multi-select', show: { type: ['chooseOne', 'chooseMany'] } },
                            fromFile: { type: 'string', tooltip: 'File path to load options from (e.g., "character_traits")', show: { type: ['schema', 'schema[]', 'chooseOne', 'chooseMany'] } },
                            //optionLabel: { type: 'string', tooltip: 'Property name to use as label when loading options from file', show: { type: ['chooseOne', 'chooseMany'] } },
                            //optionValue: { type: 'string', tooltip: 'Property name to use as value when loading options from file', show: { type: ['chooseOne', 'chooseMany'] } },
                            fromFileType: {
                                type: 'chooseOne', tooltip: 'Type of options for schema when using fromFile', options: [
                                    'string',
                                    'number',
                                    'boolean',
                                    'chooseOne',
                                    'chooseMany',
                                    'custom',
                                    'values',
                                ], show: { type: ['schema', 'schema[]', 'chooseOne', 'chooseMany'] }
                            },
                            fromFileTypeAnd: { type: 'textarea', tooltip: 'Filter options where ALL key-value pairs match (JSON object format, e.g., {"is_currency": true, "rarity": "rare"})', show: { type: ['schema', 'schema[]', 'chooseOne', 'chooseMany'] } },
                            fromFileTypeOr: { type: 'textarea', tooltip: 'Filter options where AT LEAST ONE key-value pair matches (JSON object format, e.g., {"type": "weapon", "type": "armor"})', show: { type: ['schema', 'schema[]', 'chooseOne', 'chooseMany'] } },
                            defaultValue: { type: 'string', tooltip: 'Default value for new items' },
                            fileType: { type: 'chooseOne', tooltip: 'Allowed file type', options: ['image', 'video', 'audio', 'asset', 'css', 'js'], show: { type: ['file', 'file[]'] } },
                            step: { type: 'number', tooltip: 'Step increment for number input', show: { type: ['number'] } },
                        }
                    },
                }
            },
        }
    },
    data: {
        type: 'schema[]', tooltip: 'Additional data files to inject into the game', objects: {
            uid: { type: 'uid', required: true },
            fileName: { type: 'string', tooltip: 'Target file path (e.g., "character_traits")' },
            fileData: { type: 'textarea', tooltip: 'JSON data to inject (array for array files, object for single files)' },
        }
    },
    editor_popups: {
        type: 'schema[]', tooltip: 'Custom popup components injected into editor tabs', objects: {
            uid: { type: 'uid', required: true },
            id: { type: 'string', tooltip: 'Unique popup identifier' },
            name: { type: 'string', tooltip: 'Button label in the editor' },
            tab: { type: 'string', tooltip: 'Target subtab ID (e.g., "character_templates")' },
            script: { type: 'string', tooltip: 'Component .mjs file relative to plugin folder (e.g., "scripts/editor/MyPopup.mjs")' },
            css: { type: 'string', tooltip: 'Optional CSS file relative to plugin folder (e.g., "scripts/editor/MyPopup.css")' },
        }
    }
} as const satisfies Schema;

export type PluginObject = SchemaToType<typeof PluginSchema>;
