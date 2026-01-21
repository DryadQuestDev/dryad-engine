# Store

Stores provide **flexible key-value storage** for your game. Unlike Properties, stores are untyped and created entirely through code - there are no editor forms.

Use stores when you need dynamic data structures that don't fit the Property model.

---

## Key Features

### Reactive & Serializable

Like properties, stores are automatically saved and loaded with your game. Changes trigger reactive UI updates.

### Untyped Flexibility

Stores accept any value type for any key. This makes them ideal for:
- Dynamic data generated at runtime
- Complex nested structures
- Data where the schema isn't known ahead of time

### Multiple Stores

Create as many named stores as you need to organize your data logically.

---

## When to Use Store vs Properties

| Use Case | Recommendation |
|----------|----------------|
| Known values (gold, score, settings) | Properties |
| Dynamic collections (visited NPCs, custom markers) | Store |
| Values defined in editor | Properties |
| Values created purely in code | Store |
| Typed with min/max bounds | Properties |
| Flexible structure | Store |

---

## API Reference

### createStore(id)

Create a new named store. Returns a `Map` object.

```js
const myStore = game.createStore("quest_data");
myStore.set("current_objective", "Find the key");
myStore.set("hints_shown", 3);
```

### getStore(id)

Get an existing store by ID. Throws an error if the store doesn't exist.

```js
const store = game.getStore("quest_data");
const objective = store.get("current_objective");
```

### hasStore(id)

Check if a store exists.

```js
if (game.hasStore("quest_data")) {
  // store exists
}
```

### deleteStore(id)

Delete a store and all its data.

```js
game.deleteStore("temporary_combat_data");
```

### useStore(id, key?)

Convenience wrapper that returns a reactive `ComputedRef` to store data.

```js
// Get reactive ref to entire store
const runsStore = game.useStore("runs");

// Get reactive ref to specific item
const run = game.useStore("runs", runUid);
```

This is equivalent to wrapping `getStore()` in `computed()` manually:

```js
// These are functionally identical:
const val = game.useStore("myStore", "key");
const val = vue.computed(() => game.getStore("myStore").get("key"));
```
---

## Map Methods

Stores are standard JavaScript `Map` objects. Common methods:

| Method | Description |
|--------|-------------|
| `store.get(key)` | Get a value |
| `store.set(key, value)` | Set a value |
| `store.has(key)` | Check if key exists |
| `store.delete(key)` | Remove a key |
| `store.clear()` | Remove all keys |
| `store.size` | Number of entries |

### Iterating

```js
const store = game.getStore("npcs_met");

// Iterate all entries
for (const [key, value] of store) {
  console.log(key, value);
}

// Get all keys
for (const key of store.keys()) {
  console.log(key);
}

// Get all values
for (const value of store.values()) {
  console.log(value);
}
```

---

## Examples

### Tracking NPCs Met

```js
// Create or get existing store
const npcsMet = game.createStore("npcs_met");

// When meeting an NPC
function meetNpc(npcId) {
  const count = npcsMet.get(npcId) || 0;
  npcsMet.set(npcId, count + 1);
}

// Check if met
function hasMetNpc(npcId) {
  return npcsMet.has(npcId);
}
```

### Custom NPC Relationship Data

```js
// Create store for NPC data
game.createStore("npc_relations");

// Store complex data per NPC
function updateRelation(npcId, data) {
  const relations = game.getStore("npc_relations");
  const existing = relations.get(npcId) || { trust: 0, gifts: [], conversations: 0 };
  relations.set(npcId, { ...existing, ...data });
}

// Usage
updateRelation("merchant", { trust: 50, gifts: ["apple", "gold"] });
updateRelation("merchant", { conversations: 5 });
```

### Temporary Combat State

```js
// Create at combat start
game.createStore("combat");
const combat = game.getStore("combat");
combat.set("turn", 1);
combat.set("enemies", ["goblin_1", "goblin_2"]);
combat.set("player_buffs", []);

// Clean up after combat
game.deleteStore("combat");
```
