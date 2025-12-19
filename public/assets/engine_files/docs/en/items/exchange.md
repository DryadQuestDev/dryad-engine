# Exchange System

The exchange system handles two modes of item transfer between inventories: **loot** (free taking) and **trade** (buying/selling with currency).

---

## Two Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `loot` | Free item transfer, no currency involved | Treasure chests, corpse looting, storage |
| `trade` | Items have prices, currency is exchanged | Shops, merchants, trading NPCs |

---

## Opening an Exchange

Use actions to open exchanges:

| Action | Description |
|--------|-------------|
| `{loot: "inventory_id"}` | Open loot UI with inventory |
| `{trade: "inventory_id"}` | Open trade UI with inventory |

Both actions are **event delayed** - they wait for the current scene to finish before opening.

The exchange UI shows two inventories side by side:
- **Left:** Party inventory (`_party_inventory`)
- **Right:** Exchange inventory (the one you specified)

Clicking items moves them between inventories. In trade mode, currency is automatically exchanged.

---

## Currencies

Currencies are regular items with `is_currency: true` set in their template.

| Field | Description |
|-------|-------------|
| `is_currency` | Mark item as currency (appears in currency bar) |
| `price` | Base price in various currencies |

**Example currency item:**

| Field | Value |
|-------|-------|
| `id` | gold |
| `is_currency` | true |
| `traits.name` | "Gold" |
| `traits.image` | (coin icon) |
| `max_stack` | -1 (unlimited stacking) |

**Setting item prices:**

| Field | Value |
|-------|-------|
| `price.gold` | 100 |
| `price.gems` | 5 |

Items can have prices in multiple currencies. The buyer must have all required currencies.

---

## Modifying Trade Prices

The `trade_init` event fires for each item when a trade opens. Use it to set custom buy/sell prices.

| Property | What it controls |
|----------|------------------|
| `item.price` | Base price (from template, read-only) |
| `item.tradePrice.player` | What trader pays when buying from player |
| `item.tradePrice.trader` | What trader charges when selling to player |

**Example - Merchants buy at 50% price:**

```javascript
game.on("trade_init", (traderInventory, item) => {
  for (const currency in item.price) {
    item.tradePrice.player[currency] = Math.round(item.price[currency] * 0.5);
  }
});
```

**Example - Mage trader only accepts arcane items:**

```javascript
game.on("trade_init", (traderInventory, item) => {
  if (traderInventory.tags.includes("mage_trader") && !item.tags.includes("arcane")) {
    item.tradePrice.player = {};  // Can't sell to this merchant
    item.tradePrice.trader = {};  // Can't buy from this merchant
  }
});
```

---

## Currency Methods

| Method | Description |
|--------|-------------|
| `inventory.getCurrencyAmount(currencyId)` | Get total of a specific currency |
| `inventory.getCurrencies()` | Get all currencies as `{ id: amount }` |
| `inventory.canAffordPrice(price)` | Check if can afford `{ gold: 100, gems: 5 }` |
| `inventory.deductCurrency(price)` | Pay with currency (returns false if can't afford) |

**Currency only counts unequipped items** - equipped currency items are not spendable.

---

## Exchange Events

| Event | When it fires | Parameters |
|-------|---------------|------------|
| `inventory_open` | Exchange UI opens | `(inventory)` |
| `inventory_close` | Exchange UI closes | `(inventory)` |
| `inventory_transfer` | Item moves between inventories | `(source, target, item, quantity, isTrade)` |
| `trade_init` | Trade opens, for each item | `(traderInventory, item)` |

**Canceling transfers:**

Return `false` from `inventory_transfer` to prevent the transfer:

| Event | Check | Result |
|-------|-------|--------|
| `inventory_transfer` | `item.traits.is_quest_item` | return false (can't sell quest items) |

---

## Trade Flow Example

| Step | Action | Result |
|------|--------|--------|
| 1 | Player clicks item in merchant inventory | Check if party can afford price |
| 2 | Party can afford | Deduct currency from party inventory |
| 3 | Currency deducted | Add currency to merchant inventory |
| 4 | Currency transferred | Move item from merchant to party |

If any step fails (can't afford, inventory full), the whole transaction is cancelled.

---


## Creating a Shop

| Step | What to do |
|------|------------|
| 1 | Create inventory template with shop items |
| 2 | Set prices on each item template |
| 3 | Create a currency item (gold, coins, etc.) |
| 4 | Give player starting currency |
| 5 | Use `{trade: "shop_id"}` action to open |

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Open a shop | `{trade: "shop_id"}` |
| Open a loot container | `{loot: "chest_id"}` |
| Check player gold | `inventory.getCurrencyAmount('gold')` |
| Check if can buy | `inventory.canAffordPrice({ gold: 100 })` |
| Modify trade prices | Listen to `trade_init` event |
| Prevent item transfer | Return false from `inventory_transfer` |
| Create a currency | Set `is_currency: true` on item template |

---

## Next Steps

- ->items.items_overview - Item basics and templates
- ->items.apply - Crafting and custom apply logic

