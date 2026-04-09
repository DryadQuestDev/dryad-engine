# Services

The plugin registers the following services:

## `rpg_battle`

Start and end battles.

### `start(params)`

Accepts a battle definition ID or inline enemy configuration. Returns `{ ok, battle? }` on success or `{ ok: false, reason }` on failure.

```js
const battle = game.getService('rpg_battle');

// Start a predefined battle
const result = battle.start({ battleId: 'forest_ambush' });

// Start with inline enemies
const result = battle.start({
    enemies: [
        { character_id: 'goblin_warrior', amount: 2 },
        { character_id: 'goblin_shaman', amount: 1, is_live_instance: false }
    ],
    background: 'forest_bg'
});

// Start with a specific player party
const result = battle.start({
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

### `end(result)`

End the current battle and restore previous game state.

```js
game.getService('rpg_battle').end('victory');
game.getService('rpg_battle').end('defeat');
```

| Field | Type | Description |
|---|---|---|
| `result` | string | `"victory"` or `"defeat"` |

When called:

1. The `battle_end` emitter fires
2. Battle-tagged statuses are removed from all participants
3. Spawned enemies are deleted
4. Saves and inventory are re-enabled
5. The previous game state is restored

### `addDefeated(battleId)`

Manually mark a battle definition as defeated. Useful for scripted victories or debug.

```js
game.getService('rpg_battle').addDefeated('forest_ambush');
```

Victories from `end('victory')` are tracked automatically -- this is for cases where you want to mark a battle defeated without fighting it.

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

## `rpg_battle_log`

Push entries to the battle log from game scripts. Turn number is auto-filled from the current battle.

```js
const log = game.getService('rpg_battle_log');

// Log a text entry grouped under the active character's action
log.push(casterId, 'generates <b>20</b> Rage');

// Show a different character's face icon (e.g., target takes damage, generates rage)
log.push(attackerId, game.getLine('log_rage_gen', { amount: 20 }), targetId);

// Use with locale
log.push(character.id, game.getLine('log_rage_gen', { amount: 20 }));
```

| Parameter | Type | Description |
|---|---|---|
| `actorId` | string | Character whose action block this entry groups with |
| `text` | string | HTML text for the log entry |
| `targetId` | string? | Optional -- shows this character's face icon next to the text |

## `rpg_floating_text`

Show floating text popups above characters during battle.

```js
const floats = game.getService('rpg_floating_text');

// Show "+20" in red above a character
floats.add({ characterId: 'hero', text: '+20', cssClass: 'rage', color: 'e04040' });

// Show text with an icon
floats.add({ characterId: 'hero', text: 'Shielded!', cssClass: 'shield', icon: 'path/to/icon.webp' });
```

**Fields (`RpgFloatingTextOpts`):**

| Field | Type | Description |
|---|---|---|
| `characterId` | string | Character to show the float above |
| `text` | string | Text to display |
| `cssClass` | string | CSS class appended to `rpg-floating-text` for styling |
| `icon` | string\|null | Optional icon image path |
| `color` | string | Optional hex color (without `#`), sets `--float-color` CSS variable |
