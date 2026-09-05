# Statuses

All combat-time effects in the RPG Battler are **statuses** — the same `character_statuses` data the engine uses everywhere. The plugin doesn't have its own separate token table; instead, it tags statuses with a `meta` bag of combat-specific flags (`is_battle`, `power_scaling`, `dot_damage_type`, etc.) and consumes them.

> Older versions of this plugin had a parallel `tokens` system with its own definitions, service (`rpg_tokens`), and UI component (`RpgTokenBricks`). All of that has been merged into the engine status system — `rpg_battler` now extends statuses rather than duplicating them.

## How combat statuses are defined

Combat statuses live in the engine's standard `character_statuses` editor tab. The plugin adds combat-specific behavior through three additions:

1. **`multi_stack` boolean** — engine-level field on the status. If `true`, each apply creates an independent instance with its own duration (DoT/poison-style). If `false` (default), reapply refreshes the single instance.
2. **`meta` field** — a key/value bag whose schema is defined in the `status_meta` editor tab. The plugin ships four meta keys for behavior shared across many statuses (DoT typing, scaling, lifecycle). Named one-off mechanics (shield / stun / taunt / thorns / death_defiance / regen) are recognized by **status id**, not by meta flags — there's only one of each, so the id IS the discriminator.
3. **`max_stacks`** — engine field. `0`, `-1`, or empty all mean unlimited. `1` = non-stackable. `> 1` = capped.

## Status meta keys (rpg_battler-consumed)

| Key | Type | Effect |
|---|---|---|
| `is_battle` | boolean | Status is wiped at end of battle, and ticks its duration on the affected character's turn |
| `power_scaling` | boolean | Stacks applied via `status_apply_target` are multiplied by `caster.power / 100` |
| `dot_damage_type` | chooseOne | Status deals DoT damage of this type each turn (`burn`, `poison`, `bleeding`, `absolute`), mitigated by the matching % resist; above 100% resist it heals |
| `is_channel` | boolean | Marks the status as a **channel**: it is removed from whoever holds it the moment its **caster** (the live instance's `source`) is stunned. Works for self-buffs and enemy debuffs alike. Channelled abilities (`meta.channel`) mint a runtime token with this flag plus a `channel_snapshot` (`{ abilityId, power, ability }`) it re-fires from each turn — see [Abilities](abilities.md) |
| `source` | chooseOne (character stat) | Stat whose value seeds this status's initial stacks at battle start |

You can register more meta keys in the `status_meta` editor tab; the plugin only reads the ones above.

## Hard-coded named mechanics

These mechanics are detected by status id (no meta flag):

| Status id | Behavior |
|---|---|
| `shield` | Each stack absorbs 1 incoming damage (non-absolute); consumed from **shortest-duration instance first** so soon-to-expire stacks get used before they're wasted |
| `regen` | Heals N HP per turn where N = current stacks |
| `stun` | Character skips their turn; 1 stack consumed at turn start |
| `taunt` | Forces enemies to target this character with single-target abilities |
| `thorns` | Reflects 1 flat damage per stack on every incoming hit, even one a shield absorbs (not consumed; instances expire on their own duration) |
| `reflect` | Returns 1% per stack of the damage that reaches health back to the attacker (shields stop it; not consumed) |
| `death_defiance` | Survives one lethal blow at 1 HP, consumes 1 stack |

If a game wants a variant (e.g. "magic_shield" with different absorb behavior), implement it via a `battle_damage_apply` listener — the plugin doesn't try to be everything.

## Independent instances (multi_stack)

When `multi_stack: true`, each apply appends a fresh instance to the status. The status object internally tracks `_instances: [{ stacks, duration, source }, ...]`.

```
character.getStatus("burn").getInstances() = [
    { stacks: 15, duration: 3, source: "enemy_mage" },
    { stacks: 8,  duration: 2, source: "enemy_archer" }
]
```

- `currentStacks` returns the sum across instances
- `duration` returns the longest remaining duration
- The UI renders **one brick per instance** for multi-stack statuses
- Each instance's duration ticks independently; expired instances are dropped
- `removeStacks(n)` removes FIFO from the oldest instance (used by shield absorb, stun consumption)

When `max_stacks` would be exceeded on a multi-stack apply, the new instance is capped to what fits within the limit. When `max_stacks` is 1 (single-stack), each apply refreshes the existing instance — duration goes to `max(existing, new)`, stacks add and clamp.

## Power scaling

When `meta.power_scaling: true`, the actual stacks applied scale with the caster's power stat:

```
actualStacks = round(caster.power * status_stacks_target / 100)
```

Example: a character with 50 power applying a status with `status_stacks_target: 20` would apply `round(50 * 20 / 100) = 10` actual stacks.

Use power scaling for statuses whose strength should scale with the caster (DoTs, shields, HoTs). Leave it off for gating statuses like `preparation` and `combo` where stacks are fixed counts.

## Duration

Duration is set by the ability that applies the status (`status_duration_target` / `status_duration_self` aspect), which overrides the status template's `duration` field. Omitting both makes the instance permanent (`-1`); it persists until cleansed or the battle ends.

Durations tick on the **affected character's turn** — not on a global clock. Step-by-step:

1. DoT/HoT effects fire (using the pre-tick stack counts).
2. Every `meta.is_battle` status's duration ticks by 1 (via the engine's `character.tickStatusDuration` helper).
3. Instances that reach 0 are dropped; statuses with no instances left are removed.

## Polarity & cleansing

- `positive` — Beneficial (shield, regen, preparation, taunt, death defiance). Cleansed by enemies.
- `negative` — Harmful (burn, poison, bleed, stun). Cleansed by allies.
- `neutral` — Cannot be cleansed.

The `cleanse` ability aspect removes **all `meta.is_battle` statuses** matching the appropriate polarity:

- Target is an **ally** of the caster → removes all `negative` battle statuses.
- Target is an **enemy** of the caster → removes all `positive` battle statuses.

## Source stats (battle-start seeding)

When a status's `meta.source` is set to a character stat id, that stat's value seeds the status's initial stack count at battle start. For example, the **Wind Mantle** status has `meta.source: "wind_mantle"` — a character with 5 in the `wind_mantle` stat (granted by an item / skill / sigil outside combat) starts the fight with the Wind Mantle status at 5 stacks.

Only non-resource stats are valid sources. Seeded instances are permanent (no duration).

## Built-in combat statuses

| Status | Polarity | `multi_stack` | `power_scaling` | Other meta | Description |
|---|---|---|---|---|---|
| `burn` | negative | yes | yes | `dot_damage_type: burn` | Burn damage each turn (`resist_burn`) |
| `poison` | negative | yes | yes | `dot_damage_type: poison` | Poison damage each turn (`resist_poison`) |
| `bleed` | negative | yes | yes | `dot_damage_type: bleeding` | Bleed damage each turn (`resist_bleed`) |
| `regen` | positive | yes | yes | — | Heal N HP per turn (N = stacks) |
| `shield` | positive | yes | yes | `source: shield` | Each stack absorbs 1 damage; consumed shortest-duration-first |
| `stun` | negative | no | — | — | Skip turn (max 1 stack) |
| `stagger` | negative | no | — | — | Accumulating; triggers a stun at threshold (see [Stagger](stagger.md)) |
| `taunt` | positive | no | — | — | Force enemies to target this character (max 1 stack) |
| `thorns` | positive | yes | yes | `source: thorns` | Reflects 1 flat damage per stack on every incoming hit, shielded or not (not consumed) |
| `reflect` | positive | yes | — | `source: reflect` | Returns 1% of damage reaching health per stack to the attacker (shields stop it; not consumed) |
| `death_defiance` | positive | no | — | — | Survive lethal once (max 1 stack) |
| `preparation` | positive | no | — | `source: preparation` | Gate for abilities requiring preparation |
| `combo` | positive | no | — | — | Gate consumed by combo abilities |
| `braced` | positive | no | — | — | Post-stun grace; `stagger_threshold_pct +100` |

All ship with `meta.is_battle: true`.

## Authoring tips

- New combat status? Define it in `character_statuses`, set `meta.is_battle: true`, and pick meta flags that match its behavior.
- Need a DoT? Set `multi_stack: true`, `meta.power_scaling: true`, and `meta.dot_damage_type` to one of `burn` / `poison` / `bleeding` (mitigated by the matching % resist) or `absolute`. Done — no code needed.
- Need a custom behavior the meta flags don't cover (e.g., "Composed: ticks down stagger each turn")? Listen on `character_turn_post_tick` or `status_added` in a game script.
- Want a status to start the battle with stacks based on an outside-combat stat? Add a stat in `character_stats`, then set the status's `meta.source` to that stat id.
