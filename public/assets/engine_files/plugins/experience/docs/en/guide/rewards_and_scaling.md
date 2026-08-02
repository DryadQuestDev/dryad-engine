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
scale = 1 + scale_per_level × (dungeon_level − 1)
```

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

## Item instance scaling

Every created item (drops, chests, shops, `add_item`) whose category is in `loot_equipment_categories` and that carries equip-status stats is scaled on creation:

- `status.stats` values × dungeon scale (rounded)
- `price` values × the PRICE scale – a separate curve (`price_scale_per_level`, default twice `scale_per_level`), so gear value climbs faster than its power and old gear sells cheap next to replacements. Set the config field equal to `scale_per_level` to weld value back to power
- ability enhancements: each `ability_modifiers` entry resolves to a per-instance copy whose OPT-IN number aspects scale by the same factor. An aspect scales only when its ability definition sets the `scales` flag – rpg_battler flags its absolute `status_stacks_*` aspects; power-relative values (damage/healing %) stay flat since the caster's power already scales through stats
- the instance is stamped with the `item_level` trait – the no-rescale guard, and the item card renders it as a level badge

Author equipment templates at their **level-1 baseline**; one template serves every level.

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

## Config reference

| Key | Default | Description |
|---|---|---|
| `auto_scaling` | false | Master switch for everything on this page |
| `scale_per_level` | 0.25 | Reward scaling per dungeon level |
| `loot_equipment_coef` | 0 | Equipment budget per point of base threat (0 = off) |
| `loot_income_coef` | 0 | Income budget per point of effective threat (0 = off) |
| `loot_max_items` | 3 | Item cap per roll group |
| `loot_equipment_categories` | – | Categories that roll as equipment and scale on creation |
| `loot_income_categories` | – | Categories the income roll draws from; empty = pure currency payout |
| `loot_currency_item` | – | Currency item paid from the leftover income budget |
| `threat_xp_coef` | 5 | XP per point of effective threat on defeat (0 = off) |
