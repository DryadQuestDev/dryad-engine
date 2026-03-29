# Battle Flow

## Pure Turn-Based System

The RPG Battler uses a strict turn-based system. At the start of each round, all combatants are sorted by speed (descending). Each character then takes a full turn in that order before the next round begins.

Speed ties are broken in favor of the player side.

## Turn Order

```
Round 1:  [Fastest] → [2nd fastest] → ... → [Slowest]
Round 2:  [Re-sorted by speed] → ...
```

The turn order is established once at battle start and does not change between rounds. Characters who are defeated are skipped.

## Per-Character Turn

When a character's turn begins, the following steps happen in order:

### 1. Tick Cooldowns

All of this character's ability cooldowns are reduced by 1.

### 2. Tick Token Durations

All token instances on this character have their duration reduced by 1. Instances that reach 0 are removed.

### 3. Tick Status Durations

All battle-tagged statuses on this character have their duration reduced by 1. Statuses that reach 0 are removed.

### 4. Process DoT/HoT

Damage-over-time and heal-over-time token effects are processed. DoT damage respects defenses (armor, resistances). HoT healing respects `heal_received_mult`.

### 5. Death Check

If the character died from DoT damage, their death is processed (including death defiance check) and the turn is skipped.

### 6. Stun Check

If the character has stun stacks, one stack is consumed and the turn is skipped. A "stunned" message appears in the battle log.

### 7. Action Phase

If the character passes all checks, they may act:

- **Player characters** -- The camera zooms in and the ability panel appears. The player chooses an ability and target. The player can use multiple abilities per turn before choosing to end their turn.
- **Enemy characters** -- The AI selects the best ability and target automatically (see AI & Targeting). The camera stays zoomed out.

## Multi-Action Turns

Player characters are not limited to a single ability per turn. After using an ability, the ability panel reappears and the player can use another ability (subject to cooldowns, charges, and resource costs). The turn ends when the player clicks "End Turn".

## Zoom Camera

The camera has two states:

- **Zoomed In** -- Active during the player's turn. Shows the active character large with the ability panel. Only the active player character is visible.
- **Zoomed Out** -- Active during enemy turns, or when the player is choosing an ally/any target. Shows all combatants in their battle positions.

The player can toggle zoom manually during their turn.

## Battle Lifecycle

### Starting a Battle

When a battle starts:

1. Enemies are spawned from templates (or fetched if `is_live_instance` is true)
2. Turn order is calculated from all combatants' speed stats
3. Ability states are initialized (cooldowns from `cd_on_battle_start`, charges from ability meta)
4. Tokens are initialized from source stats (e.g., a character with `shield: 50` starts with 50 shield token stacks)
5. The `battle_start` emitter fires (return false to cancel)
6. Saves are disabled and the battle screen is shown
7. The first character's turn begins

### During Battle

Each round:

1. A "Turn N" log entry is added
2. The `battle_turn_start` emitter fires
3. Each character takes their turn in speed order

### Battle End

The battle ends immediately when all characters on one side are defeated:

- **Victory** -- All enemies defeated
- **Defeat** -- All player characters defeated

When the battle ends:

1. The result overlay appears (Victory or Defeat)
2. The player clicks Continue
3. The `battle_end` emitter fires
4. All battle-tagged statuses are removed from all participants
5. Spawned enemies are deleted
6. Saves are re-enabled and the previous game state is restored

## Battle Speed

Players can choose between three animation speeds via the `rpg_battle_speed` game setting:

| Speed | Multiplier | Effect |
|---|---|---|
| `slow` | 1.8x | Slower animations and delays |
| `medium` | 1.0x | Normal speed (default) |
| `fast` | 0.5x | Faster animations and delays |

This setting affects action delays, chain delays between enemy turns, and floating combat text duration.
