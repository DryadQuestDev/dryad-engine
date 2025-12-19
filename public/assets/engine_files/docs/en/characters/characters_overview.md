# Character System Overview

## Everything is Layers

If you've read about how games in Dryad Engine are built from layers of mods, you already understand how characters work. The same principle applies:

- **Games** = layers of mods (base game + expansions)
- **Characters** = layers of statuses (base template + items + skills + effects)

Just like a mod can override or extend the base game, a status can override or extend a character's base values.

---

## What is a Status?

A status is a bundle of changes that can be applied to a character. Think of it like a transparent overlay - it can add new values, change existing ones, or enable visual elements.

Every status can contain:
- **Stats** (numbers like health, strength)
- **Traits** (custom data like name, portrait)
- **Attributes** (categories like mood, pose)
- **Skin Layers** (visual pieces like hair, clothes)
- **Abilities** (what the character can do)

### Where Do Statuses Come From?

**1. The Character Template** (always present)
This is the base layer - the character's starting state. It defines who they are before anything else happens.

**2. Equipped Items**
When a character wears armor or holds a weapon, that item adds its status. Unequip it, and the status is removed.

**3. Learned Skills**
When a character learns a skill, that skill's status is applied. More powerful skills = more impactful status.

**4. Applied Effects**
Buffs, curses, blessings, poison - any temporary condition is a status that gets added on top.

---

## How Layers Combine

When multiple statuses define the same thing, the engine needs to decide what to do. Different types of values combine differently:

### Stats: Add Them Up

If the base template gives +100 Health, an equipped sword gives +20 Health, and a buff gives +50 Health, the character has 170 Health total.

Think of it like stacking bonuses in any RPG.

### Traits & Attributes: Last One Wins

If the base template sets the character's name to "Alice" and then a curse status sets it to "Cursed Alice", the character's name becomes "Cursed Alice".

Think of it like overlapping stickers - the top sticker covers what's below.

### Skin Layers: Show Everything

If the base template enables the body layer and hair layer, and an item adds an outfit layer, all three layers display together.

Think of it like getting dressed - you don't remove your body when you put on clothes.

### Abilities: Collect All

If the base gives "slash" and a skill gives "fireball", the character can use both.

---

## The Editor Forms

In the **Characters** tab of the editor, you'll find several forms. Each one defines a different aspect of how characters work.

### Character Stats

**What they are:** Numbers that matter during gameplay.

**Examples from the tutorial game:**
- **Health** - Your physical condition. Run out and you die.
- **Stamina** - Short-term energy for actions like sprinting.
- **Fashion** - How well your outfit matches the situation.
- **Endurance** - Long-term fitness. Each point also gives +10 Stamina for each point which is explained in ->characters.characters_computed

**Special options:**
- **Is Resource** - Has a current/max value (like Health 50/100)
- **Is Replenishable** - Automatically refills when gained
- **Precision** - How many decimal places to track

**When to use:** Any number that affects gameplay - combat stats, progress counters.

---

### Character Traits

**What they are:** Custom data you want to store about a character.

Unlike stats (which are always numbers), traits can be anything:
- Text (name, biography)
- Numbers (age, level)
- Colors (hair color, aura color)
- Images (portrait, icon)
- Lists (tags, keywords)
- Rich text (detailed descriptions with formatting)

**Examples:**
- **name** - The character's display name
- **title_color** - Custom color for their name in UI

**When to use:** Anything that isn't a gameplay number - identity, appearance data, custom properties.

---

### Character Attributes

**What they are:** Categories with a fixed set of options.

Unlike traits (which can be any value), attributes choose from predefined options. This makes them perfect for driving visual changes.

**Examples from the tutorial game:**
- **sex** - Options: male, female
- **mood** - Options: normal, anxious, blush, confused
- **hairstyle** - Options: 1, 2, 3
- **mc_outfit** - Options: 0, 1, 2, 3

**How they work:**
When you create an attribute, you define all possible values. Then skin layers can watch that attribute and show different images based on its current value.

**When to use:** Anything where you have a fixed set of visual or state options.

---

### Character Skin Layers

**What they are:** Visual pieces that stack to create a character's appearance.

Each layer is an image (or set of images) that renders at a specific depth. Lower z-index = further back. Higher z-index = further front.

**Examples from the tutorial game:**
- **mc_base** (z-index: 0) - The body
- **mc_eyes** (z-index: 1) - The eyes
- **mc_hair_back** (z-index: -1) - Hair behind the body
- **mc_outfit** (z-index: 5) - Clothing on top

**Key fields:**
- **z_index** - Stacking order (negative = behind, positive = in front)
- **attributes** - Which attributes control this layer's appearance
- **images** - Different image files for different attribute combinations

**How attribute-driven images work:**

If a layer is controlled by "mood" and "hairstyle" attributes, you provide images for each combination:
- face_happy_short
- face_happy_long
- face_sad_short
- face_sad_long

The engine automatically picks the right image based on current attribute values.

**Layer styles:**

The `styles` field lets you apply custom CSS classes to a skin layer. This is useful for color variations without needing separate image files.

The engine includes built-in color classes that shift red-colored assets to other colors using CSS filters:

| Class | Effect |
|-------|--------|
| `blue_default` | Shifts red to blue |
| `cyan_default` | Shifts red to cyan |
| `brown_default` | Shifts red to brown |
| `green_default` | Shifts red to green |
| `pink_default` | Shifts red to pink |
| `violet_default` | Shifts red to violet |
| `yellow_default` | Shifts red to yellow |
| `orange_default` | Shifts red to orange |
| `silver_default` | Shifts red to silver/gray |
| `black_default` | Shifts red to black |

**Example:** Create hair assets in red, then use `styles: ["brown_default"]` for brown hair or `styles: ["yellow_default"]` for blonde. One set of images, multiple color options.

You can define your own color classes in your game's CSS file using the `.character-doll-image.classname` selector with CSS filter properties.

---

### Character Statuses

**What they are:** Pre-made bundles of changes you can apply to characters.

While items and skills automatically create their own statuses, you can also define standalone statuses for effects like buffs, debuffs, and conditions.

**Key fields:**
- **max_stacks** - How many times this status can stack (poison stacking 3 times)
- **duration** - How long it lasts (if temporary)
- **stats/traits/attributes/skin_layers** - What changes when applied

**Examples:**
- **Blessed** - +50 Health, +20 Strength, glowing aura layer
- **Poisoned** - -5 Health per turn, max 3 stacks, green tint layer
- **Stunned** - Can't use abilities, stunned expression attribute

---

### Character Templates

**What they are:** Complete character definitions - the blueprints.

A template combines everything above into one package. It defines a character's starting state before any items, skills, or effects modify them.

**Key fields:**
- **auto_create** - Automatically create this character when the game starts
- **add_to_party** - Automatically add to player's party
- **stats** - Starting stat values
- **traits** - Starting traits (name, etc.)
- **attributes** - Starting attribute values
- **skin_layers** - Which layers to display
- **item_slots** - Where equipment goes (with positions)
- **skill_trees** - Which skill trees this character can learn from

---

## Quick Reference

| I want to... | Use this form |
|--------------|---------------|
| Add a number like Health or Damage | Character Stats |
| Store custom data like name or portrait | Character Traits |
| Create options like mood or pose | Character Attributes |
| Define visual pieces for appearance | Character Skin Layers |
| Create a buff/debuff/condition | Character Statuses |
| Define a complete character | Character Templates |

---

## Next Steps

- ->characters.characters_computed - Computed stats and scripting features
- ->items.items_overview - How items work with the status system
- ->characters.characters_api - Character API reference
