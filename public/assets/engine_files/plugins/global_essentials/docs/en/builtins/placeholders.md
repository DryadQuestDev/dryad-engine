# Placeholders Reference

Format: `|placeholderName(args)|`

---

## Built-in Placeholders

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `flag` | Returns the value of a flag | `You have \|flag(gold)\| gold` |
| `property` | Returns the value of a game property | `Score: \|property(score)\|` |
| `item` | Returns the name of an item | `You are using \|item(uid, invId)\|` |
| `from` | Fetches a locale entry and resolves it through the full pipeline | `\|from(greeting_text)\|` |
| `pick` | Like `from`, but randomly selects from numbered locale variants | `\|pick(greeting_text)\|` |

---

## Locale Template Composition

Use `|from(localeId)|` to fetch a locale entry and resolve it through the full pipeline (`|placeholder|`, `if{}`, styles). This enables locale-to-locale template chaining.

Pass inline params with `key->value` syntax — they replace `|key|` tokens in the fetched locale before the full pipeline runs:

```
// locale entries:
// greeting       = "Hello, |name|! |from(greeting_detail)|"
// greeting_detail = "if{level > 10}You are a veteran.else{}Welcome, newcomer.fi"

|from(greeting, name->Alice)|
// → "Hello, Alice! You are a veteran."
```

---

## Random Variant Selection

Use `|pick(baseId)|` to randomly select from numbered locale variants. Works like `from` but adds variety.

**Variant naming convention:**
- `baseId` — first variant (required)
- `baseId_2` — second variant
- `baseId_3` — third variant, etc.

The engine probes `baseId`, `baseId_2`, `baseId_3`... until no entry is found, then picks one at random.

```
// locale entries:
// tavern_desc   = "A quiet tavern with a crackling fire."
// tavern_desc_2 = "The tavern buzzes with rowdy patrons."
// tavern_desc_3 = "An empty tavern. Dust coats every surface."

|pick(tavern_desc)|
// → randomly one of the three descriptions

|pick(tavern_desc, name->Alice)|
// → key->value params work the same as |from()|
```

---

## Nested Property Paths

For object-type properties, access nested values with dot notation:

```
Volume: |property(settings.volume)|%
Theme: |property(config.ui.theme)|
```

---

