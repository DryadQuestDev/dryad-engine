import { Schema, SchemaToType } from '../utility/schema';

export const ItemRecipeSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the item slot.' },
    id: { type: 'string', required: true, tooltip: 'Recipe ID used to reference this recipe.' },
    name: { type: 'string', tooltip: 'Recipe name.' },
    description: { type: 'htmlarea', tooltip: 'Recipe description.' },
    input_items: {
        type: 'schema[]', tooltip: 'Items required to craft the output items.', objects: {
            item_id: { type: 'chooseOne', tooltip: 'Ingredient item id.', fromFile: 'item_templates' },
            quantity: { type: 'number', tooltip: 'Quantity of the ingredient item.', defaultValue: 1 },
        }
    },
    output_items: {
        type: 'schema[]', tooltip: 'Items produced by the recipe.', objects: {
            item_id: { type: 'chooseOne', tooltip: 'Result item id.', fromFile: 'item_templates' },
            quantity: { type: 'number', tooltip: 'Quantity of the result item.', defaultValue: 1 },
        }
    },
    recipe_group: { type: 'chooseOne', fromFile: 'recipe_groups', tooltip: 'Group this recipe belongs to. A station that lists the group (inventory field `group_recipes`) can craft it, so a new recipe joins every such station by setting this one field.' },
    tags: { type: 'string[]', tooltip: 'Tags for the recipe.' },
} as const satisfies Schema;

export type ItemRecipeObject = SchemaToType<typeof ItemRecipeSchema>;