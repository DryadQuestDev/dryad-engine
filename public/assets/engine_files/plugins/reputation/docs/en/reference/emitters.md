# Emitters

| Emitter | Args | Description |
|---|---|---|
| `reputation_change` | `(character, oldValue, newValue, delta)` | Fired after a character's reputation changes, silent changes included. A change the min/max clamp swallows never fires. |

## Examples

### React when someone turns hostile

```js
game.on('reputation_change', (character, oldValue, newValue) => {
    if (oldValue >= 0 && newValue < 0) game.setState(`${character.id}_cold`, true);
});
```
