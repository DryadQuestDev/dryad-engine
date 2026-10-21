# Visual Editor

The **Visual Editor** is the recommended way to author dungeons in Dryad Engine. It's an in-editor popup that turns DryadScript's line-based markup into editable block cards.

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

## Checks

The editor checks your content as you type, against the game's data, its scripts and every dungeon. A typo is underlined – amber for a warning, red for an error – and the toolbar counts them (`1 error · 3 warnings`). Click the count for the list:

- **Did you mean** – one click replaces `forrest` with `forest`.
- **Ignore here** – stops reporting that value in this block. The **Ignored** tab lists everything a dungeon ignores, with **Stop ignoring**, and any ignore that nothing reports any more, with **Remove**.
- **Whole game** – runs the same checks over every dungeon; click a problem to jump to it.

Saving always works. Only errors – content the game would stop or skip on – ask first. **Live checks** in the list turns checking-as-you-type off; checks then run on save and from the toolbar button.

The checks know what every action takes because each action describes its own value – see ->advanced.registry.

## Suggestions and hover

- **Suggestions** open by themselves inside `{…}`, `if{…}`, and after `|`, `[[` and `[`: actions with their help line, then whatever the action takes – assets with thumbnails, characters with faces, slots after `->`, attribute values after `=`, scenes and `&anchors`, flags, conditions, placeholders. **Ctrl+Space** suggests anywhere, including a speaker at the start of a paragraph. ↑↓ choose, Tab or Enter insert (Ctrl+Z undoes it), Esc closes the list.
- **Hover** an id for a moment to see what it is: its name, picture, and where it comes from.
- **Ctrl+click** an id to go to it: a scene, anchor or room scrolls to its block; an asset, character, item or record opens its tab (the dungeon is saved first).

Suggestions can be switched off under **Typing** in the toolbar, next to curly quotes and en dashes.

## Exporting to Google Docs

Two copy buttons in the top toolbar:

- **Copy text** – plain DryadScript source. Paste anywhere (editors, chat, email) to share raw dungeon text.
- **Copy tables** – Google-Docs-ready HTML tables with matching colors, fixed 500px width, and `<h3>` headers. Paste directly into a Doc; the layout survives, so collaborators can comment / suggest in Docs without losing structure. When you're done in Docs, import back via `gdoc_id` – see ->dungeons.google_docs_integration.


## Next Steps

- ->dungeons.dungeon_template – the Google Docs template (for collaborative authoring).
- ->dungeons.google_docs_integration – set up Docs API access.
- ->dungeons.glossary – the DryadScript markup reference.
