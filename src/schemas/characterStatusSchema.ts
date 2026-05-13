import { Schema, SchemaToType } from '../utility/schema';

export const BaseStatusSchema = {
    traits: { type: 'schema', fromFile: 'character_traits', fromFileType: 'custom', tooltip: 'Custom character traits defined in character_traits file.' },
    stats: { type: 'schema', fromFile: 'character_stats', fromFileType: 'number', tooltip: 'Numeric stats (e.g., strength, health) from character_stats file.' },
    computed_stats: { type: 'string[]', tooltip: 'Computed stats to apply to the character that are registered by game.registerStatComputer(). ' },
    attributes: { type: 'schema', fromFile: 'character_attributes', fromFileType: 'chooseOne', tooltip: 'Character attributes with selectable values from character_attributes file.' },
    skin_layers: { type: 'chooseMany', fromFile: 'character_skin_layers', tooltip: 'Visual skin layers for character appearance.' },
    abilities: { type: "chooseMany", fromFile: "ability_templates", fromFileTypeAnd: { modifies: '$falsy' }, tooltip: "Abilities available to the character." },
    ability_modifiers: { type: "chooseMany", fromFile: "ability_templates", fromFileTypeAnd: { modifies: '$truthy' }, tooltip: "Ability modifier templates to apply." },
    spine: {
        type: 'schema[]', tooltip: 'Spine animation configurations. Entry with view = _default (or empty) is the default character spine. Last status wins per view.', objects: {
            id: { type: 'string', required: true, tooltip: 'Unique identifier for this spine config.' },
            view: { type: 'chooseOne', fromFile: 'character_views', tooltip: 'View this spine belongs to (e.g. back, side). _default or empty = default spine.' },
            atlas: { type: 'file', fileType: 'atlas', tooltip: 'Spine atlas file (.atlas).' },
            skeleton: { type: 'file', fileType: 'spine_skeleton', tooltip: 'Spine skeleton file (.json or .skel).' },
            art_dx: { type: 'number', tooltip: 'X shift in % for this spine\'s art positioning. Tuned per spine entry.' },
            art_dy: { type: 'number', tooltip: 'Y shift in % for this spine\'s art positioning. Tuned per spine entry.' },
            art_scale: { type: 'number', tooltip: 'Scale multiplier for this spine\'s art. 1 = native.' },
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
    duration: { type: 'number', tooltip: 'How long the status lasts. -1 = permanent (default). Interpretation depends on the game/plugin (e.g. clock turns in battle).' },
    image: { type: 'file', fileType: 'image', tooltip: 'Image to display for the status effect.' },
    polarity: { type: 'chooseOne', options: ['positive', 'neutral', 'negative'], tooltip: 'Visual indicator for the status: positive (green), neutral (gray), negative (red).' },
    is_hidden: { type: 'boolean', tooltip: 'If true, this status is hidden from the UI but still exists in data.' },
    ...BaseStatusSchema,
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type CharacterStatusObject = SchemaToType<typeof CharacterStatusSchema>;