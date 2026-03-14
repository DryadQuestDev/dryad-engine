# Abilities

Abilities are defined through the engine's ability system. The auto battler plugin extends ability definitions with metadata (gating conditions) and aspects (effects).

## Targeting

### Target Types

| Target | Description |
|---|---|
| `self` | Caster only |
| `enemy` | Any enemy character |
| `ally` | Any allied character |
| `tile_enemy` | A tile on the enemy grid (for AoE) |
| `tile_ally` | A tile on the allied grid (for AoE) |

### AoE Shapes

| Shape | Description |
|---|---|
| `single` | One target only |
| `row` | All characters in the same row |
| `column` | All characters in the same column |
| `cross` | Target + adjacent cells in 4 directions |
| `blast` | Rectangular area around target |
| `chain` | Hits target, then chains to nearby characters |
| `all` | Every character on the target side |

AoE size is controlled by `area_size`. Each effect in an ability can have its own AoE shape and size.

### Range

`range` defines the maximum column distance between caster and target. Melee abilities (range 1) can only hit front-line enemies from the front column.

`range_change` is an aspect that adds to the base range, allowing buffs to extend reach.

## Meta Fields (Gating)

These fields control **when** an ability can be used:

| Field | Description |
|---|---|
| `preparation` | Requires and consumes 1 Preparation token stack |
| `combo` | Requires and consumes 1 Combo token stack per target |
| `caster_min_health` | Caster HP must be at or below this % (desperation) |
| `caster_max_health` | Caster HP must be at or above this % (full-health bonus) |
| `target_min_health` | Target HP must be at or below this % (execute) |
| `target_max_health` | Target HP must be at or above this % |
| `charges` | Maximum casts before the ability is exhausted |
| `cd_on_battle_start` | Cooldown applied at the start of battle |
| `base_weight` | AI priority weight (higher = more likely to be chosen) |
| `is_autocast` | Only usable via the autocast system, not directly |

## Aspect Fields (Effects)

These fields define **what** the ability does. An ability can have multiple effects, each with its own aspects:

### Damage & Healing

| Field | Description |
|---|---|
| `chance` | Probability of this effect triggering (0–1) |
| `damage` | Damage as % of base stat |
| `damage_type` | `physical`, `fire`, `water`, `air`, `earth`, `arcane`, `poison`, `light`, `dark`, `absolute` |
| `healing` | Healing as % of sorcery |
| `lifesteal` | % of damage dealt returned as healing to caster |

### Tokens

| Field | Description |
|---|---|
| `token_apply` | Token ID to apply on target |
| `token_stacks` | Number of stacks to apply |
| `token_duration` | Duration in turns (omit for permanent) |
| `token_apply_self` | Token ID to apply on caster |
| `token_stacks_self` | Stacks to apply on caster |
| `token_duration_self` | Duration for self-applied token |

### Status Effects

| Field | Description |
|---|---|
| `status_apply` | Status ID to apply on target |
| `status_remove` | Status ID to remove from target |

### Cooldown & Charges

| Field | Description |
|---|---|
| `cooldown_change` | Modify an ability's cooldown (negative = reduce) |
| `charges_change` | Modify an ability's remaining charges |

### Movement

| Field | Description |
|---|---|
| `movement_x` | Push/pull target horizontally (columns) |
| `movement_y` | Push/pull target vertically (rows) |
| `movement_target` | `"target"` or `"caster"` |
| `relocate_self` | Caster teleports to target's tile |

### Other

| Field | Description |
|---|---|
| `summon` | Character template ID to spawn |
| `summon_count` | How many to spawn |
| `cleanse` | Remove tokens by polarity (ally cleanse = remove negative, enemy cleanse = remove positive) |

## Cooldowns & Charges

- **Cooldown** — After use, the ability enters cooldown for N turns. Reduced by 1 each turn tick.
- **Charges** — Limited uses per battle. When charges hit 0, the ability is exhausted.
- **`cd_on_battle_start`** — Some abilities start on cooldown (e.g., ultimates).

## Resource Costs

Abilities can have resource costs defined through the engine's built-in `costs` field on ability definitions. Costs are deducted immediately when the ability is used. If the character can't pay, the ability is unusable.
