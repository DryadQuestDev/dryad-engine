import { Schema, SchemaToType } from '../utility/schema';
import { PARTY_INVENTORY_ID } from '../game/systems/itemSystem';

export const ItemInventorySchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the inventory.' },
    id: { type: 'string', required: true, tooltip: `Inventory ID used to reference this inventory in code. Party inventory always has id "${PARTY_INVENTORY_ID}".` },
    name: { type: 'string', tooltip: 'The name of the inventory.' },
    auto_create: { type: 'boolean', tooltip: 'If true, the inventory will be created automatically at game start.' },
    traits: { type: 'schema', fromFile: 'inventory_traits', fromFileType: 'custom', tooltip: 'Custom inventory traits defined in the inventory_traits file.' },
    max_size: { type: 'number', tooltip: 'The maximum number of items that can be stored in this inventory.' },
    max_weight: { type: 'number', tooltip: 'The maximum weight that can be stored in this inventory.' },
    allow_over_capacity: { type: 'boolean', tooltip: `Allow the slot (max_size) and weight (max_weight) limits to be exceeded. Over-capacity is still reported (isOverCapacity) for gating and display, but items can still be added. Unset = the party inventory ("${PARTY_INVENTORY_ID}") allows over-capacity, every other inventory hard-blocks.` },
    interactive: { type: 'string', tooltip: "A custom interaction that can be performed on this inventory, used for different interactions like crafting, puzzle solving, etc. Also serves as a css style class for the 'apply' button." },
    recipes: { type: 'chooseMany', tooltip: 'Individual recipes craftable here. Merged with anything the assigned recipe groups bring.', fromFile: 'item_recipes' },
    group_recipes: { type: 'chooseMany', tooltip: 'Recipe groups craftable here (see the Recipe Groups tab). Their recipes are added to the ones listed above, so a station can take a whole group plus a few extras.', fromFile: 'recipe_groups' },
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