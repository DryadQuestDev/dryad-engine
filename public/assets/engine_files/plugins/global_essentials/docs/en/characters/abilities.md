# Abilities

The engine provides a complete ability system:

1. **Define & Author** — create ability definitions (fields like damage, cooldown, element) and ability templates in the editor
2. **Attach** — grant abilities to characters through templates, items, skill trees, or buff statuses
3. **Trigger Battle** — the built-in **Auto Battler** plugin consumes your abilities for a grid-based battle system with formations, AI, tokens, and damage formulas

You can use everything out of the box, or build your own battle system (or use a community plugin) on top of the same data layer.

---

## Abilities Are Part of the Status System

Like everything in the character system, abilities are granted through statuses:

- **Character template** - base abilities the character starts with
- **Equipped item** - abilities granted while wearing the item
- **Learned skill** - permanent abilities from skill trees
- **Applied buff** - temporary abilities from effects

When a status with abilities is added, the character gains those abilities. When removed, they lose them.

---

## The Two-Layer System

### 1. Ability Definitions

First, define what **fields** abilities can have in your game.

Go to **Characters > Ability Definitions** and create fields like:

| Field | Type | Role |
|-------|------|------|
| name | string | meta |
| icon | image | meta |
| cooldown | number | meta |
| damage | number | aspect |
| element | chooseOne (fire, ice, lightning) | aspect |

Each field has a **role**:
- **meta** - Presentation data (name, icon, description, cooldown)
- **aspect** - Mechanical data (damage, range, element type)

Think of definitions as "what CAN an ability have?" - you're designing the structure.

### 2. Ability Templates

Then create actual abilities using those fields.

Go to **Characters > Ability Templates** and create abilities like:

**Fireball**
- **meta section:**
  - name: "Fireball"
  - icon: (select image)
  - cooldown: 3
- **effects section:**
  - Effect "main_damage":
    - damage: 50
    - element: fire
  - Effect "burn":
    - damage: 10
    - element: fire

**Why effects are a list:** One ability can do multiple things. Fireball might deal direct damage AND apply a burn effect. Each effect has its own aspects.

---

## Granting Abilities

Add abilities to any status via the **abilities** field in the editor.

**In a character template:**
Go to **Characters > Character Templates**, select your character, and in the abilities field select the abilities you want.

**In an item:**
Go to **Characters > Item Templates**, select your item, and add abilities to the abilities field.

**In a buff status:**
Go to **Characters > Character Statuses**, create a buff, and add abilities to grant while the buff is active.

Characters accumulate abilities from all their active statuses. The same ability from multiple sources doesn't duplicate - each ability ID appears once.

---

## Ability Modifiers

Statuses can also **modify** existing abilities without changing the base template.

In any status form, the **abilities** section uses the same form as ability templates. To create a modifier, set the `modifies` field to the ID of the ability you want to modify, then fill in the fields you want to change:

**Fire Mastery Buff**
- modifies: fireball
- effects:
  - Effect "main_damage":
    - damage: +25

**How modifiers merge:**
- **Numbers** sum together (damage 50 + modifier 25 = 75)
- **Arrays** concatenate
- **Other types** last value wins

This lets you create buffs like "Fire Mastery: +25 damage to Fireball" without editing the base ability template.

---

## Accessing Abilities in Code

| Method | Returns |
|--------|---------|
| `character.abilities` | Set of ability IDs the character has |
| `character.getAbility(id)` | Single merged ability (base + all modifiers) |
| `character.getAbilities()` | All abilities as a reactive object |
| `character.addAbility(id)` | Add an ability template to the character (persists through save/load) |
| `character.removeAbility(id)` | Remove an ability from the character |

The merged ability object contains:
- `meta` - presentation fields (name, icon, cooldown, etc.)
- `effects` - object of effect IDs to their aspects

Each effect record may contain `__name` (the effect's display name from the template or modifier). This is a reserved key - skip it when iterating aspects:

```js
const ability = character.getAbility("fireball");
for (const effectId in ability.effects) {
    const effect = ability.effects[effectId];
    const effectName = effect.__name; // "Fire Strike"
    for (const aspectId in effect) {
        if (aspectId.startsWith('__')) continue; // skip reserved keys
        // process aspect...
    }
}
```

---

## Battle Systems & Plugins

The engine provides the ability data layer, but the battle system itself is handled by plugins.

**Built-in: Auto Battler plugin** — a grid-based auto battler with formations, tokens, AI targeting, and damage formulas. Enable it in your game's manifest and define abilities using its format (damage, damage_type, range, area_shape, etc.). See the Auto Battler plugin docs for details.

**Custom or community plugins** — you can build your own battle system or use community plugins. The ability API gives you everything you need: `character.getAbilities()` for data, `character.getAbility(id)` for merged values, and `game.buildAbilityEffectsDescription()` for auto-generated tooltips. Your plugin just provides the UI and game logic on top.

---

## Auto-Generated Descriptions

Ability definitions with `ingame_description` templates can auto-generate player-facing text. Set these on **aspect** or **meta** role definitions:

- **ingame_description** - Template string. `[v]` = this aspect's value, `[sibling_id]` = another aspect's value in the same effect.
- **ingame_description_ref** - For fromFile definitions, the dot-path to the display name (e.g., `"name"`, `"traits.name"`). Falls back to `"name"`, then raw ID.

Aspects without `ingame_description` are silently skipped (useful for auxiliary fields like `damage_type` that are consumed by other templates).

```js
// Grouped by effect (default)
const effects = game.buildAbilityEffectsDescription("fireball");
// [
//   { name: "Fire Strike", lines: ["Deal 50 fire damage"] },
//   { name: "Burn", lines: ["30% chance", "Deal 10 fire damage", "Apply Burning"] }
// ]

// Flat list (names dropped)
const flat = game.buildAbilityEffectsDescription("fireball", undefined, true);
// ["Deal 50 fire damage", "30% chance", "Deal 10 fire damage", "Apply Burning"]

// With character modifiers applied
const merged = game.buildAbilityEffectsDescription("fireball", "player_1");
// Uses merged ability data (base + all modifier buffs)

// Meta descriptions (range, charges, requirements)
const meta = game.buildAbilityMetaDescription("fireball");
// ["Range: <b>3</b>", "Charges: <b>2</b>"]
```

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Define what fields abilities have | Characters > Ability Definitions |
| Create an ability | Characters > Ability Templates |
| Give a character an ability | Add to **abilities** field in any status |
| Add an ability from code | `character.addAbility(id)` |
| Remove an ability from code | `character.removeAbility(id)` |
| Buff an existing ability | Add to **ability_modifiers** in a status |
| Access ability data in code | `character.getAbility(id)` |
| Use a battle system | Enable the Auto Battler plugin or build your own |

