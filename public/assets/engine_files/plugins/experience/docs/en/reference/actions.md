# Actions & Data

## DryadScript Actions

### `xp`

Award XP to characters. Pass a number to award to the MC (`mc_id`) – or to every levelled party member when `shared_level` is on – or a string for per-character amounts.

```js
// Award 50 XP to the MC (whole party with shared_level on)
{ xp: 50 }

// Award different amounts to specific characters
{ xp: "hero->100, mage->50" }
```

Per-character format: `"characterId->amount, characterId->amount"`.

The action is delayed: the player reads the paragraph first, the continue-click grants the XP and opens the reward popup (with any level-up fanfare). Mid-battle grants skip the popup and surface in the battle victory panel instead.

## Config Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `mc_id` | string | -- | Character whose level is snapshotted as the dungeon level on first entry, and the target of numeric `xp` grants |
| `shared_level` | boolean | false | Party-wide progression: numeric `xp` grants the whole party, and a levelled character joining the party is levelled up to the MC's level and XP – receiving each level's status stack and rewards on the way, without reward-panel fanfare |
| `xp_base` | number | 100 | XP threshold to level up at level 1 |
| `xp_formula` | chooseOne | `exponential_percent` | Scaling formula: `linear_percent` or `exponential_percent` |
| `xp_growth` | number | 50 | Growth percentage applied per level |
| `max_level` | number | 99 | Maximum character level |
| `level_up_rewards` | schema[] | -- | Currency items awarded to the character's private inventory on each level up. See below. |

The `auto_scaling` flag and the reward/loot keys (`scale_per_level`, `loot_*`, `threat_xp_coef`) are covered in the Rewards & Scaling guide.

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
| `xp_modifier` | stat | Percent modifier to XP gain. 0 = normal (100%), 20 = +20%, -50 = halved. Modified by statuses/items. |

## Character Traits

| Trait | Type | Description |
|---|---|---|
| `level` | number | Character's current level. Set in character template to enable XP/leveling. |
| `level_up_status` | chooseOne (status) | Optional. Status to apply on each level up. Stacks automatically — each level adds one stack. Use for no-code stat growth per level. |

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

### `xp_modifier`

Controls how much XP a character receives. Applied automatically when XP is awarded via the `xp` action or `addXp` service. Value is a percent: final multiplier = `1 + xp_modifier / 100`.

| Value | Effect |
|---|---|
| unset / `0` | Normal XP (100%) |
| `20` | 120% XP |
| `50` | 150% XP |
| `100` | 200% XP |
| `-50` | 50% XP (halved) |

**Example:**

```json
{ "traits": { "level": 1 }, "stats": { "xp_modifier": 50 } }
```

Since stats stack additively from statuses and items, an "XP Boost" status with `stats: { xp_modifier: 20 }` adds +20% per stack — two stacks give +40%, three give +60%, etc.
