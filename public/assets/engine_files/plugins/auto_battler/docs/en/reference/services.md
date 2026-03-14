# Services

The plugin registers five services:

## `start_battle`

Starts a battle. Validates leadership budget before starting. Returns `{ ok, reason? }`.

```js
const result = game.getService('start_battle').start({
    enemies: ['goblin', 'troll'],       // character instance IDs (auto-placed)
    noRetreat: false                     // optional
});

// Or with specific positions:
game.getService('start_battle').start({
    enemies: [
        { characterId: 'goblin', row: 0, col: 0 },
        { characterId: 'troll', row: 1, col: 1 }
    ]
});
```

## `check_leadership`

Returns the current leadership state:

```js
const { leaderId, budget, total, overflow } = game.getService('check_leadership').check();
// leaderId: string — current party leader character ID
// budget: number — leader's leadership stat value
// total: number — sum of all placed characters' leadership_cost
// overflow: boolean — true if total > budget
```

## `check_formation`

Check if the player's formation grid has any characters placed:

```js
const empty = game.getService('check_formation').isEmpty();
// true if no characters are placed
```

## `check_battle_ready`

Combined readiness check — formation is not empty and leadership is within budget:

```js
const { ready, empty, overflow } = game.getService('check_battle_ready').check();
// ready: boolean — true if formation has characters and no leadership overflow
// empty: boolean — true if no characters placed
// overflow: boolean — true if leadership cost exceeds budget
```

## `battle`

Query methods for the current battle:

```js
const svc = game.getService('battle');

svc.getCurrentBattle()        // Full battle state object (or null)
svc.isAlive(charId)           // Is character alive and on grid?
svc.isActive(charId)          // Same as isAlive
svc.getAliveOnSide(side)      // All living characters on 'player' or 'enemy' side
svc.getAllOnSide(side)         // All characters (alive + defeated) on a side
svc.getAll()                   // All characters from both sides
```
