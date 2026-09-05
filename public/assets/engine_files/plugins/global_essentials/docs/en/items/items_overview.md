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

### Fixed-option traits (rarity)

Traits with a `chooseOne` type give a fixed option list — `rarity` (common, uncommon, rare, epic, legendary, quest) ships this way for every game, and you can define your own in the item_traits file.

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

Items define which slots they can go into (the item's `slots`). Characters define which slots they have (and where they appear in the equipment UI).

**`accepts` — sharing one item across many slots.** A slot always admits items targeting its own id. The optional `accepts` field lists *extra* slot tokens it also admits, so a single item can fit many slots without listing each one. Define a shared "tag" slot (with no character instances) and have the real slots accept it:

| Slot ID | `accepts` | Admits items whose `slots` include… |
|---------|-----------|--------------------------------------|
| `trinket_general` | – | (tag-only slot — nothing equips it directly) |
| `trinket_ane` | `trinket_general` | `trinket_ane` **or** `trinket_general` |
| `trinket_ordelia` | `trinket_general` | `trinket_ordelia` **or** `trinket_general` |

A **general** trinket sets `slots: ["trinket_general"]` and fits every character's trinket slot; a **character-specific** trinket sets `slots: ["trinket_ane"]` and fits only Ane's. Adding a new character never touches existing items — its slot simply lists `trinket_general` in `accepts`. Leave `accepts` empty for an ordinary slot (it matches its own id only).

---

### Item Categories

**What they are:** Player-facing inventory filter groups — the tabs (and their icons) in the inventory UI.
**Unrelated to Item Slots:** categories never affect where an item equips; they only sort the inventory view.

Go to **Items > Item Categories** and define groups:

| Field | Description |
|-------|-------------|
| name | Tab label (e.g. "Consumables") |
| icon | Tab icon image (falls back to the name as a text chip if omitted) |
| order | Tab order (lower shows first) |

Each item template picks one **category** (its `category` field). The inventory shows a built-in **All**
tab plus one tab per category, with a name search box; items with no category appear only under **All**.

---

### Item Templates

**What they are:** The actual item definitions.

| Field | Description |
|-------|-------------|
| traits | Item's custom data (name, damage, weight, etc.) |
| slots | Which equipment slots this item fits |
| tags | For filtering and game logic |
| category | Inventory filter category (player UI only) |
| price | Trading value in various currencies |
| max_stack | How many can stack (1 = no stacking) |
| is_currency | Whether this item is money |
| learn_recipe | Recipe id this item teaches — adds a "Learn" choice that learns it and consumes the item (see ->items.apply) |
| status | What stats/abilities/skin layers to apply when equipped |

A `traits.item_level` number renders as a level badge on the item card – a purely visual indicator. Systems that scale item instances (e.g. the experience plugin's dungeon-level scaling) stamp it on creation.

**Example - Iron Sword:**

| Field | Value |
|-------|-------|
| `slots` | main_hand, off_hand |
| `traits.name` | "Iron Sword" |
| `traits.damage` | 25 |
| `traits.weight` | 5 |
| `traits.rarity` | common |
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
| recipes | Which crafting recipes are available here (auto-makes this a `craft` station — see ->items.apply) |
| group_recipes | Recipe groups available here (the `recipe_groups` editor tab). Every recipe in the group is added on top of `recipes`, so one station can take a whole group plus a few extras |
| interactive | Custom apply interaction (`craft`, `enchant`, …). Auto-set to `craft` when `recipes` or `group_recipes` bring in at least one recipe; set by hand only for non-crafting interactions |
| items | Starting items in this inventory |
| traits | Custom inventory data (definitions live in the `inventory_traits` editor tab; plugins can inject their own, e.g. the experience plugin's `dungeon` trait) |
| auto_create | Instantiate this inventory at game start. An inventory opened via `loot:`/`trade:` must have a live instance – without one, opening throws "Inventory not found". Use it for GLOBAL inventories (shops, shared stashes). For dungeon chests prefer the experience plugin's `dungeon` inventory trait: the inventory is created on first entry of the bound dungeon (or any dungeon sharing its level group), so contents pick up the dungeon level and lock at entry (no save-scumming). Leave both OFF for battle-loot inventories: those are read as pure drop tables by the reward system (never instantiated) |

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

## Consumable Items

Items are consumable for one-time-use effects (potions, scrolls, buff foods). There is **no
`is_consumable` flag** — an item is consumable when it has any consume effect: it applies a status,
restores/reduces a resource, or defines a consume action script. When it does, a **Consume** choice
appears in the inventory automatically.

### What Happens on Consume

| Step | What happens |
|------|--------------|
| 1 | `item_consume_before` event fires (return false to cancel) |
| 2 | Each `apply_statuses_on_consume` status is applied (by template id, with stacks) |
| 3 | Percentage-based resource changes are applied |
| 4 | Flat resource changes are applied |
| 5 | Item quantity is reduced by 1 (removed if last in stack) |
| 6 | `item_consume_after` event fires |

### Template Fields

| Field | Description |
|-------|-------------|
| `apply_statuses_on_consume` | List of `{ status, stacks }`. Applies real **status templates** — each carries its own `duration`, `max_stacks`, `polarity`, and `group_id` (no per-item shaping fields). |
| `consume_percentage` | Percentage of max resource to restore/reduce (e.g. heal 25% of max health) |
| `consume_absolute` | Flat resource amount to restore/reduce (e.g. restore 50 health) |
| `status` | Status applied on **equip** (independent of consume). See below. |

### Equip status and consume statuses are independent

`status` is applied on **equip**; `apply_statuses_on_consume` on **consume**. An item can carry both
and they can differ — e.g. a Golden Apple gives +2 luck while equipped, and +10 health when eaten.

### Duration, stacking, and mutual exclusion live on the status

Because consume statuses are real templates, their `duration` / `max_stacks` / `multi_stack` come from
the status itself. To make ranked variants replace each other (small_blessing → big_blessing), give
them the same **`group_id`** on the status template — applying one removes any other in the group,
regardless of how it was applied (status action, consumable, or battle effect).

## Usable Items

An item with a `use_scene` trait gets a **Use** choice in the inventory. The trait's value is a
scene reference (`dungeon_id.room_id.scene_id`, `room_id.scene_id`, a full `#id`, or an `&anchor`),
and picking Use plays that scene with the item as the *active item*.

The engine does nothing else: no cost, no gating, no consumption. The scene owns all of it, which is
what makes one trait enough for every kind of usable item — a key, a letter, a single-use charm.

| Inside the scene | How |
|------------------|-----|
| Name the item | The `\|item\|` placeholder resolves to the active item's name |
| Show its card | `{item_view: true}` |
| Spend it | `{remove_item: true}` removes one of that exact stack (`{remove_item: 3}` for more) |

```
#lockpick_use
1
%
|I| work the |item| into the lock until something inside it gives.
{remove_item: true}
```

> `book` and `painting` are the two specialized cousins of this trait — they render their own
> reader / viewer instead of playing an authored scene. Reach for `use_scene` for everything else.

---

---

## Accessing Items in Code

| Method | Description |
|--------|-------------|
| `game.createItem(id)` | Create an item instance |
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
| Give player a sword | `game.createItem('iron_sword')` → `inventory.addItem(sword)` |
| Check and deduct gold | `inventory.canAffordPrice({ gold: 100 })` → `inventory.deductCurrency({ gold: 100 })` |

---

## Item Actions (scripting)

Scene actions for items (used in dungeon content). See ->builtins.actions for full syntax.

| Action | What it does |
|--------|--------------|
| `equip` | Equip/unequip by real character + item-template ids (**recommended**). `char -> item & item`, `char -> !item` to unequip, `!char.slot_type` to clear a slot, `!char` to clear all. |
| `equip_item` / `unequip_item` | **Internal/advanced** — act on the *active item* (uid). Keep for active-item flows (`{ equip_item: true }`, e.g. an equip/unequip cancel handler). Prefer `equip` otherwise. |
| `add_item` | Add items to an inventory by id (`"sword, potion#5"`). |
| `remove_item` | Remove items from an inventory. `true` (or a number) takes one/N of the *active item*; otherwise the `add_item` spec (`"potion#5"`). |
| `use_scene` | Play the scene an item's `use_scene` trait names, with that item active. Powers the auto **Use** choice. |
| `consume_item` | Consume the active/target item. |
| `item_slot` | Add/remove equipment *slots* on a character (`"alice->extra_ring, bob->!ring_3"`). |
| `loot` / `trade` | Open a loot / trade exchange. A `^pool` value opens a placement-unique pool-generated inventory (experience plugin's Rewards & Scaling guide). |
| `learn_recipe` | Learn crafting recipe(s). |

> Prefer `equip` over `equip_item`/`unequip_item` for normal scripting: it takes stable character and
> item ids, while `equip_item`/`unequip_item` operate on the active item's uid.

---

## Item Events

| Event | When it fires |
|-------|---------------|
| `item_create` | Item instance is created |
| `item_equip_before` | Before equipping (return false to cancel) |
| `item_equip_after` | After equipping |
| `item_unequip_before` | Before unequipping (return false to cancel) |
| `item_unequip_after` | After unequipping |
| `item_consume_before` | Before consuming (return false to cancel) |
| `item_consume_after` | After consuming |
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

