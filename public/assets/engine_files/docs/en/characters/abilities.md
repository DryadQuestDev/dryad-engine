# Abilities

Abilities are **structured data** - the engine provides the data layer, but not specific UI implementations like battle systems or ability menus.

**Why?** Different games need different implementations. A turn-based RPG, an action game, and a card battler all use abilities differently. The engine gives you the data foundation; you build (or use a plugin for) the game-specific logic.

**What the engine provides:**
- Define custom ability fields (damage, cooldown, mana cost - whatever your game needs)
- Store abilities as structured templates
- Grant abilities to characters via statuses
- Modify abilities dynamically (buffs that boost damage, etc.)
- Access merged ability data from your code

**What you provide:**
- The UI (battle screen, anility menu, cooldown display)
- The game logic (what happens when an ability is used)

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

In any status form, find the **ability_modifiers** section and add a modifier:

**Fire Mastery Buff**
- ability_id: fireball
- effects:
  - Effect "main_damage":
    - damage: +25

**How modifiers merge:**
- **Numbers** sum together (damage 50 + modifier 25 = 75)
- **Arrays** concatenate
- **Other types** last value wins

This lets you create buffs like "Fire Mastery: +25 damage to all fire abilities" without editing the base ability.

---

## Accessing Abilities in Code

| Method | Returns |
|--------|---------|
| `character.abilities` | Set of ability IDs the character has |
| `character.getAbility(id)` | Single merged ability (base + all modifiers) |
| `character.getAbilities()` | All abilities as a reactive object |

The merged ability object contains:
- `meta` - presentation fields (name, icon, cooldown, etc.)
- `effects` - object of effect IDs to their aspects

---

## Working Example

The tutorial game includes a complete battle screen example that demonstrates:

- Displaying character abilities in a custom UI
- Iterating through ability effects and aspects
- Using engine components (CharacterFace) in custom scripts
- Registering a game state component

**Files to study:**

| File | Description |
|------|-------------|
| `_core/scripts/battle.mjs` | Vue component with detailed comments explaining the code |
| `_core/styles/battle.css` | Styles for the battle UI |
| `_core/ability_templates.json` | Sample ability definitions (fireball, water_splash, summon_golem) |
| `_core/character_templates.json` | Characters with abilities assigned |

To see it in action, trigger the `{start_battle: true}` action by clicking the 'Battle' debug button.
@en/battle.png

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Define what fields abilities have | Characters > Ability Definitions |
| Create an ability | Characters > Ability Templates |
| Give a character an ability | Add to **abilities** field in any status |
| Buff an existing ability | Add to **ability_modifiers** in a status |
| Access ability data in code | `character.getAbility(id)` |
| See a working example | Study `_core/scripts/battle.mjs` in the tutorial |

