# Autocasts

Autocasts are automatic ability triggers tied to character stats. They allow passive abilities that fire under specific conditions without AI involvement.

## Defining Autocasts

Autocasts are defined in the **Autocast Definitions** section of the Battle Config tab:

| Field | Description |
|---|---|
| `name` | Display name |
| `source` | Stat ID that gates activation (must be > 0) |
| `stat_is_chance` | If true, the stat value is used as a % chance to trigger |
| `trigger` | When to check: `battle_start`, `turn_start`, `on_attack`, `on_kill`, `on_damage_taken` |
| `target` | Targeting behavior |
| `ability` | Pool of abilities with weights (one is picked randomly) |

## Triggers

| Trigger | Fires When |
|---|---|
| `battle_start` | Once when combat begins |
| `turn_start` | Each time the turn clock ticks |
| `on_attack` | After the character uses any ability |
| `on_kill` | After the character kills an enemy |
| `on_damage_taken` | After the character takes damage |

## How It Works

1. The trigger event fires
2. For each autocast definition matching that trigger:
   - Check if the character has the `source` stat > 0
   - If `stat_is_chance`, roll against the stat value as a percentage
   - Pick an ability from the pool by weight
   - Execute the ability as if the character cast it

## Built-in Autocast Stats

| Stat | Description |
|---|---|
| `focus_fire` | On attack, apply `focus_mark` token on target (source-tracked). Damage formula adds stat value % per own mark on target. |

## Example

A character with `focus_fire = 1` and an autocast definition:

```
trigger: on_attack
source: focus_fire
stat_is_chance: false
ability: [{ id: "mark_target", weight: 1 }]
```

Every time this character attacks, they automatically cast `mark_target` on their target. Each mark stacks, increasing this attacker's damage against that target.
