# Locale

The locale system provides centralized text management for your game. Use it to store UI strings, messages, labels, and any text that may need translation.

Locale entries are defined in the engine editor under **General > Locale**.

---

## Locale Entries

Each entry has:

| Field | Description |
|-------|-------------|
| `id` | Key used to look up this text in code |
| `val` | The text value. Supports `|placeholder|` syntax for dynamic content |
| `tags` | Optional tags for filtering and organization |

---

## API

### game.getLine(lineId, params?)

Returns the localized string for the given ID, with placeholder substitution.

| Parameter | Type | Description |
|-----------|------|-------------|
| `lineId` | `string` | Locale entry ID |
| `params` | `Record<string, any>` | Values to substitute for `|placeholder|` tokens |

Returns `[lineId]` if no entry is found (easy to spot missing translations).

```js
// Simple lookup
const label = game.getLine("battle_start");
// "The battle begins!"

// With placeholders
const msg = game.getLine("damage_dealt", { name: "Goblin", amount: 50 });
// Locale val: "|name| took |amount| damage!"
// Result: "Goblin took 50 damage!"
```

---

## Placeholders

Use `|placeholder|` syntax in locale values for dynamic content. All occurrences of a placeholder are replaced.

**Locale entry:**
```
id: "item_acquired"
val: "You found |count|x |item|!"
```

**Code:**
```js
game.getLine("item_acquired", { count: 3, item: "Iron Sword" });
// "You found 3x Iron Sword!"
```

---

## Ability Description Integration

The locale system integrates with `buildAbilityEffectsDescription` and `buildAbilityMetaDescription`. Inline chooseOne/chooseMany option values (e.g., `"fire"`, `"all_targets"`) are automatically looked up in the locale when generating descriptions.

**Example:** An ability with `damage_type: "fire"` and the ingame_description template `"Deal [v] [damage_type] damage"`:

- Without locale entry for `"fire"`: renders as `"Deal 50 fire damage"`
- With locale entry `id: "fire"`, `val: "Fire"`: renders as `"Deal 50 Fire damage"`

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Add locale entries | General > Locale in the editor |
| Look up a string | `game.getLine("my_key")` |
| Use placeholders | `game.getLine("key", { name: "value" })` |
| Localize ability options | Add locale entries matching option IDs |
| Ship plugin defaults | Add `locale` array to plugin `data` field |
