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
| `battle_action_start` | `(battle, character, abilityId, targetId)` | Yes | Before ability execution. Return false to skip the action |
| `battle_action_end` | `(battle, character, abilityId)` | No | After ability effects have fully resolved |

## Combat

| Emitter | Args | Cancellable | Description |
|---|---|---|---|
| `battle_damage_raw` | `(battle, caster, target, event)` | Yes | After raw damage calculation, before defenses. `event`: `{ amount, damageType, ability, isCrit }`. Modify `event.amount` to change raw damage. Return false to prevent damage |
| `battle_damage_final` | `(battle, caster, target, event)` | Yes | After defense reduction, before HP change. Same event shape. Modify `event.amount` to change final damage. Return false to prevent damage |
| `battle_heal` | `(battle, caster, target, event)` | Yes | Before healing is applied. `event`: `{ amount }`. Modify `event.amount` to change heal amount. Return false to prevent healing |
| `battle_character_defeated` | `(battle, characterId, side)` | No | When a character reaches 0 HP (after death defiance check). `side`: `"player"` or `"enemy"` |

## Example

```js
// Double all damage to targets below 25% HP
game.on('battle_damage_final', (battle, caster, target, event) => {
    if (target.getResourceRatio('health') < 0.25) {
        event.amount *= 2;
    }
});

// Grant a shield token when battle starts
game.on('battle_start', (battle) => {
    for (const charId of battle.playerParty) {
        const svc = game.getService('start_battle');
        // Token application happens through the battle system
    }
});

// Log when any character is defeated
game.on('battle_character_defeated', (battle, characterId, side) => {
    const char = game.getCharacter(characterId);
    const name = char?.getTrait('name') || characterId;
    console.log(`${name} was defeated on the ${side} side`);
});
```
