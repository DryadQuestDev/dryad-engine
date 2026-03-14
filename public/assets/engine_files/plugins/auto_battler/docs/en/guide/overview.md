# Auto Battler

An Active Time Battle (ATB) combat system with grid positioning, token-based status effects, AI decision-making, and an autocast system.

## Quick Setup

### 1. Configure the battle system

In the **Battle Config** tab:

- Set `rows_size` and `columns_size` for the grid dimensions
- Optionally enable leadership-based formation costs by setting `starting_leader_id` — the leader's `leadership` stat becomes the formation budget, and each character's `leadership_cost` determines how much of that budget they consume

### 2. Start a battle

Two ways to trigger a battle. In both cases enemies are auto-positioned on the grid.

**From scripts:**

```js
game.getService('start_battle').start({
    enemies: ['enemy_goblin', 'enemy_troll'],
    noRetreat: false
});
```

**From DryadScript:**

```js
{ start_battle: "enemy_goblin, enemy_troll" }
```

The service accepts an array of live character instance IDs (characters that already exist in the game) and an optional `noRetreat` flag to prevent the player from retreating. The DryadScript action accepts a comma-separated string. The player's formation is read from the persistent `battle_positions` store (set up via the Formation tab).

## Core Concepts

- **ATB System** — Characters accumulate gauge based on speed. When gauge reaches 100, they act. This means faster characters act more often.
- **Grid Positioning** — Two grids (player and enemy) with configurable rows (breadth) and columns (depth). Position affects range, AoE targeting, and AI behavior.
- **Token System** — Status effects are "token instances" — independent stacks with their own duration and source tracking. Tokens can have effects like damage-over-time, healing-over-time, shields, stun, and death defiance.
- **Formation** — Players arrange their party on a grid before battle. A leadership budget (from the party leader's `leadership` stat) caps total team cost.
- **Abilities** — Defined through the engine's ability system with extensive metadata: targeting, AoE shapes, damage, healing, token application, movement, summoning, and more.

## Stats

The plugin defines character stats across several categories:

**Core:** `health`, `power`, `sorcery`, `armor`, `speed`, `speed_mult`, `leadership`, `leadership_cost`

**Resistances:** `resist_fire`, `resist_water`, `resist_air`, `resist_earth`, `resist_arcane`, `resist_poison`, `resist_light`, `resist_dark`

**Offense:** `damage_dealt_mult`, `damage_per_missing_health`, `damage_per_ally`, `damage_per_neighbor`, `thorns`, `crit_chance`, `crit_multi`, `dodge`

**Defense:** `damage_taken_mult`, `heal_amplification`, `heal_received_mult`

**Resources:** `shield`, `preparation`

**Autocast triggers:** `focus_fire`
