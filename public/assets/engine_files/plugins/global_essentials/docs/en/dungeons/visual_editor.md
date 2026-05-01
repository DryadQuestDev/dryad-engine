# Visual Editor

The **Visual Editor** is the recommended way to author dungeons in Dryad Engine. It's an in-editor popup that turns DryadScript's line-based markup into editable block cards. No external setup required.

## Opening the editor

1. Navigate to the **Dungeons** tab and pick a dungeon (or create one).
2. Go to the **Config** subtab.
3. Click the **Content Editor** button in the subtab header.

> **Auto-open:** Toggle **Auto-open** inside the popup to have it open automatically whenever you land on a dungeon's Config subtab. The preference is remembered across sessions.

## Structure at a glance

Each block type has its own card layout:

- **`^ Room`** – a section banner (blue). Rooms act as grouping headers; encounters and scenes that come after a room belong to it until the next `^` block. When you add a room, an `@description` encounter is auto-inserted below it so you can start writing immediately.
- **`@ Encounter`** – a purple card. Contains the encounter's id, optional params, any number of `!choice` rows, and a single prose content area. Choice rows have a "+ Scene" button that creates a matching `#scene` for the choice.
- **`# Scene`** – a green card. A scene is a grid: rows are numbered automatically (1, 2, 3…); each row holds one or more **columns** that are either `%` (unnamed block) or `~choice` (named). Each column has its own prose content area.
- **`$ Template`** – a gray card. Reusable content blocks referenced by name. Quest templates (title, main stage, goal, goal stage) get distinct accent colors.

## Exporting to Google Docs

Two copy buttons in the top toolbar:

- **Copy text** – plain DryadScript source. Paste anywhere (editors, chat, email) to share raw dungeon text.
- **Copy tables** – Google-Docs-ready HTML tables with matching colors, fixed 500px width, and `<h3>` headers. Paste directly into a Doc; the layout survives, so collaborators can comment / suggest in Docs without losing structure. When you're done in Docs, import back via `gdoc_id` – see ->dungeons.google_docs_integration.


## Next Steps

- ->dungeons.dungeon_template – the Google Docs template (for collaborative authoring).
- ->dungeons.google_docs_integration – set up Docs API access.
- ->dungeons.glossary – the DryadScript markup reference.
