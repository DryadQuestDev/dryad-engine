# Setting Up Your Coding Environment

This guide covers how to set up your development environment for writing custom scripts and styles for your game.

---

## Recommended: Visual Studio Code

We strongly recommend using **Visual Studio Code (VS Code)** for the best development experience.

### Quick Setup

1. Download VS Code from [code.visualstudio.com](https://code.visualstudio.com/)
2. Right-click on the root `assets` folder → **Open with Code**

**Important:** Open the root `assets` folder, not your game's subfolder. The root folder contains `jsconfig.json` which configures VS Code to use the engine's type definitions.

### What You Get

| Feature | Description |
|---------|-------------|
| **Autocomplete** | Full autocomplete for all engine APIs |
| **Type checking** | Catches errors before runtime |
| **Inline documentation** | Hover over methods to see documentation |
| **Error highlighting** | Common mistakes highlighted as you type |

---

## How It Works

The root `assets` folder contains two important files:

| File | Purpose |
|------|---------|
| `jsconfig.json` | Configures VS Code to recognize JavaScript files and use type definitions |
| `/engine_files/types.d.ts` | TypeScript definitions for all engine APIs |

When you open the `assets` folder in VS Code, the editor reads `jsconfig.json` and automatically enables:

- **Autocomplete** for `window.engine`, `game`, `vue`, and all other engine objects
- **Parameter hints** showing what arguments methods expect
- **Return type information** so you know what data you're working with
- **Error detection** for typos and incorrect method calls

### Example

```javascript
const { game } = window.engine;

// VS Code will show autocomplete for all game methods
game.getCharacter("alice");  // ✓ Valid
game.getCharcter("alice");   // ✗ Typo highlighted as error
```

### Tip: Use .mjs Extension

Use `.mjs` extension for your script files instead of `.js`. This tells VS Code to treat the file as an ES module, enabling better autocomplete and import support.

---

## Recommended Plugin: es6-string-html

When writing custom HTML components in scripts, you'll use template strings for HTML. Install the **es6-string-html** VS Code extension to get syntax highlighting inside these templates.

### Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "es6-string-html"
4. Install the extension

### Usage

Add `/*html*/` comment before your template string:

```javascript
const MyComponent = vue.defineComponent({
  template: /*html*/`
    <div class="my-component">
      <h1>{{ title }}</h1>
      <button @click="onClick">Click me</button>
    </div>
  `
});
```

The HTML inside the template string will now have proper syntax highlighting, making it much easier to read and write.

---

## Connecting Scripts and CSS

Scripts and CSS files are treated as assets, just like images or sounds. Place them in your game's assets folder (e.g., `games_assets/my_game/_core/scripts/`) and connect them through the **Manifest** form in the engine's editor.

1. Create your script (`.mjs`) or stylesheet (`.css`) file in your game's assets folder (`games_assets/my_game/_core/`)
2. Go to **General > Manifest** in the engine's editor
3. Add the files to the **Scripts** or **CSS** fields

Scripts are loaded and executed in the order they appear in the list.

---

## File Structure

```
assets/                            # ← Open this folder in VS Code
├── jsconfig.json                  # VS Code configuration
├── games_assets/
│   └── my_game/
│       └── _core/                 # Your assets (images, sounds, scripts, CSS)
│           ├── icons/
│           ├── images/
│           ├── sounds/
│           ├── scripts/
│           │   └── script1.mjs    # Your scripts (edit in VS Code)
│           └── styles/
│               └── style1.css     # Your styles (edit in VS Code)
├── games_files/
│   └── my_game/
│       └── _core/                 # JSON data managed by engine editor
│           └── manifest.json
└── engine_files/
    ├── docs/                      # Engine documentation
    └── types.d.ts                 # Type definitions (don't modify)
```

---

## Script Template

Here's a minimal script template to get started:

```javascript
// Import core engine objects
const { game, vue, primeVue } = window.engine;

// Your code here
console.log("My script loaded!");

// Example: Register a custom action
game.registerAction("my_action", () => {
    console.log("My action executed!");
});

// Example: Listen to game events
game.on("scene_play_after", (sceneId) => {
    console.log("Scene played:", sceneId);
});
```

### Importing Other Scripts

You only need one entry script defined in the Manifest. Scripts are loaded as ES6 Modules, so you can import other custom scripts:

```javascript
// main_script.mjs (entry script defined in Manifest)
import { hi } from "./hi.mjs";

hi();
```

```javascript
// hi.mjs (imported module, not in Manifest)
export function hi() {
    console.log("Hello from hi.mjs!");
}
```

---

## AI Agent Assistance

Dryad Engine is built to work well with AI coding assistants like Claude, ChatGPT, or Gemini.

### Why It Works Well

| Feature | Benefit for AI |
|---------|----------------|
| **Typed API** | `types.d.ts` gives AI full knowledge of available methods, parameters, and return types |
| **Markdown docs** | Documentation lives inside the engine in `.md` files AI can read and reference |
| **Data-driven** | AI can safely modify game data without breaking engine internals |
| **Consistent patterns** | Same structure across all games makes AI suggestions more reliable and versatile |

### Getting Context

Point the AI agent to specific folders in `assets` directory for context:

| Folder | Use for |
|--------|---------|
| `engine_files/docs/` | Engine documentation and API reference |
| `engine_files/types.d.ts` | Available methods and their signatures |
| `games_assets/my_game/_core/scripts/` | Your game's custom scripts |
| `games_assets/tutorial/_core/scripts/` | Example scripts from other games |
| `games_files/my_game/_core/` | Where your game data lives |

---

## Next Steps

- ->builtins.actions - Built-in actions reference
- ->builtins.game_events - Game events reference
- ->advanced.vue - Vue components and advanced scripting

