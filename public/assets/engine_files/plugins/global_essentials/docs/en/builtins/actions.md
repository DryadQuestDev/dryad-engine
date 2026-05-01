# Actions Reference

All built-in actions for scenes and choices.

---

## Core Actions

| Action | Description | Example | Delayed |
|--------|-------------|---------|---------|
| `notification` | Display a notification popup | `"Hello!"` | |
| `flash` | Display a flash message | `"Item received!"` | |
| `state` | Set game states | `"game_state=battle, disable_ui=true"` | |
| `popup` | Open a popup or close current popup | `"my-popup"` or `false` | ✓ |
| `property` | Modify game properties (`=` set, `>` add, `<` subtract) | `"gold>100, score=0"` | |
| `discover_lore` | Mark one or more lore records as discovered | `"kingdom_of_luminaria"` or `"goblins, orcs, trolls"` | |

### property Examples

```javascript
// String format (= set, > add, < subtract)
{ property: "gold>100" }           // add 100 to gold
{ property: "score=0, lives<1" }   // set score to 0, subtract 1 from lives

// Object format (for setting complex values)
{ property: { settings: { volume: 80, theme: "dark" } } }
```

---

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
| `join_party` | Add character to party | `"alice, bob"` | |
| `leave_party` | Remove character from party | `"alice"` | |
| `create_character` | Create a new character | `{ id: "npc1", template: "villager" }` | |
| `update_character` | Update character properties | `{ id: "alice", party: true }` | |
| `delete_character` | Delete a character | `{ id: "npc1" }` | |
| `add_status` | Add status effect to character | `{ character: "alice", statusId: "poison" }` | |
| `char` | Modify character property (`=` set, `>` add, `<` subtract) | `"alice.resource.health>10"` | |
| | Types: `trait`, `attribute`, `stat`, `resource`, `skinStyle` | `"mc.attribute.belly=2"` | |
| `add_skin_layer` | Add skin layer to character | `"alice.armor"` | |
| `remove_skin_layer` | Remove skin layer from character | `"alice.armor"` | |
| `add_item_slot` | Add equipment slot to character | `"alice.ring"` | |
| `remove_item_slot` | Remove equipment slot from character | `"alice.ring"` | |
| `skill` | Learn a skill for character | `"alice.fire_magic.fireball"` | |

---

## Item Actions

| Action | Description | Example | Delayed |
|--------|-------------|---------|---------|
| `equip_item` | Equip item to character | `true` | |
| `unequip_item` | Unequip item from character | `true` | |
| `add_item` | Add item to inventory | `"sword, potion#5"` | |
| `loot` | Open loot exchange | `"chest_inventory"` | ✓ |
| `trade` | Open trade exchange | `"merchant_inventory"` | ✓ |
| `learn_recipe` | Learn a crafting recipe | `"iron_sword, steel_sword"` | |

