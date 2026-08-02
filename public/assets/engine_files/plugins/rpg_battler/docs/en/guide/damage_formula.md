# Damage Formula

## Mitigation model: burst vs DoT

Mitigation follows **how** damage arrives, not its element:

- **Burst hits** (a single or multi-hit ability) use **flat armor**. Subtracting a flat amount scales sensibly against a meaningful chunk, and the per-hit subtraction means heavy single hits pierce armor while flurries get eaten.
- **DoT ticks** (per-turn) use **percentage resist**, because per-tick numbers are tiny and flat reduction would zero them out. A resist above 100% turns the tick into **healing**.

| Channel | Damage type(s) | Defense | Formula |
|---|---|---|---|
| Physical hit | `physical` | `physical_armor` (flat) | `max(raw - physical_armor, 1)` — min 1 dmg; negative armor amplifies |
| Magic hit | `magic` | `magical_armor` (flat) | `max(raw - magical_armor, 1)` — min 1 dmg; negative armor amplifies |
| Unblockable hit | `absolute` | — | passes through, ignores armor & shields |
| Burn DoT | `burn` | `resist_burn` (%) | `raw * (1 - resist_burn / 100)` — above 100% heals |
| Poison DoT | `poison` | `resist_poison` (%) | `raw * (1 - resist_poison / 100)` — above 100% heals |
| Bleed DoT | `bleeding` | `resist_bleed` (%) | `raw * (1 - resist_bleed / 100)` — above 100% heals |

Elemental *flavour* (fire, water, light, ...) is carried by an ability's **school** (`meta.school`), a separate tag system that does **not** affect mitigation — it's reserved for future school-synergy mechanics. All damage scales from the `power` stat.

## Calculation Steps

### 1. Raw Damage

```
effectivePower = (power + power_bonus) * (1 + power_amplifier / 100)
rawDamage      = effectivePower * (abilityDamage / 100)
```

Where `abilityDamage` is the ability's `damage` aspect value, `power_bonus` is flat added power (typically from equipment) and `power_amplifier` is a percentage boost (100 = +100% = doubles power). The bonus sits **inside** the amplified term, so the two multiply each other.

An ability with `meta.unamplified` scales from **raw `power` alone** — neither the bonus nor the amplifier applies, which is what makes a basic attack a floor that gear and buffs cannot raise. `meta.flat` goes further and ignores `power` entirely.

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

- **Physical hit:** `finalDamage = max(rawDamage - target.physical_armor, 1)` — always at least 1; negative armor increases damage.
- **Magic hit:** `finalDamage = max(rawDamage - target.magical_armor, 1)` — same rules as physical.
- **Absolute:** No reduction -- raw damage passes through.

(DoT ticks use percentage resist instead — see [DoT / HoT Damage](#dot--hot-damage) below.)

### 6. Dodge

Before defenses are applied to HP, a dodge roll occurs. If `random(0-100) < target.dodge`:

- The attack misses entirely
- "DODGE" floating text appears
- No damage, no shield absorption, no thorns reflection

### 7. Shield Absorption

If the target has the `shield` status (multi-stack) and damage is not absolute:

- Each stack absorbs 1 point of damage (1:1).
- Stacks are consumed from the **shortest-remaining-duration instance first** (permanent `-1` instances drain last). This means about-to-expire shields get used before they're wasted; long-lived shields stay around as protection.
- Remaining damage after the shield hits HP.
- "Absorbed X" floating text shows the absorbed amount.

### 8. Thorns Reflection

After damage hits HP, if the target has the `thorns` status (multi-stack):

```
thornsDamage = thorns.currentStacks   // 1 flat damage per stack
```

The reflected damage is dealt to the attacker as unmitigated damage. Stacks are **not** consumed on trigger — thorns reflects the full stack count on every incoming hit. Each `status_apply_target` of thorns creates an independent instance with its own duration; when an instance expires its stacks fall off and the per-hit reflection drops accordingly.

### 9. Death Defiance

If the target would be reduced to 0 HP and has the `death_defiance` status, one stack is consumed and the character survives at 1 HP. "DEFIED DEATH" floating text appears.

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

Status-based damage and healing over time (statuses flagged `meta.dot_damage_type` or `meta.hot`) use a simplified formula:

```
dotDamage = round(totalStacks)
```

DoT damage is mitigated by the matching **percentage** resist for its `dot_damage_type` (`resist_burn` / `resist_poison` / `resist_bleed`); `absolute` DoT ignores resists. If the resist exceeds 100%, the tick becomes **healing** instead of damage (e.g. a creature with `resist_burn` 150 is healed for 50% of each burn tick). HoT healing respects `heal_received_mult` but does not scale from any stat -- it is purely stack-based. `totalStacks` is the sum across all instances of the status.
