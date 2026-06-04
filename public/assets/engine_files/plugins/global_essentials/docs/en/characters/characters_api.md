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

### createCharacter(id, template, skipEvents?)

Create a character from a template object or registered template ID.

```js
// From a registered template ID
const shopkeeper = game.createCharacter("shopkeeper_1", "shopkeeper_template");
game.addCharacter(shopkeeper);

// From a custom template object
const npc = game.createCharacter("custom_npc", {
  traits: { name: "Custom NPC" },
  stats: { health: 100, strength: 10 },
  attributes: { sex: "male" }
});
game.addCharacter(npc);

// Skip creation events (for previews, etc.)
const preview = game.createCharacter("preview", "some_template", true);
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

Add a character to the party. Accepts character instance or ID string. Triggers `character_join_party` event.

```js
game.addToParty("alice");  // Using ID string
game.addToParty(npc);      // Using Character instance
```

### removeFromParty(character)

Remove a character from the party. Accepts character instance or ID string. Triggers `character_leave_party` event.

```js
game.removeFromParty("alice");  // Using ID string
game.removeFromParty(npc);      // Using Character instance
```

### deleteCharacter(character)

Delete a character from the game entirely. Accepts character instance or ID string. Removes their private inventory and removes them from party. Triggers `character_delete` event.

```js
game.deleteCharacter("alice");  // Using ID string
game.deleteCharacter(npc);      // Using Character instance
```

### createStatus(template)

Create a status from a template object or registered template ID.

```js
// From a registered template ID
const buff = game.createStatus("strength_buff");
character.addStatus(buff);

// From a custom template object
const customStatus = game.createStatus({
  id: "custom_buff",
  stats: { strength: 10 },
  maxStacks: 3
});
character.addStatus(customStatus);
```

### registerStatGroupResolver(resolver)

Register a function that controls which stat groups appear in the character sheet per character. The resolver receives a character and returns an array of stat tag names. The engine filters stats by those tags, sorts by `order`, and resolves group display names from locale key `group.{tag}`.

Without a resolver, the character sheet defaults to two groups: "Resources" and "Stats".

```js
// Show combat and survival for everyone, allegiance only for MC
game.registerStatGroupResolver((character) => {
    const tags = ['survival', 'combat'];
    if (character.tags.includes('mc')) tags.push('allegiance');
    return tags;
});
```

Group names are resolved from locale entries. For the tags above, define locale entries with IDs: `group.survival`, `group.combat`, `group.allegiance`.

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
| `statuses` | `Map<string, Status>` | Applied status effects (use `getStatuses()` to iterate) |
| `actions` | `Record<string, any>` | Custom actions registered on this character |
| `skinLayerStyles` | `Map<string, string[]>` | CSS classes applied to skin layers |
| `renderedLayers` | `CharacterSkinLayerObject[]` | Rendered skin layers for display |

---

## ID Methods

### getId()

Get the character's ID.

```js
const id = character.getId();
```

### setId(id)

Set the character's ID. Also updates the private inventory ID to match.

```js
character.setId("new_character_id");
```

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

Get a stat's computed value directly as a number. Works reactively in Vue templates and computed properties.

```js
const maxHealth = character.getStat("health");
```

### setStat(name, value)

Set the base value of a stat on the character's core status.

```js
character.setStat("semen_collected_potency", 42);
```

### getStatRef(name)

Get a stat's reactive ComputedRef. Use when you need the ref itself (e.g., for `watch()` or storing).

```js
const healthRef = character.getStatRef("health");
watch(healthRef, (newVal) => console.log("Health changed:", newVal));
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

Add a status effect. If status already exists and is stackable, adds stacks instead. Use `game.createStatus(id)` to build the Status instance from a registered template.

```js
const poison = game.createStatus("poison");
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

### getStatuses()

Get all status effects on this character.

```js
const statuses = character.getStatuses();
const boons = statuses.filter(s => s.tags?.includes('boon'));
```

### setStatusStacks(statusId, newStacks)

Set a status's stack count with proper resource adjustment for replenishable stats.

```js
character.setStatusStacks("power_buff", 3);
```

### addStatusStacks(statusId, amount?)

Add stacks to a status with proper resource adjustment. Returns true if stacks were added successfully.

```js
character.addStatusStacks("poison", 2);
```

### removeStatusStacks(statusId, amount?)

Remove stacks from a status (oldest instances first) with proper resource adjustment. Removes the status entirely if it drops to 0 stacks. Returns the number of stacks actually removed.

```js
character.removeStatusStacks("poison", 2);
```

> **Note:** Status stacks are mutated only through the character — `addStatusStacks()` / `setStatusStacks()` / `removeStatusStacks()`. These keep replenishable resources (like health) and computed stats in sync; `Status` is read-only from scripts (`getStatus(id)?.currentStacks`).

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

### getGroupedAbilities()

Get abilities organized by ability groups. Returns `{ useGroups, groups }`.

- If no abilities have a `group` meta assigned, `useGroups` is `false` and all ability IDs are in a single flat group.
- If any ability has a group, `useGroups` is `true` and `groups` contains sorted groups with their ability IDs. Ungrouped abilities are logged as warnings and excluded.

```js
const { useGroups, groups } = character.getGroupedAbilities();

if (useGroups) {
  for (const group of groups) {
    console.log(group.name, group.abilityIds);
  }
} else {
  // Flat list — all abilities in groups[0].abilityIds
  console.log(groups[0].abilityIds);
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

## Spine Animation Methods

### getSpineTrackAnimations(view?)

Get the current track-to-animation mapping based on character attributes. Animations are grouped by underscore prefix — each group plays on its own Spine track, driven by the matching attribute.

```js
// Spine has animations: "body", "belly_0", "belly_1", "face_idle", "face_ahegao"
// Character attributes: belly = "1", face = "idle"
// Result: { 0: "body", 1: "belly_1", 2: "face_idle" }
const trackMap = character.getSpineTrackAnimations();

// Change belly animation by setting the attribute:
character.setAttribute('belly', '2'); // automatically plays belly_2 on track 1
```

### hasSpineAnimation(animation, view?)

Check if a spine animation exists for the given view. Returns `false` if spine hasn't loaded yet.

```js
if (character.hasSpineAnimation('belly_2', '')) {
  character.setAttribute('belly', '2');
}
```

### setAvailableSpineAnimations(view, names)

Register available animation names for a view. Called automatically by `CharacterDollSpine` on load — you normally don't call this directly.

### isSpineCharacter()

Returns `true` if the character has a default spine config.

### isSpineForView(view)

Check if a spine config exists for the given view (e.g. `"back"`).

### getSpineSkins()

Returns an array of Spine skin names derived from the character's current attributes.

---

## Status Interface

Status effects applied to characters.

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier |
| `maxStacks` | `number` | Max stack count (1 = non-stackable, -1 = unlimited) |
| `currentStacks` | `number` | Current stack count |
| `isHidden` | `boolean` | Hidden from UI |
| `tags` | `string[]` | Tags for categorizing/filtering (e.g. `'battle'`) |
| `duration` | `number` | Duration (-1 = permanent, interpretation depends on game/plugin) |
| `stats` | `Record<string, number>` | Stat modifiers |
| `traits` | `Record<string, any>` | Trait values |
| `attributes` | `Record<string, string>` | Attribute values |
| `skinLayers` | `Set<string>` | Skin layers added |
| `abilities` | `Set<string>` | Abilities granted |

### Status Methods

```js
// Stacks are mutated through the character (keeps resources/stats in sync); Status is read-only.
if (status.isStackable()) {
  character.addStatusStacks(status.id, 2);
  character.removeStatusStacks(status.id, 1);
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
