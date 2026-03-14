# Emitters

All emitters are cancellable — return `false` from a listener to prevent the action.

## Formation

| Emitter | Args | Description |
|---|---|---|
| `formation_add` | `(character, row, col)` | Before a character is placed on the formation grid |
| `formation_remove` | `(character)` | Before a character is removed from the formation grid |

## Battle Lifecycle

| Emitter | Args | Description |
|---|---|---|
| `battle_start` | `(battle)` | Before battle begins |
| `battle_end` | `(battle, result)` | Before battle ends. `result`: `"victory"` or `"defeat"` |
| `battle_turn_start` | `(battle, turn)` | Before a turn tick processes |
| `battle_action_start` | `(battle, character, abilityId, targetPos)` | Before an ability is executed |
| `battle_action_end` | `(battle, character, abilityId)` | After an ability finishes executing |

## Combat

| Emitter | Args | Description |
|---|---|---|
| `battle_damage_raw` | `(battle, caster, target, event)` | After raw damage is calculated, before defense. `event`: `{ amount, damageType, ability, isCrit, isDodged }`. Modify `event.amount` to change raw damage, set `event.isDodged` to override dodge |
| `battle_damage_final` | `(battle, caster, target, event)` | After defense reduction, before applying to HP. Same event object. Modify `event.amount` to change final damage |
| `battle_heal` | `(battle, caster, target, event)` | Before healing is applied. `event`: `{ amount, ability }`. Modify `event.amount` to change heal |
| `battle_character_defeated` | `(battle, character, side, killer)` | When a character is killed |
| `battle_move` | `(battle, character, fromPos, toPos)` | Before a character moves on the grid |

## Status Effects

| Emitter | Args | Description |
|---|---|---|
| `battle_status_apply` | `(battle, target, statusId, caster)` | Before a status is applied |
| `battle_status_remove` | `(battle, target, statusId)` | Before a status is removed |

## Other

| Emitter | Args | Description |
|---|---|---|
| `battle_scaling_stat` | `(battle, caster, damageType, event)` | When determining the scaling stat for damage. Modify `event.stat` to override |

## Example

```js
game.on('battle_damage_final', (battle, caster, target, event) => {
    // Double all damage to targets below 25% HP
    if (target.getResourceRatio('health') < 0.25) {
        event.amount *= 2;
    }
});

game.on('formation_remove', (character) => {
    // Prevent removing the leader
    if (character.id === game.getState('leader_id')) return false;
});
```
