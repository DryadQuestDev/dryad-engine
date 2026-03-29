# Tokens

Tokens are the status effect system. Each token definition can have multiple composable effects, and each application creates an independent instance with its own stacks and duration.

## Token Properties

| Field | Description |
|---|---|
| `id` | Unique identifier (e.g., `burn`, `shield`, `taunt`) |
| `name` | Display name shown in UI |
| `description` | Description shown on hover in character viewer |
| `icon` | Icon image displayed on the character overlay |
| `color` | Color for floating combat text (hex). Overrides default |
| `max_stacks` | Cap on total stacks across all instances. 0 = unlimited |
| `polarity` | `positive`, `negative`, or `neutral` -- determines cleanse behavior |
| `power_scaling` | If true, applied stacks scale with caster's power stat |
| `source` | Character stat that sets initial stacks at battle start. Empty = starts at 0 |
| `effects` | Array of composable effect types |

## Effect Types

| Effect | Description |
|---|---|
| `dot` | Damage over time -- deals damage each turn based on stacks. Requires `damage_type` and `value` per stack |
| `hot` | Heal over time -- heals each turn based on stacks. Uses `value` per stack |
| `absorb` | Shield -- absorbs incoming damage before it hits HP. Each stack absorbs `value` damage |
| `stun` | Skip turn -- character cannot act. One stack is consumed per turn |
| `death_defiance` | Survive lethal damage once per stack, left at 1 HP |
| `taunt` | Force enemies to target this character with single-target enemy abilities |
| `thorns` | Reflect a percentage of incoming damage back to the attacker. `value` = % reflected per stack |

## Independent Instances

Each `applyToken()` call creates a **separate instance**:

```
battle.tokens["char_id"]["burn"] = [
    { stacks: 15, duration: 3, source: "enemy_mage" },
    { stacks: 8,  duration: 2, source: "enemy_archer" }
]
```

Multiple instances from different sources coexist. Total stacks for effect calculations is the sum across all instances. When `max_stacks` would be exceeded, the allowed stacks are capped to fit within the limit.

When stacks need to be removed (e.g., shield absorbing damage, stun consumed), they are removed FIFO from the oldest instances first.

## Power Scaling

When `power_scaling` is enabled on a token definition, the actual stacks applied scale with the caster's power:

```
actualStacks = round(power * abilityTokenStacks / 100)
```

Example: a character with 50 power applying a token with `token_stacks: 20` would apply `round(50 * 20 / 100) = 10` actual stacks.

Use power scaling for tokens whose strength should scale with the caster (DoTs, shields, HoTs). Leave it off for gating tokens like `preparation` and `combo` where stacks are fixed counts.

## Duration

Duration is defined by the **ability** that applies the token (`token_duration` / `token_duration_self` aspect), not by the token definition itself. Omitting duration makes the token permanent (it persists until cleansed or the battle ends).

Token durations tick on the **affected character's turn** -- not on a global clock. At the start of each character's turn, all token durations on that character are reduced by 1. Instances that reach 0 are removed before DoT/HoT processing.

## Polarity & Cleansing

- `positive` -- Beneficial effect (shield, regen, preparation, taunt, death defiance). Can be cleansed by enemies.
- `negative` -- Harmful effect (burn, poison, bleed, stun). Can be cleansed by allies.
- `neutral` -- Cannot be cleansed by either side.

The `cleanse` ability aspect removes **all** token instances matching the appropriate polarity:

- If the target is an **ally** of the caster: removes all `negative` tokens
- If the target is an **enemy** of the caster: removes all `positive` tokens

## Source Stats

Token definitions can reference a `source` character stat. At battle start, if a character has a non-zero value for that stat, an initial token instance is created with that many stacks (no duration -- permanent). This lets characters start battles with innate shields, preparation stacks, thorns, etc.

## Built-in Tokens

| Token | Polarity | Scaling | Effect | Description |
|---|---|---|---|---|
| `burn` | negative | yes | dot (fire) | Fire damage over time |
| `poison` | negative | yes | dot (poison) | Poison damage over time |
| `bleed` | negative | yes | dot (physical) | Physical damage over time |
| `regen` | positive | yes | hot | Heal over time |
| `shield` | positive | yes | absorb | Absorbs damage before HP |
| `stun` | negative | no | stun | Skip turn (max 1 stack) |
| `taunt` | positive | no | taunt | Force enemies to target this character (max 1 stack) |
| `thorns` | positive | no | thorns (20%) | Reflects 20% of incoming damage per stack |
| `death_defiance` | positive | no | death_defiance | Survive lethal once (max 1 stack) |
| `preparation` | positive | no | -- | Gate token for abilities requiring preparation |
| `combo` | positive | no | -- | Gate token consumed by combo abilities |
