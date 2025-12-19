import { Schema, SchemaToType } from '../utility/schema';

export const AbilityTemplateSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the ability definition.' },
    id: { type: 'string', required: true, tooltip: 'Trait ID used to reference this definition in game.' },
    meta: { type: 'schema', fromFile: 'ability_definitions', fromFileType: 'custom', fromFileTypeAnd: { role: "meta" }, tooltip: 'Meta data for the ability.' },
    effects: {
        type: 'schema[]', objects: {
            id: { type: 'string', tooltip: 'Effect ID used to reference this effect in game, e.g: "primary_strike", "secondary_burn".' },
            aspects: { type: 'schema', fromFile: 'ability_definitions', fromFileType: 'custom', fromFileTypeAnd: { role: "aspect" }, tooltip: 'Aspects of the ability effect when used.' },
        }
    }
} as const satisfies Schema;

export type AbilityTemplateObject = SchemaToType<typeof AbilityTemplateSchema>;