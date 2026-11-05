# Actions & Data

## DryadScript Actions

### `xp`

Award XP to characters. Pass a number to award to the MC (`mc_id`) – or to every levelled party member when `shared_level` is on – or a string for per-character amounts.

```js
// Award 50 XP to the MC (whole party with shared_level on)
{ xp: 50 }

// Award different amounts to specific characters
{ xp: "hero->100, mage->50" }

// Award the XP a battle's victory grants, without its loot
{ xp: "goblin_ambush" }
```

Per-character format: `"characterId->amount, characterId->amount"`.

With `auto_scaling` on, numeric amounts (plain and per-character) are written for level 1 and multiply by the reward scale at each receiver's own level, the same curve fight XP rides: `{ xp: 75 }` grants 150 to a level-5 character at the default `power_scale_per_level`. The battle form follows the dungeon level, like the fight it stands for.

Battle format: a battle id awards exactly the XP that winning that battle grants (its threat × `threat_xp_coef`, scaled to the current dungeon level) to every levelled party member. It gives no loot and does not mark the battle defeated. Use it for a route that ends an encounter without fighting it, e.g. talking a foe down. For a foe beaten by other means use `win`; to record the clear as well, add rpg_battler's `set_defeated`. Battle ids and per-character parts can share one string.

The action is delayed: the player reads the paragraph first, the continue-click grants the XP and opens the reward popup (with any level-up fanfare). Mid-battle grants skip the popup and surface in the battle victory panel instead.

### `dungeon_level`

Set (or overwrite) a dungeon/dungeon-group **dungeon level** (see the Rewards & Scaling guide). Only takes effect while `auto_scaling` is on. Writes the level state only – future battles rescale live; inventories already generated keep their stamped level.

```js
// Set the CURRENT dungeon's group to level 7
{ dungeon_level: 7 }

// (Re)set the current group to the MC's current level
{ dungeon_level: true }

// Set a specific dungeon by id – auto-resolved to its level group (level_group trait, else the id)
{ dungeon_level: "cave_dungeon = 7" }
```

Loot stamped above a character's `level` cannot be equipped by them (a notification fires) until they reach that level. Traders are unaffected – pooled trade stock generates at the MC's level.

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

The `auto_scaling` flag and the reward/loot keys (`power_scale_per_level`, `loot_*`, `threat_xp_coef`) are covered in the Rewards & Scaling guide.

### `smith`

Open the Smith Station overlay (upgrade leveled equipment, worn or not, or break down unequipped pieces for smith stones – see the Rewards & Scaling guide). Event-delayed: the overlay opens after the paragraph finishes.

```text
!use<Forge>{smith: true}
```

On a choice, `smith` also marks the option: an anvil before its label and the `smith-choice` class on the row.

| Selector | Element |
|---|---|
| `.choice-list .choice.smith-choice` | The whole option row |
| `.smith-badge` | Badge wrapper (unmasked; its `::before` / `::after` can bracket the icon) |
| `.smith-icon` | The anvil glyph, painted in the text colour |

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
