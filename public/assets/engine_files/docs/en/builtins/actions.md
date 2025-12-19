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
| `choicesOver` | Load choices (override mode: hide default scene ~choices) | `"&choice_scene"` | |
| `actor` | Add, move, or remove actors | `"alice->center, bob->left"` | |
| `quest` | Add quest log entry | `"main_quest.goal1.log1"` | |

---

## Character Actions

| Action | Description | Example | Delayed |
|--------|-------------|---------|---------|
| `joinParty` | Add character to party | `"alice, bob"` | |
| `leaveParty` | Remove character from party | `"alice"` | |
| `createCharacter` | Create a new character | `{ id: "npc1", template: "villager" }` | |
| `updateCharacter` | Update character properties | `{ id: "alice", party: true }` | |
| `deleteCharacter` | Delete a character | `{ id: "npc1" }` | |
| `addStatus` | Add status effect to character | `{ character: "alice", statusId: "poison" }` | |
| `char` | Modify character property (`=` set, `>` add, `<` subtract) | `"alice.resource.health>10"` | |
| `addSkinLayer` | Add skin layer to character | `"alice.armor"` | |
| `removeSkinLayer` | Remove skin layer from character | `"alice.armor"` | |
| `addItemSlot` | Add equipment slot to character | `"alice.ring"` | |
| `removeItemSlot` | Remove equipment slot from character | `"alice.ring"` | |
| `skill` | Learn a skill for character | `"alice.fire_magic.fireball"` | |

---

## Item Actions

| Action | Description | Example | Delayed |
|--------|-------------|---------|---------|
| `equipItem` | Equip item to character | `true` | |
| `unequipItem` | Unequip item from character | `true` | |
| `addItem` | Add item to inventory | `"sword, potion#5"` | |
| `loot` | Open loot exchange | `"chest_inventory"` | ✓ |
| `trade` | Open trade exchange | `"merchant_inventory"` | ✓ |
| `learnRecipe` | Learn a crafting recipe | `"iron_sword, steel_sword"` | |

