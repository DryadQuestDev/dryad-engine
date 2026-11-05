# Coming from Twine

Your passages become scenes in a dungeon's **Content** tab. A dungeon is a chapter or a place, and each `#scene` in it plays like a passage.

## Passage by passage

| Twine (SugarCube / Harlowe) | Dryad Engine |
|---|---|
| A passage | A `#scene` |
| The start passage | The first chapter's starting scene: `#start{if: true}` |
| `[[Go north->Harbor]]` | `~Go north{scene: "harbor"}` on the scene's next row |
| A link under one paragraph | `>Go north{scene: "harbor"}` right under that paragraph |
| `<<goto "Harbor">>` / `(go-to: "Harbor")` | `{scene: "harbor"}` |
| `<<set $gold to 5>>` / `(set: $gold to 5)` | `{flag: "gold = 5"}` |
| `<<set $gold += 1>>` | `{flag: "gold += 1"}` |
| `<<if $gold gt 3>>…<</if>>` / `(if: $gold > 3)[…]` | `if{gold > 3}` … `fi{}` |
| `$gold` printed in the text | `\|flag(gold)\|` |
| Variables set in `StoryInit` | Nothing to declare: a flag nobody set reads 0. Set another start with `{flag: "gold = 5"}` in your first scene |

## Watch out for `[[…]]`

In Twine, `[[Harbor]]` is a link to a passage. In Dryad Engine, `[[…]]` is a **lore link**: a word the player can hover to read an encyclopedia record. A Twine habit like `[[Go north]]` therefore shows a broken link instead of a choice – write a `~` or `>` choice instead. See ->miscellaneous.lore.

## Side by side

```text
:: Start
You stand on the pier.
[[Ask about the harbor->Harbor]]
[[Leave]]
```

```text
#start{if: true}
1
%
You stand on the pier.
2
~Ask about the harbor{scene: "harbor"}
~Leave{scene: "leave"}
```

In the Content tab, a menu is a row of `~` choices, each with the text it plays:

@en/images/first_steps/menu_row.webp

In the game it looks like this:

@en/images/first_steps/menu_game.webp

## What is different

- **A paragraph is one click.** A blank line starts the next click, so a long passage can play out over several clicks.
- **Choices sit in rows.** A row of `~` lines is a menu at the end of what came before it. See ->dungeons.glossary.
- **Characters can speak.** `riko: Hello!` shows Riko's name and portrait. Make her in **Characters › Character Templates**.
- **Variables are flags.** `{flag: "gold += 1"}` creates `gold` the first time it runs, and a flag nobody set reads 0. A flag holds a number and belongs to its dungeon: another chapter reads it as `chapter_1.gold`. **Properties** in **General › Properties** are for advanced use – a text value, or a value with limits that the whole game shares.

Start with ->introduction.first_15_minutes if you haven't made a game yet.
