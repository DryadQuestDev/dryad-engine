# Random Pools

Random pools provide **weighted random selection** from collections of data. Use them for loot tables, encounter spawning, reward systems, and any scenario where you need controlled randomness.

---

## Key Concepts

### Pool Definitions

A pool definition specifies:
- **Source**: Which data collection to draw from (e.g., `item_templates`)
- **Filter Fields**: Which fields can be used for filtering (e.g., `traits.rarity`, `tags`)

Pool definitions are created in the editor under **Pools > Pool Definitions**.

### Pool Entries

A pool entry is a configured draw from a pool. Each entry contains:
- **Pool**: Reference to a pool definition
- **Entities**: One or more entity groups, each with its own weight, count, and filters

Pool entries are created in the editor under **Pools > Pool Entries**.

---

## Editor Setup

### Step 1: Create a Pool Definition

1. Go to **Game Data > Pools > Pool Definitions**
2. Create a new definition (e.g., `item_pool`)
3. Set the **Source** to your data file (e.g., `item_templates`)
4. Add **Filter Fields** - the paths to filterable properties:
   - `traits.rarity`
   - `traits.weight`
   - `tags`

### Step 2: Create Pool Entries

1. Go to **Game Data > Pools > Pool Entries**
2. Create a new entry (e.g., `common_loot`)
3. Select your **Pool** definition
4. Add **Entities** - each entity group specifies:
   - **Weight**: Relative weight for weight mode (any positive number)
   - **Chance**: Percentage (0-100) for chance mode
   - **Count**: How many items to draw when this entity wins
   - **Filters Include**: Items must match these criteria
   - **Filters Exclude**: Items matching these are excluded

---

## API Reference

### drawFromPool(entry, settings?)

Draw items from a pool using weighted random selection.

```js
// Basic usage - returns array of template IDs
const items = game.drawFromPool('common_loot');
// ['iron_sword', 'leather_armor']

// With settings
const rewards = game.drawFromPool('boss_drops', {
  type: 'weight',   // Selection mode (default)
  draws: 3,         // Number of draw rounds
  unique: true      // No duplicate items
});
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `entry` | `string \| PoolEntry` | Pool entry ID or custom entry object |
| `settings.type` | `'weight' \| 'chance'` | Selection mode (default: `'weight'`) |
| `settings.draws` | `number` | Number of draw rounds (default: `1`) |
| `settings.unique` | `boolean` | Remove drawn items from pool (default: `false`) |
| `settings.customData` | `Map<string, any> \| any[]` | Use runtime data instead of pool's source |

**Returns:** `string[]` - Array of template IDs

---

## Selection Modes

Each entity has two separate fields for selection probability:
- **weight**: Used in weight mode (any positive number)
- **chance**: Used in chance mode (0-100 percentage)

### Weight Mode (Default)

Uses the `weight` field. One entity wins per draw based on **relative weights**.

```
Entity A: weight 80
Entity B: weight 20
Total: 100

A wins ~80% of the time
B wins ~20% of the time
```

The winning entity then draws its `count` of items from the filtered source.

```js
const loot = game.drawFromPool('treasure_chest', { type: 'weight' });
```

### Chance Mode

Uses the `chance` field. Each entity has an **independent percentage chance** to win. Multiple entities (or none) can win per draw.

```
Entity A: chance 50  → 50% chance
Entity B: chance 30  → 30% chance
Entity C: chance 10  → 10% chance

Possible outcomes:
- A wins alone
- A and B win
- All three win
- None win
```

```js
const bonusLoot = game.drawFromPool('rare_rewards', { type: 'chance' });
```

---

## Filter Formats

Filters determine which data entities from the source pool are eligible for selection. The editor automatically generates filter fields based on the pool definition's **Filter Fields**.

### Filter Field Types

| Source Field Type | Editor Input | Matching Behavior |
|-------------------|--------------|-------------------|
| `string` | Text input | Exact match |
| `number` | Range input (min/max) | Value within range |
| `boolean` | Toggle switch | Exact match |
| `chooseOne` | Multi-select dropdown | Any selected value matches (OR) |
| `chooseMany` | Multi-select dropdown | Any selected value matches (OR) |
| `string[]` (tags) | Chip input | Any entered value matches (OR) |

### OR vs AND Logic for Arrays

For array-based filters, you can toggle between OR and AND logic using the **Match All** switch:

| Toggle State | Behavior | Example |
|--------------|----------|---------|
| **Off** (default) | Item matches if it has **any** of the values | Tags: `weapon, sword` → matches items with "weapon" OR "sword" |
| **On** (Match All) | Item matches only if it has **all** values | Tags: `weapon, sword` → matches items with "weapon" AND "sword" |

### Range Filters

For numeric fields, the editor shows **Min** and **Max** inputs:

| Configuration | Matches |
|---------------|---------|
| Min: 5, Max: empty | Values ≥ 5 |
| Min: empty, Max: 20 | Values ≤ 20 |
| Min: 5, Max: 20 | Values between 5 and 20 (inclusive) |

### Combining Multiple Filters

When you configure multiple filter fields, they combine with **AND logic**:

| filters_include | Result |
|-----------------|--------|
| Rarity: `common, uncommon` | Items that are common OR uncommon |
| Rarity: `common, uncommon` + Tags: `weapon` | Items that are (common OR uncommon) AND have "weapon" tag |
| Rarity: `rare` + Level: max 10 + Tags: `weapon, magical` (Match All) | Items that are rare AND level ≤ 10 AND have both "weapon" AND "magical" tags |

### Include vs Exclude

- **Filters Include**: Items must match all criteria to be eligible
- **Filters Exclude**: Items matching any criteria are removed from the pool

---

## Examples

### Basic Loot Drop

```js
// Draw one item from common_loot entry
const items = game.drawFromPool('common_loot');

// Create the item
for (const templateId of items) {
  const item = game.createItem(templateId);
  playerInventory.addItem(item);
}
```

### Boss with Multiple Drop Chances

```js
// Each entity's 'chance' field determines drop probability
// Example pool entry with: common (chance: 80), rare (chance: 20), legendary (chance: 5)
const drops = game.drawFromPool('boss_drops', { type: 'chance' });

// Might get 0, 1, 2, or all drops depending on luck
for (const templateId of drops) {
  const item = game.createItem(templateId);
  playerInventory.addItem(item);
}
```

### Unique Starter Pack

```js
// Draw 5 unique items (no duplicates)
const starterItems = game.drawFromPool('starter_pack', {
  draws: 5,
  unique: true
});
```

### Custom Runtime Entry (Weight Mode)

Create pool entries at runtime without defining them in the editor:

```js
// Weight mode - one entity wins based on relative weights
const customLoot = game.drawFromPool({
  pool: 'item_pool',
  entities: [
    {
      weight: 70,
      count: 2,
      filters_include: { 'traits.rarity': ['common'] }
    },
    {
      weight: 25,
      count: 1,
      filters_include: { 'traits.rarity': ['uncommon'] }
    },
    {
      weight: 5,
      count: 1,
      filters_include: { 'traits.rarity': ['rare'] }
    }
  ]
});
```

### Custom Runtime Entry (Chance Mode)

```js
// Chance mode - each entity has independent % chance to drop
const bonusDrops = game.drawFromPool({
  pool: 'item_pool',
  entities: [
    {
      chance: 80,  // 80% chance
      count: 1,
      filters_include: { 'traits.rarity': ['common'] }
    },
    {
      chance: 30,  // 30% chance
      count: 1,
      filters_include: { 'traits.rarity': ['uncommon'] }
    },
    {
      chance: 5,   // 5% chance
      count: 1,
      filters_include: { 'traits.rarity': ['rare'] }
    }
  ]
}, { type: 'chance' });
```

### Level-Scaled Loot

```js
const playerLevel = game.getProperty('level').currentValue;

const scaledLoot = game.drawFromPool({
  pool: 'item_pool',
  entities: [{
    weight: 1,
    count: 3,
    filters_include: {
      'traits.level': { min: playerLevel - 2, max: playerLevel + 2 }
    }
  }]
});
```

### Excluding Quest Items

```js
const safeLoot = game.drawFromPool({
  pool: 'item_pool',
  entities: [{
    weight: 1,
    count: 1,
    filters_exclude: {
      'tags': ['quest_item', 'unique']  // Never drop quest or unique items
    }
  }]
});
```

### Drawing from Custom Data

Use `customData` to draw from runtime-generated data instead of predefined JSON. You can pass an array of objects (uses `id` or `uid` as key) or a Map:

```js
// Simple array format (recommended)
const dynamicItems = [
  { id: 'sword_001', traits: { rarity: 'common', level: 5 }, tags: ['weapon', 'melee'] },
  { id: 'bow_002', traits: { rarity: 'rare', level: 8 }, tags: ['weapon', 'ranged'] },
  { id: 'staff_003', traits: { rarity: 'uncommon', level: 6 }, tags: ['weapon', 'magic'] }
];

// Use existing pool entry filters on custom data
const drops = game.drawFromPool('common_loot', {
  customData: dynamicItems
});

// Or combine with a custom entry for full control
const filtered = game.drawFromPool({
  pool: 'item_pool',
  entities: [{
    weight: 1,
    count: 2,
    filters_include: { 'traits.rarity': ['common', 'uncommon'] }
  }]
}, {
  customData: dynamicItems
});
```

---

## Re-roll Behavior

When using **weight mode**, if an entity cannot fulfill its requirements (not enough matching items for `unique` mode, or no matching items at all), the system will:

1. Log a warning
2. Exclude that entity from the draw
3. Re-roll with remaining entities

This ensures you get results when possible, while alerting you to potential configuration issues.

---

## Tips

- **Test your pools** - Use the console to verify your filters return expected items
- **Keep filters broad** - Overly specific filters may result in empty draws
- **Use unique sparingly** - Only enable when you truly need no duplicates
- **Prefer editor entries** - Define common pools in the editor for easy tweaking
- **Use runtime entries** - For dynamic scenarios like level-scaling or player choices

---

## drawFromCollection

For simple weighted draws without pool definitions, use `game.drawFromCollection()`. This is ideal for quick selections from any array or Map.

### drawFromCollection(collection, settings?)

Draw items directly from any collection using weighted random selection.

```js
// Draw from an array with weight property
const regions = game.getData("plugins_data/my_plugin/regions", true);
const selected = game.drawFromCollection(regions, { type: 'weight', count: 3, unique: true });
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `collection` | `Map \| any[]` | Data to draw from (Map or array of objects with `weight` property) |
| `settings.type` | `'weight'` | Selection mode (currently only weight supported) |
| `settings.count` | `number` | Number of items to draw (default: `1`) |
| `settings.unique` | `boolean` | No duplicate draws (default: `false`) |

**Returns:** `any[]` - Array of drawn items (full objects, not just IDs)

### Examples

```js
// Draw 3 unique regions weighted by their 'weight' property
const regions = game.getData("plugins_data/my_plugin/regions", true);
const drawnRegions = game.drawFromCollection(regions, {
  type: 'weight',
  count: 3,
  unique: true
});

// Draw from a custom array
const enemies = [
  { id: 'goblin', weight: 70 },
  { id: 'orc', weight: 25 },
  { id: 'troll', weight: 5 }
];
const spawns = game.drawFromCollection(enemies, { type: 'weight', count: 5 });

// Allow duplicates (same enemy can spawn multiple times)
const horde = game.drawFromCollection(enemies, { type: 'weight', count: 10, unique: false });
```

### When to Use

| Use Case | API |
|----------|-----|
| Need filters, entity groups, or editor-defined entries | `drawFromPool` |
| Simple weighted draw from any collection | `drawFromCollection` |
| Drawing from runtime data with filtering | `drawFromPool` with `customData` |
| Quick selection without setup | `drawFromCollection` |
