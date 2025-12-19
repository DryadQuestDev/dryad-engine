# Items System

Items in Dryad Engine follow the same layered philosophy as everything else. When equipped, an item applies a **status** to the character - adding stats, granting abilities, or changing appearance.

---

## Items Are Status Containers

Like skills and buffs, equipped items add a status layer to the character:

| Action | Status Effect |
|--------|---------------|
| Equip a sword | +10 Damage |
| Wear armor | +50 Health, armor skin layer |
| Hold a magic staff | Grants "Fireball" ability |

Unequip the item, and its status is removed. The character loses those bonuses immediately.

---

## The Editor Forms

### Item Traits

**What they are:** Custom data fields for items (like Character Traits, but for items).

Go to **Items > Item Traits** and define fields like:

| Field | Type | Example Value |
|-------|------|---------------|
| name | string | "Iron Sword" |
| description | rich-text | "A sturdy blade..." |
| image | image | (icon path) |
| weight | number | 5 |
| damage | number | 25 |

**When to use:** Any data you want to store on items - display info, stats, custom properties.

---

### Item Attributes

**What they are:** Categories with fixed options (like Character Attributes).

| Attribute | Options |
|-----------|---------|
| rarity | common, uncommon, rare, legendary |
| type | weapon, armor, accessory, consumable |
| element | fire, ice, lightning, none |

**When to use:** Filtering items in UI, driving visual styles, game logic branches.

---

### Item Slots

**What they are:** Equipment positions on characters.

| Slot ID | Display Name |
|---------|--------------|
| main_hand | Main Hand |
| off_hand | Off Hand |
| head | Head |
| chest | Chest |
| accessory_1 | Accessory |

Items define which slots they can go into. Characters define which slots they have (and where they appear in the equipment UI).

---

### Item Templates

**What they are:** The actual item definitions.

| Field | Description |
|-------|-------------|
| traits | Item's custom data (name, damage, weight, etc.) |
| attributes | Categories (rarity, type) |
| slots | Which equipment slots this item fits |
| tags | For filtering and game logic |
| price | Trading value in various currencies |
| max_stack | How many can stack (1 = no stacking) |
| is_currency | Whether this item is money |
| status | What stats/abilities/skin layers to apply when equipped |

**Example - Iron Sword:**

| Field | Value |
|-------|-------|
| `slots` | main_hand, off_hand |
| `traits.name` | "Iron Sword" |
| `traits.damage` | 25 |
| `traits.weight` | 5 |
| `attributes.rarity` | common |
| `attributes.type` | weapon |
| `status.stats.damage` | 25 |
| `status.abilities` | power_strike |
| `status.skin_layers` | weapon_sword |

---

### Inventories

**What they are:** Containers that hold items.

| Field | Description |
|-------|-------------|
| maxSize | Maximum number of stacks (0 = unlimited) |
| maxWeight | Maximum total weight (0 = unlimited) |
| recipes | Which crafting recipes are available here |
| items | Starting items in this inventory |

**Special inventories:**

| Inventory | ID Format | Description |
|-----------|-----------|-------------|
| Party | `_party_inventory` | Shared inventory for all party members |
| Character private | `_character_[characterId]` | Personal storage per character (e.g., `_character_mc`) |

---

## Equipment Flow

| Step | What happens |
|------|--------------|
| 1 | Character template defines equipment slots (main_hand, head, etc.) |
| 2 | Item template defines compatible slots it can equip to |
| 3 | On equip: item's status is applied (stats, abilities, skin layers) |
| 4 | On unequip: item's status is removed |

---

## Accessing Items in Code

| Method | Description |
|--------|-------------|
| `game.createItemFromTemplate(id)` | Create an item instance |
| `game.getInventory(id)` | Get an inventory by ID |
| `inventory.addItem(item, quantity)` | Add items to inventory |
| `inventory.getItemsById(id)` | Find items by template ID |
| `inventory.getCurrencyAmount(id)` | Get currency total |
| `inventory.canAffordPrice(price)` | Check if can afford |
| `inventory.deductCurrency(price)` | Pay with currency |
| `character.getEquippedItems()` | Items equipped on character |

**Common patterns:**

| Task | Steps |
|------|-------|
| Give player a sword | `game.createItemFromTemplate('iron_sword')` → `inventory.addItem(sword)` |
| Check and deduct gold | `inventory.canAffordPrice({ gold: 100 })` → `inventory.deductCurrency({ gold: 100 })` |

---

## Item Events

| Event | When it fires |
|-------|---------------|
| `item_create` | Item instance is created |
| `item_equip_before` | Before equipping (return false to cancel) |
| `item_equip_after` | After equipping |
| `item_unequip_before` | Before unequipping (return false to cancel) |
| `item_unequip_after` | After unequipping |
| `trade_init` | When a trade opens (modify prices here) |

**Example - Cursed items:**

| Event | Check | Result |
|-------|-------|--------|
| `item_unequip_before` | `item.traits.is_cursed` | return false, show notification |

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Define item data fields | Items > Item Traits |
| Create item categories | Items > Item Attributes |
| Define equipment positions | Items > Item Slots |
| Create an item | Items > Item Templates |
| Create a container | Items > Inventories |
| Give player an item | `inventory.addItem(item)` |

---

## Next Steps

- ->items.exchange - Trading, shops, and currencies
- ->items.apply - Crafting and custom apply logic
- ->characters.characters_overview - How items connect to the status system

