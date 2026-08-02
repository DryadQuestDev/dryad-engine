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
import { ItemCategoryObject } from "../../schemas/itemCategorySchema";
import { PropertyObject } from "../../schemas/propertySchema";
import { EntityStatObject } from "../../schemas/entityStatSchema";
import { Property } from "../property";
import { ItemSlot } from "../core/character/itemSlot";
import { ItemRecipeObject } from "../../schemas/itemRecipeSchema";
import { Global } from "../../global/global";
import { gameLogger } from "../utils/logger";

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
    public itemCategoriesMap: Map<string, ItemCategoryObject> = new Map();
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
        gameLogger.info(`[learn_recipe] Learned recipe: "${recipeId}"`);
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
            // A recipe-bearing inventory is a crafting station: default `interactive` to 'craft' (the
            // apply-button CSS class → "Craft" label) so games don't have to set it by hand.
            inventory.interactive = templateObj.interactive || (templateObj.recipes?.length ? 'craft' : '');

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
        // Don't re-open if exchange is already showing
        if (this.game.coreSystem.getState('overlay_state') === 'overlay-exchange') {
            return;
        }

        let inventory = this.game.itemSystem.getInventory(inventoryId);
        if (!inventory) {
            throw new Error(`Inventory with id "${inventoryId}" not found.`);
        }
        gameLogger.info(`[exchange] Opened ${state} exchange with inventory "${inventoryId}"`);
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
        this.game.coreSystem.setState('previous_overlay_state', this.game.coreSystem.getState('overlay_state'));
        this.game.coreSystem.setState('overlay_state', 'overlay-exchange');
    }

    /**
     * Walks every inventory and returns the item with the matching uid, or null if not found.
     * Items have globally-unique uids across inventories.
     */
    public getItemByUid(uid: string): Item | null {
        for (const inv of this.inventories.value.values()) {
            const item = inv.getItemByUid(uid);
            if (item) return item;
        }
        return null;
    }

    /**
     * Construct a fresh reactive `Property` instance for a given property id and max value.
     * Returns null and logs a warning if the property id has no definition in `itemPropertiesMap`.
     * Used by `createItem()` and by save-migration when backfilling newly-defined template properties on old items.
     */
    public createProperty(propertyId: string, maxValue: number): Property | null {
        const entityStat = this.itemPropertiesMap.get(propertyId);
        if (!entityStat) {
            console.warn(`[ItemSystem] Item property definition not found for: ${propertyId}`);
            return null;
        }
        const propertyObj = this.convertToPropertyObject(propertyId, maxValue, entityStat);
        const prop = new Property();
        prop.init(propertyObj);
        return reactive(prop) as Property;
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
        item.category = obj.category || "";
        item.actions = obj.actions || {};
        item.choices = obj.choices || [];
        item.price = obj.price || {};
        item.is_currency = obj.is_currency || false;
        item.learn_recipe = obj.learn_recipe || "";
        item.apply_statuses_on_consume = obj.apply_statuses_on_consume || [];
        item.consume_percentage = obj.consume_percentage || {};
        item.consume_absolute = obj.consume_absolute || {};
        // Convert properties from Record<string, number> to Record<string, Property>
        const properties: Record<string, Property> = {};
        if (obj.properties) {
            for (const [propertyId, maxValue] of Object.entries(obj.properties)) {
                const prop = this.createProperty(propertyId, maxValue as number);
                if (prop) properties[propertyId] = prop;
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
     * Add items by spec string — the engine's grant path (used by the `add_item` and
     * `collect` actions, and available to any engine code).
     *
     * Spec grammar per entry (comma-separated string or array):
     * `"item_id"`, `"item_id#quantity"`, `"item_id->inventory_id"`,
     * `"item_id#quantity->inventory_id"`. Inventory defaults to the party inventory,
     * which also gets the `item.added` flash. Overflow is allowed.
     */
    /**
     * Move items between inventories. Spec: "[sourceInv.]itemId[#qty] -> targetInv",
     * comma-separable; source defaults to the party inventory. Aborts a transfer (with the
     * not_enough_currency notification) when the source lacks the quantity.
     * Example: "gold#200 -> mouse" pays a vendor; "mouse.gold#200 -> _party_inventory" refunds.
     */
    public transferItemsBySpec(data: string | string[]): void {
        const specs = Array.isArray(data)
            ? data
            : data.split(',').map(s => s.trim()).filter(s => s.length > 0);

        for (const spec of specs) {
            const parts = spec.split('->');
            if (parts.length !== 2) {
                throw new Error(`[transfer_item] Invalid spec (need "item#qty -> inventory"): "${spec}"`);
            }
            let itemPart = parts[0].trim();
            const targetInventoryId = parts[1].trim();

            let sourceInventoryId = PARTY_INVENTORY_ID;
            const dotIdx = itemPart.indexOf('.');
            if (dotIdx !== -1) {
                sourceInventoryId = itemPart.slice(0, dotIdx).trim();
                itemPart = itemPart.slice(dotIdx + 1).trim();
            }

            const [itemId, quantityRaw] = itemPart.split('#').map(s => s.trim());
            const quantity = quantityRaw ? parseInt(quantityRaw, 10) : 1;
            if (!itemId || isNaN(quantity) || quantity <= 0) {
                throw new Error(`[transfer_item] Invalid item/quantity in spec: "${spec}"`);
            }

            const source = this.inventories.value.get(sourceInventoryId);
            const target = this.inventories.value.get(targetInventoryId);
            if (!source) throw new Error(`[transfer_item] Source inventory "${sourceInventoryId}" not found.`);
            if (!target) throw new Error(`[transfer_item] Target inventory "${targetInventoryId}" not found.`);

            if (!source.deductCurrency({ [itemId]: quantity })) continue;

            const item = this.createItem(itemId);
            if (!item) throw new Error(`[transfer_item] Item template "${itemId}" not found.`);
            target.addItem(item, quantity, true);
            gameLogger.info(`[transfer_item] ${itemId} x${quantity}: ${sourceInventoryId} -> ${targetInventoryId}`);
        }
    }

    public addItemsBySpec(data: string | string[]): void {
        const items = Array.isArray(data)
            ? data
            : data.split(',').map(s => s.trim()).filter(s => s.length > 0);

        const addedItems: string[] = [];
        for (const itemSpec of items) {
            const parts = itemSpec.split('->');
            const itemPart = parts[0].trim();
            const targetInventoryId = parts[1]?.trim() || PARTY_INVENTORY_ID;

            const itemDetails = itemPart.split('#');
            const itemId = itemDetails[0].trim();
            const quantity = itemDetails[1] ? parseInt(itemDetails[1], 10) : 1;

            if (!itemId) {
                throw new Error(`Invalid item specification: "${itemSpec}"`);
            }
            if (isNaN(quantity) || quantity <= 0) {
                throw new Error(`Invalid quantity in item specification: "${itemSpec}"`);
            }

            const inventory = this.inventories.value.get(targetInventoryId);
            if (!inventory) {
                throw new Error(`Inventory with id "${targetInventoryId}" not found.`);
            }

            const item = this.createItem(itemId);
            if (!item) {
                throw new Error(`Item template with id "${itemId}" not found.`);
            }

            // skip validation to allow overflow
            inventory.addItem(item, quantity, true);
            const quantityText = quantity > 1 ? `(x${quantity})` : "";

            // show flash notification only for party inventory
            if (targetInventoryId === PARTY_INVENTORY_ID) {
                const message = Global.getInstance().getString('item.added', { item: item.getName(), quantity: quantityText });
                this.game.dungeonSystem.addFlash(message);
            }

            addedItems.push(`${itemId}${quantity > 1 ? ' x' + quantity : ''}${targetInventoryId !== PARTY_INVENTORY_ID ? ' -> ' + targetInventoryId : ''}`);
        }

        if (addedItems.length > 0) {
            gameLogger.info(`[add_item] Added item(s): ${addedItems.join(', ')}`);
        }
    }

    /**
     * An item's display name wrapped in its rarity color, from the template — works
     * with a template id or a live Item. Emits the same `rarity rarity_<tier>` markup
     * as item lore-links, so rarity colors stay consistent everywhere.
     */
    public getItemNameHtml(itemOrId: Item | string): string {
        const itemId = typeof itemOrId === 'string' ? itemOrId : itemOrId.id;
        const template = this.itemTemplatesMap.get(itemId);
        const traits = template?.traits as Record<string, any> | undefined;
        const name = traits?.name || itemId;
        const rarity = (template?.attributes as Record<string, any> | undefined)?.rarity;
        return rarity ? `<span class='rarity rarity_${rarity}'>${name}</span>` : name;
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
        const previousOverlayState = this.game.coreSystem.getState('previous_overlay_state');
        this.game.trigger("inventory_close", exchangeInventory);
        this.game.dungeonSystem.nextScene();
        // Restore the overlay state that was active before the exchange opened
        this.game.coreSystem.setState('overlay_state', previousOverlayState);
        this.game.coreSystem.setState('previous_overlay_state', null);
    }

}