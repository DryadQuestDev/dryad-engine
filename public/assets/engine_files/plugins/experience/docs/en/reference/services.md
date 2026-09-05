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

## `reward`

Defeat-reward and dungeon-scaling service (see the Rewards & Scaling guide).

| Method | Description |
|---|---|
| `getPending()` | Reactive pending-reward object the reward panel renders (`{ items, resources, characters }` – characters carry per-member XP gains, level range, and stat diffs) |
| `effectiveThreat(battleId)` | Battle definition's threat × the current dungeon-level scale |
| `getDungeonLevel()` | The current dungeon's (level group's) snapshot, 1 outside dungeons |
| `dungeonScale(level)` | Reward multiplier for a dungeon level |
| `recordResource(statId, amount, characterId)` | Record a resource gain for the reward display (merged per stat id + recipient). A stat flagged `is_resource` renders as a bar filling toward that character's cap; anything else as a plain line |
| `clearPending()` | Reset the pending reward. Also cashes in the panel's trash marks – any loot the player left behind is removed from the party bag here |
| `openRewardPopup()` | Open the reward popup (guarded against double-open) |

```js
// Scale a hand-authored payout by the same curve the generator uses
const reward = game.getService('reward');
const gold = Math.round(10 * reward.dungeonScale(reward.getDungeonLevel()));
```

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
