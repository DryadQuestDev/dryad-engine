# Services

## `turns`

The global clock service.

### `getTurn()`

Get the current turn number.

```js
const turns = game.getService('turns');
turns.getTurn(); // e.g. 42
```

| Parameter | Type | Description |
|---|---|---|
| **Returns** | number | The current global turn |

### `advance(turns?)`

Advance the clock. Increments the counter, ticks limited status durations on all characters, re-runs the engine's `discover` scan, fires `turn_advanced`. This is what the toolbar's Wait button calls.

```js
const turns = game.getService('turns');
turns.advance();   // one turn
turns.advance(8);  // a long rest
```

| Parameter | Type | Description |
|---|---|---|
| `turns` | number | Turns to pass (default 1, minimum 1) |
| **Returns** | number | The new turn number |

## Common Patterns

### Pass time from a custom UI

```js
// A "Rest" button in a camp component
function rest() {
    game.getService('turns').advance(8);
    game.showNotification(game.getLine('rested'));
}
```
