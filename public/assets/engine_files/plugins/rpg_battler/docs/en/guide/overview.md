# RPG Battler

A turn-based RPG battle system with player-controlled party combat, zoom-in/out camera, and back-view character art.

## Quick Setup

### 1. Configure the battle system

In the **Config** tab:

- Set `max_party_size` to control the maximum number of characters the player can bring into battle (default: 4)

### 2. Define battles

In the **Battles** tab, create battle definitions with:

- A unique `id` for referencing from scripts
- An enemy composition (character templates with amounts)
- An optional background asset

### 3. Start a battle

**From scripts:**

```js
game.getService('rpg_battle').start({ battleId: 'forest_ambush' });
```

**From DryadScript:**

```js
{ battle: "forest_ambush" }
```

You can also pass enemies directly instead of referencing a battle definition:

```js
game.getService('rpg_battle').start({
    enemies: [
        { character_id: 'goblin_warrior', amount: 2 },
        { character_id: 'goblin_shaman', amount: 1 }
    ]
});
```

The player's current party is used automatically. If the party exceeds `max_party_size`, only the first N characters participate.

## Core Concepts

- **Pure Turn-Based** -- Characters act one at a time in speed order. Faster characters go first, but each character gets exactly one turn per round.
- **Zoom In / Zoom Out** -- On the player's turn, the camera zooms in on the active character. When targeting allies or during enemy turns, the camera zooms out to show all combatants.
- **Back Views** -- Player characters are rendered with their "back" view during battle, facing the enemies. Enemy characters face the player normally.
- **No Grid** -- Unlike the Auto Battler, there is no positional grid. Characters are arranged visually but position does not affect gameplay.
- **Token System** -- Status effects are independent instances with their own stacks, duration, and source tracking. Supports DoT, HoT, shields, stun, taunt, thorns, and death defiance.
- **Ability Panel** -- Players choose abilities from an animated panel that slides in during their turn. Abilities can target self, allies, enemies, or all.

## Stats

The plugin defines the following character stats:

**Core**

| Stat | Description |
|---|---|
| `health` | Hit points. Resource stat -- character is defeated at 0. |
| `power` | Base damage and healing multiplier for all abilities. |
| `speed` | Determines turn order. Higher speed acts first. |

**Defense**

| Stat | Description |
|---|---|
| `armor` | Flat reduction to physical damage received. |
| `dodge` | Chance to avoid incoming damage entirely (0--100%). |
| `resist_fire` | Reduces fire damage received (%). |
| `resist_water` | Reduces water damage received (%). |
| `resist_air` | Reduces air damage received (%). |
| `resist_earth` | Reduces earth damage received (%). |
| `resist_arcane` | Reduces arcane damage received (%). |
| `resist_poison` | Reduces poison damage received (%). |
| `resist_light` | Reduces light damage received (%). |
| `resist_dark` | Reduces dark damage received (%). |

**Offense**

| Stat | Description |
|---|---|
| `crit_chance` | Chance to critically hit (0--100%). |
| `crit_multi` | Extra damage on critical hit (%). 50 = 1.5x damage. |
| `damage_dealt_mult` | Additive % modifier to all outgoing damage. |
| `damage_per_missing_health` | % damage bonus scaled by fraction of missing HP. |
| `damage_per_ally` | % damage bonus per alive ally. |
| `focus_fire` | Marks target on attack. Each mark increases damage from this attacker by this stat's value %. |
| `thorns` | Starting thorns stacks at battle start. % of received damage reflected back. |

**Healing**

| Stat | Description |
|---|---|
| `heal_amplification` | Multiplier for healing effects cast by this character. |
| `heal_received_mult` | Additive % modifier to all incoming healing. |

**Damage Modifiers**

| Stat | Description |
|---|---|
| `damage_taken_mult` | Additive % modifier to all incoming damage. Positive = take more. |

**Resources**

| Stat | Description |
|---|---|
| `shield` | Starting shield stacks at battle start. Each stack absorbs 1 damage. |
| `preparation` | Starting preparation stacks at battle start. |
