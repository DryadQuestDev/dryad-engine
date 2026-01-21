# Data

The `game.getData()` method provides access to the raw data defined in the engine editor. Use it when you need to reference editor-defined data for custom logic.

**Note:** By default, returns a deep copy of the data. You can safely modify the returned data without affecting the source.

---

## API Reference

### getData(path, original?)

Returns a `Map` of data indexed by ID.

| Parameter | Type | Description |
|-----------|------|-------------|
| `path` | `string` | Data path to fetch |
| `original` | `boolean` | If `true`, returns the original data without copying (faster, but do not mutate!) |

```js
// Default: returns a deep copy (safe to modify)
const stats = game.getData("character_stats");
const healthStat = stats.get("health");

// With original=true: returns original data (faster, read-only)
const templates = game.getData("character_templates", true);
```

**Performance tip:** Pass `true` as the second parameter when you only need to read data and won't modify it. This skips the deep copy and improves performance.

---

## Available Data Paths

### Character Data

| Path | Description |
|------|-------------|
| `character_stats` | Character stat definitions |
| `character_stats_visible` | Stats marked as visible |
| `character_traits` | Character trait definitions |
| `character_attributes` | Character attribute definitions |
| `character_skin_layers` | Skin layer definitions |
| `character_templates` | Character template definitions |
| `character_statuses` | Status effect definitions |
| `character_slot_templates` | Character slot templates |

### Skills & Abilities

| Path | Description |
|------|-------------|
| `skill_trees` | Skill tree definitions |
| `skill_slots` | Skill slot definitions |
| `ability_definitions` | Ability definitions |
| `ability_templates` | Ability templates |

### Items

| Path | Description |
|------|-------------|
| `item_templates` | Item template definitions |
| `item_inventories` | Inventory template definitions |
| `item_traits` | Item trait definitions |
| `item_attributes` | Item attribute definitions |
| `item_properties` | Item property definitions |
| `item_slots` | Equipment slot definitions |
| `item_recipes` | Crafting recipe definitions |

### Dungeons

| Path | Description |
|------|-------------|
| `dungeons/{id}/content_parsed` | Parsed dungeon content (lines) |
| `dungeons/{id}/rooms` | Room definitions |
| `dungeons/{id}/encounters` | Encounter definitions |

### Pools

| Path | Description |
|------|-------------|
| `pool_definitions` | Pool definition data (source, filter fields) |
| `pool_entries` | Pool entry data (weights, filters) |

### Other

| Path | Description |
|------|-------------|
| `properties` | Global property definitions |
| `assets` | Asset definitions |
| `music` | Music track definitions |
| `sounds` | Sound effect definitions |
| `galleries` | Gallery definitions |
| `custom_choices` | Custom choice definitions |

### Plugin Data

| Path | Description |
|------|-------------|
| `plugins_data/{plugin_id}/{schema_id}` | Custom plugin schema data |

---

## Examples

### Get All Character Stats

```js
const stats = game.getData("character_stats");

for (const [id, stat] of stats) {
  console.log(id, stat.name);
}
```

### Get a Specific Item Template

```js
const items = game.getData("item_templates");
const sword = items.get("iron_sword");

console.log(sword.name, sword.description);
```

### Access Dungeon Content

```js
const lines = game.getData("dungeons/intro/content_parsed");
const specificLine = lines.get("greeting");

console.log(specificLine.val);
```

### Check Stat Configuration

```js
const stats = game.getData("character_stats");
const health = stats.get("health");

if (health.is_resource) {
  console.log("Health is a resource stat");
}
```
