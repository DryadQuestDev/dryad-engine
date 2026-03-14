# AI & Targeting

The AI evaluates every usable ability against every valid target position and picks the highest-scoring action.

## Decision Process

1. Get all usable abilities for the current actor
2. For each ability, find all valid target positions (in range, correct side)
3. Score each (ability, target) pair
4. Pick the highest score
5. If no valid action, the character passes

## Scoring Factors

| Factor | Weight | Description |
|---|---|---|
| Base weight | 1× | From ability meta `base_weight` |
| Damage | Proportional | Total expected damage across all targets |
| Kill bonus | 5× | If damage would kill the target |
| Overkill penalty | -2× | If damage greatly exceeds target HP |
| Healing | Scaled | Based on target's missing HP ratio |
| AoE bonus | 2× per target | For each additional target beyond the first |
| Shield value | Proportional | Expected shield absorption amount |
| Token setup | Bonus | For abilities that enable preparation/combo |
| Cleanse | Bonus per token | For each removable token on target |
| Cooldown refresh | 3× | For abilities that reduce ally cooldowns |
| Movement | Evaluated | Score for repositioning out-of-range units |

## Target Selection

The AI considers target validity based on:

- **Range** — Target must be within ability range (column distance)
- **Line of sight** — For some shapes, characters in front columns block access to rear
- **Target type** — Enemy abilities target enemies, ally abilities target allies
- **Health gates** — `target_min_health` / `target_max_health` thresholds

## Dev Mode

In dev mode, the AI logs all scored (ability, target) pairs to the console, allowing developers to debug AI decisions and tune weights.
