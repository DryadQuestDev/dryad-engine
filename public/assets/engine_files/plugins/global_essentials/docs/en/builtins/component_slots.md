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
| `popup` | `popup_state` | Modal popups. `popup_state` is a **stack** (multiple can be open, rendered on top of each other). Each registered popup may set `mask` on `addComponent` to control its backdrop (omit = default dim, `false` = none, or a CSS color). |
| `progression-tabs` | `progression_state` | Side panel tabs (quests, characters, gallery) |
| `character-tabs` | `progression_sub_state` | Sub-tabs within character sheet |

---

## Injection Slots

Injection slots render **all registered components** together. They act as extension points throughout the UI where you can inject custom content.

Each slot passes **context props** to registered components, giving them access to parent data.

| Slot | Where it appears | Context Props |
|------|------------------|---------------|
| `ability-card-header` | Inside ability card header | `abilityId`, `characterId` |
| `ability-card-meta` | After ability cooldown/costs | `abilityId`, `characterId` |
| `ability-card-footer` | Bottom of ability card | `abilityId`, `characterId` |
| `abilities-viewer-top` | Before ability list | `character` |
| `abilities-viewer-list` | Inside ability list | `character` |
| `abilities-viewer-bottom` | Bottom of abilities viewer | `character` |
| `character-face` | Character face display | `character` |
| `character-list-item` | Inside character face in party list (via `overlaySlot`) | `character` |
| `character-sheet-top` | Top of character sheet (above stats) | |
| `character-sheet-bottom` | Bottom of character sheet (below inventory) | |
| `character-statuses-top` | Inside status list, before items/statuses (inline) | `character` |
| `character-statuses-bottom` | Inside status list, after items/statuses (inline) | `character` |
| `debug-panel` | Debug panel | `activeTabId` |
| `events-container` | Events/dialogue area | `sceneSlots` |
| `exploration-state` | Inside exploration view | `dungeon`, `currentRoom` |
| `inventory` | Inside inventory component | `inventory` |
| `inventory-header` | Header above inventory grid | `inventory` |
| `item-card` | Item card display | `item` |
| `item-choices` | Item choice popups | `item` |
| `item-grid` | Inventory grid area | `items` |
| `menu-after` | After main menu content | `menuState` |
| `menu-before` | Before main menu content | `menuState` |
| `mod-picker` | Inside mod picker UI | `availableMods`, `selectedMods` |
| `navigation-toolbar` | Buttons in map toolbar | |
| `overlay-navigation` | Navigation map overlay | `dungeon`, `choices` |
| `overlay-navigation-side` | Side column next to the navigation overlay (right column in text dungeons, right edge of viewport in screen dungeons) | `dungeon` |
| `scene-content-top` | Above scene dialogue content (text dungeons) | `sceneId` |
| `scene-content-bottom` | Below scene choices (text dungeons) | `sceneId` |
| `progression-container` | Progression side panel | `activeTab`, `selectedCharacter` |
| `quests-tab` | Quests panel | `selectedQuest` |
| `replay-custom-block` | Custom content in replay mode | `replayMode`, `data` |
| `ui-container` | Main UI layer | |

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

> **Hoist:** Overlays render below the UI layer (z-index 300 vs 400). To render an overlay **above** the UI, add the `overlay-hoist` class to its root element. This bumps the overlay wrapper to z-index 500.

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

