import { Inventory } from "../core/character/inventory";
import { Game } from "../game";
import { Populate } from "../../utility/save-system";
import { reactive, Ref, ref } from "vue";
import { ItemTemplateObject } from "../../schemas/itemTemplateSchema";
import { Item } from "../core/character/item";
import { Skip } from "../../utility/save-system";
import { ItemInventoryObject } from "../../schemas/itemInventorySchema";
import { EntityTraitObject } from "../../schemas/entityTraitSchema";
import { EntityAttributeObject } from "../../schemas/entityAttributeSchema";
import { ItemSlotObject } from "../../schemas/itemSlotSchema";
import { PropertyObject } from "../../schemas/propertySchema";
import { EntityStatObject } from "../../schemas/entityStatSchema";
import { Property } from "../property";
import { ItemSlot } from "../core/character/itemSlot";
import { ItemRecipeObject } from "../../schemas/itemRecipeSchema";

// special id for party inventory
export const PARTY_INVENTORY_ID = "_party_inventory";
export const ITEM_INFO_WIDTH = 250;

/**
 * Trade context for pricing
 * 'player' - Item owned by player (what trader pays to player when buying)
 * 'trader' - Item owned by trader (what trader charges player when selling)
 */
export type TradeContext = 'player' | 'trader';

export class ItemSystem {
    get game(): Game {
        return Game.getInstance();
    }


    @Skip()
    public itemTemplatesMap: Map<string, ItemTemplateObject> = new Map();
    @Skip()
    public inventoryTemplatesMap: Map<string, ItemInventoryObject> = new Map();

    @Skip()
    public itemTraitsMap: Map<string, EntityTraitObject> = new Map();
    @Skip()
    public itemAttributesMap: Map<string, EntityAttributeObject> = new Map();
    @Skip()
    public itemPropertiesMap: Map<string, EntityStatObject> = new Map();
    @Skip()
    public itemSlotsMap: Map<string, ItemSlotObject> = new Map();
    @Skip()
    public itemRecipesMap: Map<string, ItemRecipeObject> = new Map();

    @Populate(Inventory, { mode: 'merge' })
    public inventories: Ref<Map<string, Inventory>> = ref(new Map());

    public exchangeState = ref<'loot' | 'trade'>('loot');

    public exchangeInventoryId = ref<string>('');


    // TODO: implement this
    learnedRecipes = ref<Set<string>>(new Set());
    public addLearnedRecipe(recipeId: string): void {
        let isAlreadyLearned = this.learnedRecipes.value.has(recipeId);
        if (isAlreadyLearned) {
            return;
        }
        this.learnedRecipes.value.add(recipeId);
        this.game.trigger("recipe_learned", recipeId);
    }
    public getLearnedRecipes(): Set<string> {
        return this.learnedRecipes.value;
    }


    public createInventory(id: string, template?: any | string): Inventory {
        let isInventoryExists = this.inventories.value.has(id);
        if (isInventoryExists) {
            throw new Error(`Inventory with id "${id}" already exists.`);
        }

        let inventory = new Inventory();
        inventory.id = id;
        this.inventories.value.set(id, inventory);

        // If template is provided, populate the inventory
        if (template) {
            let templateObj: any;
            if (typeof template === 'string') {
                const found = this.inventoryTemplatesMap.get(template);
                if (!found) {
                    throw new Error(`Inventory template "${template}" not found`);
                }
                templateObj = found;
            } else {
                templateObj = template;
            }

            // Add items from template
            for (let itemTemplateObject of templateObj.items || []) {
                let itemId = itemTemplateObject.item_id || "";
                let quantity = itemTemplateObject.quantity || 1;
                let item = this.createItem(itemId);
                inventory.addItem(item, quantity);
            }

            // Set inventory properties
            inventory.name = templateObj.name || '';
            inventory.maxSize = templateObj.max_size || 0;
            inventory.maxWeight = templateObj.max_weight || 0;
            inventory.interactive = templateObj.interactive || '';

            // Add recipes
            for (let recipeId of templateObj.recipes || []) {
                inventory.addRecipe(recipeId);
            }
        }

        return inventory;
    }

    public addInventory(inventory: Inventory): void {
        this.inventories.value.set(inventory.id, inventory);
    }

    public removeInventory(inventory: string | Inventory): boolean {
        if (typeof inventory === 'string') {
            return this.inventories.value.delete(inventory);
        } else {
            return this.inventories.value.delete(inventory.id);
        }
    }

    public openExchange(inventoryId: string, state: 'loot' | 'trade'): void {
        let inventory = this.game.itemSystem.getInventory(inventoryId);
        if (!inventory) {
            throw new Error(`Inventory with id "${inventoryId}" not found.`);
        }
        this.game.itemSystem.exchangeState.value = state;
        this.game.trigger("inventory_open", inventory);
        this.game.itemSystem.exchangeInventoryId.value = inventoryId;

        // Initialize trade prices for all items in both inventories
        if (state === 'trade') {
            const partyInventory = this.game.itemSystem.getInventory(PARTY_INVENTORY_ID);

            // Initialize trade prices for exchange inventory items
            if (inventory) {
                for (const item of inventory.items) {
                    // Initialize tradePrice from base price
                    item.tradePrice.player = { ...item.price };
                    item.tradePrice.trader = { ...item.price };

                    // Trigger event for custom price modifications
                    this.game.trigger("trade_init", inventory, item);
                }
            }

            // Initialize trade prices for party inventory items
            if (partyInventory) {
                for (const item of partyInventory.items) {
                    // Initialize tradePrice from base price
                    item.tradePrice.player = { ...item.price };
                    item.tradePrice.trader = { ...item.price };

                    // Trigger event for custom price modifications
                    this.game.trigger("trade_init", inventory, item);
                }
            }
        }

        this.game.coreSystem.setState('block_party_inventory', true);
        this.game.coreSystem.setState('overlay_state', 'overlay-exchange');
    }

    /**
     * Convert EntityStatObject with a number value to PropertyObject for Property constructor
     * @param statId - The stat ID
     * @param value - The max value from template
     * @param entityStat - The EntityStatObject definition
     */
    private convertToPropertyObject(statId: string, value: number, entityStat: EntityStatObject): PropertyObject {
        return {
            uid: this.game.createUid(),
            id: statId,
            name: entityStat.name,
            description: entityStat.description,
            type: 'number',
            precision: entityStat.precision,
            is_negative: false,
            min_value: 0,
            max_value: value,
            can_overflow: entityStat.can_overflow,
            default_value_number: value, // Set default to max value
            tags: entityStat.tags
        };
    }

    public createItem(template: ItemTemplateObject | string): Item {
        // If template is a string, look it up from the templates map
        let obj: ItemTemplateObject;
        if (typeof template === 'string') {
            const found = this.itemTemplatesMap.get(template);
            if (!found) {
                throw new Error(`Item template "${template}" not found`);
            }
            // deep clone template to avoid mutating the original object
            obj = JSON.parse(JSON.stringify(found));
        } else {
            obj = template;
        }

        let item = reactive(new Item());
        item.uid = this.game.createUid();

        item.id = obj.id;
        item.traits = obj.traits || {};
        item.attributes = obj.attributes || {};
        item.statusObject = obj.status || {};
        item.slots = obj.slots || [];
        item.tags = obj.tags || [];
        item.actions = obj.actions || {};
        item.choices = obj.choices || [];
        item.price = obj.price || {};
        item.is_currency = obj.is_currency || false;
        // Convert properties from Record<string, number> to Record<string, Property>
        const properties: Record<string, Property> = {};
        if (obj.properties) {
            for (const [propertyId, maxValue] of Object.entries(obj.properties)) {
                const entityStat = this.itemPropertiesMap.get(propertyId);
                if (entityStat) {
                    const propertyObj = this.convertToPropertyObject(propertyId, maxValue as number, entityStat);
                    const prop = new Property();
                    prop.init(propertyObj);
                    properties[propertyId] = reactive(prop) as Property;
                } else {
                    console.warn(`[ItemSystem] Item property definition not found for: ${propertyId}`);
                }
            }
        }
        item.properties = properties;

        if (item.actions?.item_create) {
            this.game.logicSystem.resolveActions(item.actions.item_create);
        }
        this.game.trigger('item_create', item as Item);

        return item;
    }

    /**
     * Helper: Get property from template (moddable assets)
     * Used for properties marked with is_persistent: true
     * @example itemSystem.getTemplateProperty(item, 'icon')
     */
    // ignore types
    public getTemplateProperty(item: Item, key: string): any {
        const template = this.itemTemplatesMap.get(item.id);
        return template?.traits?.[key as keyof typeof template.traits];
    }

    public getInventory(id: string): Inventory | null {

        if (!id) {
            id = this.game.coreSystem.getState('active_inventory');
        }

        return this.inventories.value.get(id) || null;
    }

    public canUseItems(): boolean {
        if (this.game.coreSystem.getState('block_party_inventory')) {
            return false;
        }
        return true;
    }

    public closeExchangeInventory(exchangeInventory: Inventory): void {
        this.game.trigger("inventory_close", exchangeInventory);
        this.game.dungeonSystem.nextScene();
    }

}