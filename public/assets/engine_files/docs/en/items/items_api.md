# Items API Reference

API reference for working with items and inventories in code.

---

## Game Methods

### createItem(template)

Create an item from a template object or registered template ID.

```js
// From a registered template ID
const sword = game.createItem("iron_sword");
inventory.addItem(sword);

// From a custom template object
const customItem = game.createItem({
  id: "custom_sword",
  traits: { name: "Custom Sword", description: "My mighty custom sword." },
  slots: ["weapon_slot"],
  tags: ["weapon", "sword"]
});
```

### createInventory(id, template?)

Create an inventory, optionally populated from a template.

```js
// Create empty inventory
const chest = game.createInventory("treasure_chest_1");

// Create from template ID
const shop = game.createInventory("shop_1", "blacksmith_shop");

// Create from custom template object
const custom = game.createInventory("custom_inv", {
  items: [{ item_id: "gold", quantity: 100 }],
  max_size: 20,
  recipes: ["sword_recipe"]
});
```

### addInventory(inventory)

Add an existing inventory instance to the game.

```js
game.addInventory(inventory);
```

### removeInventory(inventory)

Remove an inventory from the game. Accepts inventory instance or ID string.

```js
game.removeInventory("temporary_chest");
game.removeInventory(chestInventory);
```

### getInventory(id)

Get an inventory by ID.

```js
const inventory = game.getInventory("party_inventory");
if (inventory) {
  console.log(`Inventory has ${inventory.items.length} items`);
}
```

### openExchange(inventoryId, state)

Open an exchange UI (loot or trade) with an inventory.

```js
game.openExchange("merchant_inventory", "trade");
game.openExchange("treasure_chest", "loot");
```

### closeExchangeInventory(exchangeInventory)

Close the exchange UI and proceed to the next scene.

```js
const merchant = game.getInventory("merchant_shop");
game.closeExchangeInventory(merchant);
```

### canUseItems()

Check if item usage is currently allowed. Returns false when party inventory is blocked.

```js
if (game.canUseItems()) {
  // Show use item button
}
```

### addLearnedRecipe(recipeId)

Add a recipe to the player's learned recipes.

```js
game.addLearnedRecipe("iron_sword_recipe");
```

### getLearnedRecipes()

Get all learned recipe IDs.

```js
const recipes = game.getLearnedRecipes();
if (recipes.has("iron_sword_recipe")) {
  console.log("Player can craft iron swords");
}
```

---

## Item Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Template ID |
| `uid` | `string` | Unique instance identifier |
| `traits` | `Record<string, any>` | Dynamic properties (name, damage, weight, etc.) |
| `attributes` | `Record<string, string>` | String attributes (rarity, type) |
| `properties` | `Record<string, Property>` | Property objects attached to item |
| `statusObject` | `any` | Status effect data when equipped |
| `actions` | `any` | Action handlers (item_equip_before, item_use) |
| `choices` | `string[]` | Choice IDs available when using item |
| `price` | `Record<string, number>` | Base price in currencies |
| `tradePrice` | `object` | Trade prices (player/trader) |
| `is_currency` | `boolean` | Whether item is a currency |
| `slots` | `string[]` | Equipment slot IDs item can equip to |
| `tags` | `string[]` | Tags for categorizing |
| `isEquipped` | `boolean` | Whether currently equipped |
| `quantity` | `number` | Current stack quantity |

---

## Item Methods

### Trait Accessors

```js
// Get trait value
const damage = item.getTrait("damage");

// Convenience accessors
const name = item.getName();
const image = item.getImage();
const description = item.getDescription();
const rarity = item.getRarity();
const type = item.getType();
const weight = item.getWeight(); // Multiplied by quantity
```

### Tag Methods

```js
// Get all tags
const tags = item.getTags();

// Check for tag
if (item.hasTag("consumable")) {
  // Show use button
}
```

### Trading Methods

```js
// Check if tradable
if (item.isTradable()) {
  // Get specific currency price
  const goldCost = item.getPrice("gold"); // 100

  // Get all prices
  const allPrices = item.getPrice(); // { gold: 100, gems: 5 }
}
```

### Stacking

```js
// Get max stack size (1 = non-stackable, -1 = unlimited)
if (item.maxStack() > 1) {
  console.log("This item is stackable");
}
```

### CSS Classes

```js
// Get attribute-based CSS classes
const classes = item.getAttributeClasses();
// ["rarity_legendary", "type_weapon"]
```

---

## Inventory Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier |
| `name` | `string` | Display name |
| `maxSize` | `number` | Max item stacks (0 = unlimited) |
| `maxWeight` | `number` | Max weight (0 = unlimited) |
| `interactive` | `string` | Action ID for 'apply' button |
| `recipes` | `Set<string>` | Recipe IDs available |
| `selectedRecipeId` | `string` | Currently selected recipe |
| `items` | `Item[]` | Items in inventory |

---

## Inventory Methods

### Item Management

```js
// Add item (auto-stacks)
inventory.addItem(sword);
inventory.addItem(potion, 5);
inventory.addItem(goldCoin, 100, true); // Skip validation

// Clone item
const clone = inventory.cloneItem(item);

// Remove item
inventory.removeItem(item);

// Find items
const sword = inventory.getFirstItemById("iron_sword");
const potions = inventory.getItemsById("health_potion");
const item = inventory.getItemByUid("abc123");
const weapons = inventory.getItemsByTrait("damage");
```

### Capacity

```js
// Weight
const totalWeight = inventory.getTotalWeight();
const availableWeight = inventory.getAvailableWeight(); // null if unlimited

// Slots
const availableSlots = inventory.getAvailableSlots(); // null if unlimited

// Status checks
if (inventory.isOverflowing()) { /* more items than maxSize */ }
if (inventory.isOverweight()) { /* weight exceeds maxWeight */ }
```

### Equipment

```js
// Get equipped/unequipped items
const equipped = inventory.getEquippedItems();
const unequipped = inventory.getUnequippedItems();

// Equip/unequip (triggers events)
inventory.equipSlot(slot, item, character);
inventory.unequipSlot(slot, character);
```

### Transfer

```js
// Transfer between inventories
const success = playerInventory.transferTo(chestInventory, sword, 1);
```

### Currency

```js
// Get item quantity (works for any item, including currencies)
const gold = inventory.getItemQuantity("gold");

// Get all currencies
const currencies = inventory.getCurrencies(); // { gold: 150, gems: 20 }

// Check affordability
if (inventory.canAfford(shopItem)) { /* can buy */ }
if (inventory.canAffordPrice({ gold: 100, gems: 5 })) { /* has enough */ }

// Deduct currency
const paid = inventory.deductCurrency({ gold: 100 });
```

### Recipes & Crafting

```js
// Add recipe
inventory.addRecipe("iron_sword_recipe");

// Get recipes
const recipes = inventory.getRecipes();

// Craft
inventory.selectedRecipeId = "iron_sword_recipe";
inventory.craft();

// Or craft specific recipe
inventory.craft("iron_sword_recipe");

// Apply interactive action or craft
inventory.apply();
```

---

## Events

### Item Events

```js
// Item created
game.on("item_create", (item) => {
  console.log("Created:", item.getName());
});

// Before equip (return false to cancel)
game.on("item_equip_before", (item, character) => {
  if (character.getStat("strength") < 10) {
    return false; // Too weak to equip
  }
});

// After equip
game.on("item_equip_after", (item, character) => {
  console.log(character.getName(), "equipped", item.getName());
});

// Before unequip (return false to cancel)
game.on("item_unequip_before", (item, character) => {
  if (item.hasTag("cursed")) {
    return false; // Can't remove cursed items
  }
});

// After unequip
game.on("item_unequip_after", (item, character) => {
  console.log("Unequipped:", item.getName());
});
```

### Inventory Events

```js
// Inventory opened
game.on("inventory_open", (inventory) => {
  console.log("Opened:", inventory.name);
});

// Inventory closed
game.on("inventory_close", (inventory) => {
  console.log("Closed:", inventory.name);
});

// Changes applied (craft button, etc.)
game.on("inventory_apply", (inventory) => {
  console.log("Applied:", inventory.id);
});

// Items transferred
game.on("inventory_transfer", (source, target, item, quantity, isTrade) => {
  console.log(`Transferred ${quantity}x ${item.getName()}`);
});
```

### Trade Events

```js
// Trade initiated (modify prices here)
game.on("trade_init", (traderInventory, item) => {
  // Apply discount
  item.tradePrice.trader.gold *= 0.9;
});

// Recipe learned
game.on("recipe_learned", (recipeId) => {
  console.log("Learned recipe:", recipeId);
});
```
