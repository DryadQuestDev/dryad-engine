# Services

The plugin registers three services:

## `start_battle`

Starts a battle. Accepts a battle definition ID or inline enemy configuration. Returns `{ ok, battle? }` on success or `{ ok: false, reason }` on failure.

```js
// Start a predefined battle
const result = game.getService('start_battle').start({
    battleId: 'forest_ambush'
});

// Start with inline enemies
const result = game.getService('start_battle').start({
    enemies: [
        { character_id: 'goblin_warrior', amount: 2 },
        { character_id: 'goblin_shaman', amount: 1, is_live_instance: false }
    ],
    background: 'forest_bg'
});

// Start with a specific player party
const result = game.getService('start_battle').start({
    battleId: 'boss_fight',
    playerParty: ['hero_knight', 'hero_mage']
});
```

**Parameters:**

| Field | Type | Description |
|---|---|---|
| `battleId` | string | ID of a battle definition from the Battles tab |
| `enemies` | array | Inline enemy list (overrides battleId enemies) |
| `playerParty` | string[] | Character IDs for the player side. Defaults to current party |
| `background` | string | Background asset ID. Falls back to battle definition's background |

**Enemy entry fields:**

| Field | Type | Description |
|---|---|---|
| `character_id` | string | Character template ID (or live character ID if `is_live_instance`) |
| `is_live_instance` | boolean | If true, fetch existing character instead of creating from template |
| `amount` | number | Number to spawn (default: 1) |

**Failure reasons:** `not_found`, `no_enemies`, `no_party`, `prevented` (emitter returned false).

## `end_battle`

End the current battle and restore previous game state.

```js
game.getService('end_battle').end('victory');
game.getService('end_battle').end('defeat');
```

**Parameters:**

| Field | Type | Description |
|---|---|---|
| `result` | string | `"victory"` or `"defeat"` |

When called:

1. The `battle_end` emitter fires
2. Battle-tagged statuses are removed from all participants
3. Spawned enemies are deleted
4. Saves and inventory are re-enabled
5. The previous game state is restored

## `rpg_party`

Party management helpers.

```js
const svc = game.getService('rpg_party');

const maxSize = svc.getMaxPartySize();  // Returns max_party_size from config (default: 4)
const isFull = svc.isPartyFull();       // true if current party >= max size
```

| Method | Returns | Description |
|---|---|---|
| `getMaxPartySize()` | number | Maximum party size from plugin config |
| `isPartyFull()` | boolean | Whether the current party has reached max size |
