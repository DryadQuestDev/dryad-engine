# Settings

The engine provides two separate settings systems: **Engine Settings** shared across all games, and **Game Settings** specific to each game.

Both are shown to the player in the game menu and can be read/written from scripts.

---

## Engine Settings

Engine-level settings are **shared across all games** and persisted to the browser's localStorage. They survive page refreshes, game restarts, and switching between games.

### Built-in Settings

| ID | Type | Default | Description |
|----|------|---------|-------------|
| `music_volume` | chooseOne (0-100) | 20 | Music volume percentage |
| `sound_volume` | chooseOne (0-100) | 80 | Sound effects volume percentage |
| `font_size` | chooseOne (10-40) | 20 | UI font size in pixels |
| `typing_speed` | chooseOne | fast | Text typing animation speed (none, slow, medium, fast, very_fast) |

### API

```js
// Read
const volume = game.getEngineSetting('music_volume');
const speed = game.getEngineSetting('typing_speed');

// Write (auto-persisted to localStorage)
game.setEngineSetting('music_volume', 50);
game.setEngineSetting('typing_speed', 'none');
```

The player can also change these directly via **Engine Settings** in the game menu.

---

## Game Settings

Game settings are **specific to your game** and persisted in save files. They are defined in the engine editor under **General** tab and shown inside **Game Settings** in the game menu (only visible when at least one setting is defined).

### Defining Settings

Open the engine editor and navigate to **Game Settings**. Each entry has:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier used in code |
| `type` | Value type: `title`, `string`, `number`, `boolean`, `chooseOne`, `chooseMany`, `color` |
| `label` | Display name shown in the menu |
| `tooltip` | Optional help text |
| `default_value` | Initial value (as string) |
| `values` | Available options (for chooseOne/chooseMany) |
| `order` | Display order in the menu |
| `localizeValues` | Whether option values should be passed through locale |

The `title` type creates a section header (not a setting) to organize the menu visually.

### API

```js
// Read
const difficulty = game.getGameSetting('difficulty');
const showHints = game.getGameSetting('show_hints');

// Write (persisted in save files)
game.setGameSetting('difficulty', 'hard');
game.setGameSetting('show_hints', false);
```

### Example: Difficulty Setting

Define in the editor:

| Field | Value |
|-------|-------|
| id | `difficulty` |
| type | `chooseOne` |
| label | `Difficulty` |
| default_value | `normal` |
| values | `easy`, `normal`, `hard` |

Use in scripts:

```js
const diff = game.getGameSetting('difficulty');
const damageMultiplier = diff === 'hard' ? 1.5 : diff === 'easy' ? 0.5 : 1;
```

### Example: Toggle Setting

| Field | Value |
|-------|-------|
| id | `show_damage_numbers` |
| type | `boolean` |
| label | `Show Damage Numbers` |
| default_value | `true` |

```js
if (game.getGameSetting('show_damage_numbers')) {
    // display floating damage text
}
```

---

## Engine vs Game Settings

| | Engine Settings | Game Settings |
|---|---|---|
| **Scope** | All games | One game |
| **Persistence** | Browser localStorage | Save files |
| **Defined by** | Engine (built-in) | Game developer (editor) |
| **Menu location** | Engine Settings | Game Settings |
| **Read** | `game.getEngineSetting(key)` | `game.getGameSetting(key)` |
| **Write** | `game.setEngineSetting(key, value)` | `game.setGameSetting(key, value)` |
