import { Schema, SchemaToType } from '../utility/schema';
import { BaseStatusSchema } from './characterStatusSchema';

export const CharacterTemplateSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the character template.' },
    id: { type: 'string', required: true, tooltip: 'Character template ID used to reference this character in code.' },

    auto_create: { type: 'boolean', tooltip: 'If true, the character will be created automatically.' },
    add_to_party: { type: 'boolean', tooltip: 'If true, the character will be added to the party when the game starts.', show: { auto_create: [true] } },
    instances: {
        type: 'schema[]', tooltip: 'Named characters built from this template, for scenes that need several of the same character (guard1, guard2). Each one is its own character with its own id, and differs from the template only where it overrides a trait, attribute or stat.', objects: {
            id: { type: 'string', required: true, tooltip: 'Character id of this instance, used in content and battles (e.g. guard1). Must not be a template id or another instance id.' },
            auto_create: { type: 'boolean', defaultValue: true, tooltip: 'Create this instance automatically on a new game, and on load when a save is missing it. Off: it is created only when content or a script creates it by id, e.g. {create_character: "guard1"}.' },
            add_to_party: { type: 'boolean', tooltip: 'Add this instance to the party when it is created automatically.' },
            traits: { type: 'schema', fromFile: 'character_traits', fromFileType: 'custom', tooltip: 'Traits that differ from the template, such as the portrait or the name color.' },
            attributes: { type: 'schema', fromFile: 'character_attributes', fromFileType: 'chooseOne', tooltip: 'Attribute values that differ from the template.' },
            stats: { type: 'schema', fromFile: 'character_stats', fromFileType: 'number', tooltip: 'Stats that differ from the template.' },
        }
    },
    ...BaseStatusSchema,
    item_slots: {
        type: 'schema[]', tooltip: 'Equipment slots configuration for this character.', objects: {
            id: { type: 'string', tooltip: 'Unique identifier for the item slot.' },
            slot: { type: 'chooseOne', fromFile: 'item_slots', tooltip: 'The item slot type (e.g., weapon, armor, accessory).' },
            x: { type: 'number', tooltip: 'Slot\'s X position on the character doll UI.' },
            y: { type: 'number', tooltip: 'Slot\'s Y position on the character doll UI.' },
            item_default: { type: 'chooseOne', fromFile: 'item_templates', tooltip: 'If set, when the character is created, the item from this template will be created and equipped in this slot.' }
        }
    },
    starting_statuses: { type: 'chooseMany', fromFile: 'character_statuses', tooltip: 'Statuses to apply to the character when created.' },
    skill_trees: { type: 'chooseMany', fromFile: 'skill_trees', tooltip: 'Skill trees that this character can learn.' },
    gallery: {
        type: 'schema', objects: {
            gallery_id: { type: 'chooseOne', fromFile: 'galleries', fromFileTypeAnd: { type: 'characters' }, tooltip: 'Gallery ID to display a character based on this template in.' },
            gallery_order: { type: 'number', tooltip: 'Display order within the gallery (ascending). Falls back to ID when unset or tied.', defaultValue: 0 },
            entity_name: { type: 'string', tooltip: 'Name of the character to display in the gallery.' },
            entity_description: { type: 'htmlarea', tooltip: 'Description of the character to display in the gallery.' },
        }
    },
    actions: {
        type: 'schema', tooltip: 'Action scripts triggered by character events.', objects: {
            character_create: { type: 'textarea', tooltip: 'Script executed when the character is created.' },
            //character_update: { type: 'textarea', tooltip: 'Fire this action when the character is updated.' },
            //character_delete: { type: 'textarea', tooltip: 'Fire this action when the character is deleted.' },
            character_join_party: { type: 'textarea', tooltip: 'Script executed when the character joins the party.' },
            character_leave_party: { type: 'textarea', tooltip: 'Script executed when the character leaves the party.' },
        }
    },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type CharacterTemplateObject = SchemaToType<typeof CharacterTemplateSchema>;