import { SettingsObject } from "../schemas/settingsSchema";

// Labels and tooltips are locale keys, resolved by Gform/GfieldRenderer through Global.getStringOr;
// the English text for each lives in engine_files/locales/en.json.
export const MenuOptions: SettingsObject[] = [
    {
        id: 'ui',
        type: 'title',
        label: 'settings.ui',
    },
    {
        // `values` is replaced at runtime by Global.discoverLanguages() from the files in
        // engine_files/locales; the seed only keeps the Select valid before discovery finishes.
        // Each option's label resolves through the synthetic `language.<code>` locale entries,
        // so every language is named in its own language.
        id: 'language',
        type: 'chooseOne',
        label: 'settings.language',
        default_value: 'en',
        values: ['en'],
        localizeValues: true,
    },
    {
        id: 'music_volume',
        type: 'chooseOne',
        label: 'settings.music_volume',
        default_value: '20',
        values: ['0', '5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80', '85', '90', '95', '100'],
    },
    {
        id: 'sound_volume',
        type: 'chooseOne',
        label: 'settings.sound_volume',
        default_value: '80',
        values: ['0', '5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80', '85', '90', '95', '100'],
    },
    {
        id: 'font_size',
        type: 'chooseOne',
        label: 'settings.font_size',
        default_value: '20',
        values: ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40'],
    },
    {
        id: 'typing_speed',
        type: 'chooseOne',
        label: 'settings.typing_speed',
        default_value: 'fast',
        values: ['none', 'slow', 'medium', 'fast', 'very_fast'],
        localizeValues: true,
    },
    {
        id: 'interactive_tooltips',
        type: 'boolean',
        label: 'settings.interactive_tooltips',
        default_value: 'false',
        tooltip: 'settings.interactive_tooltips.tooltip',
    }
]
