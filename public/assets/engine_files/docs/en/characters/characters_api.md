# Character API Reference

API reference for working with characters in code.

---

## Game Methods

### getCharacter(id)

Get a character by ID.

```js
const mc = game.getCharacter("mc");
```

### getParty()

Get all characters in the party.

```js
const party = game.getParty();
for (const character of party) {
  console.log(character.getName());
}
```

### getAllCharacters()

Get all characters in the game.

```js
const allChars = game.getAllCharacters();
```

### createCharacter(id, template)

Create a character from a custom template object.

```js
const npc = game.createCharacter("custom_npc", {
  traits: { name: "Custom NPC" },
  stats: { health: 100, strength: 10 },
  attributes: { sex: "male" }
});
game.addCharacter(npc);
```

### createCharacterFromTemplate(id, templateId)

Create a character from a registered template.

```js
const shopkeeper = game.createCharacterFromTemplate("shopkeeper_1", "shopkeeper_template");
game.addCharacter(shopkeeper);
```

### addCharacter(character, isParty?)

Add a character to the game. Optionally add to party.

```js
game.addCharacter(npc);       // Add without joining party
game.addCharacter(npc, true); // Add and join party
```

### isCharacterInParty(character)

Check if a character is in the party. Accepts character instance or ID string.

```js
if (game.isCharacterInParty("alice")) {
  console.log("Alice is in the party");
}
```

### addToParty(character)

Add a character to the party. Triggers `character_join_party` event.

```js
const npc = game.getCharacter("alice");
game.addToParty(npc);
```

### removeFromParty(character)

Remove a character from the party. Triggers `character_leave_party` event.

```js
game.removeFromParty(npc);
```

### deleteCharacter(character)

Delete a character from the game entirely. Removes their private inventory and removes them from party. Triggers `character_delete` event.

```js
game.deleteCharacter(npc);
```

---

## Character Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier |
| `templateId` | `string` | Template ID this character was created from |
| `traits` | `Record<string, any>` | Character traits (key-value pairs) |
| `attributes` | `Record<string, string>` | Character attributes |
| `skinLayers` | `Set<string>` | Active skin layer IDs |
| `abilities` | `Set<string>` | Ability IDs this character has |
| `abilityModifiers` | `Record<string, any>` | Modifiers applied to abilities |
| `skillTrees` | `Set<string>` | Available skill tree IDs |
| `learnedSkills` | `Array` | Skills this character has learned |
| `itemSlots` | `ItemSlot[]` | Equipment slots |
| `statuses` | `Status[]` | Applied status effects |
| `actions` | `Record<string, any>` | Custom actions registered on this character |
| `skinLayerStyles` | `Map<string, string[]>` | CSS classes applied to skin layers |
| `renderedLayers` | `CharacterSkinLayerObject[]` | Rendered skin layers for display |

---

## Trait & Attribute Methods

### getTrait(key)

Get a trait value.

```js
const mood = character.getTrait("mood");
```

### setTrait(key, value)

Set a trait value on the character's core status.

```js
character.setTrait("mood", "happy");
```

### getAttribute(key)

Get an attribute value.

```js
const hairColor = character.getAttribute("hair_color");
```

### setAttribute(key, value)

Set an attribute value on the character's core status.

```js
character.setAttribute("hair_color", "blonde");
```

### getName()

Get the character's display name (from 'name' trait).

```js
const name = character.getName();
```

---

## Stat & Resource Methods

### getStat(name)

Get a stat's computed value (sum of all status contributions).

```js
const maxHealth = character.getStat("health").value;
```

### getResource(name)

Get the current value of a resource (e.g., current HP).

```js
const currentHp = character.getResource("health");
```

### addResource(name, value)

Add to a resource value. Use negative to subtract. Value is clamped between 0 and max.

```js
character.addResource("health", -10); // Take 10 damage
character.addResource("health", 20);  // Heal 20
```

### setResource(name, value)

Set a resource to a specific value. Value is clamped between 0 and max.

```js
character.setResource("health", 50);
```

### getResourceRatio(name)

Get the ratio of current resource to max stat value (0 to 1).

```js
const healthPercent = character.getResourceRatio("health"); // 0.75 = 75%
```

---

## Status Methods

### getCoreStatus()

Get the core status (first status, contains base character data).

```js
const coreStatus = character.getCoreStatus();
```

### addStatus(status)

Add a status effect. If status already exists and is stackable, adds stacks instead.

```js
const poison = new Status();
poison.id = "poison";
character.addStatus(poison);
```

### removeStatus(id)

Remove a status effect by ID.

```js
character.removeStatus("poison");
```

### getStatus(id)

Get a status by ID.

```js
const status = character.getStatus("blessed");
```

---

## Skin Layer Methods

### addSkinLayers(layers)

Add skin layers to the character.

```js
character.addSkinLayers(["armor_plate", "helmet"]);
```

### removeSkinLayers(layers)

Remove skin layers from the character.

```js
character.removeSkinLayers(["armor_plate", "helmet"]);
```

### getSkinLayers()

Get the set of active skin layer IDs.

```js
const layers = character.getSkinLayers();
```

### setSkinLayerStyle(layerId, styles)

Set (overwrite) the CSS style classes for a skin layer.

```js
character.setSkinLayerStyle("face", ["blushing", "sweating"]);
```

### addSkinLayerStyle(layerId, styleClass)

Add a CSS style class to a skin layer.

```js
character.addSkinLayerStyle("face", "blushing");
```

### removeSkinLayerStyle(layerId, styleClass)

Remove a CSS style class from a skin layer.

```js
character.removeSkinLayerStyle("face", "blushing");
```

---

## Skill Tree Methods

### addSkillTree(skillTreeId)

Add a skill tree to this character's available skill trees.

```js
character.addSkillTree("combat_skills");
```

### removeSkillTree(skillTreeId)

Remove a skill tree from this character's available skill trees.

```js
character.removeSkillTree("combat_skills");
```

### learnSkill(skillTreeId, id, level?)

Learn a skill. If already learned, increases level (up to max).

```js
character.learnSkill("combat_skills", "fireball", 1);
```

### unlearnSkill(skillTreeId, id)

Unlearn a skill. Refunds currency if the skill tree has a refund_factor set.

```js
character.unlearnSkill("combat_skills", "fireball");
```

### getSkillStatusId(skillTreeId, skillSlotId)

Generate a status ID for a skill.

```js
const statusId = character.getSkillStatusId("combat", "fireball");
// Returns: "_skill_combat_fireball"
```

---

## Inventory Methods

### setPrivateInventory(inventory)

Set the character's private inventory.

```js
character.setPrivateInventory("mc_backpack");
```

### getPrivateInventory()

Get the character's private inventory.

```js
const inventory = character.getPrivateInventory();
```

### getPartyInventory()

Get the inventory to use for equipping items. Returns party inventory if in party, otherwise private inventory.

```js
const inventory = character.getPartyInventory();
```

### getEquippedItems()

Get all items currently equipped by this character.

```js
const equipped = character.getEquippedItems();
```

### equipItem(item, slotId?, slotIndex?)

Equip an item to this character. Accepts Item instance or uid string.

```js
character.equipItem("item_uid_123");           // Auto-find slot
character.equipItem(swordItem);                // Using Item instance
character.equipItem("item_uid_123", "weapon"); // Specific slot type
character.equipItem("item_uid_123", "ring", 1); // Specific slot index
```

### unequipItem(item)

Unequip an item from this character. Accepts Item instance or uid string.

```js
character.unequipItem("item_uid_123");
character.unequipItem(swordItem);
```

---

## Item Slot Methods

### addItemSlot(id, slotId, x, y)

Add an equipment slot to the character.

```js
character.addItemSlot("main_hand_1", "weapon_slot", 100, 200);
```

### getItemSlotById(id)

Get an item slot by its unique ID.

```js
const slot = character.getItemSlotById("main_hand_1");
```

### getItemSlots()

Get all item slots on this character.

```js
const slots = character.getItemSlots();
```

### removeItemSlot(slot)

Remove an item slot from the character.

```js
character.removeItemSlot(slot);
```

### getItemSlotsBySlotId(slotId)

Get all item slots of a specific slot type.

```js
const weaponSlots = character.getItemSlotsBySlotId("weapon_slot");
```

### getAvailableSlotsForItem(item)

Get all slots where an item can be equipped.

```js
const availableSlots = character.getAvailableSlotsForItem(sword);
```

---

## Ability Methods

### getAbilities()

Get all final computed abilities (base + modifiers merged).

```js
const abilities = character.getAbilities().value;
// {
//   fireball: {
//     meta: { name: "Fireball", icon: "...", cooldown_base: 3 },
//     effects: {
//       main_damage: { damage: 50, damage_type: "fire" }
//     }
//   }
// }
```

### getAbility(abilityId)

Get a specific computed ability by ID.

```js
const fireball = character.getAbility("fireball");
for (const effectId in fireball.effects) {
  const aspects = fireball.effects[effectId];
  console.log(effectId, aspects.damage);
}
```

---

## Utility Methods

### update(data)

Bulk update character data.

```js
character.update({
  stats: { strength: 10 },
  traits: { mood: "happy" },
  attributes: { hair_color: "red" }
});
```

---

## Status Interface

Status effects applied to characters.

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier |
| `maxStacks` | `number` | Max stack count (1 = non-stackable, -1 = unlimited) |
| `currentStacks` | `number` | Current stack count |
| `isHidden` | `boolean` | Hidden from UI |
| `expirationTrigger` | `string` | When to expire: `'none'`, `'exploration'`, `'combat'` |
| `duration` | `number` | Duration (-1 = permanent) |
| `stats` | `Record<string, number>` | Stat modifiers |
| `traits` | `Record<string, any>` | Trait values |
| `attributes` | `Record<string, string>` | Attribute values |
| `skinLayers` | `Set<string>` | Skin layers added |
| `abilities` | `Set<string>` | Abilities granted |

### Status Methods

```js
// Check if stackable
if (status.isStackable()) {
  status.addStacks(2);
}

// Add stat modifier
status.addStat("strength", 5);

// Set computed stats key
status.setComputedStats("level_scaling");

// Set values from template
status.setValues({
  stats: { strength: 10 },
  traits: { name: "Power Buff" },
  abilities: ["power_strike"]
});
```

---

## ItemSlot Interface

Equipment slots on characters.

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique slot instance ID |
| `slotId` | `string` | Slot type ID (from item_slots schema) |
| `x` | `number` | X position for UI |
| `y` | `number` | Y position for UI |
| `itemUid` | `string` | UID of equipped item (empty if none) |

```js
const slotDef = slot.getSlotObject(); // Get slot type definition
```

---

## CharacterSkinLayerObject Interface

Skin layer data for rendering.

| Property | Type | Description |
|----------|------|-------------|
| `uid` | `string` | Unique identifier |
| `id` | `string` | Skin layer ID |
| `z_index` | `number?` | Stacking order |
| `attributes` | `string[]?` | Attributes controlling this layer |
| `images` | `Record<string, any>?` | Images for attribute combinations |
| `masks` | `Record<string, any>?` | Mask definitions |
| `styles` | `string[]?` | Default CSS classes |
| `tags` | `string[]?` | Tags for filtering |
