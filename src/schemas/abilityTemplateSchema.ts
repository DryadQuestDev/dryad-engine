import { Schema, SchemaToType } from '../utility/schema';

export const AbilityTemplateSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the ability definition.' },
    id: { type: 'string', required: true, tooltip: 'ID used to reference this definition in game.' },
    modifies: { type: 'chooseOne', fromFile: 'ability_templates', fromFileTypeAnd: { modifies: '$falsy' }, tooltip: 'If set, this template acts as a modifier for the target ability instead of a standalone ability.' },
    requires_status: { type: 'chooseOne', fromFile: 'character_statuses', show: { modifies: '$truthy' }, tooltip: 'Only apply this modifier while the character has this status active (the modified ability stays, unimproved). Used for conditional item bonuses. To gate a whole ability behind a status, use meta.require_status instead.' },
    meta: { type: 'schema', fromFile: 'ability_definitions', fromFileType: 'custom', fromFileTypeAnd: { role: "meta" }, tooltip: 'Meta data for the ability.' },
    effects: {
        type: 'schema[]', objects: {
            id: { type: 'string', tooltip: 'Effect ID used to reference this effect in game, e.g: "primary_strike", "secondary_burn".' },
            name: { type: 'string', tooltip: 'Display name for this effect shown in auto-generated descriptions.' },
            order: { type: 'number', tooltip: 'Display AND execution order, lowest first. Effects without one sit at 0 and fall back to alphabetical id order. Set it when an ability\'s effects must resolve or read in a particular sequence.' },
            description_attach: { type: 'htmlarea', tooltip: 'Free text rendered as-is ABOVE this effect\'s auto-generated lines. For behaviour that cannot be expressed as aspects — a script-driven condition, a computed stat — so the card can still explain it. The effect is listed even when it has no aspects to describe.' },
            aspects: { type: 'schema', fromFile: 'ability_definitions', fromFileType: 'custom', fromFileTypeAnd: { role: "aspect" }, tooltip: 'Aspects of the ability effect when used.' },
        }
    },
    tags: { type: 'string[]', tooltip: 'Tags for the ability templates. Used for filtering and grouping.' },
} as const satisfies Schema;

export type AbilityTemplateObject = SchemaToType<typeof AbilityTemplateSchema>;