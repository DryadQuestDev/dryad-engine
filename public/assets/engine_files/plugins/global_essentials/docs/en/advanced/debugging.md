# Debugging

Dryad Engine provides two main debugging tools: the native browser console and the built-in Debug Panel.

---

## Browser Console

Since Dryad Engine is web-based and runs in Electron, all standard web development practices apply. You can use the browser's developer tools to debug your game.

**Opening the console:**
- File → Toggle Developer Tools ( `Ctrl+Shift+I` )

The console shows errors, warnings, and log messages from both the engine and your scripts.

### Engine Logger

The engine uses a structured logging system with colored output and importance levels:

| Level | Color | Use |
|-------|-------|-----|
| INFO | Blue | General messages |
| SUCCESS | Green | Successful operations |
| OVERWRITE | Brown | Data overwrites(e.g you want to overwrite an action's default behavior) |
| WARN | Yellow | Warnings |
| ERROR | Red | Errors |

When dev mode is enabled, log messages also show the source file and line number, making it easy to trace where code was called from.

---

## Debug Panel

The Debug Panel is visible automatically when playtesting your game from the Engine Editor. It provides a visual interface to inspect and manipulate game state without writing code.

@en/images/debug_panel.webp

### What You Can Inspect

@en/images/first_steps/debug_tabs.webp

The tabs come in the order you usually need them:

- **Scene** – Every choice of the paragraph on screen, hidden ones included. Each card reads **Shown**, **Hidden**, **Greyed out** or **Error**, and lists its conditions clause by clause: what each one read and whether it held. It follows the game live, so changing a variable flips the card.
- **Variables** – Flags, properties and stores in one searchable list. Click a value to change it; constants are locked. The **State** chip adds the UI states the engine and plugins keep. Click a flag's or property's name to see its history in the **Log**. **+ Flag** sets a flag nothing has set yet, in any dungeon – one nobody set reads 0, so it isn't listed until then.
- **Log** – What happened in this run, newest first: each paragraph played, each choice picked, every variable change as `old → new`, other actions and problems. Search and the kind chips narrow it. ✎ opens a paragraph in the editor, and ↺ goes back to it, for the last 10 paragraphs. The log lasts across Shift+R, PageUp and Continue; a replay drops the lines after the replayed paragraph and says so. Edits made in the panel show as their own **Console** or **Panel** lines.
- **Problems** – What went wrong while you played: a speaker with no character, a missing asset, an unknown action or condition. Each row names its paragraph, and **Open in editor** takes you there. The tab's badge counts them.
- **Console** – Three modes:
  - **Action** runs an action object on the spot, e.g. `{flag: "door_open = 1", flash: "Opened"}`, and shows what it changed. An unknown action isn't run, and the closest name is suggested. It suggests and describes as you type, like the content editor (->dungeons.visual_editor); **Ctrl+Space** suggests anywhere.
  - **Condition** checks a condition the way `{if: …}` would, e.g. `trust >= 2, door_open`, and shows each clause with what it read. It suggests flags, conditions and their arguments as you type, like `if{…}` in the content editor.
  - **Text** shows how a line comes out – placeholders, `if{…}fi{}`, styles – without running its actions.

  **Ctrl+Enter** runs, and **↑ / ↓** walk the history, which is kept per game.
- **Debug Choices** – Your own debug buttons (see below).
- **Characters** – Open a character to change its attributes, stats, resources and traits in place, and to add or remove statuses. Each change runs the action content would use (`attr`, `stat`, `resource`, `trait`, `status`). A changed field shows what it was; click that note to put it back. When a status or an equipped item overrides a value, the field says what the character shows and where it comes from.
- **Inventories** – Pick an inventory, change counts with − / + or type a number, remove an item with ×, and search by name or id to add one. Edits run `add_item` and `remove_item`.
- **Actors** – The characters on stage and their slots.
- **Dungeons** – The current dungeon, room and scene data.
- **Stores**, **Properties** – Every store and property in full.
- **Registry** – All registered events, actions, conditions, placeholders, stat computers and components.
- **Options** – Debug settings.

@en/images/first_steps/debug_tools.webp

### Changes This Playtest

Your edits in **Characters** and **Inventories** add up in a box under them: one action you can paste into a `{…}` line of your content with **Copy as action**, e.g. `{attr: "riko.mood = blush", stat: "riko.stamina = 20"}`.

- Repeated edits net out: changing a value twice is one change, and changing it back is none.
- **Undo** and **Undo all** put the original values back. **Copy all** copies the changes from every tab.
- The list lasts across Shift+R, PageUp and Continue; a new game starts it empty. If a replay takes an edit back out of the game, the box says so, and **Reapply** sets it again.

### The Playtest Loop

@en/images/first_steps/debug_loop_buttons.webp

- **Playtest** (**Ctrl+P** / **Cmd+P**) in the editor starts the game in dev mode.
- **Back to Editor**, at the top of the panel, returns to the editor and opens the **Content** tab on the paragraph you were on. The panel shows that place under the button.
- **Continue** in the editor reloads the game and replays that paragraph with your saved changes.
- **Replay paragraph** (**Shift+R**) replays the paragraph on screen with your latest saved changes. Outside a scene it reads **Reload Game**: it reloads where you stand.
- **Back one paragraph** (**PageUp**) goes back one paragraph and replays it on the state it had then – for example to pick the other answer of a menu. The game keeps the last 10 paragraphs; starting a new game or loading a save clears them.

**Shift+D** folds the panel to a slim strip at the window's edge, so the game gets its full width; press it again, or click the strip, to bring it back. Drag the panel's left edge to resize it.

Shift+R, PageUp, Shift+S and Shift+D also work while the panel is folded. They do nothing while you type in a field.

### Snapshots

@en/images/first_steps/snapshots.webp

**Save snapshot** (**Shift+S**) keeps this moment under a name, to come back to it later – before a long branch, or right before a choice you want to test both ways.

- The name field suggests a name from the paragraph on screen. **Enter** keeps the snapshot; **Escape** throws it away.
- Each snapshot shows its paragraph or room, its age and the properties that differ from their defaults.
- **Load** returns to it, even after a reload or another day. **⋮** renames or deletes it.
- Snapshots are kept per game and never show in the save lists. Loading one starts a new run: the Log and the changes start empty, and Back one paragraph reaches no further back than the snapshot.

### Play From Here

@en/images/first_steps/play_from.webp

In the editor's **Content** tab, a ▷ starts a playtest right where you are writing:

- On a scene's header, it plays the scene from its start.
- On a `%` column, it plays from the column's first paragraph, or from the paragraph the caret is in.
- On a `~` choice, it plays as if the player picked it: the choice's own actions run, then the text under it.

Before it starts, you choose:

- **Start from** – **A new game**, or **A snapshot** and its state.
- **Set first** – properties, flags, items or character changes to set before it plays. When the target has a condition (`{if: "trust >= 2"}`), the values it needs are filled in for you, and any clause that can't be filled is named.

**Play** starts it. The setup is remembered per target, so the next ▷ there starts the same way.

### Playtest Menu

@en/images/first_steps/playtest_menu.webp

The arrow next to **Playtest** offers:

- **From the start** (**Ctrl+P**) – the usual playtest.
- **From the scene I'm editing** – the scene you last worked on in the Content tab, with its remembered setup.
- **Snapshots** – each one starts from that moment.
- **Manage snapshots…** – rename or delete them.

### Placeholders for What Isn't Made Yet

In a playtest, content can name things that don't exist yet:

- A speaker with no character (`ghost: Boo!`) talks under an amber, striped name tag marked **not in the game**.
- An asset that isn't in **Assets** (`{asset: "bg_cellar"}`) shows as a grey, striped card with its id, marked **missing · dev only**. Staged as a backdrop (`bg=true`) it fills the backdrop.

@en/images/first_steps/placeholders.webp

Each one is also listed in **Problems**.

Once the character exists – a character template with **auto_create** on, or one your content creates – or the asset is added, the next replay shows the real one. Outside dev mode neither placeholder appears: the speaker line reads as plain narration, prefix included, and the asset is left out.

### Custom Debug Buttons

You can add custom debug buttons that appear in the Debug Panel. These are useful for testing specific scenarios like giving items, teleporting, or triggering events.

Add custom debug buttons in the Engine Editor:
1. Go to **General → Custom Choices**
2. Create choices with the `debug` group
3. These appear as buttons in the Debug Panel during playtest

Example uses:
- "Give 1000 Gold" - quickly test shop purchases
- "Max All Stats" - test endgame content
- "Trigger Boss Fight" - skip to specific encounters

---

## Checking Dev Mode in Scripts

You can check if dev mode is enabled using `game.isDevMode()`:

```javascript
if (game.isDevMode()) {
  console.log('Debug info:', someData);
}
```

---

## Tips

- Keep the console open during development to catch errors early
- Use the Debug Panel's Registry tab to verify your custom registrations are working
- Create debug buttons for common testing scenarios to speed up iteration
- Check the Network tab in Developer Tools if assets aren't loading

