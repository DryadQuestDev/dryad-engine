# Computed Stats

This guide covers computed stats - a scripting feature for dynamic stat calculations. If you're new to characters in Dryad Engine, start with ->characters.characters_overview first.

---

In the basic character system, stats simply add up. If your template gives +100 Health and an item gives +20 Health, you have 120 Health. Simple addition.

But what if you need stats that depend on something else entirely?

**Examples:**
- Endurance stat gives +10 Stamina per point
- A global "difficulty" property affects all characters' defense
- Having 3+ equipped items from the same set gives a bonus
- Party size affects individual character stats

This is what computed stats are for - stats calculated dynamically from **any game data**.

---

### Why Use Computed Stats?

Computed stats let you create relationships that simple addition can't handle:

- **Derived stats** - Endurance gives Stamina, Intelligence gives Mana
- **Global modifiers** - A "world danger" property affects all combat stats
- **Set bonuses** - Equipping multiple items from a set grants extra stats
- **Conditional bonuses** - Stats that depend on character state, attributes, or traits
- **Cross-character effects** - Party composition affecting individual stats

---

### What You Can Access

Your computed stat function receives the character, but you can access **anything in the game**:

**From the Character:**
- `character.getStat(name)` - other stats
- `character.getTrait(key)` - character traits
- `character.getAttribute(key)` - character attributes
- `character.getEquippedItems()` - equipped items
- `character.learnedSkills` - learned skills
- `character.statuses` - active status effects

**From game:**
- `game.getProperty(id)` - global properties
- `game.getState(key)` - global game state
- `game.getStore(id)` - custom stores
- `game.getAllCharacters()` - all characters
- `game.getParty()` - party members

All game data is reactive - when the underlying data changes, computed stats automatically recalculate.

---

### How They Work

Computed stats have two parts:

**1. A stat computer function** (defined in your mod's script)

```typescript
game.registerStatComputer("myComputer", (character) => {
  // Access any game data here
  // Return stat bonuses as { statName: amount }
  return {
    health: 50,
    stamina: 20
  };
});
```

**2. A reference in the template or status** (in the editor)

In the **Character Templates** or **Character Statuses** form, add the computer's name to the `computed_stats` field:

```
computed_stats: ["myComputer"]
```

---

### Examples

**Example 1: Stat to Stat**

Every point of Endurance gives +10 Stamina:

```typescript
game.registerStatComputer("enduranceToStamina", (character) => {
  const endurance = character.getStat("endurance").value || 0;
  return {
    stamina: endurance * 10
  };
});
```

**Example 2: Global Property to Stat**

A global "difficulty" property affects all characters' defense:

```typescript
game.registerStatComputer("difficultyPenalty", (character) => {
  const difficulty = Number(game.getProperty("difficulty")?.currentValue) || 1;
  return {
    defense: -10 * (difficulty - 1)  // Higher difficulty = less defense
  };
});
```

**Example 3: Equipped Items (Set Bonus)**

Count equipped items with a specific trait for a set bonus:

```typescript
game.registerStatComputer("armorSetBonus", (character) => {
  const equipped = character.getEquippedItems();
  const setPieces = equipped.filter(item =>
    item.getTrait("item_set") === "dragon_armor"
  ).length;

  // 3+ pieces = full bonus
  if (setPieces >= 3) {
    return { defense: 50, fire_resistance: 30 };
  }
  // 2 pieces = partial bonus
  if (setPieces >= 2) {
    return { defense: 20 };
  }
  return {};
});
```

**Example 4: Multiple Sources Combined**

Combine character stats with global properties:

```typescript
game.registerStatComputer("combatPower", (character) => {
  const strength = character.getStat("strength").value || 0;
  const worldBonus = Number(game.getProperty("combat_bonus")?.currentValue) || 0;

  return {
    attack: (strength * 2) + worldBonus
  };
});
```

---

### Step-by-Step: Adding a Computed Stat

**Step 1: Register the computer in your game script**

```typescript
game.registerStatComputer("enduranceToStamina", (character) => {
  const endurance = character.getStat("endurance").value || 0;
  return {
    stamina: endurance * 10
  };
});
```

**Step 2: Add to template or status**

In **Characters → Character Templates**, add to `computed_stats`:

```
computed_stats: ["enduranceToStamina"]
```

**Result:** Characters with this template now get +10 Stamina per point of Endurance, updating automatically when Endurance changes.

---

### Important Notes

**Return only what changes** - Your function should return only the stats you want to add. Return an empty object `{}` if no bonus applies.

**Results are cached** - Results are cached and only recalculate when dependencies change - not on every access.

**Order matters** - Computed stats are calculated in order. If one depends on another's result, list dependencies first.

**Works with statuses too** - Add `computed_stats` to any status(remember everything is a status, including items and skills) for temporary computed bonuses. A buff could add a relationship that disappears when the buff ends.
