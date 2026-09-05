# Game States Reference

All built-in game states you can read and write using `game.getState()` and `game.setState()`, or via the `state` action (`{state: "disable_ui=true"}`).

`game.getState()` throws on an unregistered key. To read a state a **mod** owns, ask first:

```javascript
const on = game.hasState('mod_flag') && game.getState('mod_flag');
```

---

## UI States

| State | Default | Description |
|-------|---------|-------------|
| `game_state` | `"exploration" but can be set to a custom state in General->Manifest` | Main game view state (used by `game_state` component slot) |
| `overlay_state` | `"overlay-navigation"` | Overlay layer state |
| `popup_state` | `[]` | Open popup stack (array of popup ids; last = topmost) |
| `progression_state` | `null` | Side panel tab (quests, character, gallery) |
| `progression_sub_state` | `null` | Character sheet sub-tab |
| `suppress_character_progression` | `false` | When true, clicking a character in the character list only updates `selected_character` and skips opening the progression overlay. Use when the game renders the character sheet elsewhere (e.g., a side panel) and doesn't want the full-page overlay on every click. |
| `gallery_tab` | `"characters"` | Active gallery tab |
| `show_character_list` | `true` | Whether to show party character list |
| `actor_list_expanded` | `true` | Whether the scene actor rail's faces are expanded. The player folds them away with the eye icon on the panel itself (top-right); the panel and its icon exist only while actors are staged. Distinct from `hide_actor_list`, which removes the panel entirely |
| `hide_actor_list` | `false` | Hide the scene actor rail (staged non-party characters, shown top-right, opposite the party list). The rail already hides itself when nothing is staged — use this to suppress it for a beat without hiding the whole event layer the way `hide_events` does |
| `disable_ui` | `false` | Disable all UI interactions |
| `block_scene_advance` | `false` | Block scene advancement clicks/keys without disabling UI |
| `block_party_inventory` | `false` | Block access to party inventory |

---

## Selection States

| State | Default | Description |
|-------|---------|-------------|
| `selected_character` | `null` | Currently viewed character in character sheet |
| `active_character` | `null` | Character being interacted with |
| `active_inventory` | `null` | Currently open inventory ID |
| `active_item` | `null` | Currently selected item UID |

---

## Map States

| State | Default | Description |
|-------|---------|-------------|
| `map_zoom_factor` | `1` | Current map zoom level |
| `hide_map` | `false` | Hide the map (map dungeons) or background screen image (screen dungeons). Hides the whole map/screen layer, including room circles and encounter markers. No effect on `text` dungeons. |

---

## Quest States

| State | Default | Description |
|-------|---------|-------------|
| `is_show_completed_quests` | `false` | Whether to show completed quests in quest log |

---

## Achievement States

| State | Default | Description |
|-------|---------|-------------|
| `accolades_filter` | `"all"` | Achievements tab view filter — `"all"`, `"earned"` (only completed) or `"locked"` (only outstanding). The summary, tier ladder and group counts always score the whole catalog |
| `accolades_frozen` | `false` | Freezes accolade progress writes — set by debug tooling so seeding doesn't earn achievements |

---

---

## System States

| State | Default | Description |
|-------|---------|-------------|
| `supress_game_events` | `false` | Suppress game event triggers |
| `hide_events` | `false` | Hide the active scene's event UI and background assets (used by full-screen takeovers like battles or a game-over screen) |
| `disable_saves` | `false` | Disable save functionality |
| `replay_mode` | `false` | Whether game is in replay mode |
| `replay_mode_unlock_choices` | `false` | Unlock all choices in replay mode |
| `replay_mode_unlock_scenes` | `false` | Open every gallery scene for replay, including ones the player never reached |
| `max_log` | `40` | Maximum number of log entries |
| `reading_book` | `null` | Active book-reader session `{ itemId, base, page }`; cleared when the scene closes |
| `book_bookmarks` | `{}` | Per-item saved page `{ itemId: page }`; cleared when a book is finished |
| `choose_item_pending` | `null` | Filter/options of the open choose_item picker |
| `chosen_item_id` | `''` | Template id of the last choose_item pick (`''` after a cancel) |

