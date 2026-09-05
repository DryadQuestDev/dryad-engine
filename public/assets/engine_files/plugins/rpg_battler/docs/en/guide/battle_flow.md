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

### 2. Process DoT/HoT

Damage-over-time and heal-over-time status effects are processed using the pre-tick stack counts. DoT damage respects defenses (armor, resistances). HoT healing respects `heal_received_mult`. DoT damage type is read from `meta.dot_damage_type`; HoT statuses are flagged with `meta.hot`.

### 3. Tick Status Durations

Every status flagged `meta.is_battle` on this character has each of its instances' duration reduced by 1. Instances that reach 0 are removed; statuses whose last instance expires are dropped entirely.

### 4. Stagger Bonus-Loss Bookkeeping

If a threshold-bonus status (Braced) expired during step 3, any stagger that was accumulated in the bonus zone is removed proportionally. See [Stagger](stagger.md) for the math.

### 5. Death Check

If the character died from DoT damage, their death is processed (including the `death_defiance` check) and the turn is skipped.

### 6. Stun Check

If the character has stun stacks, one stack is consumed and the turn is skipped. A "recovers from stun" message appears in the battle log.

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

1. Enemies are spawned from templates — or, for an `is_live_instance` entry, each live character named by `live_character_ids` is fetched and healed to full
2. Turn order is calculated from all combatants' speed stats
3. Ability states are initialized (abilities flagged `cd_on_battle_start` open on cooldown for their `cd`, charges from ability meta)
4. Statuses with `meta.source` are seeded from the named character stat (e.g., a character with `wind_mantle: 5` starts the fight with the Wind Mantle status at 5 stacks)
5. The `battle_start` emitter fires (return false to cancel)
6. Saves are disabled and the battle screen is shown
7. Round 1 opens like every other round (below) — battle start is not a special case

### Enemy Scaling and Difficulty

The plugin does **not** scale enemies. It fights whatever stats the characters report, and the
difficulty setting (`rpg_battle_difficulty`) is a game setting the plugin stores but never applies.
Both curves belong to the game.

Implement them as a stat computer rather than by writing stats at battle start. Register one
computer, attach it to a character template with `computed_stats`, and return the *delta* — the stat
channel is additive, so a ×N multiplier is authored as `base × (N − 1)`:

```js
game.registerStatComputer('my_scale', (character) => {
    const mult = myCurve(character);           // dungeon level, difficulty, whatever the game uses
    if (mult === 1) return {};
    const base = character.getCoreStatus()?.stats || {};
    return { health: base.health * (mult - 1), power: base.power * (mult - 1) };
});
```

Read `getCoreStatus().stats`, never `getBaseStat` — the latter sums *every* status, so it would
multiply gear and mid-battle buffs too. Never call `getStat` on the character being computed: that
re-enters the same computer and overflows the stack.

Because the value is derived, an enemy reports its true fight stats everywhere — a pre-battle
inspect panel, the in-battle viewer and the damage math all read the same number, and nothing has to
be snapshotted or restored.

One thing a computer cannot do: max health is a computed, but the health **resource** is imperative
state. `adjustAllResources` only runs from status mutations, so when a curve moves under a live
character its current health does not follow. Nudge it from whatever event moves the curve.

### During Battle

Each round:

1. Initiative is re-rolled and the turn order is re-sorted by current speed
2. A "Turn N" log entry is added
3. The `battle_turn_start` emitter fires
4. The **Turn N starts** banner holds for `round_start_delay` ms (Battle Config, default 1500, scaled by the player's battle-speed setting) with the camera pulled out — the settled lineup is readable before anyone acts. Set it to 0 to open rounds immediately
5. Queued turn-start scenes play
6. Each character takes their turn in speed order

### Mid-Battle Scenes

Game scripts can play dungeon scenes over the battle with plain `game.playScene(sceneRef)` — scripted dialogue, tutorial barks, story beats. The plugin intercepts scene plays during battle: they queue up and the battle flow pauses at the next safe point (turn start, or after the current action's animations) until the player clicks through them all; battle input is blocked while a scene shows. The story scene that triggered the battle is restored afterward. See [Services](../reference/services.md) for details.

### Battle End

The battle ends immediately when all characters on one side are defeated:

- **Victory** -- All enemies defeated
- **Defeat** -- All player characters defeated

When the battle ends:

1. The result overlay appears (Victory or Defeat)
2. The player clicks Continue -- the battle ends with the shown result
3. The `battle_end` emitter fires (battle data still readable)
4. All `meta.is_battle` statuses are removed from all participants
5. Spawned enemies are deleted
6. Saves are re-enabled and the previous game state is restored
7. The `battle_closed_before` emitter fires (teardown complete -- safe to set post-battle state)
8. On victory only, the scene that triggered the battle resumes; on defeat it stays halted -- handle what happens next in a `battle_closed_before` listener
9. The `battle_closed_after` emitter fires (the story has moved past the paragraph that started the fight -- the safe point to snapshot or save)

## Battle Speed

Players can choose between three animation speeds via the `rpg_battle_speed` game setting:

| Speed | Multiplier | Effect |
|---|---|---|
| `slow` | 1.8x | Slower animations and delays |
| `medium` | 1.0x | Normal speed (default) |
| `fast` | 0.5x | Faster animations and delays |

This setting affects action delays, chain delays between enemy turns, and floating combat text duration.
