# Emitters

| Emitter | Args | Description |
|---|---|---|
| `character_level_up` | `(character, newLevel)` | Fired each time a character levels up. If a character gains multiple levels at once, fires once per level. |
| `reward_assemble` | `({ source, battleId, threat })` | Fired once per battle when its defeat reward is granted (after loot and threat XP). `source` is `'battle'` for a fight victory, `'scene'` for a scripted `{win: ...}` defeat; `threat` is the effective (level-scaled) threat. The hook for game-specific reward economics. |
| `smith_upgrade` | `(item, levels)` | Fired before an item is reforged at the smith station. Return `false` to prevent the upgrade (stones are kept). |
| `smith_break` | `(item, stonesRefunded)` | Fired before an item is broken down at the smith station. Return `false` to prevent the break. |

## Examples

### Grant a game resource on fight victories

Games hook their own economics into the reward and record it so the panel displays it:

```js
game.on('reward_assemble', ({ source, battleId, threat }) => {
    if (source !== 'battle') return;
    const refund = Math.round(threat * 2);
    game.getCharacter('mc').addResource('pheromones', refund);
    game.getService('reward').recordResource('pheromones', refund, hero.id);
});
```

### Increase base stats on level up

Use `setStat()` to permanently increase a character's base stat value:

```js
game.on('character_level_up', (character, newLevel) => {
    const health = character.getStat('health');
    const power = character.getStat('power');
    character.setStat('health', health + 20);
    character.setStat('power', power + 5);
});
```

### Award skill points (currency items)

If your game uses currency items for the skill tree system, award them on level up:

```js
game.on('character_level_up', (character, newLevel) => {
    const inventory = character.getPrivateInventory();
    if (inventory) {
        const skillPoint = game.createItem('skill_point');
        inventory.addItem(skillPoint, 2); // 2 skill points per level
    }
});
```

### Apply a status at a specific level

Grant a permanent status that provides abilities, stat bonuses, or visual changes:

```js
game.on('character_level_up', (character, newLevel) => {
    if (newLevel === 5 && character.id === 'hero') {
        const status = game.createStatus('veteran_fighter');
        if (status) character.addStatus(status);
        // veteran_fighter status grants abilities, stats, skin layers, etc.
    }
});
```

### Auto-learn a skill at a certain level

```js
game.on('character_level_up', (character, newLevel) => {
    if (newLevel === 3 && character.id === 'hero') {
        character.learnSkill('combat_tree', 'fireball');
    }
});
```

### Per-character growth tables

```js
const GROWTH = {
    hero:  { health: 25, power: 5 },
    mage:  { health: 10, power: 8 },
    tank:  { health: 40, power: 3 },
};

game.on('character_level_up', (character, newLevel) => {
    const growth = GROWTH[character.id];
    if (!growth) return;
    for (const stat in growth) {
        character.setStat(stat, character.getStat(stat) + growth[stat]);
    }
});
```
