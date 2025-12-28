import { reactive, ref } from "vue";
import copy from "fast-copy";
import { Item } from "./item";
import { Game } from "../../game";
import { Populate, Skip } from "../../../utility/save-system";
import { ItemSlot } from "./itemSlot";
import { Character } from "./character";
import { Status } from "./status";
import { Global } from "../../../global/global";
import { ItemRecipeObject } from "../../../schemas/itemRecipeSchema";
import { TradeContext } from "../../systems/itemSystem";

//type apply


export class Inventory {



    public id: string = "";
    public name: string = "";

    // 0 or undefined - unlimited; Otherwise, the maximum number of items in the inventory
    public maxSize: number = 0;

    // 0 or undefined - unlimited; Otherwise, the maximum weight in the inventory
    public maxWeight: number = 0;

    // execute when clicking 'apply' button in inventory
    public interactive: string = '';

    // ignore types
    public getApplyButton(): string {
        if (this.interactive) {
            return this.interactive;
        }
        if (this.recipes && this.recipes.size > 0) {
            return "craft";
        }
        return '';
    }

    // available recipes that can be crafted in this inventory
    recipes = new Set<string>();
    public addRecipe(recipeId: string): void {
        this.recipes.add(recipeId);
    }
    public getRecipes(): Set<string> {
        return this.recipes;
    }

    // selected recipe for crafting
    public selectedRecipeId = ""


    @Populate(Item)
    public items: Item[] = [];

    /**
     * Calculate how many inventory slots are needed to add items
     * @param itemId - Item template ID
     * @param quantity - Quantity to add
     * @param maxStack - Max stack size for the item
     * @returns Number of slots needed
     */
    private calculateSlotsNeeded(itemId: string, quantity: number, maxStack: number): number {
        let slotsNeeded = 0;

        if (maxStack === -1) {
            // Unlimited stacking - check if we have an existing stack
            const existingStack = this.items.find(i => i.id === itemId && !i.isEquipped);
            if (!existingStack) {
                slotsNeeded = 1; // Need one new slot
            }
            // Otherwise no new slots needed (can add to existing unlimited stack)
        } else if (!maxStack || maxStack <= 1) {
            // Non-stackable - each item needs its own slot
            slotsNeeded = quantity;
        } else {
            // Stackable with limit - calculate available space in existing stacks
            const existingStacks = this.items.filter(i =>
                i.id === itemId && i.quantity < maxStack && !i.isEquipped
            );

            let availableInExisting = 0;
            for (const stack of existingStacks) {
                availableInExisting += maxStack - stack.quantity;
            }

            const remainingAfterStacking = Math.max(0, quantity - availableInExisting);
            slotsNeeded = Math.ceil(remainingAfterStacking / maxStack);
        }

        return slotsNeeded;
    }

    /**
     * Calculate total weight of unequipped items (equipped items don't count toward weight limit)
     * @returns Total weight of unequipped items in inventory
     */
    public getTotalWeight(): number {
        return this.items
            .filter(item => !item.isEquipped)
            .reduce((sum, item) => {
                const weight = item.getTrait('weight') || 0;
                const quantity = item.quantity || 1;
                return sum + (weight * quantity);
            }, 0);
    }

    public getEquippedItems(): Item[] {
        return this.items.filter(i => i.isEquipped);
    }

    /**
     * Get all unequipped items (items that occupy inventory slots)
     * @returns Array of unequipped items
     */
    public getUnequippedItems(): Item[] {
        return this.items.filter(i => !i.isEquipped);
    }

    /**
     * Get the count of unequipped items (items that occupy inventory slots)
     * @returns Number of unequipped items
     */
    // ignore types
    public getUnequippedCount(): number {
        return this.getUnequippedItems().length;
    }

    /**
     * Get the count of equipped items (items that don't occupy inventory slots)
     * @returns Number of equipped items
     */
    // ignore types
    public getEquippedCount(): number {
        return this.items.filter(i => i.isEquipped).length;
    }

    /**
     * Get visible items based on display mode
     * @param mode Display mode: 'all' returns all unequipped items, 'trade' filters by trade context
     * @param tradeContext Context for trade filtering ('player' or 'trader')
     * @returns Array of visible items
     */
    // ignore types
    public getVisibleItems(mode: 'all' | 'trade' = 'all', tradeContext?: TradeContext): Item[] {
        const unequippedItems = this.getUnequippedItems();

        if (mode === 'trade' && tradeContext) {
            // Filter items that are tradable in the given context
            return unequippedItems.filter(item => item.isTradableInContext(tradeContext));
        }

        return unequippedItems;
    }

    /**
     * Get the number of available inventory slots
     * @returns Number of available slots, or null if unlimited
     */
    public getAvailableSlots(): number | null {
        if (this.maxSize <= 0) return null;
        return Math.max(0, this.maxSize - this.getUnequippedCount());
    }

    /**
     * Get the available weight capacity
     * @returns Available weight, or null if unlimited
     */
    public getAvailableWeight(): number | null {
        if (this.maxWeight <= 0) return null;
        return Math.max(0, this.maxWeight - this.getTotalWeight());
    }

    /**
     * Check if inventory is overflowing (more unequipped items than maxSize)
     * @returns True if overflowing
     */
    public isOverflowing(): boolean {
        if (this.maxSize <= 0) return false;
        return this.getUnequippedCount() > this.maxSize;
    }

    /**
     * Check if inventory is overweight (total weight exceeds maxWeight)
     * @returns True if overweight
     */
    public isOverweight(): boolean {
        if (this.maxWeight <= 0) return false;
        return this.getTotalWeight() > this.maxWeight;
    }

    /**
     * Get comprehensive inventory statistics
     * @param visibleItemCount Optional count of visible items (for cases where items are filtered in UI)
     * @returns Object containing all inventory statistics
     */
    // ignore types
    public getInventoryStats(visibleItemCount?: number): {
        maxSize: number;
        maxWeight: number;
        totalItems: number;
        equippedCount: number;
        unequippedCount: number;
        visibleCount: number;
        hiddenCount: number;
        availableSlots: number | null;
        currentWeight: number;
        availableWeight: number | null;
        isOverflowing: boolean;
        isOverweight: boolean;
    } {
        const unequippedCount = this.getUnequippedCount();
        const equippedCount = this.getEquippedCount();
        const totalItems = this.items.length;
        const currentWeight = this.getTotalWeight();
        const availableSlots = this.getAvailableSlots();
        const availableWeight = this.getAvailableWeight();

        // If visibleItemCount is provided, calculate hidden items
        const visibleCount = visibleItemCount !== undefined ? visibleItemCount : unequippedCount;
        const hiddenCount = unequippedCount - visibleCount;

        return {
            maxSize: this.maxSize,
            maxWeight: this.maxWeight,
            totalItems,
            equippedCount,
            unequippedCount,
            visibleCount,
            hiddenCount,
            availableSlots,
            currentWeight,
            availableWeight,
            isOverflowing: this.isOverflowing(),
            isOverweight: this.isOverweight()
        };
    }

    /**
     * Create grid slots array with empty slots for fixed-size inventories
     * @param visibleItems Array of items to display in the grid
     * @param mode Grid mode: 'simple' for basic inventory, 'trade' for trade exchange, 'loot' for loot exchange
     * @returns Array of items and nulls (null represents empty slots)
     */
    // ignore types
    public createGridSlots(visibleItems: Item[], mode: 'simple' | 'trade' | 'loot' = 'simple'): (Item | null)[] {
        // If no max size, return items without empty slots
        if (this.maxSize <= 0) {
            return visibleItems;
        }

        const slots: (Item | null)[] = [];

        // Fill with visible items
        for (let i = 0; i < visibleItems.length; i++) {
            slots.push(visibleItems[i]);
        }

        // Calculate how many empty slots to show
        let emptySlotCount = 0;

        if (mode === 'trade') {
            // In trade mode, use getAvailableSlots() which accounts for ALL unequipped items
            // (including items filtered out that aren't visible in UI)
            const availableSlots = this.getAvailableSlots();
            emptySlotCount = availableSlots !== null ? availableSlots : 0;
        } else {
            // In simple/loot mode, calculate based on visible items already added to slots
            emptySlotCount = Math.max(0, this.maxSize - slots.length);
        }

        // Add empty slots
        for (let i = 0; i < emptySlotCount; i++) {
            slots.push(null);
        }

        return slots;
    }

    /**
     * Calculate weight that would be added
     * @param itemId - Item template ID
     * @param quantity - Quantity to add
     * @returns Weight to be added
     */
    private calculateWeightToAdd(itemId: string, quantity: number): number {
        const game = Game.getInstance();
        const template = game.itemSystem.itemTemplatesMap.get(itemId);
        const weight = (template?.traits as any)?.weight || 0;
        return weight * quantity;
    }

    /**
     * Check if inventory has enough space to add items
     * @param itemId - Item template ID
     * @param quantity - Quantity to add
     * @param maxStack - Max stack size for the item
     * @throws Error if inventory is full and cannot accommodate the items
     */
    private validateInventorySpace(itemId: string, quantity: number, maxStack: number): void {
        // Check size limit
        if (this.maxSize > 0) {
            const currentCount = this.items.filter(i => !i.isEquipped).length;
            const slotsNeeded = this.calculateSlotsNeeded(itemId, quantity, maxStack);
            const availableSlots = this.maxSize - currentCount;

            if (slotsNeeded > availableSlots) {
                throw new Error(
                    `Cannot add items: Inventory is full (${currentCount}/${this.maxSize}). ` +
                    `Need ${slotsNeeded} slots but only ${availableSlots} available.`
                );
            }
        }

        // Check weight limit
        if (this.maxWeight > 0) {
            const currentWeight = this.getTotalWeight();
            const weightToAdd = this.calculateWeightToAdd(itemId, quantity);

            if (currentWeight + weightToAdd > this.maxWeight) {
                throw new Error(
                    `Cannot add items: Weight limit exceeded. ` +
                    `Current: ${currentWeight.toFixed(1)}/${this.maxWeight}, ` +
                    `Trying to add: ${weightToAdd.toFixed(1)}`
                );
            }
        }
    }

    /**
     * Add items to inventory with intelligent stacking
     * @param item - Item to add (used as template)
     * @param quantity - How many to add (defaults to item.quantity if not provided)
     * @param skipValidation - Skip inventory space/weight validation (for currency payments, etc.)
     * @returns Array of items created/modified
     * @throws Error if inventory is full and cannot accommodate the items
     */
    public addItem(item: Item, quantity?: number, skipValidation: boolean = false): Item[] {
        // If quantity is not provided, use the item's quantity property
        const actualQuantity = quantity !== undefined ? quantity : item.quantity;
        const maxStack = item.maxStack();
        const createdItems: Item[] = [];

        // Validate inventory space (unless skipped for special cases like currency payments)
        if (!skipValidation) {
            this.validateInventorySpace(item.id, actualQuantity, maxStack);
        }

        // Special case: unlimited stack (-1)
        if (maxStack === -1) {
            // Find existing stack with same id (stacks items of same type)
            const existingStack = this.items.find(i => i.id === item.id);

            if (existingStack) {
                existingStack.quantity += actualQuantity;
                createdItems.push(existingStack);
            } else {
                // Create new stack with all quantity
                const newItem = this.cloneItem(item);
                newItem.quantity = actualQuantity;
                this.items.push(newItem);
                createdItems.push(newItem);
            }

            return createdItems;
        }

        // Non-stackable items (max_stack = 0, 1, or undefined)
        if (!maxStack || maxStack <= 1) {
            for (let i = 0; i < actualQuantity; i++) {
                const newItem = this.cloneItem(item);
                newItem.quantity = 1;
                this.items.push(newItem);
                createdItems.push(newItem);
            }

            return createdItems;
        }

        // Stackable items with limit (e.g., max_stack = 99)
        let remainingQuantity = actualQuantity;

        // First, try to top off existing stacks
        const existingStacks = this.items.filter(i =>
            i.id === item.id && i.quantity < maxStack
        );

        for (const existingStack of existingStacks) {
            if (remainingQuantity <= 0) break;

            const availableSpace = maxStack - existingStack.quantity;
            const amountToAdd = Math.min(availableSpace, remainingQuantity);

            existingStack.quantity += amountToAdd;
            remainingQuantity -= amountToAdd;
            createdItems.push(existingStack);
        }

        // Create new stacks for remaining quantity
        while (remainingQuantity > 0) {
            const newItem = this.cloneItem(item);
            newItem.quantity = Math.min(remainingQuantity, maxStack);
            remainingQuantity -= newItem.quantity;

            this.items.push(newItem);
            createdItems.push(newItem);
        }

        return createdItems;
    }

    /**
     * Deep clone an item with new UID and reactive wrapper
     */
    public cloneItem(item: Item): Item {
        // Deep clone the item using fast-copy
        const cloned = reactive(copy(item)) as Item;

        // Override specific properties
        cloned.uid = Game.getInstance().createUid();
        cloned.isEquipped = false; // New clone is never equipped

        return cloned;
    }

    public removeItem(item: Item): void {
        this.items = this.items.filter(i => i !== item);
    }

    public getFirstItemById(id: string): Item | null {
        return this.items.find(i => i.id === id) || null;
    }

    public getItemsById(id: string): Item[] {
        return this.items.filter(i => i.id === id);
    }

    public getItemByUid(uid: string): Item | null {
        if (!uid) {
            uid = Game.getInstance().coreSystem.getState('active_item');
        }
        return this.items.find(i => i.uid === uid) || null;
    }

    public getItemsByTrait(trait: string): Item[] {
        return this.items.filter(i => i.getTrait(trait) !== null);
    }





    public equipSlot(slot: ItemSlot, item: Item, character: Character): boolean {
        const game = Game.getInstance();

        // unequip item in slot if it exists first
        let successUnequip = this.unequipSlot(slot, character);
        if (!successUnequip) {
            return false;
        }

        if (!game.getState('supress_game_events')) {
            game.coreSystem.setState('active_character', character.id);
            game.coreSystem.setState('active_inventory', this.id);
            game.coreSystem.setState('active_item', item.uid);
        }

        if (item.actions?.item_equip_before) {
            game.logicSystem.resolveActions(item.actions.item_equip_before);
        }

        let proceed = game.trigger('item_equip_before', item, character);
        if (!proceed) {
            return false;
        }

        // The sticky/hover state is now managed by useItemPopup composable
        // and will be automatically cleared via the watcher when equipped state changes

        item.isEquipped = true;
        slot.itemUid = item.uid;

        // create and add Item Status
        if (item.statusObject) {
            let status = new Status();
            status.id = "item_" + item.uid;
            status.setValues(item.statusObject);
            status.isHidden = true;
            character.addStatus(status);
        }

        if (item.actions?.item_equip_after) {
            game.logicSystem.resolveActions(item.actions.item_equip_after);
        }
        game.trigger('item_equip_after', item, character);
        return true;
    }

    public unequipSlot(slot: ItemSlot, character: Character): boolean {

        const game = Game.getInstance();

        if (!slot.itemUid) {
            return true;
        }

        let itemToUnequip = this.getItemByUid(slot.itemUid);
        if (!itemToUnequip) {
            throw new Error(`Item with uid ${slot.itemUid} not found`);
        }

        if (!game.getState('supress_game_events')) {
            game.coreSystem.setState('active_character', character.id);
            game.coreSystem.setState('active_inventory', this.id);
            game.coreSystem.setState('active_item', itemToUnequip.uid);
        }

        if (itemToUnequip.actions?.item_unequip_before) {
            game.logicSystem.resolveActions(itemToUnequip.actions.item_unequip_before);
        }
        let proceed = game.trigger('item_unequip_before', itemToUnequip, character);
        if (!proceed) {
            return false; // stop unequipping
        }

        // The sticky/hover state is now managed by useItemPopup composable
        // and will be automatically cleared via the watcher when equipped state changes

        slot.itemUid = "";
        itemToUnequip.isEquipped = false;

        // remove Item Status
        if (itemToUnequip.statusObject) {
            character.removeStatus("item_" + itemToUnequip.uid);
        }

        if (itemToUnequip.actions?.item_unequip_after) {
            game.logicSystem.resolveActions(itemToUnequip.actions.item_unequip_after);
        }
        game.trigger('item_unequip_after', itemToUnequip, character);
        return true;
    }

    /**
     * Transfer items from this inventory to another
     * @param target Target inventory
     * @param item Item to transfer
     * @param quantity Quantity to transfer
     * @param silentFail If true, suppress error notifications (for batch operations)
     * @returns true if successful, false otherwise
     */
    public transferTo(target: Inventory, item: Item, quantity: number, silentFail: boolean = false): boolean {
        const global = Global.getInstance();

        // Validate this inventory has the item
        const sourceItem = this.getItemByUid(item.uid);
        if (!sourceItem) {
            if (!silentFail) {
                global.addNotificationId("item_not_found_in_source");
            }
            return false;
        }

        // Check quantity
        if (sourceItem.quantity < quantity) {
            if (!silentFail) {
                global.addNotificationId("not_enough_items_to_transfer");
            }
            return false;
        }

        // Check if item is equipped (shouldn't be visible but safety check)
        if (sourceItem.isEquipped) {
            if (!silentFail) {
                global.addNotificationId("cannot_transfer_equipped_items");
            }
            return false;
        }

        // Check target capacity using consolidated logic
        try {
            target.validateInventorySpace(sourceItem.id, quantity, sourceItem.maxStack());
        } catch (error) {
            if (!silentFail) {
                global.addNotificationId("target_inventory_full");
            }
            return false;
        }
        let isTrade = Game.getInstance().itemSystem.exchangeState.value === "trade";
        let proceed = Game.getInstance().trigger('inventory_transfer', this, target, sourceItem, quantity, isTrade);
        if (!proceed) {
            return false;
        }

        // Transfer logic
        if (sourceItem.quantity === quantity) {
            // Move entire stack
            this.removeItem(sourceItem);
            target.addItem(sourceItem, sourceItem.quantity);
        } else {
            // Split stack
            sourceItem.quantity -= quantity;
            const newItem = this.cloneItem(sourceItem);
            newItem.quantity = quantity;
            target.addItem(newItem, newItem.quantity);
        }

        return true;
    }

    /**
     * Check if this inventory can afford an item
     * @param item Item to check
     * @returns true if affordable, false otherwise
     */
    public canAfford(item: Item): boolean {
        if (!item.isTradable()) {
            return true; // No price means free/not tradeable
        }

        const price = item.price;

        // Check each currency requirement
        for (const [currencyId, requiredAmount] of Object.entries(price)) {
            const currencyItems = this.items.filter(
                i => i.id === currencyId && !i.isEquipped
            );

            const totalAmount = currencyItems.reduce((sum, curr) => sum + curr.quantity, 0);

            if (totalAmount < requiredAmount) {
                return false;
            }
        }

        return true;
    }


    /**
     * Get the total amount of a specific currency in this inventory
     * @param currencyId The currency item template ID
     * @returns Total quantity of unequipped currency items
     */
    public getCurrencyAmount(currencyId: string): number {
        const currencyItems = this.items.filter(
            i => i.id === currencyId && !i.isEquipped
        );
        return currencyItems.reduce((sum, curr) => sum + curr.quantity, 0);
    }

    /**
    * Check if this inventory can afford a specific price
    * @param price Price object to check
    * @returns true if affordable, false otherwise
    */
    public canAffordPrice(price: Record<string, number>): boolean {
        if (!price || Object.keys(price).length === 0) {
            return true; // No price means free
        }

        // Check each currency requirement
        for (const [currencyId, requiredAmount] of Object.entries(price)) {
            const totalAmount = this.getCurrencyAmount(currencyId);

            if (totalAmount < requiredAmount) {
                return false;
            }
        }

        return true;
    }

    /**
     * Deduct currency from this inventory
     * @param price Currency requirements { currency_id: amount }
     * @returns true if successful, false otherwise
     */
    public deductCurrency(price: Record<string, number>): boolean {
        const global = Global.getInstance();
        const game = Game.getInstance();

        // First, check if we can afford it
        for (const [currencyId, requiredAmount] of Object.entries(price)) {
            const totalAmount = this.getCurrencyAmount(currencyId);

            if (totalAmount < requiredAmount) {
                // Get currency name from template
                const template = game.itemSystem.itemTemplatesMap.get(currencyId);
                const currencyName = (template?.traits as any)?.name || currencyId;
                global.addNotificationId("not_enough_currency", { currency: currencyName });
                return false;
            }
        }

        // Deduct each currency
        for (const [currencyId, requiredAmount] of Object.entries(price)) {
            let remaining = requiredAmount;
            const currencyStacks = this.items.filter(
                i => i.id === currencyId && !i.isEquipped
            );

            for (const stack of currencyStacks) {
                if (remaining <= 0) break;

                const deduct = Math.min(stack.quantity, remaining);
                stack.quantity -= deduct;
                remaining -= deduct;

                if (stack.quantity === 0) {
                    this.removeItem(stack);
                }
            }
        }

        return true;
    }


    /**
     * Get all currencies in this inventory
     * @returns Record of currency_id -> total_quantity
     */
    public getCurrencies(): Record<string, number> {
        const currencies: Record<string, number> = {};

        for (const item of this.items) {
            // Skip equipped items
            if (item.isEquipped) continue;

            // Check if item is a currency
            if (item.is_currency) {
                currencies[item.id] = (currencies[item.id] || 0) + item.quantity;
            }
        }

        return currencies;
    }

    public apply() {
        let proceed = Game.getInstance().trigger('inventory_apply', this);
        if (!proceed) {
            return false;
        }

        // craft logic
        this.craft();
    }

    public craft(selectedRecipeId?: string) {
        const game = Game.getInstance();
        const global = Global.getInstance();

        // Determine which recipe to use
        const recipeId = selectedRecipeId || this.selectedRecipeId;

        // Get list of recipes to check
        const recipesToCheck: string[] = [];
        if (recipeId) {
            // If specific recipe selected, only check that one
            recipesToCheck.push(recipeId);
        } else {
            // Otherwise check all available recipes in order
            recipesToCheck.push(...Array.from(this.recipes));
        }

        // Check if any recipes are learned
        let hasAnyLearnedRecipes = false;
        for (const currentRecipeId of recipesToCheck) {
            if (game.itemSystem.learnedRecipes.value.has(currentRecipeId)) {
                hasAnyLearnedRecipes = true;
                break;
            }
        }

        // If no recipes are learned, show appropriate message
        if (!hasAnyLearnedRecipes) {
            global.addNotificationId("no_recipes_learned");
            return false;
        }

        // Try to craft the first craftable recipe
        for (const currentRecipeId of recipesToCheck) {
            const recipe = game.itemSystem.itemRecipesMap.get(currentRecipeId);
            if (!recipe) continue;

            // Check if recipe is learned
            if (!game.itemSystem.learnedRecipes.value.has(currentRecipeId)) continue;

            // Check if we have enough ingredients in exchange inventory only
            const hasIngredients = this.hasIngredientsForRecipe(recipe);
            if (!hasIngredients) continue;

            // Check if there's enough space for output items
            const hasSpace = this.hasSpaceForRecipeOutputs(recipe);
            if (!hasSpace) {
                global.addNotificationId("not_enough_space_for_crafting");
                return false;
            }

            // All checks passed - perform crafting
            this.performCraft(recipe);
            return true;
        }

        // No craftable recipe found (have learned recipes but missing ingredients)
        global.addNotificationId("not_enough_ingredients");
        return false;
    }

    /**
     * Check if exchange inventory has enough ingredients for a recipe
     */
    private hasIngredientsForRecipe(recipe: ItemRecipeObject): boolean {
        if (!recipe.input_items) return true;

        for (const input of recipe.input_items) {
            const requiredQuantity = input.quantity || 1;

            // Count items in exchange inventory only (only non-equipped)
            const itemsInExchange = this.getItemsById(input.item_id!).filter(i => !i.isEquipped);

            const totalQuantity = itemsInExchange.reduce((sum, item) => sum + item.quantity, 0);

            if (totalQuantity < requiredQuantity) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if exchange inventory has space for recipe outputs
     */
    private hasSpaceForRecipeOutputs(recipe: ItemRecipeObject): boolean {
        if (!recipe.output_items) return true;
        if (this.maxSize === 0) return true; // Unlimited inventory

        const currentCount = this.items.filter(i => !i.isEquipped).length;

        // Calculate how many slots will be freed by removing input items
        let slotsFreed = 0;
        if (recipe.input_items) {
            for (const input of recipe.input_items) {
                const inputItems = this.getItemsById(input.item_id!).filter(i => !i.isEquipped);
                let remainingToRemove = input.quantity || 1;

                for (const item of inputItems) {
                    if (remainingToRemove <= 0) break;

                    const removeAmount = Math.min(item.quantity, remainingToRemove);
                    remainingToRemove -= removeAmount;

                    // If this stack will be completely removed, count it as a freed slot
                    if (item.quantity === removeAmount) {
                        slotsFreed++;
                    }
                }
            }
        }

        let slotsNeeded = 0;

        for (const output of recipe.output_items) {
            const game = Game.getInstance();

            // Get max stack from template traits
            const template = game.itemSystem.itemTemplatesMap.get(output.item_id!);
            const maxStack = (template?.traits as any)?.max_stack || 1;
            const outputQuantity = output.quantity || 1;

            // Check existing stacks
            const existingStacks = this.items.filter(i =>
                i.id === output.item_id && !i.isEquipped
            );

            let availableStackSpace = 0;
            if (maxStack === -1 && existingStacks.length > 0) {
                availableStackSpace = Infinity;
            } else if (maxStack > 1) {
                for (const stack of existingStacks) {
                    availableStackSpace += Math.max(0, maxStack - stack.quantity);
                }
            }

            const remainingAfterStacking = Math.max(0, outputQuantity - availableStackSpace);
            slotsNeeded += Math.ceil(remainingAfterStacking / (maxStack || 1));
        }

        const availableSlots = this.maxSize - currentCount + slotsFreed;
        return slotsNeeded <= availableSlots;
    }

    /**
     * Perform the actual crafting: remove inputs from exchange inventory only, add outputs
     */
    private performCraft(recipe: ItemRecipeObject): void {
        const game = Game.getInstance();

        // Remove input items from exchange inventory only
        if (recipe.input_items) {
            for (const input of recipe.input_items) {
                let remainingToRemove = input.quantity || 1;

                // Remove from exchange inventory
                const exchangeItems = this.getItemsById(input.item_id!).filter(i => !i.isEquipped);

                for (const item of exchangeItems) {
                    if (remainingToRemove <= 0) break;

                    const removeAmount = Math.min(item.quantity, remainingToRemove);

                    item.quantity -= removeAmount;
                    remainingToRemove -= removeAmount;

                    if (item.quantity === 0) {
                        this.removeItem(item);
                    }
                }
            }
        }

        // Add output items with animation tracking
        if (recipe.output_items) {
            for (const output of recipe.output_items) {
                const item = game.itemSystem.createItem(output.item_id!);
                const createdItems = this.addItem(item, output.quantity || 1);

                // Mark items for animation
                for (const createdItem of createdItems) {
                    (createdItem as any)._justCrafted = true;
                }
            }
        }

        // Keep selected recipe after crafting so user can craft multiple times
        // this.selectedRecipeId = "";

        // TODO: Add 'inventory_craft' event to game triggers
        // game.trigger('inventory_craft', this, recipe);
    }

}
