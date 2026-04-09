# XP Formulas

The XP threshold (amount needed to level up) scales with each level based on the config settings.

## Config Fields

| Field | Default | Description |
|---|---|---|
| `xp_base` | 100 | Base XP value used in formula calculations |
| `xp_formula` | `exponential_percent` | Scaling formula (see below) |
| `xp_growth` | 50 | Growth percentage (used by `linear_percent` and `exponential_percent`) |
| `xp_table` | -- | Custom thresholds per level (used by `custom_table`) |

---

## Exponential Percent

```
threshold(level) = xp_base × (1 + xp_growth / 100) ^ (level - 1)
```

Each level's threshold multiplies the previous by `(1 + growth/100)`. Accelerating curve – early levels are cheap, later levels grow fast. Similar to RuneScape.

### Example: xp_base = 100, xp_growth = 50

| Level | Threshold |
|---|---|
| 1 | 100 |
| 2 | 150 |
| 3 | 225 |
| 5 | 506 |
| 10 | 3,844 |
| 20 | 148,024 |

**When to use:** Long-term progression with a natural soft cap at high levels.

---

## Linear Percent

```
threshold(level) = xp_base × (1 + xp_growth / 100 × (level - 1))
```

Each level adds a flat percentage of the base. Steady, predictable growth.

### Example: xp_base = 100, xp_growth = 50

| Level | Threshold |
|---|---|
| 1 | 100 |
| 2 | 150 |
| 3 | 200 |
| 5 | 300 |
| 10 | 550 |
| 20 | 1,050 |

**When to use:** Shorter campaigns or when XP rewards also scale linearly. Predictable pacing.

---

## Quadratic

```
threshold(level) = xp_base × level²
```

Moderate acceleration. The most common formula in standard RPGs with 20–60 level caps. Used by early World of Warcraft and many indie RPGs.

### Example: xp_base = 10

| Level | Threshold |
|---|---|
| 1 | 10 |
| 2 | 40 |
| 3 | 90 |
| 5 | 250 |
| 10 | 1,000 |
| 20 | 4,000 |

**When to use:** Most general-purpose RPGs. Balanced curve that doesn't feel too grindy or too fast.

---

## Cubic

```
threshold(level) = xp_base × level³
```

Aggressive late-game scaling. Used by Pokemon (some growth rates), Dark Souls, and action RPGs where high-level content is meant to be a significant investment.

### Example: xp_base = 5

| Level | Threshold |
|---|---|
| 1 | 5 |
| 2 | 40 |
| 3 | 135 |
| 5 | 625 |
| 10 | 5,000 |
| 20 | 40,000 |

**When to use:** Games where late-game leveling should feel like a major achievement. Creates a strong sense of power progression.

---

## Custom Table

```
threshold(level) = xp_table[level - 1]
```

Define exact thresholds per level. Full designer control, no math. If the character's level exceeds the table length, the last entry is used.

### Example: xp_table = [50, 100, 200, 350, 500, 750, 1000, 1500]

| Level | Threshold |
|---|---|
| 1 | 50 |
| 2 | 100 |
| 3 | 200 |
| 4 | 350 |
| 5 | 500 |
| 8 | 1,500 |
| 9+ | 1,500 (last entry) |

**When to use:** Story-driven RPGs, boss-progression games, or any game where you want precise control over every level. Used by Diablo 2, Fire Emblem, and many JRPGs.

---

## Comparison

All formulas with similar early pacing (roughly 100 XP at level 1):

| Level | Linear (g=50) | Exponential (g=50) | Quadratic (b=100) | Cubic (b=100) |
|---|---|---|---|---|
| 1 | 100 | 100 | 100 | 100 |
| 2 | 150 | 150 | 400 | 800 |
| 3 | 200 | 225 | 900 | 2,700 |
| 5 | 300 | 506 | 2,500 | 12,500 |
| 10 | 550 | 3,844 | 10,000 | 100,000 |

- **Linear** – gentlest curve, stays manageable
- **Exponential** – moderate early, steep later
- **Quadratic** – balanced middle ground
- **Cubic** – aggressive, extreme at high levels

Choose based on your game's level cap and intended grind curve.

---

## Overflow

When a character gains more XP than needed to level up, the excess carries over. If it's enough for multiple levels, they all happen at once.

**Example:** Character at level 1 (threshold 100, current XP 80) gains 250 XP:
1. XP becomes 330 (80 + 250)
2. Level 1 → 2: 330 – 100 = 230 overflow
3. Level 2 → 3: 230 – 150 = 80 overflow (exponential, growth 50%)
4. 80 < 225 (level 3 threshold), stop. Character is now level 3 with 80/225 XP.

## Accessing from Scripts

```js
const xpService = game.getService('xp');

// Get threshold for any level
const thresh = xpService.getThreshold(5); // depends on config formula

// Get remaining XP for a character
const remaining = xpService.getXpToNext('hero');
```
