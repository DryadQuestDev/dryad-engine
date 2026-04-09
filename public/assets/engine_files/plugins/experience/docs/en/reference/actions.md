# Actions & Data

## DryadScript Actions

### `xp`

Award XP to characters. Pass a number to award to all party members, or a string for per-character amounts.

```js
// Award 50 XP to all party members with a level trait
{ xp: 50 }

// Award different amounts to specific characters
{ xp: "hero->100, mage->50" }
```

Per-character format: `"characterId->amount, characterId->amount"`.

## Config Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `xp_base` | number | 100 | XP threshold to level up at level 1 |
| `xp_formula` | chooseOne | `exponential_percent` | Scaling formula: `linear_percent` or `exponential_percent` |
| `xp_growth` | number | 50 | Growth percentage applied per level |
| `max_level` | number | 99 | Maximum character level |
| `level_up_rewards` | schema[] | -- | Currency items awarded to the character's private inventory on each level up. See below. |

### `level_up_rewards`

Optional array of currency items to award per level up. Only items with `is_currency: true` appear in the editor dropdown. Items are added to the character's **private** inventory.

| Field | Type | Description |
|---|---|---|
| `item_id` | chooseOne | Currency item to award (e.g., skill points) |
| `amount` | number | Quantity per level up (default: 1) |

**Example use case:** Create a `skill_point` item with `is_currency: true`. Add it to `level_up_rewards` with `amount: 2`. Each level up awards 2 skill points that the player can spend in skill trees.

## Character Stats

| Stat | Type | Description |
|---|---|---|
| `xp` | resource | Experience points toward next level. Max = current level's threshold. Managed by the plugin. |

## Character Traits

| Trait | Type | Description |
|---|---|---|
| `level` | number | Character's current level. Set in character template to enable XP/leveling. |
| `level_up_status` | chooseOne (status) | Optional. Status to apply on each level up. Stacks automatically — each level adds one stack. Use for no-code stat growth per level. |
| `xp_multiplier` | number | Optional. XP gain multiplier. Defaults to 1 if unset or 0. Applied when XP is awarded via the `xp` action or service. |

### `level_up_status`

Assign a status ID to a character's `level_up_status` trait. On each level up, the plugin applies one stack of that status. The status's `stats` field defines the growth per level.

**Setup:**

1. Create a status with `is_hidden: true`, `max_stacks: -1`, and stat bonuses:
   ```json
   {
     "id": "warrior_growth",
     "is_hidden": true,
     "max_stacks": -1,
     "stats": { "health": 20, "power": 5 }
   }
   ```

2. On the character template:
   ```json
   { "traits": { "level": 1, "level_up_status": "warrior_growth" } }
   ```

3. Each level up adds a stack. At level 5 (4 level-ups): +80 health, +20 power.

Different characters can reference different growth statuses for unique progression curves.

### `xp_multiplier`

Controls how much XP a character receives. Applied automatically when XP is awarded via the `xp` action or `addXp` service. Defaults to 1 if unset or 0.

| Value | Effect |
|---|---|
| unset / 0 | Treated as 1 (normal XP) |
| `1` | Normal XP |
| `1.5` | 50% bonus XP |
| `0.5` | Half XP |
| `2` | Double XP |

**Example:**

```json
{ "traits": { "level": 1, "xp_multiplier": 1.5 } }
```

Since traits are computed from statuses, items and buffs can modify the multiplier. For example, an "XP Boost" status with `traits: { xp_multiplier: 0.5 }` would add +0.5 to the base value, giving a total of 1.5 (or 2.0 if stacked).
