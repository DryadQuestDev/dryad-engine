# Exported Components Reference

All Vue components exported through `window.engine.components`.

---

# General

## CustomComponentContainer

Renders all custom components registered to a specific slot. Used to inject custom UI into predefined slots throughout the game.

**Props:**
- `slot` (string, required) - The slot ID to render components for
- `context` (object, optional) - Props to pass to all child components. Context props are merged with each component's own props, with component props taking precedence.

**Behavior:**
- Context props allow parent components to share data with injected custom components
- See ->builtins.component_slots for available slots and their context props

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
- `formatNumbers` (boolean, optional) - Format numbers with thousand separators (e.g., `100,000` instead of `100000`) (default: `false`)

---

## Savelist

The engine's save/load list — the same component the menu renders. Lists every save slot for the game with its name, date, playtime and `(game + mods)` versions; clicking a row loads it. Useful for a game-over screen that has to offer a way back without sending the player through the menu.

**Props:**
- `gameId` (string | null, required) - Which game's slots to list. Normally `game.getId()`.
- `isFromGame` (boolean, required) - `true` adds the save-name field, "Save Locally" and "Save to File" (the in-menu form). `false` leaves loading only: the slot list plus "Load from File".

**Example:**
```js
const { Savelist } = window.engine.components;

export const FallenPopup = defineComponent({
  components: { Savelist },
  setup() {
    return { gameId: game.getId() };
  },
  template: /*html*/`
    <div class="fallen-popup">
      <h1>She has fallen</h1>
      <Savelist :game-id="gameId" :is-from-game="false" />
    </div>
  `,
});
```

The list sizes itself with `flex-grow: 1` and scrolls internally, so give the wrapper `display: flex; flex-direction: column` and a bounded height.

---

# Characters

## CharacterFace

Renders a character's face portrait. Uses either a static face image (from `face_static` trait) or falls back to a cropped CharacterDoll.

**Props:**
- `character` (Character, optional) - The character to display
- `showName` (boolean, optional) - Show character name label (default: `false`)
- `nameStyle` ("badge" | "overlay", optional) - Name display style (default: `"badge"`)
  - `"badge"` - Name in a pill below the face, extends outside bounds
  - `"overlay"` - Name inside the face at the bottom, semi-transparent background
- `size` (number, optional) - Face size in pixels (default: `100`)
- `borderRadius` (string, optional) - CSS border-radius value (default: `"50%"` for circle, use `"8px"` for rounded square, `"0"` for square)
- `borderColor` (string, optional) - Outline color for the face (default: `"rgb(174, 174, 174)"`)
- `noWrapper` (boolean, optional) - Skip the wrapper div and render just the face element. Use for inline layouts where the column wrapper is unwanted (default: `false`)

---

## CharacterDoll

Renders a full character doll with all skin layers composited together. Supports view-based rendering for alternative perspectives.

**Props:**
- `character` (Character, required) - The character to display
- `view` (string, optional) - Render a specific character view (e.g. `'back'`). When set, only layers tagged with that view are rendered. Base (viewless) layers are excluded. See ->characters.character_views
- `instantLayers` (boolean, optional) - Disables the fade transition on skin layer changes. Use for combat animations where layer swaps should be immediate (default: `false`)

---

## CharacterSheet

Default character sheet layout with vertical sections for statuses, stats, and abilities. Automatically shows/hides sections based on character data. The party inventory lives in its own `inventory` character tab.

**Props:**
- `character` (Character, required) - The character to display
- `viewerMode` (boolean, optional) - Read-only embed: hides the dismiss and rename controls

Stat groups are controlled via `game.registerStatGroupResolver()`. See [Character API](../characters/characters_api.md).

---

## CharacterStats

Displays character stats organized into groups. Uses the registered stat group resolver to determine which groups to show per character. Without a resolver, defaults to "Resources" and "Stats" groups.

**Props:**
- `character` (Character, required) - The character whose stats to display
- `tags` (string[], optional) - Filter stats by these tag names. Overrides the resolver when provided.
- `noHeaders` (boolean, optional) - Hide group headers (default: `false`)

**Example:**
```html
<!-- Show only fertilization stats, no headers -->
<CharacterStats :character="mc" :tags="['fertilization']" :no-headers="true" />
```

---

## CharacterStatuses

Displays equipped items and character statuses as compact "bricks" in a flex-wrap row. Items render first, then statuses. Hovering an item shows an ItemCard popup; hovering a status shows description, stats, and ability details.

Supports two component slots for plugins to inject inline content:
- `character-statuses-top` — renders before items/statuses
- `character-statuses-bottom` — renders after items/statuses

Both slots render inside the same flex container, so injected components participate in the brick layout.

**Props:**
- `character` (Character, required) - The character to display
- `showItems` (boolean, optional) - Show equipped item bricks (default: `true`)
- `showStatuses` (boolean, optional) - Show status effect bricks (default: `true`)

**Example:**
```html
<!-- Show both items and statuses (default) -->
<CharacterStatuses :character="myCharacter" />

<!-- Statuses only -->
<CharacterStatuses :character="myCharacter" :showItems="false" />

<!-- Items only -->
<CharacterStatuses :character="myCharacter" :showStatuses="false" />
```

**Slot injection:**
```js
game.addComponent({
  id: 'my_plugin_extra_bricks',
  slot: 'character-statuses-bottom',
  component: MyBricksComponent,
});
```

---

## CharacterSlot

Renders a character in a scene slot with full animation support. Handles positioning, transforms, filters, and can optionally show item slots overlay.

**Props:**
- `character` (Character, required) - The character to display
- `slot` (`Partial<SceneSlot>`, required) - Scene slot configuration with position, transforms, and animation data
- `showItemSlots` (boolean, optional) - Whether to show equipped item slots
- `enableAppear` (boolean, optional) - Enable appear animations
- `view` (string, optional) - Character view override passed to CharacterDoll (e.g. `'back'`). See ->characters.character_views
- `interactive` (boolean, optional) - Enables pointer-events on the slot, allowing click/hover handling (default: `false`)
- `overlaySlot` (string, optional) - Slot name for overlay injection inside the character content area. Works the same as `CharacterFace.overlaySlot` — register components via `game.addComponent()` targeting this slot name
- `instantLayers` (boolean, optional) - Disables the fade transition on skin layer changes. Use for combat animations where layer swaps should be immediate (default: `false`)

---

## CharacterViewer

Displays a character doll with stats/statuses panel. Supports single or multiple characters with a face list for switching between them. Auto-hides face list when displaying a single character. The face list pages at 10 characters, with prev/next controls; the page follows the selection, so `initialIndex` opens on the page holding that character. Item interaction is always disabled.

**Props:**
- `characters` (Character | Character[], required) - Single character or array of characters to display
- `initialIndex` (number, optional) - Starting index for character selection (default: 0)

**Emits:**
- `select` - When a character is selected, provides (character, index)

---

## CharacterViewerPopup

Fullscreen popup overlay wrapping CharacterViewer. Teleports to `<body>`, renders a dark overlay with a centered popup containing the CharacterViewer. Clicking the overlay backdrop or close button dismisses it. Parent controls visibility via `v-if`.

**Props:**
- `characters` (Character[], required) - Array of characters to display
- `initialIndex` (number, optional) - Starting index for character selection (default: 0)

**Emits:**
- `close` - When the popup should close (overlay click or close button)

**Example:**
```js
const viewerChars = vue.ref(null);
const viewerIndex = vue.ref(0);

function openViewer(characters, index) {
  viewerChars.value = characters;
  viewerIndex.value = index;
}

function closeViewer() {
  viewerChars.value = null;
}
```
```html
<CharacterViewerPopup v-if="viewerChars"
    :characters="viewerChars" :initialIndex="viewerIndex" @close="closeViewer" />
```

---

## CharacterRename

Inline character name editor with validation. Displays character name with edit icon - click to enter edit mode with input field and save/cancel buttons.

**Props:**
- `character` (Character, required) - The character whose name to display/edit
- `maxLength` (number, optional) - Maximum name length (default: 50)

**Emits:**
- `rename` - When name is saved, provides (oldName, newName)

**Example:**
```js
// Basic usage
<CharacterRename :character="myCharacter" />

// With max length and event handler
<CharacterRename
  :character="myCharacter"
  :maxLength="30"
  @rename="(oldName, newName) => console.log('Renamed:', oldName, '->', newName)"
/>
```

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
- `character` (Character, optional) - Reference character for the "equippable" filter. Defaults to the selected character.
- `maxHeight` (string, optional, default `'400px'`) - CSS max-height of the item grid. Pass `'none'` to let it fill the available height instead (what the `inventory` character tab does).

---

## InventoryHeader

Displays inventory header with item count and weight statistics.

**Props:**
- `inventory_id` (string, required) - The ID of the inventory

---

## ItemGrid

Renders a grid of items, one ItemSlot per entry, and starts the drag payload. Card, pin and double-click behavior all come from ItemSlot.

**Props:**
- `items` ((Item | null)[], required) - Array of items to display. Null values render as empty slots.
- `disabled` (boolean, optional) - Disables item choices while keeping the hover card
- `maxHeight` (string, optional, default `'400px'`) - CSS max-height of the scrolling grid. Pass `'none'` to let it fill its container.

---

## ItemSlot

Renders a single item slot with icon, quantity badge, and durability indicator.

Hovering shows the item card; clicking pins it (click again, or outside, to unpin); double-clicking equips the item into its first free compatible slot, or unequips it when it is worn. Double-click is equip-only — consumables, books and recipes keep to their explicit choice buttons, so a mis-click can't spend one. It goes through the same `item_equip_before` / `item_unequip_before` veto and the same `canUseItems()` check as those buttons.

**Props:**
- `item` (Item, required) - The item to display
- `characterId` (string, optional) - Character the card's choices and the double-click act on. Defaults to the selected character.
- `disabled` (boolean, optional) - Disables click, double-click and drag while keeping the hover card
- `popupPlacement` (Placement, optional, default `'right-start'`) - Where the item card anchors
- `popupNoChoices` (boolean, optional) - Hide the card's choice buttons, and disable double-click equip along with them
- `popupDismissOnClick` (boolean, optional) - Clicking the slot closes its card instead of pinning it — for slots whose click opens their own UI
- `noPopup` (boolean, optional) - Suppress the card entirely — for click-to-choose pickers where a floating card would cover the slots

**Emits:**
- `click` - When item is clicked
- `dragstart` - When drag starts

---

## ItemSlots

Displays equipped item slots for a character. Shows all item slots with their equipped items and handles item popup/actions.

**Props:**
- `character` (Character, required) - The character whose equipped items to display
- `disabled` (boolean, optional) - Disables item click/drag while keeping hover tooltips
- `layout` (string, optional) - `'doll'` (default) positions slots over a character portrait via each slot's `x`/`y` coordinates. `'row'` renders a flex row of slots (no positioning) — use this in text-based dungeons or in sheet headers where there is no portrait.

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

# Abilities

## AbilityCard

Displays detailed ability information in a card format. Shows the ability icon, name, cooldown (in turns), resource costs (with stat-specific colors), description, and auto-generated effect descriptions.

**Props:**
- `abilityId` (string, required) - The ID of the ability to display
- `characterId` (string, optional) - Character ID to resolve character's merged ability for display. If omitted, shows base template data
- `showDelta` (boolean, optional) - When true and `characterId` is provided, shows base→merged transitions inline in the description (e.g., "Deal 100→120 damage"). New effects (not in base) appear in a separate section with "New" badge
- `improvementData` ({ meta, effects }, optional) - Externally provided modifier delta. Values are raw deltas that get displayed as base→merged transitions inline in the description
- `isGranted` (boolean, optional) - Shows a "Granted" tag in the header. A "Modified" tag is auto-shown when `improvementData` is provided

**Features:**
- Cooldown displayed with ⏱️ icon and turn count
- Resource costs displayed with stat colors from character_stats definitions
- Effect descriptions auto-generated from ability template aspects with `ingame_description`
- Delta transitions shown inline in the description, not as a separate section

**Custom Slots:**
- `ability-card-header` - Inside the header, after the ability name. Use for custom badges or tags.
- `ability-card-meta` - Inside the meta section, after costs. Use for additional stat displays.
- `ability-card-footer` - At the bottom of the card. Use for action buttons (e.g., "Use Ability").

**Slot Context:** All slots receive `abilityId` (string) and `characterId` (string | undefined) as props.

---

## StatusObjectDisplay

Renders stats and abilities from a `BaseStatusObject`. Filters stat visibility, displays granted abilities as AbilityCards, and shows modifier-only abilities with a "Modification" label. Used internally by item popups, status popups, and skill popups.

**Props:**
- `data` (BaseStatusObject, required) - The status object containing `stats`, `abilities`, and `ability_modifiers`
- `stacks` (number, optional) - Stack multiplier passed to stats display (e.g., status stacks)
- `multiplier` (number, optional) - Level multiplier passed to stats display (e.g., skill level)
- `isActive` (boolean, optional) - Whether stats are active (default: `true`). Inactive stats show dimmed header

**Example:**
```js
// Display an item's stats + abilities
<StatusObjectDisplay :data="item.statusObject" />

// Display a status with stacks
<StatusObjectDisplay :data="statusData" :stacks="3" />
```

---

## StatusBrick

Renders a single status as a compact "brick" (icon or name, polarity-colored border) with a StatusCard popup on hover. The same brick CharacterStatuses uses, exposed for standalone use — status pickers, codex entries, sire badges. Works applied or unapplied.

**Props:**
- `status` (string | Status | object, required) - A status template id, a status def object, or an applied Status instance
- `characterId` (string, optional) - Owning character; enables live stack/duration badges and computed-stat resolution in the hover card
- `statusInstanceIndex` (number, optional) - Instance index for a multi-stack status on that character
- `disableClick` (boolean, optional) - When true, clicking the brick does nothing to the hover card (no pin); use when the brick's click is handled for selection

**Example:**
```js
// By template id (unapplied — shows the definition)
<StatusBrick status="strain_ember" />

// Applied to a character (live stacks/duration)
<StatusBrick :status="myStatus" :character-id="character.id" />
```

---

## StatusCard

The full status detail card — title, description, stacks/duration, and its stat block. This is what `StatusBrick` shows on hover, exposed on its own so you can mount it as a popover on any element of your choosing (a table row, a list item, a custom picker). Reads the definition from `character_statuses`, so an unapplied status renders fine.

**Props:**
- `statusId` (string, required) - Status template id
- `characterId` (string, optional) - Owning character; switches the card to that character's live instance for stacks, duration and computed stats
- `statusInstanceIndex` (number, optional) - Which instance to read for a multi-stack status on that character
- `titleChip` (string, optional) - Small chip shown left of the title (e.g. `"Consume"`)
- `stacksOverride` (number, optional) - Explicit stack count for previews where the status is not applied yet

**Example:**
```js
// As a hover popover on your own row (the v-popover directive)
const StatusCard = markRaw(game.getComponent('StatusCard'));
const binding = (id) => ({ component: StatusCard, props: { statusId: id }, placement: 'right-start' });
// <tr v-popover="binding(row.id)"> ... </tr>

// Inline, bound to a character's live instance
<StatusCard status-id="burn" :character-id="character.id" />
```

---

## AbilitiesViewer

Lists a character's abilities as selectable items. Shows ability icons and names in a horizontal list. Selecting an ability displays its full details via AbilityCard.

**Props:**
- `character` (Character, required) - The character whose abilities to display
- `showDelta` (boolean, optional) - Whether to show base➜merged transitions in ability descriptions (default: `false`)

**Behavior:**
- Auto-selects first ability on mount
- Shows "No abilities" message when character has none
- Selected ability highlighted with accent color

**Custom Slots:**
- `abilities-viewer-top` - Before the ability list. Use for filters or search input.
- `abilities-viewer-list` - Inside the ability list, after the ability items. Use for "Add Ability" buttons.
- `abilities-viewer-bottom` - At the bottom of the viewer. Use for global actions.

**Slot Context:** All slots receive `character` (Character) as a prop.

---

# Assets

## BackgroundAsset

Renders a scene asset (image, video, or spine animation) with full transform support including position, scale, rotation, alpha, blur, and various filter effects.

**Props:**
- `asset` (SceneAsset, required) - The asset data object containing file path and transform properties

---

# Exporting Plugin Components

Plugins can register their own reusable components to `window.engine.components`, making them available to other plugins and game scripts.

## Registering a Component

Use `game.registerComponent(name, component)` in your plugin's main script:

```js
// plugins/my_plugin/scripts/main.mjs
const { game, vue } = window.engine;
const { defineComponent, ref, computed } = vue;

// Define a reusable component
const MyGrid = defineComponent({
  props: ['rows', 'cols'],
  setup(props) {
    const cells = computed(() => {
      const result = [];
      for (let r = 0; r < props.rows; r++) {
        for (let c = 0; c < props.cols; c++) {
          result.push({ row: r, col: c });
        }
      }
      return result;
    });
    return { cells };
  },
  template: `
    <div class="my-grid">
      <div v-for="cell in cells" :key="cell.row + '_' + cell.col">
        {{ cell.row }}, {{ cell.col }}
      </div>
    </div>
  `
});

// Register it for other scripts to use
game.registerComponent('MyGrid', MyGrid);
```

## Using Registered Components

Any script can access registered components via `window.engine.components`:

```js
// Another plugin or game script
const { MyGrid, CharacterFace } = window.engine.components;

const MyScreen = defineComponent({
  components: { MyGrid, CharacterFace },
  template: `
    <div>
      <MyGrid :rows="3" :cols="3" />
      <CharacterFace :character="hero" />
    </div>
  `
});
```

## Getting a Single Component

Use `game.getComponent(name)` to retrieve a component by name:

```js
const MyGrid = game.getComponent('MyGrid');
if (MyGrid) {
  // Component exists, use it
}
```

## Best Practices

1. **Use unique names** - Prefix with your plugin name to avoid collisions (e.g., `AutoBattler_FormationGrid`)
2. **Register early** - Register components in your plugin's main script so they're available when other scripts load
3. **Document your components** - If sharing with other plugins, document the props and events
