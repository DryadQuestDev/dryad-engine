# Dryad Engine

A Vue-based game engine for creating UI-heavy games like visual novels, dating sims, and RPGs with complex interfaces.

## Why Dryad Engine?

- **Event-driven architecture** - Hook into game events with before/after listeners and cancellable actions.
- **Component-based UI** - Swap and customize HTML UI components through a custom slot system powered by Vue3.
- **Status layer system** - Items, skills, and effects share a unified architecture that composes naturally.
- **Declarative content** - Define game logic with conditions and actions, write stories in markup documents.
- **Visual editor** - Edit game data through forms, never touch JSON directly.
- **Extensible** - Register custom actions, conditions, placeholders, and components.
- **Moddable** - Layered data system makes mods, addons, and content packs easy to develop and distribute.

## Features

| Category | Highlights |
|----------|------------|
| **Content** | Dungeon documents with markup syntax, Google Docs integration |
| **Characters** | Stats, traits, equipment slots, skin layers, abilities |
| **Items** | Stackable/unique items, equipment, crafting recipes, currencies |
| **Skills** | Visual skill trees, upgrade levels, public/private currencies |
| **UI** | Component slots, custom popups, CSS theming |
| **Assets** | Spine animations, layered images, sound/music |
| **Scripting** | Fully Typed JavaScript API, event hooks, custom logic |

## Quick Start

```bash
git clone https://github.com/DryadQuestDev/dryad-engine.git
cd dryad-engine
npm install
./build.sh --local

# Linux
./production/dryad-engine-linux/dryad-engine

# Windows
./production/dryad-engine-windows/dryad-engine.exe
```

The `--local` (or `-l`) flag builds for your current OS only. Omit it to build both Linux and Windows and zip them(requires zip library).

## Documentation

Documentation is integrated into the engine. Launch the engine and access docs from the Editor.

## License

Dryad Engine uses a source-available license:
- **Games**: Commercialize freely, keep all profits
- **Modifications**: Modify and share for free
- **Engine**: Cannot be sold or commercially distributed

See [LICENSE.md](LICENSE.md) for details.

## Status

Dryad Engine is in active development. Expect breaking changes until v1.0.
