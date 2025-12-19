# Dryad Engine

Dryad Engine is a new generation engine for **UI‑heavy 2D games** – RPGs, dungeon crawlers, visual novels, and story‑driven adventures where menus, character sheets, and custom interfaces are the real playground.

It grew out of 10+ years of making games the hard way: rebuilding the same systems, losing track of content, and fighting tools that were made for physics‑driven games instead of content‑driven ones.

## The Problems We Solved

If you’ve ever tried to build a content‑heavy game, you’ve probably run into this:

- **You get lost in your own game.** Where is that character stat defined? Which file controls this quest step? How do items connect to inventories?
- **You rewrite the same foundations every project.** Save/load, inventories, equipment, skill trees, quest logs – it all has to be reinvented again.
- **Simple content changes require touching code.** Adding an item, tweaking a stat, or creating a new dungeon feels risky because you’re editing logic, not just data.
- **Scaling hurts.** A small prototype is fine. A full game with hundreds of items, characters and quests becomes fragile and slow to change.

Dryad Engine is built to make those problems disappear, so you can spend your time on story, choices, and cool game systems instead.

## The Core Idea: Everything is Content

In Dryad Engine, your game is treated like a well‑organized library instead of a pile of scripts:

- **Characters, items, stats, skills, quests, dungeons, dialogue – all live as structured content.**
- A **visual editor** lets you browse, search, sort, and edit that content without hunting through files.
- You can **add, change, and rebalance** things without rewriting engine code.
- As your project grows, the structure stays readable and consistent instead of turning into a tangle of one‑off systems.

You focus on designing your world. Dryad Engine handles the boring glue.

## What Kind of Games Is Dryad Engine For?

Dryad Engine shines when:

- Your game is **story‑heavy** and full of meaningful choices.
- You care about **rich UI** – inventories, character sheets, galleries, quest logs, maps, overlays, custom complex interfaces.
- You want **deep systems** (characters, stats, items, skills) but don’t want to build all the plumbing from scratch. **You can focus on your game-specific mechanics**.

If your main challenge is high‑speed action and complex physics, a traditional engine like Unity or Godot may be a better fit.  
If your main challenge is **designing, organizing, and iterating on content**, Dryad Engine is made for you.

## What You Get Out of the Box

Dryad Engine comes with batteries included:

- **Characters** – stats, resources, traits, attributes, equipment, status effects, and skill trees.
- **Items & Inventory** – templates, stacking, weight/slot limits, equipment slots, currencies, crafting, loot and trading.
- **Dungeons & Scenes** – rooms, encounters, flags, scenes, choices, and quest hooks.
- **Quest & Dialogue Systems** – structured quests with goals/logs, branching dialogue with conditions and choices.
- **Save System** – automatic saving and loading, made to survive long projects and frequent content changes.

All of this is already wired together so you can start building immediately instead of assembling your own toolbox first.

## Infinite Ways to Build Your World

Dryad Engine comes with three built-in exploration systems:

| Type | Best For |
|------|----------|
| **Map Dungeon** | Map‑based exploration, fog of war, room‑to‑room navigation |
| **Screen Dungeon** | Visual novels, point‑and‑click layouts |
| **Text Dungeon** | Pure narrative, interactive fiction, Twine-style games |

But you're not limited to these three. Need a city management screen? A crafting workshop? A relationship map? An investigation board? You can build entirely custom UI systems from scratch, or inject new sections into the existing interface. The engine is designed to grow with your ideas, not constrain them.

## Embraces Community Content

Dryad Engine is built to be extended. The **mod system** and **plugin system** are part of the core, not an afterthought:

- You can add new characters, items, dungeons, quests, or even whole subsystems in a separate mod without touching your original files.
- Plugins let you bundle extra data and behavior into neat, self‑contained packages.
- It’s easy to load **community‑made content**: drop a plugin or mod in, enable it, and it layers cleanly on top of your game.

This makes Dryad Engine a natural fit for games that want modding, community scenarios, or long‑running campaigns that grow over time.

## How You Create Content

Dryad Engine is built so writers, designers, and coders can all work comfortably:

- Use the **visual editor** to manage structured data like items, characters, stats, skills, dungeons and quests.
- Use **Google Docs** for collaborative writing, then bring that text into the engine’s content pipeline.
- Attach **small scripts the same way you attach data** – you can listen to built‑in events (like creating a character, entering a dungeon, gaining an item), or define your own events and logic in a clear, structured way instead of scattering ad‑hoc code everywhere.
- **No compile step for content** – you change something and see it in‑game right away.

Most of your project can stay “just content”, and when you do need custom behavior, it lives beside your data and follows the same organized patterns.

## AI‑Friendly by Design

Dryad Engine is also built to work well with AI assistants:

- **All documentation lives in Markdown (`.md`) files** inside the engine assets, so an AI agent can read, reference, and update it alongside you.
- The engine exposes a **fully typed API**, making it easier for AI tools to suggest correct calls and patterns when you’re scripting custom behavior.
- **All games live in the `assets` folder**, which means an AI can look at other projects in the same engine and help you “build this feature like in that game, but with a twist” instead of starting from a blank page every time.
- Because the engine is **data‑driven at its core**, it’s safer for you (and for AI helpers) to work directly with game data without accidentally breaking the underlying systems.

## Next Steps

- ->introduction.getting_started
- ->introduction.creating_new_game

