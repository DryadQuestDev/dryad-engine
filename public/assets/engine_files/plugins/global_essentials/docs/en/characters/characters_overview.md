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

**Exception: Merge mode.** Traits with `is_merge` enabled accumulate across statuses instead. The merge behavior depends on the trait's type:
- **chooseMany** - union (deduplicates entries)
- **array** - concatenate (preserves duplicates)
- **schema** - deep merge objects

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

### Stat Meta

Stats can carry a **meta** data bag too – custom fields you define in the `Stat Meta` editor tab and read from your own scripts or plugins through `game.getData("character_stats", true)`. Once a field is defined, every stat shows it in its form. Plugins define fields of their own: the experience plugin's `scaling` decides how a stat grows on levelled items. A plugin may also fill in another plugin's fields on the stats it defines; the values simply sit unused when that plugin isn't installed.

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

When a layer watches several attributes, the key segments follow each attribute's `order` field (ascending; unset = 0; ties keep the layer's attribute list order). The order is applied when the layer is saved in the editor.

**Toggling whole layers from scripts:**

Simple show/hide layers don't need a dedicated on/off attribute. The `attr` action falls back to layer visibility when the key is a skin layer id: `attr: "mc.wings = true"` shows the layer, `= false` hides it. Conditions can read it the same way: `{_char(mc.attribute.wings) = true}`.

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

### Status Meta

Status effects can carry a **meta** data bag – a set of custom fields you define yourself (in the `Status Meta` editor tab) and read from your own scripts. A burn status might carry `damage_per_turn` and `element`; a buff might carry `power_scaling`. The engine just stores and hands these values back to your game and plugin code, so the same status system flexibly powers whatever mechanics your game needs.

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

**Art Manager:** Every character template, status, item template and skill slot has an **Art Manager** button beside its title. It opens the doll preview with five tabs – Layers, Attributes, Spine, Face and Offset – so a character's whole look is set in one place without hunting through the form:

- **Layers** – tick skin layers on and off. Each row shows the image or animation key the layer resolves to for the current attributes, red when nothing matches, and the pencil saves and jumps to that layer in Skin Layers.
- **Attributes** – pick values from dropdowns; the attributes watched by the selected layers come first.
- **Spine** – add or swap the atlas and skeleton for the selected view, and click an animation or skin chip to force it in the preview.
- **Face** – set the static face image and its precedence, and drag the purple box to position the face crop.
- **Offset** – drag the doll to move it and scroll over it to scale, per view and per asset.

A status, item or skill slot is drawn on top of a character in the game, so its layers often only resolve with that character's layers and attributes. Pick a template under **Preview on character** and the preview applies the entry over it the way the game does: the template's layers render with the entry's, and where both set an attribute the entry's value wins. The pick is remembered in this browser for every status, item and skill slot, and it is never saved. The Attributes tab then shows two columns – the entry's own values, which are saved, and the character's values, which you can change to preview a state such as `battle_state = cast`. A character value is locked wherever the entry sets that attribute: while the entry is applied, the game ignores the character's own value, so changing it with `setAttribute()` shows nothing.

**Stats:** The same four forms carry a **Stats** button next to Art Manager. It opens every character stat as one grid of the usual form fields, sectioned by the Stat Groups tab with a chip per section to filter: the entity's own value is typed straight into its field, and a character template also shows what its starting statuses and default gear add and the total the character is created with. A filter box and an **Only set** toggle keep the list short, and keys that no stat defines are flagged with a remove button. The side column lists the sources (with jump buttons), edits the computed stat keys with suggestions drawn from the rest of the game, and offers three tools: compare against another entity of the same tab, copy another entity's stats, and scale every own stat by a factor.

---

## Quick Reference

| I want to... | Use this form |
|--------------|---------------|
| Add a number like Health or Damage | Character Stats |
| Give the character sheet sections | Stat Groups |
| Attach custom settings to stats | Stat Meta |
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
