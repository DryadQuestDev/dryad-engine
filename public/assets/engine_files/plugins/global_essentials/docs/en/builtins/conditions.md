# Conditions Reference

All built-in conditions for choice visibility checks and conditional logic.

---

## Built-in Conditions

| Condition | Description | Example |
|-----------|-------------|---------|
| `_property` | Get a game property value (supports nested paths) | `_property(gold) > 100` |
| `_room_visited` | Whether a room has been visited | `_room_visited(room5) = true` |
| `_previous_room` | Id of the room left immediately before the current one (`''` if none) — the room just left, not merely ever-visited | `_previous_room = 19` |
| `_room` | Id of the room the player stands in | `_room = room5` |
| `_choice_visited` | Whether a choice was ever picked, by its line id; put its dungeon in front to ask about another one. A `{no_visited}` choice never counts. For choices already made in existing saves: in new content, set a flag on the branch's first paragraph and test the flag | `_choice_visited(~1.intro.3.1) = true`, `_choice_visited(dungeon2.~1.intro.3.1) = false` |
| `_scene` | Whether a scene is currently active | `_scene = true` |
| `_selected_character` | ID of currently selected character | `_selected_character = alice` |
| `_in_party` | Whether a character is currently in the party. For a companion's own line use the `ane!:` speaker tag instead | `_in_party(ane) = true`, `if{_in_party(klead) = false}ane!: “…”fi{}` |
| `_item_on` | Whether character has item equipped (no item id = the active item) | `_item_on(alice, sword) = true`, `_item_on(mc) = true` |
| `_active_item` | Whether the active item (the one whose custom choice opened the scene) is this template id | `_active_item(rusty_key) = true` |
| `_active_item_slot` | Slot type the active item is equipped in on that character (`''` while it isn't) | `_active_item_slot(alice) = ring` |
| `_slot_filled` | Whether anything is equipped in that slot (slot type or slot id) | `_slot_filled(alice, helmet) = false` |
| `_item_count` | Quantity of an item in an inventory (party by default; unequipped stacks only) | `_item_count(pickaxe) > 0`, `_item_count(chest.gold) >= 100` |
| `_chosen_item` | Whether the last `choose_item` pick was this template id | `_chosen_item(key_mansion) = true` |
| `_char` | Get a character property value | `_char(alice.stat.strength) > 10` |
| `_skill` | Get learned skill level (0 if not learned) | `_skill(alice.fire_magic.fireball) > 0` |

---

## _property Nested Paths

For object-type properties, access nested values with dot notation:

```
_property(settings.volume) > 50
_property(config.ui.theme) = dark
```

---

## _char Types

The `_char` condition accesses character properties by path: `characterId.type.key`

| Type | Description | Example |
|------|-------------|---------|
| `trait` | Character traits | `_char(alice.trait.name) = Alice` |
| `attribute` | Character attributes. If the key is a skin layer id (not an attribute), returns whether the layer is active (true/false) | `_char(alice.attribute.class) = warrior`, `_char(mc.attribute.wings) = true` |
| `stat` | Character stats (computed value) | `_char(alice.stat.strength) > 10` |
| `resource` | Character resources | `_char(alice.resource.health) >= 50` |
| `skinStyle` | Active skin layer styles | `_char(alice.skinStyle.hat) = wizard` |
| `status` | Whether the character has a status (1/0) | `_char(alice.status.poisoned) = 1` |

---

## _skill Formats

The `_skill` condition returns the learned level of a skill (0 if not learned).

| Format | Description |
|--------|-------------|
| `_skill(treeId.slotId)` | Uses selected character |
| `_skill(characterId.treeId.slotId)` | Specific character |

```
_skill(fire_magic.fireball) > 0        // check if learned
_skill(alice.fire_magic.fireball) >= 3 // check level >= 3
```

