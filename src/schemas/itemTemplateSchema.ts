import { active } from 'sortablejs';
import { Schema, SchemaToType } from '../utility/schema';
import { BaseStatusSchema } from './characterStatusSchema';

export const ItemTemplateSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the item template.' },
    id: { type: 'string', required: true, tooltip: 'Item template ID used to reference this item in code.' },
    choices: { type: 'chooseMany', fromFile: 'custom_choices', fromFileTypeOr: { group: ['any', 'item'] }, tooltip: 'Custom choices to show when interacting with the item in the party inventory.' },
    traits: { type: 'schema', fromFile: 'item_traits', fromFileType: 'custom', tooltip: 'Custom item traits defined in item_traits file.' },
    attributes: { type: 'schema', fromFile: 'item_attributes', fromFileType: 'chooseOne', tooltip: 'Item attributes with selectable values from item_attributes file.' },
    properties: { type: 'schema', fromFile: 'item_properties', fromFileType: 'number', tooltip: 'Numeric properties (e.g., weight) from item_properties file.' },
    status: {
        type: 'schema', tooltip: 'The status to apply to the character when equipped.', objects: {
            ...BaseStatusSchema
        }
    },
    slots: { type: 'chooseMany', fromFile: 'item_slots', tooltip: 'Equipment slots where this item can be equipped.' },
    price: { type: 'schema', fromFile: 'item_templates', fromFileType: 'number', fromFileTypeAnd: { is_currency: true }, tooltip: 'Price of the item in various currencies. Only items marked as currency appear as options.' },
    is_currency: { type: 'boolean', tooltip: 'If true, the item can be used as currency for the \'price\' field. You might need to reload the tab to update the price options.' },
    actions: {
        type: 'schema', tooltip: 'Action scripts triggered by item events.', objects: {
            item_create: { type: 'textarea', tooltip: 'Script executed when the item is created in the inventory.' },
            item_equip_before: { type: 'textarea', tooltip: 'Script executed before the item is equipped.' },
            item_equip_after: { type: 'textarea', tooltip: 'Script executed after the item is equipped.' },
            item_unequip_before: { type: 'textarea', tooltip: 'Script executed before the item is unequipped.' },
            item_unequip_after: { type: 'textarea', tooltip: 'Script executed after the item is unequipped.' },
        }
    },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type ItemTemplateObject = SchemaToType<typeof ItemTemplateSchema>;