import { Schema, SchemaToType } from '../utility/schema';

export const AbilityTemplateSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the ability definition.' },
    id: { type: 'string', required: true, tooltip: 'ID used to reference this definition in game.' },
    modifies: { type: 'chooseOne', fromFile: 'ability_templates', fromFileTypeAnd: { modifies: '$falsy' }, tooltip: 'If set, this template acts as a modifier for the target ability instead of a standalone ability.' },
    requires_status: { type: 'chooseOne', fromFile: 'character_statuses', tooltip: 'Only apply this modifier if the character has this status active. Used for conditional item bonuses.' },
    meta: { type: 'schema', fromFile: 'ability_definitions', fromFileType: 'custom', fromFileTypeAnd: { role: "meta" }, tooltip: 'Meta data for the ability.' },
    effects: {
        type: 'schema[]', objects: {
            id: { type: 'string', tooltip: 'Effect ID used to reference this effect in game, e.g: "primary_strike", "secondary_burn".' },
            name: { type: 'string', tooltip: 'Display name for this effect shown in auto-generated descriptions.' },
            aspects: { type: 'schema', fromFile: 'ability_definitions', fromFileType: 'custom', fromFileTypeAnd: { role: "aspect" }, tooltip: 'Aspects of the ability effect when used.' },
        }
    }
} as const satisfies Schema;

export type AbilityTemplateObject = SchemaToType<typeof AbilityTemplateSchema>;