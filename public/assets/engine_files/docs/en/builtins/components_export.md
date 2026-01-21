# Exported Components Reference

All Vue components exported through `window.engine.components`.

---

# General

## CustomComponentContainer

Renders all custom components registered to a specific slot. Used to inject custom UI into predefined slots throughout the game.

**Props:**
- `slot` (string, required) - The slot ID to render components for

---

## ProgressBar

Generic animated progress bar for displaying percentage-based values like health, mana, influence, etc.

**Props:**
- `current` (number, required) - Current value
- `max` (number, required) - Maximum value
- `barColor` (string, optional) - Bar fill color (default: `#42b983`)
- `bgColor` (string, optional) - Background color (default: `#555`)
- `width` (string, optional) - Bar width (default: `100px`)
- `height` (string, optional) - Bar height (default: `1.2rem`)
- `hideMax` (boolean, optional) - Hide max value, showing only current (default: `false`)

---

# Characters

## CharacterFace

Renders a character's face portrait. Uses either a static face image (from `face_static` trait) or falls back to a cropped CharacterDoll.

**Props:**
- `character` (Character, optional) - The character to display
- `showName` (boolean, optional) - Show character name in a pill below the face (default: `false`)
- `size` (number, optional) - Face size in pixels (default: `100`)
- `borderRadius` (string, optional) - CSS border-radius value (default: `"50%"` for circle, use `"8px"` for rounded square, `"0"` for square)

---

## CharacterDoll

Renders a full character doll with all skin layers composited together.

**Props:**
- `character` (Character, required) - The character to display

---

## CharacterSheet

Default character sheet layout with vertical sections for statuses, stats, and inventory. Automatically shows/hides sections based on character data.

**Props:**
- `character` (Character, required) - The character to display
- `groups` (StatGroup[], optional) - Custom stat groups. Falls back to `character_stat_groups` state if not provided

**Example - Custom stat groups via state:**
```js
// Wrap in game_initiated to regenerate fresh each session (prevents stale data from saves)
game.on("game_initiated", () => {
  const statsData = game.getData("character_stats", true);
  const statTags = ['combat', 'resources'];
  const groups = [];
  for (const tag of statTags) {
    const stats = Array.from(statsData.values()).filter(stat => stat.tags?.includes(tag));
    groups.push({
      groupName: getLine(tag),  // localized group name
      stats: stats.map(stat => stat.id)
    });
  }
  game.setState("character_stat_groups", groups);
});
```

**Important:** Use `game_initiated` event to set this state. States are serialized with saves, so setting at module load time means old saves restore stale group data instead of using current stat definitions.

Groups with no matching character stats are automatically hidden.

---

## CharacterStats

Displays character stats organized into groups. By default separates resources (health, mana, etc.) from regular stats. Supports custom stat groups.

**Props:**
- `character` (Character, required) - The character whose stats to display
- `groups` (StatGroup[], optional) - Custom stat groups. If not provided, defaults to "Resources" and "Stats" groups

---

## CharacterStatuses

Displays character statuses as "bricks" - compact boxes showing either an image or text name for each status. Hovering shows a popup with status description.

**Props:**
- `character` (Character, required) - The character whose statuses to display

---

## CharacterSlot

Renders a character in a scene slot with full animation support. Handles positioning, transforms, filters, and can optionally show item slots overlay.

**Props:**
- `character` (Character, required) - The character to display
- `slot` (Partial<SceneSlot>, required) - Scene slot configuration with position, transforms, and animation data
- `showItemSlots` (boolean, optional) - Whether to show equipped item slots
- `enableAppear` (boolean, optional) - Enable appear animations

---

## CharacterViewer

Displays a character doll with stats/statuses panel. Supports single or multiple characters with a face list for switching between them. Auto-hides face list when displaying a single character. Item interaction is always disabled.

**Props:**
- `characters` (Character | Character[], required) - Single character or array of characters to display
- `initialIndex` (number, optional) - Starting index for character selection (default: 0)

**Emits:**
- `select` - When a character is selected, provides (character, index)

---

## StatEntity

Renders a single stat entry. Displays as a resource bar for resource-type stats or plain text for regular stats.

**Props:**
- `character` (Character, required) - The character whose stat to display
- `statId` (string, required) - The ID of the stat to display

**Emits:**
- `statHover` - When hovering over a stat with description
- `statLeave` - When mouse leaves the stat

---

# Items

## InventoryComponent

Displays an inventory with item grid. Shows unequipped items with support for fixed-size inventories showing empty slots.

**Props:**
- `inventory_id` (string, required) - The ID of the inventory to display

---

## InventoryHeader

Displays inventory header with item count and weight statistics.

**Props:**
- `inventory_id` (string, required) - The ID of the inventory

---

## ItemGrid

Renders a grid of items with popup support for item details and actions. Handles drag-and-drop and hover interactions.

**Props:**
- `items` ((Item | null)[], required) - Array of items to display. Null values render as empty slots.

---

## ItemSlot

Renders a single item slot with icon, quantity badge, and durability indicator. Handles hover and drag events.

**Props:**
- `item` (Item, required) - The item to display

**Emits:**
- `click` - When item is clicked
- `dragstart` - When drag starts
- `hover` - When hover state changes

---

## ItemSlots

Displays equipped item slots for a character. Shows all item slots with their equipped items and handles item popup/actions.

**Props:**
- `character` (Character, required) - The character whose equipped items to display

---

## ItemCard

Displays detailed item information in a popup card. Shows name, description, stats, weight, and rarity styling.

**Props:**
- `item` (Item, required) - The item to display details for

---

## ItemChoices

Displays available actions/choices for an item (use, equip, drop, etc.).

**Props:**
- `item` (Item, required) - The item to show choices for

---

# Skills

## SkillTree

Renders a skill tree with nodes, connections, and popup descriptions. Supports multiple trees with a selector, panning navigation, and skill learning.

**Props:**
- `character` (Character, required) - The character whose skill trees to display

---

## SkillSlot

Renders a single skill node in a skill tree. Shows skill icon, level progress, and learnable/locked states.

**Props:**
- `skill` (any, required) - The skill slot data
- `character` (Character, required) - The character
- `treeId` (string, required) - The skill tree ID
- `allSkills` (any[], required) - All skills in the tree (for dependency checking)

**Emits:**
- `mouseenter` - When hovering over skill
- `mouseleave` - When mouse leaves skill

---

# Assets

## BackgroundAsset

Renders a scene asset (image, video, or spine animation) with full transform support including position, scale, rotation, alpha, blur, and various filter effects.

**Props:**
- `asset` (SceneAsset, required) - The asset data object containing file path and transform properties
