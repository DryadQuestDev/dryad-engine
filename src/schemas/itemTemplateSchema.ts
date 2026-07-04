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
    traits: { type: 'schema', fromFile: 'item_traits', fromFileType: 'custom', tooltip: 'Custom item traits defined in item_traits file.' },
    attributes: { type: 'schema', fromFile: 'item_attributes', fromFileType: 'chooseOne', tooltip: 'Item attributes with selectable values from item_attributes file.' },
    properties: { type: 'schema', fromFile: 'item_properties', fromFileType: 'number', tooltip: 'Numeric properties (e.g., weight) from item_properties file.' },
    is_consumable: { type: 'boolean', tooltip: 'If true, the item can be consumed for one-time effects.' },
    consume_duration: { type: 'number', tooltip: 'Duration (turns) for the status applied on consume. -1 or empty = permanent.', show: { is_consumable: [true] } },
    consume_max_stacks: { type: 'number', tooltip: 'Max stacks for the consume status. -1 = unlimited. Consuming the same item again adds stacks. Default: -1.', show: { is_consumable: [true] } },
    consume_polarity: { type: 'chooseOne', options: ['positive', 'neutral', 'negative'], tooltip: 'Polarity of the consume status: positive (green), neutral (gray), negative (red).', show: { is_consumable: [true] } },
    consume_status_id: { type: 'string', tooltip: 'Custom status ID for the consume effect. Items sharing the same ID will replace each other instead of stacking. If empty, defaults to "consume_" + item ID.', show: { is_consumable: [true] } },
    consume_percentage: { type: 'schema', fromFile: 'character_stats', fromFileType: 'number', fromFileTypeAnd: { is_resource: true }, tooltip: 'Percentage of max resource to restore/reduce on consume. Positive = restore, negative = reduce.', show: { is_consumable: [true] } },
    consume_absolute: { type: 'schema', fromFile: 'character_stats', fromFileType: 'number', fromFileTypeAnd: { is_resource: true }, tooltip: 'Flat resource amount to restore/reduce on consume. Positive = restore, negative = reduce.', show: { is_consumable: [true] } },
    status: {
        type: 'schema', tooltip: 'The status to apply to the character when equipped.', objects: {
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