# Damage Formula

## Damage Types

There are three damage categories:

| Type | Base Stat | Defense |
|---|---|---|
| Physical | `power` | Reduced by `armor`: `max(raw - armor, 0)` |
| Elemental | `sorcery` | Reduced by matching resistance: `raw × (1 - resist / 100)` |
| Absolute | `max(power, sorcery)` | Ignores all defenses |

Elemental sub-types: `fire`, `water`, `air`, `earth`, `arcane`, `poison`, `light`, `dark`.

## Calculation Steps

### 1. Raw Damage

```
rawDamage = baseStat × (abilityDamage / 100)
```

Where `baseStat` depends on `damage_type`:
- Physical → `power`
- Any elemental → `sorcery`
- Absolute → `max(power, sorcery)`

### 2. Critical Hit

If `crit_chance` roll succeeds:

```
rawDamage *= (1 + crit_multi / 100)
```

### 3. Offensive Multipliers

```
rawDamage *= max(1 + totalMult / 100, mult_floor)
```

Where `totalMult` is the sum of:
- `damage_dealt_mult` — Base damage modifier
- `damage_per_missing_health` — Scales with caster's missing HP ratio
- `damage_per_ally` — Per living ally on the same side
- `damage_per_neighbor` — Per adjacent ally on the grid
- `focus_fire` — Bonus per own focus mark on the target

The `mult_floor` (default 0.1) prevents the multiplier from going below 10%.

### 4. Defensive Multiplier

Applied before defense reduction:

```
rawDamage *= max(1 + target.damage_taken_mult / 100, mult_floor)
```

### 5. Defense Reduction

- **Physical:** `finalDamage = max(rawDamage - target.armor, 0)`
- **Elemental:** `finalDamage = rawDamage × (1 - target.resist_X / 100)` (where X matches the element)
- **Absolute:** No reduction

### 6. Shield Absorption

If the target has `absorb` token instances (shields), damage is absorbed stack-by-stack before reaching HP. Each shield instance absorbs up to its remaining stacks. Absolute damage bypasses shields entirely.

### 7. Death Defiance

If lethal damage would kill the target and they have a `death_defiance` token, one stack is consumed and the character survives at 1 HP.

## Healing Formula

```
healAmount = round(caster.sorcery × (abilityHealing / 100) × ((100 + heal_amplification) / 100))
healAmount = round(healAmount × (1 + target.heal_received_mult / 100))
```

Healing cannot exceed the target's missing health.

## Lifesteal

```
healAmount = finalDamageDealt × (lifesteal / 100)
```

Applied to the caster after dealing damage.

## Dodge

If the target's `dodge` roll succeeds, the attack misses entirely. Displayed as "Dodge" floating text.

## Thorns

When a character takes damage, if they have `thorns > 0`, the attacker takes a percentage of the final damage dealt back:

```
thornsDamage = round(finalDamage × thorns / 100)
```

Thorns damage is applied as physical damage via the emitter system.
