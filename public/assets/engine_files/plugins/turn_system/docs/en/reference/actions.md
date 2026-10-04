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

### `timestamp`

Stamp the current turn into a flag. A dotted key stamps another dungeon's flag.

```js
{timestamp: "last_rest"}
{timestamp: "dungeon2.last_rest"}
```

## Conditions

| Condition | Returns | Example |
|---|---|---|
| `_turns_since(flag)` | Turns elapsed since `{timestamp}` stamped the flag. A flag never stamped counts as forever ago, so a wait gate starts open | `_turns_since(last_rest) >= 5` |

```js
// Resting works again five turns after the last rest
~Rest by the fire{if: "_turns_since(last_rest) >= 5", timestamp: "last_rest", scene: "rest"}
```

## State

| State | Type | Description |
|---|---|---|
| `turn` | number | The global turn counter. Saved with the game. Starts at 0, +1 per room entry. Read with `game.getState('turn')`. |

## Locale

| Line | Placeholders | Description |
|---|---|---|
| `turn_status_expired` | `\|status\|`, `\|name\|` | Notification shown when a party member's status fully expires from ticking. Override in your game's locale to reword. |
