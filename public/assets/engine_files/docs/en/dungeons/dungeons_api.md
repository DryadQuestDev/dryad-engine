# Dungeons API Reference

API reference for working with dungeons in code.

---

## Game Methods

### enter(val)

Enter a dungeon room or dungeon.

```js
game.enter('tavern'); // Enter room in current dungeon
game.enter('forest.entrance'); // Enter specific dungeon and room
```

### playScene(sceneId, dungeonId?)

Play a specific scene in a dungeon. Accepts shorthand scene IDs that are resolved internally.

```js
// Shorthand formats (resolved to full ID internally)
game.playScene('#room1.greetings'); // Becomes #room1.greetings.1.1.1
game.playScene('greetings'); // Uses current room, becomes #currentRoom.greetings.1.1.1

// Full scene ID format: #room.scene.row.block.paragraph
game.playScene('#room1.greetings.1.1.1');

// With specific dungeon
game.playScene('#room1.intro', 'forest_dungeon');

// Using anchors
game.playScene('&my_anchor'); // Jump to anchor in current dungeon

// Exit current scene
game.playScene(null);
```

### resolveSceneId(value)

Resolve a shorthand scene reference to a full scene ID and dungeon ID. Useful when you need to resolve the scene before calling `playScene`, e.g., to validate or use with other methods.

```js
// Resolve dungeon.room.scene format
const { sceneId, dungeonId } = game.resolveSceneId('factions.goblins.scouts');
// sceneId: '#goblins.scouts.1.1.1', dungeonId: 'factions'
game.playScene(sceneId, dungeonId);

// Resolve room.scene format (uses current dungeon)
const resolved = game.resolveSceneId('tavern.greeting');
// sceneId: '#tavern.greeting.1.1.1', dungeonId: null

// Resolve anchor format
const anchor = game.resolveSceneId('&my_anchor');
// Returns the scene ID where the anchor is defined
```

### nextScene()

Proceed to the next scene in the current dialogue.

```js
game.nextScene();
```

### exitScene(skipEvents?)

Exit the current scene.

```js
game.exitScene(); // Normal exit with events
game.exitScene(true); // Skip exit events
```

### getDungeonId(dungeonId?)

Get the current dungeon ID. If a dungeon ID is passed, returns that ID instead.

```js
const id = game.getDungeonId(); // Get current dungeon ID
const id = game.getDungeonId('forest'); // Returns 'forest'
```

### getLineByDungeonId(lineId, dungeonId?)

Get a dungeon line by its exact ID. Unlike `playScene`, this does not resolve shorthand - you must provide the full line ID as stored in the dungeon.

```js
// Scene lines (full format: #room.scene.row.block.paragraph)
const scene = game.getLineByDungeonId('#room1.greetings.1.1.1');
console.log(scene.val); // The scene text content

// Choice lines
const choice = game.getLineByDungeonId('~room1.greetings.2.1');

// Encounter descriptions
const encounter = game.getLineByDungeonId('@room1.description');

// Templates
const template = game.getLineByDungeonId('$button');

// Special lines
const name = game.getLineByDungeonId('$dungeon_name');
console.log(name.val); // The dungeon's display name
```

### getDungeonDataById(id)

Get dungeon runtime data by ID. Returns a DungeonData object containing visited rooms, flags, and other state.

```js
const data = game.getDungeonDataById('forest');
console.log(data.visitedRooms); // Set of visited room IDs
console.log(data.getFlag('boss_defeated')); // Get flag value
```

### getDungeonType()

Get the current dungeon type.

```js
const type = game.getDungeonType(); // 'map', 'screen', or 'text'
```

### getDungeonName(dungeonId)

Get the display name of a dungeon.

```js
const name = game.getDungeonName('forest'); // "Dark Forest"
```

### getFlag(id)

Get a dungeon flag value. Supports scoped flags with `dungeonId.flagName` format.

```js
const flag = game.getFlag('explored'); // Current dungeon flag
const otherFlag = game.getFlag('forest.explored'); // Specific dungeon flag
```

---

## Asset Methods

### addAssets(data)

Add assets to the current scene.

```js
// By ID
game.addAssets('background_forest');
game.addAssets('tree1, tree2, rock');
game.addAssets(['npc_merchant', 'stall']);

// With asset properties
game.addAssets({ id: 'hero', x: 50, y: 30, animation: 'idle' });
game.addAssets({ id: 'spine_char', skins: ['default', 'armor'], animation: 'walk' });
```

### removeAssets(data)

Remove assets from the current scene.

```js
game.removeAssets('background_forest');
game.removeAssets(['tree1', 'tree2']);
```

### addFlash(flash)

Add a flash text effect to the current scene.

```js
game.addFlash('Critical Hit!');
```

### setMapZoomFactor(factor)

Set the map zoom factor for the dungeon map view.

```js
game.setMapZoomFactor(1.5); // Zoom in
game.setMapZoomFactor(0.5); // Zoom out
```

---

## DungeonLine Interface

A single line/scene entry in a dungeon. Line IDs use prefixes to indicate their type:

- `#` - Scene lines (e.g., `#room1.greetings.1.1.1`)
- `~` - Choice lines (e.g., `~room1.greetings.2.1`)
- `@` - Encounter descriptions (e.g., `@room1.description`)
- `!` - Encounter choices (e.g., `!room1.description.survey`)
- `$` - Templates (e.g., `$button`, `$dungeon_name`)

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Line identifier with type prefix |
| `val` | `string` | The content/text of the line |
| `params` | `Record<string, any>?` | Optional parameters (conditions, actions, etc.) |
| `anchor` | `string?` | Optional anchor for jumping with `&anchor_name` |

---

## DungeonData Interface

Runtime data for a dungeon instance. Tracks visited rooms, events, flags, and other state.

| Property | Type | Description |
|----------|------|-------------|
| `visitedRooms` | `Set<string>` | Set of visited room IDs |
| `visibleRooms` | `Set<string>` | Set of visible room IDs |
| `visitedEvents` | `Set<string>` | Set of visited event IDs |
| `viewEvents` | `Set<string>` | Set of viewed event IDs |
| `visitedInventories` | `Set<string>` | Set of visited inventory IDs |
| `visitedChoices` | `Set<string>` | Set of visited choice IDs |
| `flags` | `Map<string, number>` | Map of flag names to values |

### DungeonData Methods

```js
const data = game.getDungeonDataById('forest');

// Flag management
data.setFlag('boss_defeated', 1);
data.addFlag('treasure_found', 1);
const value = data.getFlag('boss_defeated'); // Returns 0 if not set
data.removeFlag('temporary_flag');

// Room checks
if (data.isRoomVisited('tavern')) {
  console.log('Player has visited the tavern');
}

if (data.isRoomVisible('secret_room')) {
  console.log('Secret room is visible on map');
}

// Event checks
if (data.isEventVisited('intro_event')) {
  console.log('Player has seen the intro');
}
```
