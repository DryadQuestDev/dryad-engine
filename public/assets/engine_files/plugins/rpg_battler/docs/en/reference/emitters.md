# Emitters

## Battle Lifecycle

| Emitter | Args | Cancellable | Description |
|---|---|---|---|
| `battle_start` | `(battle)` | Yes | Before battle begins. Return false to prevent the battle from starting |
| `battle_end` | `(battle, result)` | No | When battle ends. `result`: `"victory"` or `"defeat"` |
| `battle_turn_start` | `(battle, turnNumber)` | No | At the start of a new round |

## Actions

| Emitter | Args | Cancellable | Description |
|---|---|---|---|
| `battle_action_start` | `(battle, caster, event)` | Yes | Before ability execution. `event`: `{ abilityId, targetId, power }`. Mutate to redirect ability, change target, or adjust power. Return false to cancel |
| `battle_action_cast` | `(battle, caster, abilityId)` | No | After ability is confirmed and costs deducted, before effects resolve. Use for on-cast side effects (resource generation, etc.) |
| `battle_action_apply` | `(battle, caster, event)` | Yes | Per-effect per-target, after all math, before state mutation. See event fields below. Return false to skip this effect on this target |
| `battle_action_applied` | `(battle, caster, event)` | No | Per-effect per-target, AFTER state mutations. Same event fields as `battle_action_apply`. Use for reactive effects (rage-on-hit, counters, on-kill triggers) |
| `battle_action_end` | `(battle, caster, abilityId, results)` | No | After ability effects have fully resolved. `results`: array of `RpgEffectResult` objects |

### `battle_action_apply` event fields

| Field | Type | Description |
|---|---|---|
| `effectId` | `string` | Which effect of the ability |
| `targetId` | `string` | Target character id |
| `damage` | `number` | Final damage after defenses (0 if no damage) |
| `rawDamage` | `number` | Raw damage before defenses |
| `damageType` | `string` | `"physical"`, `"fire"`, `"absolute"`, etc. |
| `isCrit` | `boolean` | Whether the hit is a critical strike |
| `isDodged` | `boolean` | Whether the target dodged (set false to override) |
| `healing` | `number` | Computed heal amount (0 if no healing) |
| `tokenId` | `string\|null` | Token to apply on target |
| `tokenStacks` | `number` | Computed token stacks |
| `tokenDuration` | `number` | Token duration in turns |
| `statusApply` | `string[]` | Status ids to apply |
| `statusRemove` | `string[]` | Status ids to remove |
| `cleanse` | `boolean` | Whether to cleanse tokens |
| `cooldownChange` | `number` | Cooldown adjustment on target's abilities |
| `chargesChange` | `number` | Charges adjustment on target's abilities |

## Other

| Emitter | Args | Cancellable | Description |
|---|---|---|---|
| `battle_character_defeated` | `(battle, characterId, side)` | No | When a character reaches 0 HP (after death defiance check). `side`: `"player"` or `"enemy"` |

## Example

```js
// Boost power for semen-costing abilities based on potency
game.on('battle_action_start', (battle, caster, event) => {
    const ability = caster.getAbility(event.abilityId);
    if (ability?.meta?.costs?.semen) {
        event.power += caster.getStat('potency');
    }
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
```
