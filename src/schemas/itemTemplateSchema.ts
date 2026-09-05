import { active } from 'sortablejs';
import { Schema, SchemaToType } from '../utility/schema';
import { AppliedStatusSchema } from './characterStatusSchema';

export const ItemTemplateSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the item template.' },
    id: { type: 'string', required: true, tooltip: 'Item template ID used to reference this item in code.' },
    category: { type: 'chooseOne', fromFile: 'item_categories', tooltip: 'Inventory filter category (player UI only — unrelated to equip slots).' },
    choices: { type: 'chooseMany', fromFile: 'custom_choices', fromFileTypeOr: { group: ['any', 'item'] }, tooltip: 'Custom choices to show when interacting with the item in the party inventory.' },
    slots: { type: 'chooseMany', fromFile: 'item_slots', tooltip: 'Equipment slots where this item can be equipped.' },
    price: { type: 'schema', fromFile: 'item_templates', fromFileType: 'number', fromFileTypeAnd: { is_currency: true }, tooltip: 'Price of the item in various currencies. Only items marked as currency appear as options.' },
    is_currency: { type: 'boolean', tooltip: 'If true, the item can be used as currency for the \'price\' field. You might need to reload the tab to update the price options.' },
    learn_recipe: { type: 'chooseOne', fromFile: 'item_recipes', tooltip: 'If set, the item shows a "Learn" choice in the inventory that teaches this recipe (grayed out once learned). Learning consumes the item.' },
    traits: { type: 'schema', fromFile: 'item_traits', fromFileType: 'custom', tooltip: 'Custom item traits defined in item_traits file.' },
    apply_statuses_on_consume: {
        type: 'schema[]', tooltip: 'Statuses applied when the item is CONSUMED (referencing status templates, which carry their own duration/max_stacks/polarity/group_id). Any entry makes the item show a "Consume" choice. An item can also carry an equip `status` — the two are independent (e.g. +2 luck on equip, +10 health on consume).', objects: {
            status: { type: 'chooseOne', fromFile: 'character_statuses', tooltip: 'Status template to apply on consume.' },
            stacks: { type: 'number', tooltip: 'Stacks to apply (default 1).' },
        }
    },
    consume_percentage: { type: 'schema', fromFile: 'character_stats', fromFileType: 'number', fromFileTypeAnd: { is_resource: true }, tooltip: 'Percentage of max resource to restore/reduce on consume. Positive = restore, negative = reduce. Any entry makes the item consumable.' },
    consume_absolute: { type: 'schema', fromFile: 'character_stats', fromFileType: 'number', fromFileTypeAnd: { is_resource: true }, tooltip: 'Flat resource amount to restore/reduce on consume. Positive = restore, negative = reduce. Any entry makes the item consumable.' },
    status: {
        type: 'schema', tooltip: 'The status to apply to the character when EQUIPPED (independent of consume effects).', objects: {
            ...AppliedStatusSchema
        }
    },
    actions: {
        type: 'schema', tooltip: 'Action scripts triggered by item events.', objects: {
            item_create: { type: 'textarea', tooltip: 'Script executed when the item is created in the inventory.' },
            item_equip_before: { type: 'textarea', tooltip: 'Script executed before the item is equipped.' },
            item_equip_after: { type: 'textarea', tooltip: 'Script executed after the item is equipped.' },
            item_unequip_before: { type: 'textarea', tooltip: 'Script executed before the item is unequipped.' },
            item_unequip_after: { type: 'textarea', tooltip: 'Script executed after the item is unequipped.' },
            item_consume_before: { type: 'textarea', tooltip: 'Script executed before the item is consumed.' },
            item_consume_after: { type: 'textarea', tooltip: 'Script executed after the item is consumed.' },
        }
    },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type ItemTemplateObject = SchemaToType<typeof ItemTemplateSchema>;