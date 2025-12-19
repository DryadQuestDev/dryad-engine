import { Game } from "../../game";
import { Property } from "../../property";
import { Populate } from "../../../utility/save-system";
import { BaseStatusObject } from "../../../schemas/characterStatusSchema";
import { ItemSlotObject } from "../../../schemas/itemSlotSchema";
import { Inventory } from "./inventory";
import { TradeContext } from "../../systems/itemSystem";

export class Item {
    public id: string = "";
    public uid: string = "";
    public traits: Record<string, any> = {};
    public attributes: Record<string, string> = {};

    @Populate(Property)
    public properties: Record<string, Property> = {};
    public statusObject: BaseStatusObject = {};
    public actions: any = {};
    public choices: string[] = [];

    public price: Record<string, number> = {};
    public is_currency: boolean = false;

    public tradePrice: {
        player: Record<string, number>; // the player party's items price
        trader: Record<string, number>; // the trader's items price
    } = {
            player: {},
            trader: {}
        }; // will be set to price when the trade is open and used as an actual price of the item. Can be modified by 'inventory_items_init' event.

    public isTradable(): boolean {
        return this.price && Object.keys(this.price).length > 0;
    }

    /**
     * Check if item is tradable in the current context (uses tradePrice)
     * @param context 'player' for selling to trader, 'trader' for buying from trader
     * @returns true if the item has a price in the given context
     */
    // ignore types
    public isTradableInContext(context: TradeContext): boolean {
        const price = this.tradePrice[context];
        // Handle falsy values (null, undefined, false) as non-tradable
        if (!price || typeof price !== 'object') {
            return false;
        }
        // Check if object has keys and at least one non-zero value
        const entries = Object.entries(price);
        if (entries.length === 0) {
            return false;
        }
        // Item is tradable only if at least one currency has a non-zero value
        return entries.some(([, amount]) => amount > 0);
    }

    /**
     * Get the trade price for a specific context
     * @param context 'player' for selling to trader, 'trader' for buying from trader
     * @returns Price object for the given context, or empty object if invalid
     */
    // ignore types
    public getTradePriceInContext(context: TradeContext): Record<string, number> {
        const price = this.tradePrice[context];
        // Handle falsy values or non-objects by returning empty object
        if (!price || typeof price !== 'object') {
            return {};
        }
        return price;
    }

    /**
     * Check if an inventory can afford this item in a specific context
     * @param context 'player' for selling to trader, 'trader' for buying from trader
     * @param inventory The inventory to check affordability for
     * @returns true if the inventory can afford the item
     */
    // ignore types
    public isAffordableInContext(context: TradeContext, inventory: Inventory): boolean {
        const price = this.getTradePriceInContext(context);
        return inventory.canAffordPrice(price);
    }

    public getPrice(currency?: string): number | Record<string, number> {
        if (currency) {
            return this.price[currency] || 0;
        }
        return this.price;
    }



    public slots: string[] = [];

    // TODO:should these be fetched from the template?
    public tags: string[] = [];
    public getTags(): string[] {
        return this.tags;
    }
    public hasTag(tag: string): boolean {
        return this.tags.includes(tag);
    }


    public isEquipped: boolean = false;
    public quantity: number = 1;

    // -1 - unlimited
    public maxStack(): number {
        return this.getTrait('max_stack') || 1;
    }


    public getTrait(key: string): any | null {
        let trait = Game.getInstance().itemSystem.itemTraitsMap.get(key);
        if (!trait) {
            throw new Error(`Item Trait ${key} does not exist`);
        }

        if (trait.is_persistent === true) {
            let templateTrait = this.getTemplateTrait(key);
            if (templateTrait) {
                return templateTrait;
            }
        }

        return this.traits[key] || null;
    }

    // ignore types
    public getLiveTrait(key: string): any | null {
        let trait = Game.getInstance().itemSystem.itemTraitsMap.get(key);
        if (!trait) {
            throw new Error(`Item Trait ${key} does not exist`);
        }

        return this.traits[key] || null;
    }

    // retrieve trait from the template
    // ignore types
    public getTemplateTrait(key: string): any {
        const template = Game.getInstance().itemSystem.itemTemplatesMap.get(this.id);
        return template?.traits?.[key as keyof typeof template.traits];
    }

    // ignore types
    public getSlotObjects(): ItemSlotObject[] {
        const slots: ItemSlotObject[] = [];
        for (const slotId of this.slots) {
            const slotObject = Game.getInstance().itemSystem.itemSlotsMap.get(slotId);
            if (slotObject) {
                slots.push(slotObject);
            } else {
                console.error(`Item slot ${slotId} for item ${this.id} not found`);
            }
        }
        return slots;
    }

    /**
     * Get CSS class names based on item attributes
     * Converts attributes like { rarity: "rare", type: "ring" } to classes like "rarity_rare type_ring"
     */
    public getAttributeClasses(): string[] {
        const classes: string[] = [];
        for (const [key, value] of Object.entries(this.attributes)) {
            if (value) {
                // Sanitize the value to be CSS-safe (replace spaces and special chars with underscores)
                const sanitizedValue = String(value).toLowerCase().replace(/[^a-z0-9]/g, '_');
                classes.push(`${key}_${sanitizedValue}`);
            }
        }
        return classes;
    }


    // trait methods
    public getName(): string {
        return this.getTrait('name') || this.id;
    }
    public getImage(): string {
        return this.getTrait('image') || '';
    }
    public getDescription(): string {
        return this.getTrait('description') || '';
    }
    public getRarity(): string {
        return this.getTrait('rarity') || '';
    }
    public getType(): string {
        return this.getTrait('type') || '';
    }
    public getWeight(): number {
        return this.getTrait('weight') || 0 * this.quantity;
    }



}