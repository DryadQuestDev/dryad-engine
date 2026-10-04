import { Schema, SchemaToType } from '../utility/schema';

/**
 * A section of the character sheet. Every character stat picks one group through its `group`
 * field; the sheet shows the groups in `order`, and stats without a group fall into the
 * engine's built-in Resources / Stats split. A game's registerStatGroupResolver still
 * overrides the whole layout for per-character cases.
 */
export const StatGroupSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the stat group.' },
    id: { type: 'string', required: true, tooltip: 'Group ID. Stats reference it through their group field; scripts through character.getStatsByGroup().' },
    name: { type: 'string', tooltip: 'Section title shown on the character sheet.' },
    order: { type: 'number', tooltip: 'Display order of the section (lower numbers appear first).' },
    description: { type: 'textarea', tooltip: 'What belongs in this group (inside Editor).' },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type StatGroupObject = SchemaToType<typeof StatGroupSchema>;
