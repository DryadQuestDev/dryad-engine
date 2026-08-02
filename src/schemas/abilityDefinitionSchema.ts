import { Schema, SchemaToType } from '../utility/schema';
import { CustomValueSchema } from './schemaParts';

export const AbilityDefinitionSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the ability definition.' },
    id: { type: 'string', required: true, tooltip: 'ID used to reference this definition in code.' },
    role: { type: 'chooseOne', options: ['meta', 'aspect'], defaultValue: 'aspect', tooltip: 'Meta describes the ability meta data like name, icon, etc.\n Aspect describes the ability effect aspects when used like damage, healing, summoning, etc.' },
    ...CustomValueSchema,
    order: { type: 'number', tooltip: 'Display order in the definition list (lower numbers appear first).' },
    description: { type: 'textarea', tooltip: 'Description of what this definition represents.' },
    ingame_description: { type: 'htmlarea', tooltip: 'In-game description template for players. Use [v] for this aspect value, [other_id] for sibling aspect values. Aspects without this are hidden from auto-gen.', show: { role: ['aspect'] } },
    ingame_description_ref: { type: 'string', tooltip: 'Dot-path to display name in fromFile data (e.g. "name", "traits.name"). Falls back to "name", then raw ID.', show: { role: ['aspect'] } },
    ingame_hide: { type: 'boolean', tooltip: 'Hide from standalone line rendering. Description is still used when referenced inline by sibling aspects.', show: { role: ['aspect'] } },
    scales: { type: 'boolean', tooltip: 'Opt-in: number values of this aspect scale in instance-level systems (e.g. equipment ability enhancements scaling with dungeon level). Leave off for values that must stay flat (cooldowns, chances, power-relative percentages).', show: { role: ['aspect'] } },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type AbilityDefinitionObject = SchemaToType<typeof AbilityDefinitionSchema>;