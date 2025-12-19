# Conditions Reference

All built-in conditions for choice visibility checks and conditional logic.

---

## Built-in Conditions

| Condition | Description | Example |
|-----------|-------------|---------|
| `_property` | Get a game property value (supports nested paths) | `_property(gold) > 100` |
| `_room_visited` | Whether a room has been visited | `_room_visited(room5) = true` |
| `_scene` | Whether a scene is currently active | `_scene = true` |
| `_selected_character` | ID of currently selected character | `_selected_character = alice` |
| `_item_on` | Whether character has item equipped | `_item_on(alice, sword) = true` |
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
| `attribute` | Character attributes | `_char(alice.attribute.class) = warrior` |
| `stat` | Character stats (computed value) | `_char(alice.stat.strength) > 10` |
| `resource` | Character resources | `_char(alice.resource.health) >= 50` |
| `skinStyle` | Active skin layer styles | `_char(alice.skinStyle.hat) = wizard` |

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

