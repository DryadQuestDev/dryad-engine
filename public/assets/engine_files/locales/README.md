# Adding a language

Each file here is one language of the engine's own interface. Game text lives elsewhere, in the
game's `locale.json`.

The engine's editor has its own strings, and they are **not** in these files – they sit in
`locales/editor/<code>.json`. Nothing in that folder reaches a player, so a translation that never
touches it is complete. It is only worth filling in if you are translating the engine for people
who build games with it.

## Steps

1. Copy `en.json` to `<code>.json`, where `<code>` is the language code you want in the settings
   dropdown – `de.json`, `pt-br.json`, `zh-hans.json`. The name is yours to choose; the engine
   treats it as an opaque label. Use lowercase, since some targets are case-sensitive.
2. Set `lang_name` to the language's own name, written in that language: `Deutsch`, `日本語`,
   `Português (Brasil)`. This is the label a speaker of that language sees in the dropdown.
3. Set `_number_locale` to your BCP-47 tag – see **A few values are codes** below.
4. Translate the values. Leave every key exactly as it is.

The engine reads English first and layers your file over it, so a key you have not reached yet
falls back to English rather than breaking. Partial files are safe to ship.

## Rules

**Keys are identifiers.** Copy each one byte for byte. Translating, reordering, adding, or
removing a key breaks the lookup.

**`|placeholders|` are code.** Tokens between pipes – `|item|`, `|character|`, `|count|` – are
replaced at runtime with live values. Keep the word inside the pipes in English. Move a placeholder
wherever your word order needs it, and repeat it if your grammar calls for it; every occurrence is
substituted.

**HTML and text tags are markup.** Some values carry tags such as `<b>` and colour tags such as
`[green]…[/green]`. Reproduce every tag and attribute exactly, including the single quotes around
class names, and translate only the text between them.

**Paths and file names are code.** Text inside `<code>` tags – `games_files/`, `assets/install/` –
is a real folder on disk. Reproduce it byte for byte.

**A few values are codes, not text.** Leave the English alone unless you know the equivalent:

| Key | What it is |
|---|---|
| `_number_locale` | BCP-47 tag driving number grouping – `de-DE`, `ja-JP`, `zh-Hans`. Wrong or missing and every number reads `1,250` instead of `1.250` / `1 250`. |
| `list_separator` | What joins names in a list. `, ` in most languages; CJK usually wants `、`. The trailing space is part of the value. |
| `masked_name` | The mask over an undiscovered entry. `???` works everywhere; CJK may prefer fullwidth `？？？`. |

**A value that ends in a space ends in a space on purpose.** `list_separator` is the one that
matters today. Editors and spreadsheets like to trim it; check after a round trip.

**Key names in prose are the keyboard's, not words.** `Ctrl+H` in `navigation.hide_dialogue` and
the `T` in `settings.interactive_tooltips.tooltip` name physical keys. Translate the sentence
around them and leave the key name as it is, even where your language usually writes it otherwise.

**A few values are formats, not sentences.** `encounter.discovered.check` is `|stat|[|threshold|]`
and `progress_bar.fraction` is `|current| / |max|`. There is nothing to translate; change the
punctuation only if your language writes such a figure differently.

**Write plurals that hold for any number.** Never reach for the English `(s)` shortcut: it reads
badly in most languages and is impossible in several. Restructure instead, so the number sits apart
from the noun: `Usages: |count|` rather than `|count| usage(s)`.

**Label and value travel together.** `saves.date` is `Date: |date|`, not a bare `Date:`. The colon,
its spacing and the order are yours – French wants a space before it, Japanese often wants none.

**Abbreviations have a width budget.** `inventory.filter.equippable_short` is a one-glyph toggle
abbreviating `inventory.filter.equippable`; one or two characters is all the button holds. If your
language has no short form, leave the English letter.

**Generic verbs are shared across screens.** `back`, `cancel`, `close`, `confirm`, `continue`,
`delete`, `no`, `ok`, `refresh`, `save` are used as button labels *and* as icon aria-labels on
several different screens. Pick the most neutral word your language has, and keep it short. Keys
such as `menu.close` and `choose_item.cancel` are separate on purpose – they name one specific
surface and may read differently there.

**Keep terms stable.** Pick one word for each recurring noun and use it everywhere. Note that
trait, status and attribute are three distinct systems in this engine and need three distinct words.

**Watch the length.** The settings form reserves a fixed label column and the tabs are sized for
English. Where a faithful translation runs much longer, prefer the shorter natural synonym.

## Checking your file

```sh
jq empty <code>.json                                  # valid JSON
diff <(jq -r 'keys[]' en.json|sort) <(jq -r 'keys[]' <code>.json|sort)   # prints nothing
```
