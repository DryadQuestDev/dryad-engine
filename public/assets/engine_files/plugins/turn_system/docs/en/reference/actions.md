# Actions

## DryadScript Actions

### `turn`

Advance the global clock by N turns (minimum 1). Ticks limited status durations and fires `turn_advanced`.

```js
// One turn passes
{turn: 1}

// Resting passes 5 turns
{turn: 5}
```

## State

| State | Type | Description |
|---|---|---|
| `turn` | number | The global turn counter. Saved with the game. Starts at 0, +1 per room entry. Read with `game.getState('turn')`. |

## Locale

| Line | Placeholders | Description |
|---|---|---|
| `turn_status_expired` | `\|status\|`, `\|name\|` | Notification shown when a party member's status fully expires from ticking. Override in your game's locale to reword. |
