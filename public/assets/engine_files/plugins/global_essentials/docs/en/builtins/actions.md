# Actions Reference

All built-in actions for scenes and choices.

---

## Core Actions

| Action | Description | Example | Delayed |
|--------|-------------|---------|---------|
| `notification` | Display a notification popup | `"Hello!"` | |
| `flash` | Display a flash message. Accepts a plain string, or `{ text, class }` to wrap the text in a `<span class="…">` | `"Item received!"` or `{ text: "small note", class: "flash-small" }` | |
| `state` | Set game states | `"game_state=battle, disable_ui=true"` | |
| `popup` | Manage the popup stack: `"id"` opens, `"!id"` closes that one, `false` closes all. Comma-separated tokens applied in order; popups stack on top of each other | `"my-popup"`, `"popup1, !popup2"`, or `false` | ✓ |
| `property` | Modify game properties (`=` set, `>` add, `<` subtract) | `"gold>100, score=0"` | |
| `lore` | Mark one or more lore records as discovered | `"kingdom_of_luminaria"` or `"goblins, orcs, trolls"` | |

### property Examples

```javascript
// String format (= set, > add, < subtract)
{ property: "gold>100" }           // add 100 to gold
{ property: "score=0, lives<1" }   // set score to 0, subtract 1 from lives

// Object format (for setting complex values)
{ property: { settings: { volume: 80, theme: "dark" } } }
```

## Dungeon Actions

| Action | Description | Example | Delayed |
|--------|-------------|---------|---------|
| `music` | Play background music | `"battle_theme"` | |
| `sound` | Play a sound effect. Sounds flagged `loop` repeat until stopped and resume after loading a save. `!id` stops that sound (looping or not); `false` stops all. A loop started in a scene ends with it; one started from a room/dungeon enter action follows the player | `"sword_slash"`, `"key_turn, door_creak"`, `"!rain"`, or `false` | |
| `asset` | Add, update, or remove assets(!). `false` = remove all (incl. defaults); `clear` = remove all but backdrop; `reset` = clear all + re-stage defaults. Flag an asset `bg=true` to make it a runtime backdrop preserved by `clear`/`solo`. Re-staging a visible asset glides it to the new values — see below | `"false, forest(bg=true), pic1"`, `"!bg1"`, `"clear"`, or `"reset"` | |
| `grade` | Colour-grade the scene, actors and map art. `false` / `none` clears. `#N` sets strength | `"night"`, `"night#0.5"`, `false`, or an object | |
| `flag` | Set flags (`=` set, `>` add, `<` subtract) | `"gold>10, count=5"` | |
| `exit` | Exit current scene | true | ✓ |
| `enter` | Enter a room | `"room5"` | ✓ |
| `scene` | Play a scene | `"intro_scene"` | ✓ |
| `redirect` | Redirect to a scene | `"&alt_scene"` | |
| `choices` | Load choices from a scene | `"&choice_scene"` | |
| `choices_over` | Load choices (override mode: hide default scene ~choices) | `"&choice_scene"` | |
| `actor` | Add, move, or remove actors(!). `false` = remove all actors instantly; `clear` = remove all with exit animations | `"alice->center, bob->left"`, `"!alice"`, or `"false, alice->right"` | |
| `panel_actor` | List a character in the scene's actor panel without staging art. `!id` removes; `false` clears. Staged actors are listed automatically | `"alice"`, `"alice, bob"`, `"!alice"`, `false` | |
| `quest` | Add quest log entry | `"main_quest.goal1.log1"` | |

### asset property glide

Re-staging an asset that is already on screen glides it to the new values over `tween` seconds
(default 0.5). Position, scale, rotation, opacity and blur glide; `z` and `fit_mode` snap. Staging an
asset for the first time never glides — its enter transition owns how it appears.

```js
{asset: "bg_mountain(scale = 2)"}              // grows over ~0.5s
{asset: "bg_mountain(scale = 2, tween = 3)"}   // slow approach
{asset: "bg_mountain(scale = 2, tween = 0)"}   // hard cut
{asset: "bg_mountain(x = 20, alpha = 0.4)"}    // drifts and fades together
```

Spine assets are positioned by their `viewport` through the Spine renderer rather than by these
props, so they are unaffected.

---

### grade

Grades world art — background assets, character art and the exploration map — wherever it is drawn,
including inside battle. UI is never graded: dialogue, choices, toolbar, and in battle the health
bars, ability panel, turn order, floating damage and log all stay at full brightness. Persists across
rooms and saves until changed.

| Preset | Look |
|--------|------|
| **Time of day** | |
| `dawn` | Warm peach, gently lifted |
| `dusk` | Warm violet, lightly dimmed |
| `night` | Cold blue, strongly dimmed |
| `moonlit` | Cold blue, desaturated, higher contrast |
| `sunlit` | Bright, warm |
| `bright` | Blown out, glaring, high contrast |
| **Weather & place** | |
| `overcast` | Flat grey daylight, low contrast |
| `stormy` | Grey, heavily desaturated |
| `foggy` | Washed pale, very low contrast |
| `underwater` | Teal, sunk, dimmed |
| **Elemental & magical** | |
| `candlelit` | Warm amber, dimmed |
| `infernal` | Furnace red-orange, high contrast |
| `frozen` | Pale cyan, bleached |
| `arcane` | Violet, desaturated |
| `void` | Near-black, colourless |
| **State of mind** | |
| `sickly` | Green, dimmed |
| `bloodied` | Red wash, high contrast |
| `dream` | Bright, soft, unreal pink |
| `nightmare` | Crushed dark, high contrast |
| **Utility** | |
| `memory` | Sepia flashback |
| `noir` | Greyscale, punchy contrast |
| `none` | Daylight |

```js
{grade: "night"}                    // full strength, ~0.8s crossfade
{grade: "night#0.5"}                // half strength
{grade: false}                      // fade back to daylight ("none" also works)
{grade: {duration: 3}}              // fade back to daylight over 3s

{grade: {preset: "night", amount: 0.5, duration: 2}}

// Manual control. Explicit fields override the preset.
{grade: {brightness: 0.5, saturate: 0.6, contrast: 1.06, hue: -10, tint: #16264f, tint_amount: 0.25, duration: 1.5}}
```

Numbers need a leading zero — write `0.5`, never `.5`. A hex tint may be written unquoted.

---

## Scene Params

| Param | Description | Example |
|-------|-------------|---------|
| `intro` | Play block 1 on first visit, block 2 on repeat visits | `{intro: true}` |

### intro

Add `{intro: true}` to the first paragraph of a scene. On the first visit, column 1 plays normally. On any subsequent visit, the engine skips column 1 and plays column 2 instead.

**Example (DryadScript):**

```
#npc~talk{intro: true}
1
%
The old man looks up from his desk.

old_man: Ah, a visitor. I am Gareth, the keeper of this archive.

old_man: What brings you here?
%
Gareth nods as you approach.

old_man: Back again? What do you need?
```

Column 1 (before `%`) plays on first visit. Column 2 (after `%`) plays on every subsequent visit. Both share the same choices below.

**Note:** Column 2 must exist. If missing, the engine logs an error.

---

## Encounter Params

Params on an `@` encounter line. These are not actions — they configure the encounter itself.

| Param | Description | Example |
|-------|-------------|---------|
| `if` / `ifOr` | Show the encounter only while the condition holds. Re-evaluated live | `{if: "_defeated(bats) = false"}` |
| `rooms` | Also place this encounter in other rooms | `{rooms: "3, 4, 6"}` |
| `discover` | Hide the encounter until the party meets a stat threshold. Permanent once met | `{discover: "perception#6"}` |

### discover

`statId#number` — "this stat, at least this high". Checked against **every party member**, so the sharpest eyes in the group find it. Comma-separate for several stats (`"perception#6, wits#4"`); each has to be met by *someone*.

```
@bats{discover: "perception#6", if: "_defeated(bats) = false"}
!listen
!attack{battle: "bats"}
Something shifts in the dark above you.
```

**Discovery is permanent.** The first time the party clears the threshold the engine writes the encounter into the save. Drop the stat afterwards — swap the gear, bench the character, lose the buff — and it stays found.

**`if` keeps working alongside it.** `discover` decides whether you have *found* the encounter; `if` decides whether it is *there right now*, and it keeps evaluating. Above, the bats are revealed forever once you are perceptive enough, yet still vanish once killed.

Checked on **room entry** and on **scene exit** — the two moments a stat can have changed. A buff gained while standing in a room reveals nothing until you step out and back in. Anything else that moves a stat in place can force a re-check with `game.scanDiscoverableEncounters()` (the turn_system plugin does this whenever the clock advances, so waiting works too).

The engine renders a cue on an encounter found this way (`Perception[6] check success`), and fires the ->builtins.game_emitters `encounter_discovered` emitter.

---

## Choice Params

Params on a choice (`!`, `~` or `>`). These are not actions — they configure the choice itself.

| Param | Description | Example |
|-------|-------------|---------|
| `if` / `ifOr` | Show the choice only while the condition holds | `{if: "has_key = 1"}` |
| `active` / `activeOr` | Show the choice, but grey it out unless the condition holds | `{active: "_item_on(riko, lockpick) = true"}` |
| `clue` | Highlight the choice until the player takes it | `{clue: true}` |
| `wip` | Mark a branch as unwritten: greys the choice out permanently and prefixes `[wip]` to its label | `{wip: true}` |

### wip

An authoring marker for a branch that isn't written yet. The choice renders greyed out and
unclickable — the same `unavailable` styling as a failed `active` condition — with `[wip]` prefixed
to its label, so planned options stay visible in-game without being reachable.

```
@crossroads
!north<Head north>{scene: "north_road"}
!south<Head south>{wip: true}
Two roads lead away from the crossroads.
```

The player sees `[wip] Head south`, greyed out.

Unconditional — unlike `active`, there is no condition to satisfy and no way to enable it. It also
takes no action handler, so the choice can never fire. Placeholders in the label still resolve
normally (`|my|`, `if{}` logic, text styles).

**Note:** a row whose choices are *all* `wip` leaves the player with nothing to pick. Keep at least
one live choice, or an `exit`, in every row.

### enc_sensitive

Marks a travel/exit choice as encumbrance-sensitive: it greys out and becomes unclickable while the
party inventory is over capacity (too heavy or too many slots). Authored as `!leave{enc_sensitive: true}`.
A proactive affordance only — the engine also blocks *all* free room-to-room movement while
over-capacity (map clicks, pathfinding, and `{enter}` actions when no scene is active), so a choice
without this flag is still stopped, just without the grey-out. No-op unless the game caps the party
inventory's `max_weight` / `max_size`. Drop items (the auto **Drop** item action) to recover.

### clue

Marks a choice as a hint the player hasn't followed yet. It renders highlighted, and stops standing out the moment it is picked — permanently, since taken choices are remembered in the save.

```
@chest
!force<Force it open>{clue: true, loot: "chest1"}
!leave<Leave it be>
A heavy chest, its lock crusted shut.
```

In **map** and **screen** dungeons the encounter itself also glows on the map for as long as it still holds an untaken, visible clue choice — so the player can see there is something here they haven't done, without having to click through everything.

A greyed-out choice never glows: `active` wins over `clue`, so a hint you cannot act on yet stays quiet.

## Character Actions

| Action | Description | Example | Delayed |
|--------|-------------|---------|---------|
| `party` | Add / remove characters from party. `!` prefix removes | `"alice, bob, !carol"` | |
| `create_character` | Create a new character. Logs an error and skips when the id already exists | `{ id: "npc1", template: "villager" }` | |
| `update_character` | Update character properties | `{ id: "alice", party: true }` | |
| `delete_character` | Delete a character | `{ id: "npc1" }` | |
| `reset_character` | Rebuild a character from its template, same id — creates it if none is live. Keeps party membership | `{ id: "orc" }`, `{ id: "orc", template: "orc_veteran" }` | |

`create_character` and `reset_character` take the same shapes — a string, a comma-separated list of ids, an object, or an array of either. They differ only on an id that is already live: `create_character` logs an error and skips it, `reset_character` rebuilds it.

```js
{ create_character: "villager" }                  // id doubles as the template id
{ reset_character: "orc, goblin" }                // `,` separates ids
{ create_character: [
    { id: "slime_2", template: "slime_small" },
    { id: "slime_3", template: "slime_small" }
]}
{ reset_character: { id: "orc", template: "orc_veteran", party: false } }
```

| Key | Description |
|-----|-------------|
| `id` | Required. The character id |
| `template` | Template to build from. On `reset_character` it overrides the live character's own template |
| `party` | `true` joins the party, `false` leaves it. Omit on `reset_character` to keep the membership it had |

Without a `template`, `reset_character` falls back to the live character's own `templateId`, then to the id — so `{ reset_character: "orc_boss_2" }` rebuilds from `orc` when that is the template it was built from.

`create_character` also accepts the template body inline — any object without a `template` key is used as the template itself:

```js
{ create_character: { id: "custom_npc", traits: { name: "Stranger" }, stats: { health: 20 } } }
```
| `status` | Apply / remove status effects per target. `&` separates items; `!` prefix removes. Flash notification only for party members | `"alice->buff1 & buff2, bob->!debuff"` | |
| `char` | Modify character property (`=` set, `>` add, `<` subtract) | `"alice.resource.health>10"` | |
| | Types: `trait`, `attribute`, `stat`, `resource`, `skinStyle` | `"mc.attribute.belly=2"` | |
| | `attribute` fallback: if the key is a skin layer id (not an attribute), `true`/`false` toggles the layer's visibility. Attribute wins on id collision | `"mc.attribute.wings=true"` | |
| `attr` | Shortcut for `char` with `attribute` type (same skin-layer fallback) | `"ane.face = hurt"`, `"mc.wings = true"` | |
| `trait` | Shortcut for `char` with `trait` type | `"alice.name = Alice"` | |
| `stat` | Shortcut for `char` with `stat` type (`=` `>` `<`) | `"alice.strength > 5"` | |
| `resource` | Shortcut for `char` with `resource` type (`=` `>` `<`) | `"alice.health > 10"` | |
| `skin_style` | Shortcut for `char` with `skinStyle` type (`=` set, `>` add, `<` remove) | `"alice.hat = class1"` | |
| `skin_layer` | Add / remove skin layers per target. `&` separates layers; `!` prefix removes | `"alice->armor & helmet, bob->!cloak"` | |
| `item_slot` | Add / remove equipment slots per target. `&` separates slots; `!` prefix removes | `"alice->ring & necklace, bob->!belt"` | |
| `ability` | Grant / remove innate abilities per target. `&` separates abilities; `!` prefix removes | `"alice->fireball & ice_bolt, bob->!punch"` | |
| `skill` | Learn / upgrade a skill for a character. `#level` adds levels; comma-separate for several. Flash notification only for party members | `"alice.fire_magic.fireball"`, `"fire_magic.fireball#2"` | |

### `skill` flashes

Party-only, the same rule `status` keeps. A first learn flashes "**Fireball** has been
learned!"; a level gain flashes "**Fireball** has been upgraded to level 2!"; a slot already
at `max_upgrade_level` flashes nothing. `skill` takes dot paths, never the `->` syntax below.

### Targeted-spec syntax (`status`, `skin_layer`, `item_slot`, `ability`)

Each action takes a string of the form `targetId->item & item & ..., targetId->!item, ...`:

- Comma separates per-target groups.
- Within a group, `&` separates items.
- Items prefixed with `!` are **removed**; bare items are **added**.

```javascript
{ status: "alice->blessed & focused, bob->!cursed" }
{ skin_layer: "mc->armor_dirty, mc->!armor_clean" }
{ item_slot: "alice->extra_ring, bob->!ring_3" }
```

`status` posts a flash notification ("**Alice** has gained **Blessed**!") only when the target is
**in the party**. Statuses set on NPCs, enemies, or a character staged before recruitment apply
silently. `skin_layer`, `item_slot`, and `ability` never flash.

---

## Item Actions

| Action | Description | Example | Delayed |
|--------|-------------|---------|---------|
| `equip` | Equip/unequip items by character + item id | `"ordelia -> armor1, ane -> !sword1"` | |
| `equip_item` | Equip the **active item** (uid) — internal/advanced | `true` | |
| `unequip_item` | Unequip the **active item** (uid) — internal/advanced | `true` | |
| `add_item` | Add item to inventory | `"sword, potion#5"` | |
| `remove_item` | Remove items from an inventory. `true` takes one of the **active item** (the exact stack whose choice or scene is running) — what a usable item's own scene wants; a number takes that many off the same stack. Otherwise the spec mirrors `add_item`; equipped stacks are drained last | `true`, `3`, `"potion#5"`, `"key -> chest_inventory"` | |
| `transfer_item` | Move items between inventories (source defaults to party; aborts if the source lacks the quantity) | `"gold#200 -> merchant"`, `"chest.gold#5 -> _party_inventory"` | |
| `item_view` | Show an item card under the dialogue text until the event ends | `true` (active item), `"healing_herb"` (party item), `false` (hide) | |
| `collect` | Collect the current collectable encounter: grants its item(s) and hides it (see Collectables in the ->dungeons.glossary). Auto-attached to `collectable` encounters; use on a custom `!` choice for a custom label | `"berry#2"` | |
| `loot` | Open loot exchange. A `^pool` value opens a placement-unique pooled inventory (requires the experience plugin with auto_scaling – see its Rewards & Scaling guide) | `"chest_inventory"`, `"^chest_common"` | ✓ |
| `trade` | Open trade exchange. `^pool` values work as for `loot`, with stock re-rolled when the MC's level changes | `"merchant_inventory"`, `"^merchant_basic"` | ✓ |
| `learn_recipe` | Learn a crafting recipe (one id, or comma-separated) | `"iron_sword, steel_sword"` | |
| `learn_recipe_item` | Learn the recipe named by the active item's `learn_recipe` field, then consume the item (notifies; "already known" if learned). Powers the auto "Learn" choice on recipe-scroll items. Discovers the item (item-card check mark) | `true` | |
| `choose_item` | Item picker popup (pauses the scene). Pick lands in `active_item` + `chosen_item_id`; branch with `_chosen_item(id)`. `remove: true` consumes the pick; `scene` plays after; cancel resumes with `chosen_item_id` `''` | `"all"`, `"keys"`, `{tags: ["herb"], remove: true, scene: "fed"}` | ✓ |
| `read_book` | Open the paged book reader for an item with the `book` trait (`dungeon_id.room_id.scene_id`; pages = that scene's paragraphs; Next/Previous/Read again/Close choices). Resumes at the bookmark; finishing the last page discovers the item. Powers the auto "Read" choice | `true` (active item), `"book_eilfiel"` | |
| `read_page` / `read_close` | Internal paging actions of the book reader (its choices dispatch them) | `2` / `true` | |
| `view_painting` | Open an item's painting scene: the registered asset named by the `painting` trait full-screen, the item description as the text (a runtime-synthesized one-paragraph scene in the current dungeon). Discovers the item. Powers the auto "View" choice | `true` (active item), `"painting_ane"` | |
| `use_scene` | Open the scene named by an item's `use_scene` trait, with that item as the active one (so the scene reads `|item|` and can end with `{remove_item: true}`). Powers the auto "Use" choice on usable items | `true` (active item), `"lockpick"` | |

### equip

Equip and unequip items using real **character ids** and **item template ids** (no uids). Comma
separates specs; two spec shapes:

- **Targeted** (`char -> payload & payload`): `&` separates payloads; a payload is `itemId` to equip or
  `!itemId` to unequip. `char.slot_type` targets a specific slot type (an equip fills its first empty
  slot, else the first; an `!itemId` is restricted to that type).
- **Clear** (`!char` / `!char.slot_type`, no arrow): `!char.slot_type` unequips every occupied slot of
  that type; `!char` clears all of the character's equipment.

`slot_type` is the slot's id from **Item Slots** (e.g. `outfit_ordelia`), not a per-character instance
name. On equip, if no matching instance exists in the character's inventory one is created from the
template and the `item.added` flash shows (same as `add_item`); equipping an instance already in
inventory stays silent. Invalid ids/slots log a console warning and skip that spec — the scene continues.

```javascript
{ equip: "ordelia -> armor1 & ring1" }        // equip both (auto slot)
{ equip: "ordelia.trinket_ordelia -> ring1" } // equip into a slot type
{ equip: "ordelia -> !armor1" }               // unequip by item id
{ equip: "!ordelia.outfit_ordelia" }          // clear a slot type
{ equip: "!ordelia" }                         // clear all equipment
```

> **`equip` vs `equip_item`/`unequip_item`:** prefer `equip` for scripting — it uses stable ids.
> `equip_item`/`unequip_item` act on the *active item* (its uid) and are mostly internal UI plumbing;
> `{ equip_item: true }` / `{ unequip_item: true }` stay useful inside active-item flows (e.g. the
> tutorial's equip/unequip cancel handling).

