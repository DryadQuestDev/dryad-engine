import { SettingsObject } from "../schemas/settingsSchema";

export const MenuOptions: SettingsObject[] = [
    {
        id: 'ui',
        type: 'title',
        label: 'User Interface',
    },
    {
        id: 'music_volume',
        type: 'chooseOne',
        label: 'Music Volume',
        default_value: '20',
        values: ['0', '5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80', '85', '90', '95', '100'],
    },
    {
        id: 'sound_volume',
        type: 'chooseOne',
        label: 'Sound Volume',
        default_value: '80',
        values: ['0', '5', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80', '85', '90', '95', '100'],
    },
    {
        id: 'font_size',
        type: 'chooseOne',
        label: 'Font Size',
        default_value: '20',
        values: ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '40'],
    },
    {
        id: 'typing_speed',
        type: 'chooseOne',
        label: 'Typing Speed',
        default_value: 'fast',
        values: ['none', 'slow', 'medium', 'fast', 'very_fast'],
        localizeValues: true,
    }
]