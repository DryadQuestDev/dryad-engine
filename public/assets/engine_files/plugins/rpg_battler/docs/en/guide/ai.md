# AI & Targeting

The AI evaluates every usable ability against every valid target and picks the highest-scoring action.

## Decision Process

1. Get all usable abilities for the current actor (respecting cooldowns, charges, costs, preparation, health gates, stun)
2. For each ability, find all valid targets based on target type
3. Score each (ability, target) pair
4. Pick the highest score
5. If no valid action, the character passes (turn ends)

## Scoring Factors

| Factor | Weight | Description |
|---|---|---|
| Base weight | `base_weight` or 5 | Starting score from ability meta |
| Damage | 0.1 per point | Total expected damage across all targets (after defenses) |
| Kill bonus | +5 | If damage would kill the target (damage >= HP + shield) |
| Overkill penalty | -2 | If damage exceeds target effective HP by 1.5x |
| Healing | 0.15 per point | Based on effective healing (capped at missing HP) scaled by missing HP ratio |
| AoE bonus | +2 per extra target | For each additional target beyond the first |
| Shield/status value | 0.08 per stack | Expected status stacks applied (target and self) |
| Status setup | +8 | For preparation or combo setup abilities that enable other abilities |
| Cleanse | +4 per status | For each cleansable battle status on the target |
| Cooldown refresh | +3 per ability | For each ability currently on cooldown when using a CD-reducing ability |

## Target Selection

The AI considers target validity based on:

- **Target type** -- Enemy abilities target enemies, ally abilities target allies, self targets self
- **Taunt enforcement** -- If any enemy has the `taunt` status, single-target enemy abilities can only target taunters
- **AoE handling** -- For `all_enemies` / `all_allies`, only one dummy target is evaluated since the ability hits all

For AoE abilities, the AI scores the full set of actual targets even though only one target ID is submitted.

## Dev Mode

In dev mode (`game.isDevMode()`), the AI logs the chosen action to the console for each enemy character:

```
[RPG AI] Goblin Warrior -> Slash on Hero Knight (score: 12.5)
```

This shows the character name, chosen ability, target name, and final score -- useful for tuning `base_weight` values and debugging AI behavior.
