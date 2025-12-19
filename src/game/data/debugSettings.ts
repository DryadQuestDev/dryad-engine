import { SettingsObject } from "../../schemas/settingsSchema";

export type DebugSettingsType = {
    ids_on_map?: boolean;
    disable_fog?: boolean;
    events_zone?: boolean;
    show_hidden_stats?: boolean;
    selected_dungeon?: string;
};

export const DebugSettings: SettingsObject[] = [
    {
        id: 'ids_on_map',
        type: 'boolean',
        label: 'Show IDs on Map',
        default_value: 'false',
    },
    {
        id: 'show_hidden_stats',
        type: 'boolean',
        label: 'Show Hidden Stats',
        default_value: 'false',
    },
    {
        id: 'events_zone',
        type: 'boolean',
        label: 'Show Scenes Zone',
        default_value: 'false',
    },
    {
        id: 'disable_fog',
        type: 'boolean',
        label: 'Disable Fog',
        default_value: 'false',
    },
]



