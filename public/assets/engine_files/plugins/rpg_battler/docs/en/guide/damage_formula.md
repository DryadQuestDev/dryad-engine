# Damage Formula

## Damage Types

All damage in the RPG Battler scales from the `power` stat. The damage type determines which defense applies:

| Category | Sub-types | Defense |
|---|---|---|
| Physical | `physical` | Reduced by `armor`: `max(raw - armor, 0)` |
| Elemental | `fire`, `water`, `air`, `earth`, `arcane`, `poison`, `light`, `dark` | Reduced by matching resistance: `raw * (1 - resist / 100)` |
| Absolute | `absolute` | Ignores all defenses and shields |

## Calculation Steps

### 1. Raw Damage

```
rawDamage = power * (abilityDamage / 100)
```

Where `power` is the caster's power stat and `abilityDamage` is the ability's `damage` aspect value.

### 2. Critical Hit

If the `crit_chance` roll succeeds (random 0--100 < `crit_chance`):

```
rawDamage *= (1 + crit_multi / 100)
```

A `crit_multi` of 50 means 1.5x damage on crits.

### 3. Offensive Multipliers

```
rawDamage *= max(1 + totalMult / 100, 0.1)
```

Where `totalMult` is the sum of:

| Source | Formula |
|---|---|
| `damage_dealt_mult` | Added directly |
| `damage_per_missing_health` | `stat * (1 - currentHP / maxHP) * 100` |
| `damage_per_ally` | `stat * aliveAllyCount` (excluding self) |

The floor of 0.1 prevents the multiplier from going below 10%.

### 4. Defensive Multiplier

```
rawDamage *= max(1 + target.damage_taken_mult / 100, 0.1)
```

Applied before defense reduction. A positive `damage_taken_mult` increases damage taken.

### 5. Defense Reduction

- **Physical:** `finalDamage = max(rawDamage - target.armor, 0)`
- **Elemental:** `finalDamage = rawDamage * (1 - target.resist_X / 100)` where X matches the element
- **Absolute:** No reduction -- raw damage passes through

### 6. Dodge

Before defenses are applied to HP, a dodge roll occurs. If `random(0-100) < target.dodge`:

- The attack misses entirely
- "DODGE" floating text appears
- No damage, no shield absorption, no thorns reflection

### 7. Shield Absorption

If the target has `absorb` token instances (shields) and the damage is not absolute:

- Shield stacks absorb damage 1:1 (each stack absorbs 1 point of damage)
- Stacks are consumed as damage is absorbed
- Multiple shield instances are drained in application order
- Remaining damage after shields hits HP
- "Absorbed X" floating text shows absorbed amount

### 8. Thorns Reflection

After damage passes through shields and hits HP, if the target has `thorns` token stacks:

```
thornsDamage = round(damageDealt * thornsValue * totalStacks / 100)
```

The reflected damage is dealt to the attacker as unmitigated damage.

### 9. Death Defiance

If the target would be reduced to 0 HP and has a `death_defiance` token, one stack is consumed and the character survives at 1 HP. "DEFIED DEATH" floating text appears.

## Healing Formula

All healing scales from the caster's `power` stat:

```
healAmount = round(power * (abilityHealing / 100) * ((100 + heal_amplification) / 100))
```

Then the target's incoming healing modifier is applied:

```
healAmount = round(healAmount * (1 + target.heal_received_mult / 100))
```

## Lifesteal

```
healAmount = round(totalDamageDealt * (lifesteal / 100))
```

Applied to the caster after all targets have been damaged by the effect. Uses the total damage dealt across all targets (before shield absorption).

## DoT / HoT Damage

Token-based damage and healing over time use a simplified formula:

```
dotDamage = round(effectValue * totalStacks)
```

DoT damage respects defenses (armor for physical, resistances for elemental). HoT healing respects `heal_received_mult` but does not scale from any stat -- it is purely stack-based.
