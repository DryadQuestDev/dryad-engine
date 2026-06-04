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


/**
 * Shape for a status that gets *applied* to a character (vs. the character's intrinsic baseline).
 * Adds `meta` — the per-instance data bag consumed by game/plugin scripts.
 * Used by CharacterStatusSchema, ItemTemplateSchema.status, SkillSlotSchema.status.
 */
export const AppliedStatusSchema = {
    meta: { type: 'schema', fromFile: 'status_meta', fromFileType: 'custom', tooltip: 'Per-instance metadata flags consumed by game or plugin scripts (e.g. power_scaling, dot_damage_type, is_battle). Keys are defined in the status_meta editor tab.' },
    ...BaseStatusSchema,
} as const satisfies Schema;

export type AppliedStatusObject = SchemaToType<typeof AppliedStatusSchema>;


export const CharacterStatusSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the character status effect.' },
    id: { type: 'string', required: true, tooltip: 'Status ID used to reference this status in code.' },
    name: { type: 'string', tooltip: 'Display name of the status effect shown to users.' },
    description: { type: 'htmlarea', tooltip: 'Rich text description of what this status effect does.' },
    max_stacks: { type: 'number', tooltip: 'Maximum stack count. 0, -1, or empty = unlimited.' },
    duration: { type: 'number', tooltip: 'How long the status lasts. -1 = permanent (default). Interpretation depends on the game/plugin (e.g. clock turns in battle).' },
    multi_stack: { type: 'boolean', tooltip: 'If true, each apply creates an independent instance with its own duration (DD-style). If false, reapply refreshes the single instance.' },
    duration_increment: { type: 'boolean', show: { multi_stack: '$falsy' }, tooltip: 'Single-stack only: reapplying adds the new duration to the existing one (accumulate) instead of refreshing to the max.' },
    image: { type: 'file', fileType: 'image', tooltip: 'Image to display for the status effect.' },
    polarity: { type: 'chooseOne', options: ['positive', 'neutral', 'negative'], tooltip: 'Visual indicator for the status: positive (green), neutral (gray), negative (red).' },
    is_hidden: { type: 'boolean', tooltip: 'If true, this status is hidden from the UI but still exists in data.' },
    ...AppliedStatusSchema,
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type CharacterStatusObject = SchemaToType<typeof CharacterStatusSchema>;