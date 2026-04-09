# Services

## `xp`

XP management service.

### `addXp(characterId, amount)`

Add XP to a character. Wrapper for `character.addResource('xp', amount)`. Level-up happens automatically via the `character_resource_change` listener.

```js
const xp = game.getService('xp');
xp.addXp('hero', 100);
```

| Parameter | Type | Description |
|---|---|---|
| `characterId` | string | Character to award XP to |
| `amount` | number | XP to add |

### `getThreshold(level)`

Get the XP threshold for a given level based on the current config.

```js
const xp = game.getService('xp');
xp.getThreshold(1);  // e.g. 100
xp.getThreshold(5);  // e.g. 506 (exponential) or 300 (linear)
```

| Parameter | Type | Description |
|---|---|---|
| `level` | number | Level to get threshold for |
| **Returns** | number | XP needed to level up from that level |

### `getXpToNext(characterId)`

Get the remaining XP a character needs to reach the next level.

```js
const remaining = game.getService('xp').getXpToNext('hero');
// e.g. 45 (needs 45 more XP to level up)
```

| Parameter | Type | Description |
|---|---|---|
| `characterId` | string | Character to check |
| **Returns** | number | XP remaining to next level |

## Common Patterns

### Award XP after battle victory

```js
// In a game script (e.g., battle_rewards.mjs)
game.on('battle_end', (battle, result) => {
    if (result !== 'victory') return;
    const xpService = game.getService('xp');
    // Award 50 XP to each party member
    for (const char of game.getParty()) {
        if (char.getTrait('level') > 0) {
            xpService.addXp(char.id, 50);
        }
    }
});
```

### Show XP needed in UI

```js
const xpService = game.getService('xp');
const remaining = xpService.getXpToNext('hero');
const threshold = xpService.getThreshold(hero.getTrait('level'));
const current = hero.getResource('xp');
console.log(`${current}/${threshold} XP (${remaining} to next level)`);
```
