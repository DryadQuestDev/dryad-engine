import { Schema, SchemaToType } from '../utility/schema';

// add knob
export const SettingsSchema = {
  uid: { type: 'uid', tooltip: 'Unique identifier for the setting.' },
  id: { type: 'string', required: true, tooltip: 'Setting ID used to reference this setting in code.' },
  type: { type: 'chooseOne', options: ['title', 'string', 'number', 'boolean', 'chooseOne', 'chooseMany', 'color'], tooltip: 'Type of setting control - title for section headers, or input types for user configuration.' },
  default_value: { type: 'string', show: { type: ['string', 'number', 'boolean', 'chooseOne', 'chooseMany', 'color'] }, tooltip: 'Default value for this setting.' },
  values: { type: 'string[]', show: { type: ['chooseOne', 'chooseMany'] }, tooltip: 'Available options for dropdown or multi-select settings.' },
  label: { type: 'string', tooltip: 'Display label shown to users in the settings UI.' },
  tooltip: { type: 'string', show: { type: ['string', 'number', 'boolean', 'chooseOne', 'chooseMany', 'color'] }, tooltip: 'Help text shown when hovering over the setting.' },
  order: { type: 'number', tooltip: 'Display order in the settings list (lower numbers appear first).' },
  localizeValues: { type: 'boolean', show: { type: ['chooseOne', 'chooseMany'] }, tooltip: 'If true, values will be localized using getString with pattern: id.value (e.g., typing_speed.slow).' },
} as const satisfies Schema;

export type SettingsObject = SchemaToType<typeof SettingsSchema>;
