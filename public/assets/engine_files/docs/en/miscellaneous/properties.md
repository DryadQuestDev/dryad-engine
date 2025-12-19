# Properties

Properties serve as **typed global variables** for your game. Use them for game-wide values like currencies, settings, counters, and flags that need to persist across saves.

Properties are defined in the engine editor under **General → Properties**.

---

## Key Features

### Auto-Serializable & Reactive

Properties are automatically saved and loaded with your game. Any changes trigger reactive updates in the UI - no manual save/load code needed.

### Live Schema Updates

If you add a new property during development and a player loads an old save file where that property didn't exist yet, the game will automatically initialize the newly added property with its default value.

This means you can safely add new properties without breaking existing saves.

### Default Value Behavior

**Important:** Changing the default value of a property that has already been initialized in a save file will **not** update that save. The saved value takes priority.

If you need to force a value change for existing saves, use the `game_initiated` event:

```js
game.on("game_initiated", () => {
  // Force update for existing saves if needed
  if (game.isNewGame === false) {
    let prop = game.getProperty("my_property");
    if (prop.currentValue === oldValue) {
      prop.currentValue = newValue;
    }
  }
});
```

---

## Property Types

| Type | Description | Default |
|------|-------------|---------|
| `number` | Numeric values with optional min/max bounds | `0` |
| `string` | Text values | `""` |
| `boolean` | True/false toggles | `false` |
| `array` | Lists of values | `[]` |
| `object` | Complex nested data (JSON) | `{}` |

---

## Number Properties

Number properties support additional options:

- **precision** - Decimal places (0 = integers, 2 = two decimals)
- **min_value** / **max_value** - Automatic clamping
- **can_overflow** - Allow exceeding max (still respects min)
- **is_negative** - UI hint that lower is better (e.g., damage taken)

---

## Accessing Properties in Dungeons

### Conditions

```
_property(gold) > 100
_property(settings.volume) >= 50
```

### Placeholders

```
You have |property(gold)| gold remaining.
Volume: |property(settings.volume)|%
```

### Actions

```js
// String format (= set, > add, < subtract)
{ property: "gold>100" }           // add 100 to gold
{ property: "score=0, lives<1" }   // set score to 0, subtract 1 from lives

// Object format (for setting complex values)
{ property: { settings: { volume: 80, theme: "dark" } } }
```

---

## API Reference

### Getting a Property

```js
const reputation = game.getProperty("reputation");
```

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier |
| `name` | `string?` | Display name |
| `type` | `string` | `'number'`, `'boolean'`, `'string'`, `'array'`, or `'object'` |
| `precision` | `number?` | Decimal places (number type only) |
| `isNegative` | `boolean?` | Whether lower values are better |
| `defaultValue` | `any` | The initial default value |
| `canOverflow` | `boolean?` | Whether value can exceed max |
| `currentValue` | `any` | The current value (get/set directly) |

---

### Value Methods

#### getCurrentValue()

Get the current value.

```js
const value = game.getProperty("gold").getCurrentValue();
```

#### setCurrentValue(value)

Set a new value. For numbers, automatically applies clamping and precision.

```js
game.getProperty("gold").setCurrentValue(500);
```

#### addCurrentValue(amount) - Number only

Add to the current value. Use negative numbers to subtract.

```js
game.getProperty("gold").addCurrentValue(100);  // gain 100
game.getProperty("gold").addCurrentValue(-50);  // lose 50
```

---

### Min/Max Methods (Number only)

#### getMinValue() / setMinValue(value)

Get or set the minimum allowed value.

```js
const min = game.getProperty("reputation").getMinValue(); // -100
game.getProperty("reputation").setMinValue(-50); // raise floor
```

#### getMaxValue() / setMaxValue(value)

Get or set the maximum allowed value.

```js
const max = game.getProperty("reputation").getMaxValue(); // 100
game.getProperty("reputation").setMaxValue(150); // raise cap
```

#### addMinValue(amount) / addMaxValue(amount)

Adjust min/max by an amount.

```js
game.getProperty("reputation").addMaxValue(20); // increase cap by 20
```

---

### Utility Methods

#### getRatio() - Number only

Get the ratio of current value to maximum (0.0 to 1.0). Useful for progress bars.

```js
const ratio = game.getProperty("reputation").getRatio(); // 0.75 = 75%
const barWidth = ratio * 100 + "%";
```

Returns `1` if max is not set or is `0`.

#### switch() - Boolean only

Toggle between true and false.

```js
game.getProperty("dark_mode").switch(); // toggle on/off
```

---

## Examples

### Reputation System

```js
// Check if player can afford something
const reputation = game.getProperty("reputation");
if (reputation.currentValue >= 100) {
  // give item
}
```

### Settings Object

```js
// Store complex settings
const settings = game.getProperty("settings");
settings.currentValue = {
  volume: 80,
  theme: "dark",
  notifications: true
};

// Access nested value in conditions: _property(settings.volume) > 50
```

### Progress Tracking

```js
// Track completion with min/max
const progress = game.getProperty("chapter_progress");
progress.setMaxValue(10); // 10 objectives
progress.addCurrentValue(1); // complete one

// Show progress bar
const percent = progress.getRatio() * 100; // 10%, 20%, etc.
```
