# Experience System

An XP and leveling system. Characters with a `level` trait automatically gain a managed `xp` resource. When XP reaches the threshold, the character levels up.

## Quick Setup

### 1. Enable the plugin

Add `experience` to your game's manifest plugin list.

### 2. Configure thresholds

In the **Experience Config** tab:

- `xp_base` – XP needed to level up at level 1 (default: 100)
- `xp_formula` – How the threshold scales: `linear_percent` or `exponential_percent`
- `xp_growth` – Growth percentage per level (default: 50)
- `max_level` – Level cap (default: 99)

See ->guide.xp_formulas for detailed examples.

### 3. Set level on characters

In a character template, add the `level` trait:

```json
{
  "id": "hero",
  "traits": {
    "name": "Hero",
    "level": 1
  }
}
```

When the character is created, the plugin automatically sets up the `xp` resource with the correct threshold.

### 4. Award XP

**From DryadScript:**

```js
// Award 50 XP to all party members with a level trait
{ xp: 50 }

// Award different amounts to specific characters
{ xp: "hero->100, mage->50" }
```

**From scripts:**

```js
game.getService('xp').addXp('hero', 100);

// Or directly:
const hero = game.getCharacter('hero');
hero.addResource('xp', 100);
```

### 5. (Optional) Set up stat growth per level — no code needed

Create a status that defines stat bonuses per level. The plugin stacks it automatically on each level up.

1. Create a status (e.g., `warrior_growth`) with `is_hidden: true`, `max_stacks: -1`, and the stats you want per level:
   ```json
   {
     "id": "warrior_growth",
     "name": "Growth",
     "is_hidden": true,
     "max_stacks": -1,
     "stats": { "health": 20, "power": 5 }
   }
   ```

2. On the character template, set the `level_up_status` trait:
   ```json
   {
     "traits": { "level": 1, "level_up_status": "warrior_growth" }
   }
   ```

Each level up adds one stack. At level 5, the character has 4 stacks = +80 health, +20 power. Different characters can use different growth statuses.

### 6. (Optional) Award skill points on level up — no code needed

In the **Experience Config** tab, add entries to `level_up_rewards`. Only currency items (`is_currency: true`) appear in the dropdown. Items are added to the character's private inventory on each level up.

For example, if you have a `skill_point` currency item and set `amount: 2`, each level up awards 2 skill points that the player can spend in skill trees.

### 7. (Optional) React to level-ups with code

For custom logic, listen to the `character_level_up` emitter. See ->reference.emitters for full examples.

```js
game.on('character_level_up', (character, newLevel) => {
    // Custom logic: unlock content, trigger events, etc.
});
```

## How It Works

1. **Character creation** – The plugin listens to `character_create`. If the character has a `level` trait, it sets the `xp` resource max to the threshold for that level and current XP to 0.

2. **Gaining XP** – Any source can add XP: actions, services, scripts, battle rewards. The plugin listens to `character_resource_change` for the `xp` stat.

3. **Level up** – When XP reaches the threshold, the plugin:
   - Subtracts the threshold from current XP (overflow carries forward)
   - Increments the `level` trait
   - Applies `level_up_status` stack (if configured on the character)
   - Awards `level_up_rewards` items to private inventory (if configured)
   - Fires `character_level_up` emitter
   - Shows a flash message
   - If overflow exceeds the next threshold, repeats (multi-level gain)

4. **UI** – An XP bar appears in the character sheet showing level + progress.
