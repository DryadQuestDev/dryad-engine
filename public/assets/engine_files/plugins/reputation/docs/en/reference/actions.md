# Actions

## DryadScript Actions

### `reputation`

Change one or more characters' reputation. `+=` adds, `-=` subtracts and `=` sets. Every add or subtract notes "|name| will remember that." under the dialogue text until the next paragraph; a set is silent.

```js
{reputation: "rosa -= 1"}
{reputation: "rosa += 2, tomas -= 1"}
{reputation: "rosa = 0"}
```

Values clamp to the configured `min` / `max`; a change the clamp swallows does nothing. A character the story has not created yet is created from its template first.

### `reputation_silent`

The same, with no note.

```js
{reputation_silent: "rosa -= 1"}
```

## Conditions

| Condition | Returns | Example |
|---|---|---|
| `_reputation(character)` | The character's reputation; an untracked character reads `0` | `_reputation(rosa) >= 2` |

## Character Traits

| Trait | Type | Description |
|---|---|---|
| `reputation` | number | The value itself. Set it on a template to track the character from the start |

## Locale

| Line | Default |
|---|---|
| `reputation_remember` | `\|name\| will remember that.` |
