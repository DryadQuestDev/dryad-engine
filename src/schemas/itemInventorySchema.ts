import { Schema, SchemaToType } from '../utility/schema';
import { PARTY_INVENTORY_ID } from '../game/systems/itemSystem';

export const ItemInventorySchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the inventory.' },
    id: { type: 'string', required: true, tooltip: `Inventory ID used to reference this inventory in code. Party inventory always has id "${PARTY_INVENTORY_ID}".` },
    name: { type: 'string', tooltip: 'The name of the inventory.' },
    auto_create: { type: 'boolean', tooltip: 'If true, the inventory will be created automatically.' },
    max_size: { type: 'number', tooltip: 'The maximum number of items that can be stored in this inventory.' },
    max_weight: { type: 'number', tooltip: 'The maximum weight that can be stored in this inventory.' },
    interactive: { type: 'string', tooltip: "A custom interaction that can be performed on this inventory, used for different interactions like crafting, puzzle solving, etc. Also serves as a css style class for the 'apply' button." },
    recipes: { type: 'chooseMany', tooltip: 'The recipes that can be crafted in this inventory.', fromFile: 'item_recipes' },
    // TODO: think if we need this field or not, maybe rename to shop_id
    // character_id: { type: 'string', tooltip: 'Optional character ID that uses this inventory.' },
    items: {
        type: 'schema[]', tooltip: 'Initial items in this inventory.', objects: {
            item_id: { type: 'chooseOne', tooltip: 'The item template ID to add to the inventory.', fromFile: 'item_templates' },
            quantity: { type: 'number', tooltip: 'The quantity of the item to add to the inventory.', defaultValue: 1 },
        }
    },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type ItemInventoryObject = SchemaToType<typeof ItemInventorySchema>;