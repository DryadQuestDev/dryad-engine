# Emitters

| Emitter | Args | Description |
|---|---|---|
| `turn_advanced` | `(newTurn, turnsElapsed)` | Fired after the turn counter advances and limited status durations have ticked. `turnsElapsed` is how many turns passed in this advance (1 for a room move, N for `{turn: N}`). |

## Examples

### Per-turn resource generation

```js
game.on('turn_advanced', (newTurn, turnsElapsed) => {
    const hero = game.getCharacter('hero');
    if (!hero) return;
    hero.addResource('milk', hero.getStat('lactation') * turnsElapsed);
});
```

### Something happens every 10 turns

```js
game.on('turn_advanced', (newTurn, turnsElapsed) => {
    const before = Math.floor((newTurn - turnsElapsed) / 10);
    const after = Math.floor(newTurn / 10);
    if (after > before) {
        game.showNotification('A patrol passes through the halls...');
    }
});
```

### React to expired statuses

The engine fires `status_expired` per expired instance when a duration reaches 0 — from map turns and battle ticking alike:

```js
game.on('status_expired', (character, status, instance) => {
    if (status.id === 'blessing') {
        game.addFlash(`${character.getName()} feels the blessing fade.`);
    }
});
```
