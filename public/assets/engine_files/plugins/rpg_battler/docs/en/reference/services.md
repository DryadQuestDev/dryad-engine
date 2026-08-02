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
| `background` | string | Background asset ID. Falls back to the battle definition's background, then the current room's / dungeon's configured default asset |

**Enemy entry fields:**

| Field | Type | Description |
|---|---|---|
| `character_id` | string | Character template ID (or live character ID if `is_live_instance`) |
| `is_live_instance` | boolean | If true, fetch existing character instead of creating from template |
| `amount` | number | Number to spawn (default: 1) |

**Failure reasons:** `not_found`, `no_enemies`, `no_party`, `prevented` (emitter returned false), `already_active` (a battle is already running — `start()` never replaces a live battle).

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

### Mid-battle scenes — plain `game.playScene()`

During battle, any `game.playScene()` call is intercepted by the plugin and **queued** — if one scene is already showing, the next waits its turn — and the **battle flow pauses** (no turns or actions advance, battle input is blocked) until the player clicks through every queued scene. A scene requested mid-action starts after that action's animations finish. Full scene flow is supported: multiple paragraphs, choices, and branches all work; the battle resumes when the whole scene exits. No dedicated service call is needed.

Queued scenes start on a **clean stage**: the interrupted scene's actors and assets are cleared instantly before each one plays (stage your own cast with plain `{actor: "char->slot"}` — no `{actor: false}` clears needed), and they play as **cutaways** (`root: false`) — no default backgrounds, dungeon music, or `scene_play` default-actor staging, even in script-started battles.

Queued scenes **fade** (an engine behavior for all scene dialogues): the dialogue fades in when the scene starts, and exiting runs the engine's graceful close — actors leave with their slot **exit animations** while the dialogue fades out — before the battle resumes. Actors entering use their slot **enter animations** as usual.

The story scene that triggered the battle is snapshotted before the first queued scene and restored afterward — its actors, assets, and choices come back with it, so the post-victory `nextScene()` resume works unchanged.

```js
const battle = game.getService('rpg_battle');

// Chyseleia comments on the first turn
game.on('battle_turn_start', (turn) => {
    if (turn === 1 && battle.inBattle('prologue_golems')) {
        game.playScene('1.fight_golems_1.1.1.1');
    }
});
```

Limitation: for battles started from a script (no triggering story scene), a scene's exit briefly leaves no active scene — a viable room event could fire mid-battle. Content-started battles are unaffected.

### `isScenePlaying()`

True while queued battle scenes are pending or one is on screen (battle flow paused).

```js
if (!game.getService('rpg_battle').isScenePlaying()) { ... }
```

### `inBattle(battleId)`

True when the running battle definition matches `battleId`. False outside battle and for ad-hoc battles.

```js
if (game.getService('rpg_battle').inBattle('prologue_clover')) { ... }
```

### `checkStaggerThreshold(characterId)`

Check whether the character's `stagger` status has crossed their effective threshold; if so, strip stagger, apply `stun` (1 stack), and refresh `braced`. Same logic that runs automatically inside the ability pipeline — exposed here for game scripts that apply stagger from custom listeners (e.g. an on-damage reactive like Brittle).

```js
const battle = game.getService('rpg_battle');
const target = game.getCharacter(targetId);

target.addStatus(game.createStatus('stagger'), { stacks: 1, source: casterId });
battle.checkStaggerThreshold(targetId);
```


## Status operations (engine API)

The plugin no longer has a `rpg_tokens` service. Combat statuses are regular engine statuses — read and mutate them via the standard `Character` API. See [Statuses](../guide/statuses.md) for the full data model.

```js
const target = game.getCharacter(targetId);

// Read current total stacks (sum across instances)
const burnStacks = target.getStatus('burn')?.currentStacks ?? 0;

// Apply (multi_stack=true appends an instance; single-stack refreshes)
target.addStatus(game.createStatus('poison'), { stacks: 5, duration: 3, source: casterId });

// Remove stacks (FIFO from oldest instance); drops the status automatically if empty
target.removeStatusStacks('shield', 1);

// Iterate per-instance for multi_stack statuses
for (const inst of target.getStatus('burn')?.getInstances() ?? []) {
  console.log(inst.stacks, inst.duration, inst.source);
}
```

`Character.addStatus(status, applyArgs?)` is the single entry point — the engine handles refresh-on-reapply for single-stack statuses and per-instance append for `multi_stack: true` statuses automatically.


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
