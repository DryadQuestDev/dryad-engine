# Emitters

| Emitter | Args | Description |
|---|---|---|
| `character_level_up` | `(character, newLevel)` | Fired each time a character levels up. If a character gains multiple levels at once, fires once per level. |

## Examples

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
