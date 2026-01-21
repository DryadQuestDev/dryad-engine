import { Schema, SchemaToType } from '../utility/schema';

export const BaseStatusSchema = {
    traits: { type: 'schema', fromFile: 'character_traits', fromFileType: 'custom', tooltip: 'Custom character traits defined in character_traits file.' },
    stats: { type: 'schema', fromFile: 'character_stats', fromFileType: 'number', tooltip: 'Numeric stats (e.g., strength, health) from character_stats file.' },
    computed_stats: { type: 'string[]', tooltip: 'Computed stats to apply to the character that are registered by game.registerStatComputer(). ' },
    attributes: { type: 'schema', fromFile: 'character_attributes', fromFileType: 'chooseOne', tooltip: 'Character attributes with selectable values from character_attributes file.' },
    skin_layers: { type: 'chooseMany', fromFile: 'character_skin_layers', tooltip: 'Visual skin layers for character appearance.' },
    abilities: { type: "chooseMany", fromFile: "ability_templates", tooltip: "Abilities available to the character." },
    ability_modifiers: {
        type: "schema[]", tooltip: "Modifiers to apply to the abilities.", objects: {
            id: { type: "string", tooltip: "Optional custom id." },
            ability_id: { type: "chooseOne", fromFile: "ability_templates", tooltip: "Ability ID to modify." },
            meta: { type: "schema", fromFile: "ability_definitions", fromFileType: "custom", fromFileTypeAnd: { role: "meta" }, tooltip: "Meta data for the ability." },
            effects: {
                type: "schema[]", objects: {
                    id: { type: 'string', tooltip: 'Effect ID used to reference this effect in game, e.g: "primary_strike", "secondary_burn".' },
                    aspects: { type: 'schema', fromFile: 'ability_definitions', fromFileType: 'custom', fromFileTypeAnd: { role: "aspect" }, tooltip: 'Aspects of the ability effect when used.' },
                }
            }
        }
    },
} as const satisfies Schema;

export type BaseStatusObject = SchemaToType<typeof BaseStatusSchema>;


export const CharacterStatusSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the character status effect.' },
    id: { type: 'string', required: true, tooltip: 'Status ID used to reference this status in code.' },
    name: { type: 'string', tooltip: 'Display name of the status effect shown to users.' },
    description: { type: 'htmlarea', tooltip: 'Rich text description of what this status effect does.' },
    max_stacks: { type: 'number', tooltip: 'Maximum number of times this status can stack on a character.' },
    // TODO
    //expiration_trigger: { type: 'chooseOne', options: ['none', 'exploration', 'combat'] },
    duration: { type: 'number', show: { expiration_trigger: ['exploration', 'combat'] }, tooltip: 'How long the status lasts (in turns or time units).' },
    image: { type: 'file', fileType: 'image', tooltip: 'Image to display for the status effect.' },
    ...BaseStatusSchema,
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type CharacterStatusObject = SchemaToType<typeof CharacterStatusSchema>;