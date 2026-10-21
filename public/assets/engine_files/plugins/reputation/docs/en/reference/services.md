# Services

## `reputation`

```js
const rep = game.getService('reputation');
```

| Method | Returns | Description |
|---|---|---|
| `get(id)` | `number` | Current value; untracked reads `0` |
| `isTracked(id)` | `boolean` | True when the character carries a value |
| `add(id, delta, { silent })` | `number \| null` | Change by `delta`, clamped; noted under the dialogue unless `silent` |
| `set(id, value)` | `number \| null` | Set the value, silently |
| `getTracked()` | `Character[]` | Every live character that carries a value |
| `getBounds()` | `{ min, max }` | The configured range |

## Examples

### A merchant's discount that follows her opinion

```js
game.on('trade_init', (inventory, item) => {
    if (inventory.id !== 'market_rosa') return;
    const rep = game.getService('reputation').get('rosa');
    const discount = rep >= 3 ? 20 : rep < 0 ? -10 : 0;
    for (const currency in item.price) {
        item.tradePrice.trader[currency] = Math.round(item.price[currency] * (100 - discount) / 100);
    }
});
```
