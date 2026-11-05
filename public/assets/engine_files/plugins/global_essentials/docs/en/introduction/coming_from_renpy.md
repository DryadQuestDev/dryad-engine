# Coming from Ren'Py

Your `script.rpy` becomes a dungeon's **Content** tab. A dungeon is a chapter or a place, and each `#scene` in it is what Ren'Py calls a label.

## Statement by statement

| Ren'Py | Dryad Engine |
|---|---|
| `define r = Character("Riko")` | A character in **Characters › Character Templates** (its id is `riko`) |
| `default trust = 0` | Nothing to declare: a flag nobody set reads 0 |
| `label start:` | The first chapter's starting scene: `#start{if: true}` |
| `r "Hi!"` | `riko: Hi!` |
| `menu:` and its choices | The scene's next row, one `~Choice` line per choice |
| `jump harbor` | `{scene: "harbor"}` |
| `$ trust += 1` | `{flag: "trust += 1"}` |
| `if trust >= 2:` | `if{trust >= 2}` … `fi{}` |
| `[trust]` inside a line | `\|flag(trust)\|` |
| `scene bg harbor` | `{asset: "bg_harbor"}` |
| `show riko blush at left` | `{actor: "riko->left"}` and `{attr: "riko.mood = blush"}` |
| Shift+R | Shift+R in a playtest replays the paragraph on screen |
| Rollback | PageUp in a playtest goes back one paragraph |

## Side by side

```text
label start:
    scene bg harbor
    show riko blush at left
    r "Hi, I'm Riko!"
    menu:
        "Ask about the harbor":
            $ trust += 1
            r "The lights come on at dusk."
        "Say goodbye":
            r "See you soon!"
```

```text
#start{if: true}
1
%
riko: Hi, I'm Riko!
{asset: "bg_harbor", actor: "riko->left"}
{attr: "riko.mood = blush"}
2
~Ask about the harbor{flag: "trust += 1"}
riko: The lights come on at dusk.
~Say goodbye
riko: See you soon!
```

In the Content tab, a menu is a row of `~` choices, each with the text it plays:

@en/images/first_steps/menu_row.webp

In the game it looks like this:

@en/images/first_steps/menu_game.webp

## What is different

- **A paragraph is one click.** Lines with no blank line between them show together; a blank line starts the next click.
- **Scenes are a grid of rows.** A row of `%` text plays in order; a row of `~` lines is a menu. See ->dungeons.glossary.
- **Characters are data.** Name, colour, portrait and expressions live in the editor, not in the script. An expression is an attribute such as `mood`.
- **Variables are flags.** `{flag: "trust += 1"}` creates `trust` the first time it runs, and a flag nobody set reads 0. A flag holds a number and belongs to its dungeon: another chapter reads it as `chapter_1.trust`. **Properties** in **General › Properties** are for advanced use – a text value, or a value with limits that the whole game shares.
- **No Python.** Logic is written as `{…}` actions and `if{…}` conditions. When you need real code, a JavaScript file can add your own actions – see ->advanced.registry.
- **Placeholders while you test.** A speaker or a picture that doesn't exist yet still shows in a playtest, marked as missing, so you can write first and add art later.

Start with ->introduction.first_15_minutes if you haven't made a game yet.
