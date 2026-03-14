# Battle Flow

## Active Time Battle (ATB)

The battle runs on an ATB system with two independent clocks:

### Action Gauge

Every character has a gauge that fills based on their speed. When gauge reaches 100, the character acts.

```
gauge += speed × speed_mult × deltaTime
```

Characters with higher speed act more frequently. The `speed_mult` stat defaults to 1 and can be modified by buffs/debuffs. Stunned characters have their effective speed set to 0.

### Turn Clock

A separate virtual clock ticks independently from the action gauge. Each tick:

1. Increments the turn counter
2. Ticks ability cooldowns (reduce by 1)
3. Ticks token durations (reduce by 1, remove expired instances)
4. Processes DoT/HoT effects for all characters
5. Triggers `turn_start` autocasts

The turn clock speed is configurable via `turn_speed` in Battle Config.

## Battle Lifecycle

### Starting a Battle

```js
game.getService('start_battle').start({
    enemies: ['enemy_goblin', 'enemy_troll'],  // character instance IDs
    noRetreat: false  // optional: prevent retreat
});
```

Enemies can also be passed with specific grid positions:

```js
game.getService('start_battle').start({
    enemies: [
        { characterId: 'enemy_goblin', row: 0, col: 0 },
        { characterId: 'enemy_troll', row: 1, col: 1 }
    ]
});
```

### Turn Execution

Each turn follows this sequence:

1. **ATB fills** — All characters gain gauge
2. **Actor ready** — First character to reach 100 gauge acts
3. **AI decision** — AI picks ability + target (see AI & Targeting)
4. **Ability resolution** — Effects applied (damage, healing, tokens, etc.)
5. **Post-action** — Check for deaths, trigger `on_kill`/`on_damage_taken` autocasts
6. **End check** — Battle ends when one side is eliminated

### Battle End

When all characters on one side are defeated, the battle ends with a result: `"victory"` or `"defeat"`. The `battle_end` emitter fires with the result.

## Speed Controls

Players can adjust playback speed during battle: pause (0×), slow (0.5×), normal (1×), fast (2×), faster (3×), fastest (5×). Stored in the `battle_speed` state.
