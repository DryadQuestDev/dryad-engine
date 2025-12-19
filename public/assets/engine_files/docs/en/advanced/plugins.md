# Plugins

Dryad Engine provides comprehensive data management through its built-in forms - characters, items, dungeons, and more. But what if your game needs custom data types that don't fit into the standard categories?

Plugins solve this by letting you create your own forms directly in the Engine Editor. Define a custom schema, and the engine generates forms for you to work with your game-specific data.

---

## Creating a Plugin

1. Go to **Dev → Plugins** in the Engine Editor
2. Click **Add** to create a new plugin
3. Give it an ID (e.g., `my_plugin`)
4. Define your custom tabs and schemas

When you save, the engine creates (inside `games_files/[your_game]/[your_game_or_mod]/`):
- `plugins/{pluginId}/plugin.json` - Your plugin definition
- `plugins/{pluginId}/scripts/` - Auto-loaded JavaScript files
- `plugins/{pluginId}/css/` - Auto-loaded stylesheets

Your form data is saved to:
- `plugins_data/{pluginId}/{tabId}.json`

A new tab appears in the Engine Editor with your custom forms.

---

## Plugin Structure

### Meta

Basic information about your plugin:

| Field | Description |
|-------|-------------|
| `name` | Display name shown in the editor |
| `description` | What the plugin does |
| `author` | Who created it |
| `version` | Version number (e.g., "1.0.0") |

### Tabs

Each tab becomes a form in the Engine Editor. Configure:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for the tab |
| `name` | Display name (defaults to id) |
| `isArray` | If true, tab holds multiple items; if false, a single object |
| `schema` | Array of field definitions |

### Schema Fields

Each field in your schema defines one form input:

| Field | Description |
|-------|-------------|
| `propertyId` | Property name in the data object |
| `label` | Display label for the field |
| `tooltip` | Help text shown on hover |
| `type` | Field type (see below) |
| `defaultValue` | Default value for new items |

**Field Types:**

| Type | Description |
|------|-------------|
| `string` | Single-line text input |
| `number` | Numeric input |
| `boolean` | Checkbox toggle |
| `textarea` | Multi-line text |
| `htmlarea` | Rich text editor |
| `chooseOne` | Dropdown select |
| `chooseMany` | Multi-select |
| `string[]` | Array of strings |
| `number[]` | Array of numbers |
| `file` | Single file picker |
| `file[]` | Multiple file picker |
| `schema` | Nested object |
| `schema[]` | Array of nested objects |
| `color` | Color picker |

For `chooseOne` and `chooseMany`, you can:
- Provide static `options` array
- Use `fromFile` to load options from another data file (e.g., `"character_traits"`)

---

## Accessing Plugin Data

Use `game.getData()` with the unified path API:

```javascript
// Get your plugin's data
let myData = game.getData("plugins_data/my_plugin/my_tab");

// Iterate over items (if isArray: true)
for (let [id, item] of myData) {
  console.log(item.name, item.customField);
}
```

The path follows the same pattern as other game data files.

---

## Auto-Loading Scripts and CSS

Place files in your plugin folder and they load automatically when the game starts:

```
plugins/my_plugin/
├── plugin.json
├── scripts/
│   └── my_script.mjs    <- Loads automatically
└── css/
    └── my_styles.css    <- Loads automatically
```

This lets you implement code related to your plugin's data.

---

## Data Injection (For Sharing)

The `data` field lets your plugin inject data into existing game files. This is useful when sharing plugins with the community - you can provide pre-made character traits, items, or other data that merges with the user's game.

| Field | Description |
|-------|-------------|
| `fileName` | Target file (e.g., `"character_traits"`) |
| `fileData` | JSON data to inject (must be valid JSON array) |

When the game loads, injected data merges with the target file, giving your plugin's data lower precedence than the user's own data.

---

## Global vs Game Plugins

**Global plugins** come bundled with the engine in `engine_files/plugins/`. These provide optional features that any game can enable (like `global_essentials`).

**Game plugins** are created by you in `games_files/{gameId}/{modId}/plugins/`. These are specific to your game and can be shared with the community.

To enable plugins, add them to your manifest's `plugins` field in **General → Manifest**.

---

## Sharing Plugins

You can share specific plugins from your `plugins/` folder with the community, or place community plugins into your `plugins/` folder to use them. Don't forget to enable the plugin in **General → Manifest**.

