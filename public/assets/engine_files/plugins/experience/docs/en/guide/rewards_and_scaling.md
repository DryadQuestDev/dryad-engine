# Rewards & Dungeon Scaling

Beyond XP and leveling, the plugin can run a full defeat-reward pipeline: dungeon-level snapshots, threat-based loot generation, item instance scaling, and a reward popup. The whole layer is opt-in.

## The `auto_scaling` flag

Everything on this page is gated behind the `auto_scaling` config flag (off by default). With it off, the plugin is a plain XP/leveling system and none of the behavior below runs – no level snapshots, no inventory creation, no item scaling, no threat scaling.

## Dungeon level

On first entry of a dungeon, the MC's level (config `mc_id`) is snapshotted as that dungeon's **dungeon level** – rewards there stay calibrated to the level the player arrived at, even if they return stronger.

Dungeons that belong together share one snapshot via the `level_group` dungeon trait (set in the dungeon config). Whichever grouped dungeon is entered first writes the snapshot; entry order is irrelevant.

**Convention:** name the level group after the group's main dungeon id (e.g. `level_group: "castle"` on both the castle and its cellar). Then binding inventories to the main dungeon covers the whole group.

The reward multiplier for a dungeon level is:

```
scale = 1 + power_scale_per_level × (dungeon_level − 1)
```

Numeric `{ xp: N }` grants use the same multiplier, read at the receiving character's own level instead of the dungeon's. Author them at their level-1 value, like equipment. A quest finished long after the dungeon was entered still pays its full share.

**Overriding the level.** Author `{ dungeon_level: N }` to set the current dungeon's group to level `N`, `{ dungeon_level: true }` to (re)set it to the MC's live level, or `{ dungeon_level: "dungeon_id = N" }` to target a specific dungeon by id (auto-resolved to its level group). It writes the level only: future battles rescale immediately, while already-generated chests/loot keep the level they were stamped at. See the Actions reference.

**Over-leveled gear can't be equipped.** Loot locks at the dungeon level, so a bumped dungeon can drop gear above the MC's level. Such items are still lootable and sellable, but a character cannot equip an item whose `item_level` exceeds their own `level` (a notification fires) until they catch up. Traders are unaffected — pooled trade stock always generates at the MC's level.

## Defeat rewards

When a battle definition is first marked defeated – fight victory or a scripted `{win: "battleId"}` – the plugin grants, in one pass:

1. **Drop table** – the battle's `loot` inventory, read as pure template data. Hand-authored, ignores threat.
2. **Battle pool** – the `battle_loot_pools` band with the highest `min_threat` at or below the battle's base threat names a pool entry, drawn in chance mode at the dungeon level, exactly like a pooled chest: spawn windows apply, equipment scales to the level, and drawn currency quantities scale by the level's reward multiplier. No band, no generated loot.
3. **Threat XP** – effective threat × `threat_xp_coef` to every levelled party member.
4. The game's own `reward_assemble` listeners run (see Emitters).

Bands are sparse steps, like the enemy curve's pins:

```json
"battle_loot_pools": [
  { "min_threat": 0,  "pool": "battle1" },
  { "min_threat": 30, "pool": "battle3" },
  { "min_threat": 50, "pool": "battle4" }
]
```

Threat comes from the rpg_battler plugin: the sum of enemy `threat` traits plus the battle's `bonus_threat`.

**Display:** in battle the victory overlay shows the reward; outside battle (scripted wins, `{xp: N}` grants) the reward popup opens and closing it advances the scene.

### Leaving loot behind

Every loot brick carries a trash toggle under it. Loot is already in the party bag by the time the panel renders, so the toggle marks the line rather than refusing the pickup – continuing removes the marked lines again (only the granted quantity; a stack the player already carried keeps the rest). Useful with a carry-weight system, where a full bag makes junk a liability.

Whether the toggle renders is the same pair of questions the item card's Drop choice asks: `item.isDiscardable()` (the engine's own rule – equipped gear, quest rarity and the `no_discard` trait) and the `item_discard_render` emitter. A game adds its own protected kinds once and both UIs obey:

```js
game.on('item_discard_render', (item) => {
    if (item.category === 'keys') return false;
});
```

## Item instance scaling

Every created item (drops, chests, shops, `add_item`) whose category is in `loot_equipment_categories` and that carries equip-status stats is scaled on creation:

- `status.stats` values, each on the curve its stat's `scaling` Stat Meta names (rounded):

| `scaling` | Curve | For |
|---|---|---|
| `flat` | `power_scale_per_level` | stats in the units enemy scaling grows – power, armor, health, thorns, capacities |
| `relative` | `relative_scale_per_level` (slower) | chances, percentages, speed – measured against things enemies never scale, so the power curve would run them into their caps |
| unset | none | stats that should never grow |

  The plugin declares the `scaling` field; the plugin or game that defines a stat sets it (rpg_battler ships it on its own stats).
- `price` values × the PRICE scale – a separate curve (`price_scale_per_level`, default twice `power_scale_per_level`), so gear value climbs faster than its power and old gear sells cheap next to replacements. Set the config field equal to `power_scale_per_level` to weld value back to power
- ability enhancements: each `ability_modifiers` entry resolves to a per-instance copy whose OPT-IN number aspects scale by the same factor. An aspect scales only when its ability definition sets the `scales` flag – rpg_battler flags its absolute `status_stacks_*` aspects; power-relative values (damage/healing %) stay flat since the caster's power already scales through stats
- the instance is stamped with the `item_level` trait – the no-rescale guard, and the item card renders it as a level badge

Author equipment templates at their **level-1 baseline**; one template serves every level.

**Saved items catch up with the editor.** A saved item is a snapshot of its template at creation, and the engine's save migration resets its equip status and price to the template baseline. The plugin listens to `item_migrate` and rescales every level-stamped equipment item from the template at its stamped `item_level`, so a retuned weapon reaches old saves at the right level – identical to a fresh drop there. Templates that hand-stamp `item_level` are left as authored, exactly as on creation.

## Dungeon-bound inventories

Inventories opened via `loot:` need a live instance. Instead of `auto_create` (game start = level 1 forever), give the inventory the `dungeon` trait (injected by this plugin into the `inventory_traits` tab): it is instantiated on first entry of that dungeon **or any dungeon sharing its level group**, so chest contents pick up the dungeon level and lock at entry – saving and reloading before opening changes nothing.

## Tiered items (spawn windows)

Equipment uses ONE template that scales per instance. Consumables and junk tier by DISTINCT item ids instead (small/medium/big heal potion) – static stats, different prices. Two item traits control where a tier can be GENERATED:

- `spawn_min` – minimum level; empty = no floor
- `spawn_max` – maximum level; empty = no ceiling

The level compared against is the roll's own level: the dungeon snapshot for battle loot and loot chests, the MC's live level for trade stock and restocks. Windows apply to every generated source – battle pools and all other pool draws – and never to hand-authored drop tables or inventory items (the author picked the tier deliberately). With no level context (auto_scaling off, outside dungeons) the level counts as 1.

Windows give each tier its hard floor (no big potion early) and ceiling (no small-potion padding late).

## Pooled inventories

Generic chests and shops can be filled from the engine's pool system (pool_definitions + pool_entries) instead of hand-authored lists. Two forms:

**Inline** – reference a pool entry directly from a `!` choice, prefixed with `^`:

```
!open<Open>{loot: "^chest_common"}
!shop<Trade>{trade: "^merchant_basic"}
```

Each placement gets its OWN inventory (the choice is redirected to a unique id, `^dungeon.room.encounter.choice`) – two chests using the same pool roll independently. Comma lists (`^chest_common,herbs`) draw several entries into one inventory. Draws use chance mode: every pool entity rolls its own `chance` and contributes `count ± delta` on success.

Give the placement a name with `title` – it heads the loot or trade window instead of the generic one:

```
!search<Search>{loot: "^trash1", title: "Dusty Shelf"}
```

**Declared hybrid** – an inventory template with authored `items` plus the `pool` inventory trait (and `dungeon` to bind it). Authored items always survive restocks; pooled stock is drawn on top. Add the `restock` trait for shops.

Lifecycle:

- **Loot** (`loot:` refs, and hybrids without `restock`): rolled once on dungeon entry at the dungeon level, then locked – same save-scum-proof guarantee as `dungeon`-bound chests.
- **Trade** (`trade:` refs, and hybrids with `restock`): rolled at the MC's live level; whenever the MC's level has changed since the last roll, opening the shop re-rolls the pooled stock and re-prices it. Authored (stamped) items are kept as-is – a bought signature item does NOT come back.
- Quantities of drawn currency items scale with the roll's level – author a shop's gold as a pool entity (e.g. count 300, delta 60, chance 100).

A `^` reference outside a `!` choice, or with `auto_scaling` off, fails at open with "Inventory not found" – the feature requires this plugin with `auto_scaling` on.

## Gather spots (random collectables)

A collectable encounter with `collect_pool: "gather"` (instead of `collect_item`) rolls its ingredient once, at dungeon creation, and keeps it for the whole save (`gather_spots` state). Prose and map icon fall back to the drawn item, so authored `@` lines should stay generic (`|title|. |description|`) and the encounter's `image` should stay empty.

Eligible items: `ingredient` category, tagged `herb` or `fungus`, no `no_drop`, inside their `spawn_min`/`spawn_max` window at the dungeon level, and legal for the dungeon's `environment`:

- The **Environments tab** defines the game's environment vocabulary (e.g. `cave`, `forest`, `mansion`).
- Dungeon trait `environment` (single pick) says what the place is.
- Item trait `environments` (multi pick) lists where an ingredient grows; an ingredient with none grows everywhere.

The roll picks a tier first, then a uniform item of that tier. Level 1 and each distinct `spawn_min` among the foragable items open a tier (items with `spawn_min` 8, 15 and 22 make four tiers); the dungeon level's own tier weighs 100 % and each tier below keeps `gather_lower_tier_weight` % per step down – low-tier staples stay available forever, just rarer in deep dungeons.

Resolution happens through the core `collectable_resolve` emitter, so a game can claim other table names (any `collect_pool` value except `gather`) with its own listener.

## Smith station

The `smith` action (eventDelayed) opens a station overlay where **level-stamped** equipment from the party bag is worked, worn or not. The list sorts by level, then rarity, highest first (each brick carries the engine's level tag); worn pieces carry an equipped tag, and a bag piece that beats what a party member wears carries a ▲ (it gains a visible stat and loses none in some slot that takes it, by each stat's `reduction_is_good` polarity; mixed trades are not called). The station reopens on the tab and filter the player left it on.

- **Upgrade** – reforge an item up to the MC's level (a worn piece also stops at its wearer's level, or the equip gate would refuse it). Cost per level = the item's rarity position (common 1, uncommon 2, rare 3, …) in **smith stones**; the item is recreated through the normal `item_create` scaling path, so the result matches a fresh drop at that level. A worn piece is unequipped, swapped and re-equipped into the same slot, so its equip status and the game's `item_equip_*` listeners see the new stats. The before/after preview is a throwaway instance built the same way and read as it would be in the worn piece's slot (`game.getItemStats`), so stats a game makes depend on the slot through `item_stats` preview correctly. The stats that change are listed beside it. Pieces already at their cap stay listed, last in their group and faded under a MAX badge. **Upgrade equipped** reforges every worn piece at once: the stones held are spread one level at a time, lowest level first (cheaper rarity on a tie), and the confirm lists each piece's levels.
- **Break down** – the player selects any number of unequipped items (one by one, by rarity chip, or every piece up to a level) and breaks them in one confirm. Each is destroyed for `floor(item_level / break_divisor) × rarity cost` stones (≈ a third of what upgrading it cost). Items below the divisor refund nothing and stay ordinary sellables; worn items are left out.

The `smith_stone` item template is plugin-injected with neutral traits; a game overrides it by id to set its category, icon, and price, and provides the faucet (shop stock, loot pools, quest rewards). Keeping stones sell-proof is the game's economy call too — a trade script can clear the player-side trade price for items the game flags as no-sell, so stones stay buy-only and the gold→item→break→stones→gold loop can never close. Listeners can veto either operation through the `smith_upgrade` / `smith_break` emitters (`smith_break` fires per item, so one veto skips just that piece of a batch). A `smith` service exposes the same operations to game scripts.

### Smithy tab

The station's own settings sit in the plugin's **Smithy** tab (`plugins_data/experience/smith`):

| Key | Default | Description |
|---|---|---|
| `break_divisor` | 3 | Break-down yield = `floor(item level / this) × rarity cost`; items below it refund nothing |
| `sound_open` | – | Played when the station opens |
| `sound_upgrade` | – | Played on a reforge (once for **Upgrade equipped**, however many pieces) |
| `sound_break` | – | Played on a break-down (once per **Break**, however many pieces) |

Empty sounds stay silent.

### Styling the station

Everything the station draws sits under `#smith-station`, so a game's CSS can restyle every part of it with no other effect on the game. That includes the confirm box that **Upgrade equipped** and **Break** open, which is drawn inside the panel:

| Class | Part |
|---|---|
| `.smith-panel` | The station window |
| `.smith-forge` / `.smith-break-button` | Forge and break buttons, including each confirm box's accept button |
| `.smith-cancel` | Back button, including each confirm box's reject button |
| `.smith-confirm-backdrop` | The dimmed layer under the confirm box; a click on it rejects |
| `.smith-confirm` | The confirm box; `.upgrade` or `.break` is added by action |
| `.smith-confirm-header` / `.smith-confirm-message` | Its title and text |

```css
#smith-station .smith-confirm {
    background: #2a1d14;
    border: 2px solid #8a6a3a;
}
```

## Config reference

| Key | Default | Description |
|---|---|---|
| `auto_scaling` | false | Master switch for everything on this page |
| `power_scale_per_level` | 0.25 | Item + reward (power-curve) scaling per dungeon level; the curve of `flat` stats |
| `relative_scale_per_level` | 0.08 | Scaling per dungeon level for `relative` stats |
| `price_scale_per_level` | 2 × power | Price growth per level for scaled equipment |
| `battle_loot_pools` | – | Threat bands → pool entry a won battle draws |
| `loot_equipment_categories` | – | Categories treated as equipment: they scale on creation and the smith works them |
| `gather_lower_tier_weight` | 40 | Weight in % kept by each ingredient tier below the dungeon's own at gather spots |
| `threat_xp_coef` | 5 | XP per point of effective threat on defeat (0 = off) |
