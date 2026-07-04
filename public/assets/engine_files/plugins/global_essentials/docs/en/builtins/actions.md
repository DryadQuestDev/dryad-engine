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
| `sound` | Play a sound effect | `"sword_slash"` | |
| `asset` | Add, update, or remove assets(!) | `"bg1, alice(x=50)"` or `"!bg1"` | |
| `flag` | Set flags (`=` set, `>` add, `<` subtract) | `"gold>10, count=5"` | |
| `exit` | Exit current scene | true | ✓ |
| `enter` | Enter a room | `"room5"` | ✓ |
| `scene` | Play a scene | `"intro_scene"` | ✓ |
| `redirect` | Redirect to a scene | `"&alt_scene"` | |
| `choices` | Load choices from a scene | `"&choice_scene"` | |
| `choices_over` | Load choices (override mode: hide default scene ~choices) | `"&choice_scene"` | |
| `actor` | Add, move, or remove actors | `"alice->center, bob->left"` | |
| `quest` | Add quest log entry | `"main_quest.goal1.log1"` | |

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

## Character Actions

| Action | Description | Example | Delayed |
|--------|-------------|---------|---------|
| `party` | Add / remove characters from party. `!` prefix removes | `"alice, bob, !carol"` | |
| `create_character` | Create a new character | `{ id: "npc1", template: "villager" }` | |
| `update_character` | Update character properties | `{ id: "alice", party: true }` | |
| `delete_character` | Delete a character | `{ id: "npc1" }` | |
| `status` | Apply / remove status effects per target. `&` separates items; `!` prefix removes | `"alice->buff1 & buff2, bob->!debuff"` | |
| `char` | Modify character property (`=` set, `>` add, `<` subtract) | `"alice.resource.health>10"` | |
| | Types: `trait`, `attribute`, `stat`, `resource`, `skinStyle` | `"mc.attribute.belly=2"` | |
| `attr` | Shortcut for `char` with `attribute` type | `"ane.face = hurt"` | |
| `trait` | Shortcut for `char` with `trait` type | `"alice.name = Alice"` | |
| `stat` | Shortcut for `char` with `stat` type (`=` `>` `<`) | `"alice.strength > 5"` | |
| `resource` | Shortcut for `char` with `resource` type (`=` `>` `<`) | `"alice.health > 10"` | |
| `skin_style` | Shortcut for `char` with `skinStyle` type (`=` set, `>` add, `<` remove) | `"alice.hat = class1"` | |
| `skin_layer` | Add / remove skin layers per target. `&` separates layers; `!` prefix removes | `"alice->armor & helmet, bob->!cloak"` | |
| `item_slot` | Add / remove equipment slots per target. `&` separates slots; `!` prefix removes | `"alice->ring & necklace, bob->!belt"` | |
| `skill` | Learn a skill for character | `"alice.fire_magic.fireball"` | |

### Targeted-spec syntax (`status`, `skin_layer`, `item_slot`)

Each action takes a string of the form `targetId->item & item & ..., targetId->!item, ...`:

- Comma separates per-target groups.
- Within a group, `&` separates items.
- Items prefixed with `!` are **removed**; bare items are **added**.

```javascript
{ status: "alice->blessed & focused, bob->!cursed" }
{ skin_layer: "mc->armor_dirty, mc->!armor_clean" }
{ item_slot: "alice->extra_ring, bob->!ring_3" }
```

---

## Item Actions

| Action | Description | Example | Delayed |
|--------|-------------|---------|---------|
| `equip` | Equip/unequip items by character + item id | `"ordelia -> armor1, ane -> !sword1"` | |
| `equip_item` | Equip the **active item** (uid) — internal/advanced | `true` | |
| `unequip_item` | Unequip the **active item** (uid) — internal/advanced | `true` | |
| `add_item` | Add item to inventory | `"sword, potion#5"` | |
| `loot` | Open loot exchange | `"chest_inventory"` | ✓ |
| `trade` | Open trade exchange | `"merchant_inventory"` | ✓ |
| `learn_recipe` | Learn a crafting recipe | `"iron_sword, steel_sword"` | |

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
template. Invalid ids/slots log a console warning and skip that spec — the scene continues.

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

