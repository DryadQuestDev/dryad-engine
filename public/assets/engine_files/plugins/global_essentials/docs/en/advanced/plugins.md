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

## Plugin Script Loading

Plugins must explicitly specify which scripts to load via the `scripts` field in `plugin.json`. This allows you to use ES6 imports without double-loading modules.

### Script Configuration

Specify entry point script(s) in the `scripts` array. Only listed scripts will be loaded by the engine:

```json
{
  "meta": {
    "name": "My Plugin",
    "id": "my_plugin",
    "version": "1.0.0"
  },
  "scripts": ["main.mjs"],
  "tabs": []
}
```

Your main entry point can then use ES6 imports for other modules:

```javascript
// scripts/main.mjs (loaded by engine)
import { combatLogic } from './combat-utils.mjs';
import { BattleUI } from './ui-components.mjs';

// Your plugin initialization code here
console.log('Plugin loaded!');
```

```javascript
// scripts/combat-utils.mjs (imported, not loaded standalone)
export function combatLogic() {
  // Implementation
}
```

**Only list entry points in the scripts array** - imported modules should not be included.

### Folder Structure

```
plugins/my_plugin/
├── plugin.json
├── scripts/
│   ├── main.mjs           <- Listed in scripts array
│   ├── combat-utils.mjs   <- Imported by main.mjs
│   └── ui-components.mjs  <- Imported by main.mjs
└── css/
    └── my_styles.css      <- CSS auto-loads (no need to specify)
```

### Common Patterns

| Pattern | Configuration |
|---------|--------------|
| Single entry point | `"scripts": ["main.mjs"]` |
| Multiple entry points | `"scripts": ["init.mjs", "ui.mjs"]` |
| No scripts needed | `"scripts": []` |

**Note:** CSS files always auto-load - no need to specify them in your configuration.

---

## Data Injection

The `data` field lets your plugin inject entries into existing game data files. Any game data file can be targeted: `locale`, `character_attributes`, `character_traits`, `character_stats`, etc. Plugin data has lower precedence than the game's own data — if both define the same `id`, the game's version wins.

### Editor Format

In the Engine Editor, each data entry has two fields:

| Field | Description |
|-------|-------------|
| `fileName` | Target file (e.g., `"locale"`, `"character_traits"`) |
| `fileData` | JSON data to inject (array for array files, object for single files) |

### Object Shorthand

When writing `plugin.json` by hand, you can use the object shorthand — each key is a file name, each value is the data array:

```json
{
  "data": {
    "locale": [
      { "id": "greeting", "val": "Hello, traveler!", "uid": "myPlug01" }
    ],
    "character_attributes": [
      { "uid": "attr_mood", "id": "mood", "values": ["happy", "sad", "angry"] }
    ]
  }
}
```

The engine converts this to the `fileName`/`fileData` format automatically on load.

---

## Service Registry

Plugins can expose utility functions for other scripts via `game.registerService()`. This is useful when a plugin provides logic that game scripts need to call.

```js
// In plugin main.mjs — register a service
function resolvePronouns(charId) {
    // ... pronoun resolution logic
}
game.registerService('gender_pov', { resolvePronouns });
```

```js
// In a game script — consume the service
const { resolvePronouns } = game.getService('gender_pov');
const pronouns = resolvePronouns(characterId);
```

Plugin scripts load before game scripts, so services registered by plugins are available when game scripts run. If a game script re-registers placeholders or overrides behavior, it takes precedence.

---

## Typed Services

Plugins can expose typed service APIs so that game scripts get autocomplete and typo protection on `game.getService()` calls. This uses TypeScript declaration merging on the `Game` interface.

### 1. Define service types in the plugin's `dtypes.d.ts`

```
plugins/my_plugin/
├── plugin.json
├── scripts/
│   ├── main.mjs
│   └── dtypes.d.ts     <- Service types defined here
```

In `scripts/dtypes.d.ts`, define a type for each service and add a `getService` overload via declaration merging:

```ts
// Service type
type MyPluginService = {
  resolvePronouns(charId: string): { he: string; him: string; his: string };
};

// Declaration merging — adds typed overload to Game.getService()
interface Game {
  getService(id: 'gender_pov'): MyPluginService;
}
```

### 2. Reference plugin types from the game's `dtypes.d.ts`

Each game has its own `dtypes.d.ts` (in `games_assets/{game}/_core/scripts/`). Add a single reference to the plugin's types:

```ts
/// <reference path="../../../../games_files/{game}/_core/plugins/my_plugin/scripts/dtypes.d.ts" />
```

Every game script already references the game's `dtypes.d.ts`, so plugin types cascade to all scripts automatically.

### 3. Use in game scripts

```js
// Autocomplete works — no manual cast needed
const pronouns = game.getService('gender_pov').resolvePronouns(charId);

// Typos are caught at compile time
game.getService('gender_pvo'); // Error: no overload matches
```

## Global vs Game Plugins

**Global plugins** come bundled with the engine in `engine_files/plugins/`. These provide optional features that any game can enable (like `global_essentials`).

**Game plugins** are created by you in `games_files/{gameId}/{modId}/plugins/`. These are specific to your game and can be shared with the community.

To enable plugins, add them to your manifest's `plugins` field in **General → Manifest**.

---

## Sharing Plugins

You can share specific plugins from your `plugins/` folder with the community, or place community plugins into your `plugins/` folder to use them. Don't forget to enable the plugin in **General → Manifest**.

---

## Plugin Documentation

Plugins can ship their own documentation that appears in the engine's Docs Viewer. Add a `docs/` folder to your plugin with the following convention:

```
plugins/my_plugin/
├── plugin.json
├── docs/
│   ├── tree.json              <- Navigation structure (language-independent)
│   └── en/                    <- One folder per locale
│       ├── headers.json       <- Display names for categories and pages
│       └── guide/             <- Category folder (matches tree.json key)
│           ├── overview.md
│           └── usage.md
├── scripts/
└── css/
```

### tree.json

Defines the navigation tree. Keys are category folder names, values are arrays of page filenames (without `.md`):

```json
{
  "guide": ["overview", "usage"],
  "reference": ["api", "emitters"]
}
```

### headers.json

Maps category and page IDs to display names. Use `"category"` for the section header and `"category.page"` for individual pages:

```json
{
  "guide": "Guide",
  "guide.overview": "Overview",
  "guide.usage": "Usage",
  "reference": "Reference",
  "reference.api": "API",
  "reference.emitters": "Emitters"
}
```

### Markdown files

Place `.md` files inside `docs/{locale}/{category}/`. Each file corresponds to a page in `tree.json`. The file's `# h1` heading is displayed at the top of the page.

The Docs Viewer automatically discovers plugins with a `docs/` folder — both global plugins (`engine_files/plugins/`) and game plugins (`games_files/{game}/{mod}/plugins/`). A searchable dropdown lets the user switch between plugin docs.

---

## Docs Renderer Syntax

Documentation pages use standard Markdown rendered via MarkdownIt with a few extras.

### Standard Markdown

All standard Markdown is supported:

| Syntax | Result |
|---|---|
| `# Heading` through `#### Heading` | Section headings (h1–h4) |
| `**bold**` / `*italic*` | **bold** / *italic* |
| `` `inline code` `` | Inline code |
| ` ``` ` fenced blocks | Code blocks with syntax highlighting |
| `- item` / `1. item` | Unordered / ordered lists |
| `> quote` | Blockquotes |
| `\|col\|col\|` | Tables |
| `[text](url)` | External links |

### Code Blocks

Fenced code blocks support language-specific syntax highlighting. Specify the language after the opening backticks:

````
```js
game.log('Hello!');
```

```json
{ "key": "value" }
```
````

A copy button appears on hover for all code blocks.

### Internal Links

Use `->category.page` to create a clickable link to another docs page within the same plugin. The link text is resolved from `headers.json`:

```
See ->guide.overview for an introduction.
```

This renders as a clickable link showing the display name (e.g., "Overview") that navigates to that page.

### Images

Use `@path/to/image.png` to embed an image. The path is relative to the plugin's `docs/` folder:

```
@en/images/screenshot.png
```

