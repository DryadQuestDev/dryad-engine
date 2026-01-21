# Component Slots Reference

This page lists all available UI slots where you can register custom Vue components using `game.addComponent()`.

See ->advanced.vue for usage examples.

---

## State-Based Slots

State-based slots show **one component at a time** based on a state value. The slot renders whichever component's `id` matches the current state.

| Slot | State | Description |
|------|-------|-------------|
| `game_state` | `game_state` | Main game view (exploration, battle, custom screens) |
| `overlay` | `overlay_state` | Overlay layer (navigation map, exchange UI) |
| `popup` | `popup_state` | Modal popups |
| `progression-tabs` | `progression_state` | Side panel tabs (quests, characters, gallery) |
| `character-tabs` | `progression_sub_state` | Sub-tabs within character sheet |

---

## Injection Slots

Injection slots render **all registered components** together. They act as extension points throughout the UI where you can inject custom content.

| Slot | Where it appears |
|------|------------------|
| `character-face` | Character face display |
| `character-sheet-top` | Top of character sheet (above stats) |
| `character-sheet-bottom` | Bottom of character sheet (below inventory) |
| `debug-panel` | Debug panel |
| `events-container` | Events/dialogue area |
| `exploration-state` | Inside exploration view |
| `inventory` | Inside inventory component |
| `inventory-header` | Header above inventory grid |
| `item-card` | Item card display |
| `item-choices` | Item choice popups |
| `item-grid` | Inventory grid area |
| `menu-after` | After main menu content |
| `menu-before` | Before main menu content |
| `mod-picker` | Inside mod picker UI |
| `navigation-toolbar` | Buttons in map toolbar |
| `overlay-navigation` | Navigation map overlay |
| `progression-container` | Progression side panel |
| `quests-tab` | Quests panel |
| `replay-custom-block` | Custom content in replay mode |
| `ui-container` | Main UI layer |

---

## Default Components by Slot

### game_state

| ID | Description |
|----|-------------|
| `exploration` | Default exploration/dungeon view |

### overlay

| ID | Description |
|----|-------------|
| `overlay-navigation` | Map navigation overlay |
| `overlay-exchange` | Trade/loot exchange UI |

### progression-tabs

| ID | Description |
|----|-------------|
| `quests` | Quest log |
| `character` | Character sheet |
| `gallery` | Gallery tab |

### character-tabs

| ID | Description | Props |
|----|-------------|-------|
| `stats` | Character stats display | |
| `skill-trees` | Skill tree interface | |
| `inventory` | Party inventory | `inventory_id` |

### debug-tabs

| ID | Description |
|----|-------------|
| `debug-options` | Debug options |
| `debug-dungeons` | Dungeon debugging |
| `debug-characters` | Character debugging |
| `debug-choices` | Choice debugging |
| `debug-registry` | Registry viewer |
| `debug-inventories` | Inventory debugging |
| `debug-stores` | Store debugging |

### navigation-toolbar

| ID | Description |
|----|-------------|
| `toolbar-back` | Back button |
| `toolbar-encounter-nav` | Encounter navigation |
| `toolbar-toggle-circles` | Toggle interaction circles |
| `toolbar-zoom-controls` | Zoom in/out |
| `toolbar-center-room` | Center on current room |
| `toolbar-logs` | Open logs |
| `toolbar-minimize` | Minimize toolbar |

### inventory-header

| ID | Description | Props |
|----|-------------|-------|
| `default-inventory-header` | Default inventory header with filters | `inventory_id` |

### ui-container

| ID | Description |
|----|-------------|
| `character-list` | Party character list panel |

---

## Next Steps

- ->advanced.vue - Vue components overview and examples

