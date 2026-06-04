# Emitters

## Battle Lifecycle

| Emitter | Args | Cancellable | Description |
|---|---|---|---|
| `battle_start` | `()` | Yes | Before battle begins. Return false to prevent the battle from starting |
| `battle_end` | `(result)` | No | When battle ends. `result`: `"victory"` or `"defeat"` |
| `battle_turn_start` | `(turnNumber)` | No | At the start of a new round |

## Actions

| Emitter | Args | Cancellable | Description |
|---|---|---|---|
| `battle_action_start` | `(caster, event)` | Yes | Before ability execution. `event`: `{ abilityId, targetId }`. Mutate to redirect ability or change target. Return false to cancel. To boost ability scaling, add to the `power_amplifier` stat (via a stat computer or buff status) — every ability that doesn't set `meta.unamplified` will use `power * (1 + power_amplifier/100)`. `power_amplifier` is a percentage (100 = +100% = doubles power). |
| `battle_action_cast` | `(caster, abilityId)` | No | After ability is confirmed and costs deducted, before effects resolve. Use for on-cast side effects (resource generation, etc.) |
| `battle_action_apply` | `(caster, event)` | Yes | Per-effect per-target, after all math, before state mutation. See event fields below. Return false to skip this effect on this target |
| `battle_action_applied` | `(caster, event)` | No | Per-effect per-target, AFTER state mutations. Same event fields as `battle_action_apply`. Use for reactive effects (rage-on-hit, counters, on-kill triggers) |
| `battle_action_end` | `(caster, abilityId, results)` | No | After ability effects have fully resolved. `results`: array of `RpgEffectResult` objects |

### Battle state & helpers — via the `rpg_battle` service

Emitters pass **domain args only** (`caster`, `event`, …), not the battle object — `battle` is plugin-internal state and must not be mutated by listeners. Everything you need is on the `rpg_battle` service:

| Service method | Returns | Description |
|---|---|---|
| `eventDealtDamage(event)` | `boolean` | True if a `battle_action_apply` / `battle_action_applied` event is a damage hit that landed (`damage > 0`, not dodged). |
| `isActive()` | `boolean` | Whether a battle is currently running. |
| `getEnemyParty()` / `getPlayerParty()` / `getCombatants()` | `string[]` | Read battle rosters (copies) without touching the state object. |
| `getTurn()` / `getActiveCharId()` | `number` / `string\|null` | Current turn / whose turn it is. |
| `dealDamage(casterId, targetId, amount, damageType)` | — | One-off damage through the full pipeline (defenses, shields, floating text, log, death). For scripted effects. |
| `applyStatus(casterId, targetId, statusId, stacks, duration?)` | — | Apply N stacks of a status through the pipeline. Stacks as-is (no power-scaling). |
| `effectivePower(character, ability?)` | `number` | Amplifier-aware power; stateless (safe in UI). |

Example:

```js
const battleSvc = game.getService('rpg_battle');
game.on('battle_action_applied', (caster, event) => {
    if (!battleSvc.eventDealtDamage(event)) return;
    // ... react to a damage hit on event.targetId, e.g. battleSvc.applyStatus(...) ...
});
```

### `battle_action_apply` event fields

| Field | Type | Description |
|---|---|---|
| `effectId` | `string` | Which effect of the ability |
| `targetId` | `string` | Target character id |
| `damage` | `number` | Final damage after defenses (0 if no damage) |
| `rawDamage` | `number` | Raw damage before defenses |
| `damageType` | `string` | `"physical"`, `"magic"`, `"absolute"` (hits) or `"burn"`/`"poison"`/`"bleeding"` (DoT). |
| `isCrit` | `boolean` | Whether the hit is a critical strike |
| `isDodged` | `boolean` | Whether the target dodged (set false to override) |
| `healing` | `number` | Computed heal amount (0 if no healing) |
| `statusApply` | `string[]` | Status ids to apply on target |
| `statusStacks` | `number` | Stacks to apply per status in `statusApply`. Power-scaled if the status has `meta.power_scaling`. |
| `statusDuration` | `number\|undefined` | Duration override for applied statuses |
| `statusRemove` | `string[]` | Status ids to remove from target |
| `statusRemoveStacks` | `number\|undefined` | Stacks of `statusRemove` to drop per id. **Leave undefined to remove all stacks**; set a number for partial removal. |
| `cleanse` | `boolean` | Whether to polarity-cleanse battle statuses (ally target removes negative, enemy target removes positive) |
| `cooldownChange` | `number` | Cooldown adjustment on target's abilities |
| `chargesChange` | `number` | Charges adjustment on target's abilities |

## Character Turn

| Emitter | Args | Cancellable | Description |
|---|---|---|---|
| `character_turn_post_tick` | `(battle, characterId)` | No | Fires at the start of an individual character's turn, **after** their cooldowns / status durations have ticked and DoTs have been processed, but **before** the stun check. Use for reactive effects that depend on a character's post-tick state (e.g., "after my Braced just expired, do X"). |

## Other

| Emitter | Args | Cancellable | Description |
|---|---|---|---|
| `battle_character_defeated` | `(battle, characterId, side)` | No | When a character reaches 0 HP (after death defiance check). `side`: `"player"` or `"enemy"` |

## Example

```js
// Boost power for one character via the standard `power_amplifier` stat.
// rpg_battler computes effective scaling as `power * (1 + power_amplifier/100)`, so any
// normal stat channel (computer, buff status, item) drives the boost without a special emitter.
// `power_amplifier` is a percentage (100 = +100% = doubles power).
// Abilities can opt out per-call by setting `meta.unamplified: true`.
game.registerStatComputer('reservoir_potency', (character) => {
    if (character.id !== 'ane') return {};
    return { power_amplifier: character.getStat('potency') };
});

// Double damage to targets below 25% HP
game.on('battle_action_apply', (battle, caster, event) => {
    const target = game.getCharacter(event.targetId);
    if (target.getResourceRatio('health') < 0.25) {
        event.damage *= 2;
    }
});

// Override a dodge (target can't dodge this turn)
game.on('battle_action_apply', (battle, caster, event) => {
    if (someCondition) event.isDodged = false;
});

// Log when any character is defeated
game.on('battle_character_defeated', (battle, characterId, side) => {
    const char = game.getCharacter(characterId);
    const name = char?.getTrait('name') || characterId;
    console.log(`${name} was defeated on the ${side} side`);
});

// React when a specific status has just expired on a character's turn start
game.on('character_turn_post_tick', (battle, characterId) => {
    const char = game.getCharacter(characterId);
    if (!char.hasStatus('braced')) {
        // Braced just expired (or was never active) — react accordingly
    }
});
```
