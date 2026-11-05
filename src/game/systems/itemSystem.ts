import { Inventory } from "../core/character/inventory";
import { Game } from "../game";
import { Populate } from "../../utility/save-system";
import { reactive, Ref, ref, shallowRef, ShallowRef } from "vue";
import { ItemTemplateObject } from "../../schemas/itemTemplateSchema";
import { Item, ItemReadable, ItemReadableType } from "../core/character/item";
import { Skip } from "../../utility/save-system";
import { ItemInventoryObject } from "../../schemas/itemInventorySchema";
import { EntityTraitObject } from "../../schemas/entityTraitSchema";
import { ItemSlotObject } from "../../schemas/itemSlotSchema";
import { ItemCategoryObject } from "../../schemas/itemCategorySchema";
import { ItemSlot } from "../core/character/itemSlot";
import type { Character } from "../core/character/character";
import { ItemRecipeObject } from "../../schemas/itemRecipeSchema";
import { RecipeGroupObject } from "../../schemas/recipeGroupSchema";
import { Global } from "../../global/global";
import { gameLogger } from "../utils/logger";

// special id for party inventory
export const PARTY_INVENTORY_ID = "_party_inventory";
export const ITEM_INFO_WIDTH = 250;

/**
 * A line a game is expected to own, with an engine default behind it: the running game's locale
 * first, then the engine locale. The key-lock ids (key_used, key_missing_chest, key_missing_door)
 * are authored per game — and shipped by the global_essentials plugin — so a game that overrides
 * one keeps its wording, and a game that ships neither still reads as prose instead of a raw
 * `[key_used]` bracket.
 */
export function getGameLineOrEngine(lineId: string, params: Record<string, string | number> = {}): string {
    const gameLine = Game.getInstance().getLine(lineId, params);
    if (gameLine && gameLine !== `[${lineId}]`) return gameLine;
    return Global.getInstance().getString(lineId, params);
}

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
    public itemSlotsMap: Map<string, ItemSlotObject> = new Map();
    @Skip()
    public itemCategoriesMap: Map<string, ItemCategoryObject> = new Map();
    @Skip()
    public itemRecipesMap: Map<string, ItemRecipeObject> = new Map();
    public recipeGroupsMap: Map<string, RecipeGroupObject> = new Map();

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

    // The item the reader popup shows. Held here, not looked up by uid, because a readable made from
    // an inline template object sits in no inventory; transient, so a load never reopens a stale one.
    @Skip()
    public readingItem: ShallowRef<Item | null> = shallowRef(null);

    // Discovered collectables — item ids the player has "experienced" (recipe learned from the
    // scroll, readable opened (a Scene one: read to its last page), painting scene viewed). Drives the check mark on item
    // cards. A Set of template ids; serializes as an array like learnedRecipes.
    discoveredItems = ref<Set<string>>(new Set());
    public discoverItem(itemId: string): void {
        if (this.discoveredItems.value.has(itemId)) {
            return;
        }
        if (!this.itemTemplatesMap.has(itemId)) {
            gameLogger.error(`[discover_item] Item template "${itemId}" does not exist.`);
            return;
        }
        this.discoveredItems.value.add(itemId);
        gameLogger.info(`[discover_item] Discovered item: "${itemId}"`);
        this.game.trigger("item_discovered", itemId);
    }
    public isItemDiscovered(itemId: string): boolean {
        return this.discoveredItems.value.has(itemId);
    }
    public getDiscoveredItems(): Set<string> {
        return this.discoveredItems.value;
    }

    /**
     * Open an item's text. A Book or Scroll opens the reader popup and marks the item read at once;
     * a Scene plays in the dialogue box from its bookmark and is marked read on its last page.
     * An id is looked up in the party inventory and then the templates, so a letter can be read
     * where it lies without being carried.
     */
    public readItem(itemOrId: Item | string): boolean {
        const item = typeof itemOrId === 'string'
            ? this.getInventory(PARTY_INVENTORY_ID)?.getItemsById(itemOrId)[0] || null
            : itemOrId;
        const itemId = item ? item.id : itemOrId as string;
        const readable = item ? item.getReadable() : this.getTemplateReadable(itemId);
        if (!readable) {
            gameLogger.warn(`[read_item] "${itemId}" has no readable source.`);
            return false;
        }
        if (readable.type === 'scene') {
            return this.openReadableScene(itemId, readable.source);
        }
        if (this.getReadableText(readable) === null) {
            gameLogger.error(`[read_item] template "${readable.source}" on "${itemId}" not found (expected dungeon_id.template_id).`);
            return false;
        }
        if (this.itemTemplatesMap.has(itemId)) {
            this.discoverItem(itemId);
        }
        this.readingItem.value = item;
        this.game.setState('reading_item', { id: itemId, uid: item?.uid || '' });
        this.game.openPopup('readable_popup');
        return true;
    }

    /** A registered template's readable definition, or null when it has none. */
    public getTemplateReadable(itemId: string): ItemReadable | null {
        const readable = this.itemTemplatesMap.get(itemId)?.readable;
        if (!readable?.source) return null;
        return { type: (readable.type || 'book') as ItemReadableType, source: readable.source };
    }

    /**
     * The resolved text of a Book or Scroll: the `$template` its source names (split at the first
     * dot, since template ids may contain dots), with placeholders and styles applied and actions
     * left unrun. Null when the template does not exist.
     */
    public getReadableText(readable: ItemReadable): string | null {
        const dot = readable.source.indexOf('.');
        if (dot < 1) return null;
        const dungeonId = readable.source.slice(0, dot);
        const line = this.game.dungeonSystem.dungeonLines.get(dungeonId)?.get('$' + readable.source.slice(dot + 1));
        if (!line) return null;
        return this.game.resolveString(line.val ?? '', true).output;
    }

    private openReadableScene(itemId: string, ref: string): boolean {
        // The engine's scene-reference grammar owns the parsing — the source takes anything the
        // scene action takes (dungeon.room.scene, room.scene, full #ids, &anchors).
        const resolved = this.game.dungeonSystem.resolveSceneId(ref);
        if (!resolved.sceneId) {
            gameLogger.error(`[read_item] scene "${ref}" on "${itemId}" did not resolve.`);
            return false;
        }
        const dungeonId = resolved.dungeonId || this.game.dungeonSystem.currentDungeonId.value || '';
        const base = resolved.sceneId.replace(/^#/, '').split('.').slice(0, -3).join('.');
        if (!this.game.dungeonSystem.dungeonLines.get(dungeonId)?.get(`#${base}.1.1.1`)) {
            gameLogger.error(`[read_item] scene "#${base}.1.1.1" not found in dungeon "${dungeonId}" (readable on "${itemId}").`);
            return false;
        }
        const bookmarks = (this.game.getState('book_bookmarks') || {}) as Record<string, number>;
        this.playBookPage(itemId, dungeonId, base, bookmarks[itemId] || 1);
        return true;
    }

    // Open a Scene readable's page: update the reading state + bookmark, then play the page's scene.
    // The last page (no following paragraph line) discovers the item and clears the bookmark.
    public playBookPage(itemId: string, dungeonId: string, base: string, page: number): void {
        this.game.setState('reading_book', { itemId, dungeonId, base, page });
        const bookmarks = { ...((this.game.getState('book_bookmarks') || {}) as Record<string, number>) };
        const nextPageExists = !!this.game.dungeonSystem.dungeonLines.get(dungeonId)?.get(`#${base}.1.1.${page + 1}`);
        if (nextPageExists) {
            bookmarks[itemId] = page;
        } else {
            delete bookmarks[itemId];
            this.discoverItem(itemId);
        }
        this.game.setState('book_bookmarks', bookmarks);
        this.game.dungeonSystem.playSceneResolver(`${base}.1.1.${page}`, dungeonId);
    }

    // Key-locked inventories (chests) that have been opened — locks stay open for the save.
    unlockedInventories = ref<Set<string>>(new Set());

    /**
     * Auto-use a key item from the party bag: consume it if asked, notify, fire key_used.
     * Returns false when the bag holds no such key (caller shows the locked message).
     */
    public tryUseKey(keyItemId: string, consume: boolean, targetId: string): boolean {
        const inventory = this.inventories.value.get(PARTY_INVENTORY_ID);
        // Never consume an equipped stack — deleting it would strand slot.itemUid and the granted
        // equip status. An equipped key still counts when the lock keeps the key.
        const stacks = inventory?.getItemsById(keyItemId) || [];
        const keyItem = stacks.find(item => !item.isEquipped) || (!consume ? stacks[0] : undefined);
        if (!inventory || !keyItem) {
            return false;
        }
        if (consume) {
            inventory.reduceItemQuantity(keyItem, 1);
        }
        this.game.showNotification(getGameLineOrEngine('key_used', { item: this.getItemNameHtml(keyItemId) }));
        this.game.trigger('key_used', keyItemId, targetId);
        return true;
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
            // Left undefined when the template omits it, so the party-inventory over-capacity
            // fallback (resolved in addItem) applies.
            inventory.allowOverCapacity = templateObj.allow_over_capacity;
            // A recipe-bearing inventory is a crafting station: default `interactive` to 'craft' (the
            // apply-button CSS class → "Craft" label) so games don't have to set it by hand.
            inventory.traits = templateObj.traits || {};
            const templateRecipes = this.resolveTemplateRecipes(templateObj);
            inventory.interactive = templateObj.interactive || (templateRecipes.length ? 'craft' : '');

            // Add recipes
            for (let recipeId of templateRecipes) {
                inventory.addRecipe(recipeId);
            }
        }

        return inventory;
    }

    /**
     * An inventory's own `recipes` plus every recipe carried by the groups in `group_recipes`, deduplicated.
     */
    public resolveTemplateRecipes(templateObj: ItemInventoryObject): string[] {
        const recipeIds: string[] = [...(templateObj.recipes || [])];
        for (let groupId of templateObj.group_recipes || []) {
            if (!this.recipeGroupsMap.has(groupId)) {
                gameLogger.warn(`Recipe group "${groupId}" referenced by inventory "${templateObj.id}" does not exist.`);
                continue;
            }
            // Membership lives on the recipe (`recipe_group`), so a new recipe joins every station
            // that lists its group without anyone editing the group or the station.
            for (const [recipeId, recipe] of this.itemRecipesMap) {
                if ((recipe as any).recipe_group === groupId) recipeIds.push(recipeId);
            }
        }
        return [...new Set(recipeIds)];
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

        // Key lock (inventory traits key / key_consume): auto-use the key or refuse to open.
        // Template traits win over the instance snapshot so mid-production lock edits reach old
        // saves; the instance copy covers runtime-created inventories with no template.
        const lockTraits = (this.inventoryTemplatesMap.get(inventoryId) as any)?.traits ?? inventory.traits;
        const lockKey = lockTraits?.key;
        if (lockKey && !this.unlockedInventories.value.has(inventoryId)) {
            if (this.tryUseKey(lockKey, !!lockTraits?.key_consume, inventoryId)) {
                this.unlockedInventories.value.add(inventoryId);
            } else {
                this.game.showNotification(getGameLineOrEngine('key_missing_chest'));
                // The loot/trade action may have parked a scene on its delayed choice — resume the
                // MAIN flow: drop any branch resume first, or the refused branch's success prose
                // would play.
                this.game.dungeonSystem.pendingResume = null;
                this.game.dungeonSystem.nextScene();
                return;
            }
        }

        gameLogger.info(`[exchange] Opened ${state} exchange with inventory "${inventoryId}"`);
        this.game.itemSystem.exchangeState.value = state;
        this.game.trigger("inventory_open", inventory, state);
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
     * The stats an item grants where it sits: a copy of its own stats, passed through the
     * `item_stats` emitter so a game can make them depend on the slot. With no `slot`, a worn item
     * resolves in the slot it is in and a loose one in none; pass a slot (null for none) to ask
     * how it would be there instead.
     */
    public getItemStats(item: Item, slot?: ItemSlot | null, character?: Character | null): Record<string, number> {
        if (slot === undefined) {
            slot = null;
            character = null;
            if (item.isEquipped) {
                for (const candidate of this.game.getAllCharacters()) {
                    const worn = candidate.getItemSlotByItemUid(item.uid);
                    if (worn) {
                        slot = worn;
                        character = candidate;
                        break;
                    }
                }
            }
        }
        const stats: Record<string, number> = { ...(item.statusObject?.stats || {}) };
        this.game.trigger('item_stats', item, stats, slot, character ?? null);
        return stats;
    }

    /**
     * Copy every template-owned field onto an item: everything except identity (id, uid), traits
     * (synced per trait id, so instance-owned ones can be skipped) and per-instance state (quantity,
     * equipped flag, trade prices). `createItem` builds a fresh instance with it and the save
     * migration re-runs it on saved items, so the two can never disagree about what a template owns.
     * `obj` must be the caller's own copy — fields are assigned by reference.
     */
    public applyTemplateFields(item: Item, obj: ItemTemplateObject): void {
        item.statusObject = obj.status || {};
        item.slots = obj.slots || [];
        item.tags = obj.tags || [];
        item.category = obj.category || "";
        item.actions = obj.actions || {};
        item.choices = obj.choices || [];
        item.price = obj.price || {};
        item.is_currency = obj.is_currency || false;
        item.learn_recipe = obj.learn_recipe || "";
        item.readable = (obj.readable?.source ? obj.readable : null) as Item['readable'];
        item.apply_statuses_on_consume = obj.apply_statuses_on_consume || [];
        item.consume_percentage = obj.consume_percentage || {};
        item.consume_absolute = obj.consume_absolute || {};
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
        this.applyTemplateFields(item, obj);

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
     * which also gets the `item.added_single` / `item.added_quantity` flash. Overflow is allowed.
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

    public addItemsBySpec(data: string | string[], flash: boolean = true): void {
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

            // show flash notification only for party inventory
            if (flash && targetInventoryId === PARTY_INVENTORY_ID) {
                // Two keys rather than one with an injected "(xN)" clause: the count is a number
                // the locale value places itself, so a translation can drop it, move it before the
                // name, or write its own multiplier glyph.
                // The flash footer runs through v-script, so the lore link renders as a hoverable item card.
                const link = `[[item:${itemId}]]`;
                const message = quantity > 1
                    ? Global.getInstance().getString('item.added_quantity', { item: link, count: quantity })
                    : Global.getInstance().getString('item.added_single', { item: link });
                this.game.dungeonSystem.addFlash(message);
            }

            addedItems.push(`${itemId}${quantity > 1 ? ' x' + quantity : ''}${targetInventoryId !== PARTY_INVENTORY_ID ? ' -> ' + targetInventoryId : ''}`);
        }

        if (addedItems.length > 0) {
            gameLogger.info(`[add_item] Added item(s): ${addedItems.join(', ')}`);
        }
    }

    /**
     * Remove items from an inventory. `true` takes one of the ACTIVE item (the instance whose
     * choice or scene is running) — that is the form a usable item's own scene wants, since it
     * destroys the exact stack the player used rather than an arbitrary copy; a number takes that
     * many off the same stack. Otherwise the spec mirrors {@link addItemsBySpec}:
     * `"item_id"`, `"item_id#quantity"`, `"item_id#quantity->inventory_id"`, comma-separable,
     * inventory defaulting to the party bag.
     *
     * Equipped stacks are drained last, so a scene that removes a spare from the bag never
     * unequips the copy the character is wearing while a loose one is still lying around.
     * Removing fewer than asked is not an error — it warns and removes what is there.
     *
     * @example
     * // From scene content (the `remove_item` action takes the same value):
     * { remove_item: true }                    // spend the item whose Use choice opened this scene
     * { remove_item: 3 }                       // three off that same stack
     * { remove_item: "torch" }                 // one torch from the party bag
     * { remove_item: "arrow#20" }              // twenty arrows
     * { remove_item: "rope, torch#2" }         // several entries in one action
     * { remove_item: "gold#50 -> merchant" }   // fifty gold out of the merchant's stock
     *
     * @example
     * // From engine code / plugins:
     * game.itemSystem.removeItemsBySpec(true);                 // the active item
     * game.itemSystem.removeItemsBySpec(3);                    // three of the active item
     * game.itemSystem.removeItemsBySpec("healing_herb#3");     // by id + quantity
     * game.itemSystem.removeItemsBySpec(["rope", "torch#2"]);  // array form, same grammar
     */
    public removeItemsBySpec(data: boolean | number | string | string[]): void {
        if (data === true || typeof data === 'number') {
            const amount = data === true ? 1 : Math.trunc(data);
            if (!(amount > 0)) {
                gameLogger.warn(`[remove_item] quantity must be a positive number, got ${data}`);
                return;
            }
            const inventory = this.getInventory(this.game.getState('active_inventory') || PARTY_INVENTORY_ID);
            const item = inventory?.getItemByUid(this.game.getState('active_item'));
            if (!inventory || !item) {
                gameLogger.warn(`[remove_item] no active item to remove`);
                return;
            }
            const removed = inventory.reduceItemQuantity(item, amount);
            if (removed < amount) {
                gameLogger.warn(`[remove_item] active stack "${item.id}" only held ${removed} (asked for ${amount})`);
            }
            gameLogger.info(`[remove_item] Removed active item "${item.id}"${removed > 1 ? ' x' + removed : ''}`);
            if (removed > 0) this.flashRemoved(item.id, removed);
            return;
        }
        if (typeof data === 'boolean') return;

        const specs = Array.isArray(data)
            ? data
            : data.split(',').map(s => s.trim()).filter(s => s.length > 0);

        const removedItems: string[] = [];
        for (const spec of specs) {
            const parts = spec.split('->');
            const itemPart = parts[0].trim();
            const targetInventoryId = parts[1]?.trim() || PARTY_INVENTORY_ID;

            const [itemId, quantityRaw] = itemPart.split('#').map(s => s.trim());
            const quantity = quantityRaw ? parseInt(quantityRaw, 10) : 1;
            if (!itemId || isNaN(quantity) || quantity <= 0) {
                throw new Error(`[remove_item] Invalid item specification: "${spec}"`);
            }

            const inventory = this.inventories.value.get(targetInventoryId);
            if (!inventory) {
                throw new Error(`[remove_item] Inventory with id "${targetInventoryId}" not found.`);
            }

            const stacks = inventory.getItemsById(itemId)
                .sort((a, b) => Number(a.isEquipped) - Number(b.isEquipped));
            let left = quantity;
            for (const stack of stacks) {
                if (left <= 0) break;
                left -= inventory.reduceItemQuantity(stack, left);
            }

            const removed = quantity - left;
            if (removed < quantity) {
                gameLogger.warn(`[remove_item] "${targetInventoryId}" only had ${removed} of "${itemId}" (asked for ${quantity})`);
            }
            if (removed > 0) {
                removedItems.push(`${itemId}${removed > 1 ? ' x' + removed : ''}${targetInventoryId !== PARTY_INVENTORY_ID ? ' from ' + targetInventoryId : ''}`);
                // The party bag is the player's own; a chest or a merchant losing stock says nothing.
                if (targetInventoryId === PARTY_INVENTORY_ID) this.flashRemoved(itemId, removed);
            }
        }

        if (removedItems.length > 0) {
            gameLogger.info(`[remove_item] Removed item(s): ${removedItems.join(', ')}`);
        }
    }

    // The `item.removed_*` scene flash — the mirror of add_item's `item.added_*`, so a story that
    // takes something away says so where the pickup did, with the same hoverable item link.
    private flashRemoved(itemId: string, count: number): void {
        const link = `[[item:${itemId}]]`;
        const message = count > 1
            ? Global.getInstance().getString('item.removed_quantity', { item: link, count })
            : Global.getInstance().getString('item.removed_single', { item: link });
        this.game.dungeonSystem.addFlash(message);
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
        const rarity = traits?.rarity;
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
        if (this.game.coreSystem.getState('block_party_inventory') || this.game.coreSystem.getState('block_party_inventory_persist')) {
            return false;
        }
        return true;
    }

    /**
     * Move an item across the open exchange, exactly as clicking it in the exchange window does.
     * In a trade, an item priced in that direction is bought or sold: the receiving side pays its
     * trade price × quantity and the giving side is paid. A refused move (buyer short of currency,
     * no room, an `inventory_transfer` listener) changes nothing on either side.
     * @param silent Suppress the failure notifications, for batch moves that report once at the end.
     * @returns true if the item moved.
     */
    public exchangeItem(item: Item, source: Inventory, target: Inventory, quantity: number, silent: boolean = false): boolean {
        if (this.exchangeState.value === 'trade') {
            // The party giving the item means the trader is buying, at the player-side price.
            const context: TradeContext = source.id === PARTY_INVENTORY_ID ? 'player' : 'trader';

            if (item.isTradableInContext(context)) {
                const totalPrice: Record<string, number> = {};
                for (const [currencyId, amount] of Object.entries(item.getTradePriceInContext(context))) {
                    totalPrice[currencyId] = amount * quantity;
                }

                if (!target.canAffordPrice(totalPrice)) {
                    if (!silent) {
                        Global.getInstance().addNotificationId('not_enough_currency', { currency: this.getCurrencyName(totalPrice) });
                    }
                    return false;
                }

                // The item moves first, so a refused transfer leaves both purses untouched.
                if (!source.transferTo(target, item, quantity, silent)) {
                    return false;
                }

                // Affordability was checked above, so this only pays.
                target.deductCurrency(totalPrice);

                // Paid even past the seller's weight/size limit — the sale already happened.
                for (const [currencyId, amount] of Object.entries(totalPrice)) {
                    source.addItem(this.createItem(currencyId), amount, true);
                    this.game.trigger('currency_change', source, currencyId, amount);
                }

                return true;
            }
        }

        return source.transferTo(target, item, quantity, silent);
    }

    private getCurrencyName(price: Record<string, number>): string {
        const id = Object.keys(price)[0];
        return (this.itemTemplatesMap.get(id)?.traits as any)?.name || id;
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