# Tokens

Tokens are the status effect system. Each token definition can have multiple effect types, and each application creates an independent instance with its own stacks and duration.

## Token Properties

| Field | Description |
|---|---|
| `id` | Unique identifier |
| `name` | Display name |
| `icon` | Icon image |
| `color` | Display color |
| `max_stacks` | Cap on total stacks across all instances (0 = unlimited) |
| `polarity` | `positive`, `negative`, or `neutral` — determines cleanse behavior |
| `power_scaling` | If true, stacks scale with caster's power stat |
| `effects` | Array of effect types applied by this token |

## Effect Types

| Effect | Description |
|---|---|
| `dot` | Damage over time — deals damage each turn based on stacks and `damage_type` |
| `hot` | Heal over time — heals each turn based on stacks |
| `absorb` | Shield — absorbs incoming damage before it hits HP |
| `stun` | Sets character speed to 0, preventing actions |
| `death_defiance` | Survives lethal damage once per stack, left at 1 HP |

## Independent Instances

Each `applyToken()` call creates a **separate instance**:

```
battle.tokens["char_id"]["burn"] = [
    { stacks: 15, duration: 3, source: "enemy_mage" },
    { stacks: 8,  duration: 2, source: "enemy_archer" }
]
```

Multiple instances from different sources coexist. When `max_stacks` is exceeded, the oldest instances are removed first (FIFO).

## Power Scaling

When `power_scaling` is enabled on a token definition, the actual stacks applied scale with the caster's relevant stat:

```
actualStacks = round(scalingStat × abilityTokenStacks / 100)
```

The scaling stat is determined by the token's first effect damage type: `power` for physical, `sorcery` for elemental/healing, `max(power, sorcery)` for absolute.

Example: a character with 50 power applying a physical DoT token with 20 stacks would apply `round(50 × 20 / 100) = 10` actual stacks.

## Duration

Duration is defined by the ability that applies the token (`token_duration` aspect), not by the token definition itself. Omitting duration makes the token permanent.

Each turn tick reduces duration by 1. When duration reaches 0, the instance is removed.

## Polarity & Cleansing

- `positive` — Beneficial effect (e.g., shield, regen). Can be cleansed by enemies.
- `negative` — Harmful effect (e.g., burn, stun). Can be cleansed by allies.
- `neutral` — Cannot be cleansed by either side.

The `cleanse` ability aspect removes all token instances matching the appropriate polarity based on the target relationship.

## Built-in Tokens

| Token | Polarity | Effect | Description |
|---|---|---|---|
| `shield` | positive | absorb | Absorbs damage before HP |
| `preparation` | positive | — | Gate for abilities requiring preparation |
| `combo` | positive | — | Gate for abilities requiring combo stacks |
| `regen` | positive | hot | Heal over time |
| `focus_mark` | neutral | — | Tracks focus fire bonus damage |
| `burn` | negative | dot (fire) | Fire damage over time |
| `poison` | negative | dot (poison) | Poison damage over time |
| `bleed` | negative | dot (physical) | Physical damage over time |
| `stun` | negative | stun | Prevents acting |
| `death_defiance` | positive | death_defiance | Survive lethal once |
