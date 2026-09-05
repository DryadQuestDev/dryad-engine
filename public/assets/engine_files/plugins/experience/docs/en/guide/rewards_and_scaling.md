# Rewards & Dungeon Scaling

Beyond XP and leveling, the plugin can run a full defeat-reward pipeline: dungeon-level snapshots, threat-based loot generation, item instance scaling, and a reward popup. The whole layer is opt-in.

## The `auto_scaling` flag

Everything on this page is gated behind the `auto_scaling` config flag (off by default). With it off, the plugin is a plain XP/leveling system and none of the behavior below runs – no level snapshots, no inventory creation, no item scaling, no threat scaling.

## Dungeon level

On first entry of a dungeon, the MC's level (config `mc_id`) is snapshotted as that dungeon's **dungeon level** – rewards there stay calibrated to the level the player arrived at, even if they return stronger.

Dungeons that belong together share one snapshot via the `level_group` dungeon trait (set in the dungeon config). Whichever grouped dungeon is entered first writes the snapshot; entry order is irrelevant.

**Convention:** name the level group after the group's main dungeon id (e.g. `level_group: "elf_mansion_dungeon"` on both the mansion and its undercroft). Then binding inventories to the main dungeon covers the whole group.

The reward multiplier for a dungeon level is:

```
scale = 1 + power_scale_per_level × (dungeon_level − 1)
```

**Overriding the level.** Author `{ dungeon_level: N }` to set the current dungeon's group to level `N`, `{ dungeon_level: true }` to (re)set it to the MC's live level, or `{ dungeon_level: "dungeon_id = N" }` to target a specific dungeon by id (auto-resolved to its level group). It writes the level only: future battles rescale immediately, while already-generated chests/loot keep the level they were stamped at. See the Actions reference.

**Over-leveled gear can't be equipped.** Loot locks at the dungeon level, so a bumped dungeon can drop gear above the MC's level. Such items are still lootable and sellable, but a character cannot equip an item whose `item_level` exceeds their own `level` (a notification fires) until they catch up. Traders are unaffected — pooled trade stock always generates at the MC's level.

## Defeat rewards

When a battle definition is first marked defeated – fight victory or a scripted `{win: "battleId"}` – the plugin grants, in one pass:

1. **Drop table** – the battle's `loot` inventory, read as pure template data. Hand-authored, ignores threat.
2. **Equipment roll** – budget = base threat × `loot_equipment_coef`, spent on items from `loot_equipment_categories` at their template price. Deliberately NOT level-scaled: the created instances scale themselves (below), so a scaled budget would double-dip.
3. **Income roll** – budget = effective threat (base × scale) × `loot_income_coef`, spent on items from `loot_income_categories` (e.g. junk). Whatever budget remains pays out 1:1 as the `loot_currency_item`. The only level-scaled budget.
4. **Threat XP** – effective threat × `threat_xp_coef` to every levelled party member.
5. The game's own `reward_assemble` listeners run (see Emitters).

Both rolls pick the most expensive affordable item first, then fill remaining slots against a price floor (`remaining / slots left`), capped at `loot_max_items` per roll. Items with no price, a `no_drop` trait, a `test` tag, or `is_currency` never drop.

Threat comes from the rpg_battler plugin: the sum of enemy `threat` traits plus the battle's `bonus_threat`.

**Display:** in battle the victory overlay shows the reward; outside battle (scripted wins, `{xp: N}` grants) the reward popup opens and closing it advances the scene.

### Leaving loot behind

Every loot brick carries a trash toggle under it. Loot is already in the party bag by the time the panel renders, so the toggle marks the line rather than refusing the pickup – continuing removes the marked lines again (only the granted quantity; a stack the player already carried keeps the rest). Useful with a carry-weight system, where a full bag makes junk a liability.

Whether the toggle renders is the same pair of questions the item card's Drop choice asks: `item.isDroppable()` (the engine's own rule – equipped gear and anything quest-flagged, by rarity or category) and the `item_drop_render` emitter. A game adds its own protected kinds once and both UIs obey:

```js
game.on('item_drop_render', (item) => {
    if (item.category === 'keys') return false;
});
```

## Item instance scaling

Every created item (drops, chests, shops, `add_item`) whose category is in `loot_equipment_categories` and that carries equip-status stats is scaled on creation:

- `status.stats` values × dungeon scale (rounded)
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

The level compared against is the roll's own level: the dungeon snapshot for battle loot and loot chests, the MC's live level for trade stock and restocks. Windows apply to every generated source – the threat-budget generator and all pool draws – and never to hand-authored drop tables or inventory items (the author picked the tier deliberately). With no level context (auto_scaling off, outside dungeons) the level counts as 1.

Pricing still matters: the budget generator can only afford expensive tiers at high budgets anyway – windows add the hard floor (no big potion early even if affordable) and the ceiling (no small-potion padding late).

## Pooled inventories

Generic chests and shops can be filled from the engine's pool system (pool_definitions + pool_entries) instead of hand-authored lists. Two forms:

**Inline** – reference a pool entry directly from a `!` choice, prefixed with `^`:

```
!open<Open>{loot: "^chest_common"}
!shop<Trade>{trade: "^merchant_basic"}
```

Each placement gets its OWN inventory (the choice is redirected to a unique id, `^dungeon.room.encounter.choice`) – two chests using the same pool roll independently. Comma lists (`^chest_common,herbs`) draw several entries into one inventory. Draws use chance mode: every pool entity rolls its own `chance` and contributes `count ± delta` on success.

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

The roll picks a tier first, then a uniform item of that tier. Tiers open with `spawn_min` floors 1/4/7/10; the dungeon level's own tier weighs 100 % and each tier below keeps `gather_lower_tier_weight` % per step down – low-tier staples stay available forever, just rarer in deep dungeons.

Resolution happens through the core `collectable_resolve` emitter, so a game can claim other table names (any `collect_pool` value except `gather`) with its own listener.

## Smith station

The `smith` action (eventDelayed) opens a station overlay where **unequipped, level-stamped** equipment from the party bag is worked:

- **Upgrade** – reforge an item up to the MC's level. Cost per level = the item's rarity position (common 1, uncommon 2, rare 3, …) in **smith stones**; the item is recreated through the normal `item_create` scaling path, so the result matches a fresh drop at that level. The before/after preview is a throwaway instance built the same way.
- **Break down** – destroy an item for `floor(item_level / smith_break_divisor) × rarity cost` stones (≈ a third of what upgrading it cost). Items below the divisor refund nothing and stay ordinary sellables.

The `smith_stone` item template is plugin-injected with neutral traits; a game overrides it by id to set its category, icon, and price, and provides the faucet (shop stock, loot pools, quest rewards). Keeping stones sell-proof is the game's economy call too — e.g. dryad_tale's trade script clears the player-side trade price for items flagged `no_sell`, so stones are buy-only and the gold→item→break→stones→gold loop can never close. Listeners can veto either operation through the `smith_upgrade` / `smith_break` emitters. A `smith` service exposes the same operations to game scripts.

## Config reference

| Key | Default | Description |
|---|---|---|
| `auto_scaling` | false | Master switch for everything on this page |
| `power_scale_per_level` | 0.25 | Item + reward (power-curve) scaling per dungeon level |
| `loot_equipment_coef` | 0 | Equipment budget per point of base threat (0 = off) |
| `loot_income_coef` | 0 | Income budget per point of effective threat (0 = off) |
| `loot_max_items` | 3 | Item cap per roll group |
| `loot_equipment_categories` | – | Categories that roll as equipment and scale on creation |
| `loot_income_categories` | – | Categories the income roll draws from; empty = pure currency payout |
| `loot_currency_item` | – | Currency item paid from the leftover income budget |
| `gather_lower_tier_weight` | 40 | Weight in % kept by each ingredient tier below the dungeon's own at gather spots |
| `threat_xp_coef` | 5 | XP per point of effective threat on defeat (0 = off) |
