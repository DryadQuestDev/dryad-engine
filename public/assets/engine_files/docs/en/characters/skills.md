# Skill Trees

Skill trees let characters learn and upgrade abilities over time. Like items and statuses, skills are **status layers** - they can modify stats, grant abilities, add skin layers, and more.

---

## How Skills Work

When a character learns a skill, a status effect is applied to them. This status can:

- Add stats (e.g., +10 Strength)
- Grant abilities
- Add skin layers (visual changes)
- Set traits or attributes

Skills can be upgraded multiple times. Each upgrade level adds another stack to the status effect, multiplying its bonuses.

---

## Editor Forms

Skills are defined using two forms in **Characters → Skills**:

### Skill Slots

Individual skill definitions. Each slot describes what a skill does.

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for the skill |
| `name` | Display name |
| `description` | Rich text description shown in tooltips |
| `image` | Icon displayed in the skill tree |
| `size` | Size of the skill node in pixels |
| `shape` | Node shape: circle, square, triangle, diamond, hexagon, octagon |
| `status` | The status effect applied when learned (stats, abilities, skin layers, etc.) |
| `tags` | For categorizing and filtering |

### Skill Trees

The visual layout that organizes skills into learnable progression paths.

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for the tree |
| `name` | Display name shown in the tree selector |
| `description` | Rich text description shown on hover |
| `width` / `height` | Canvas dimensions in pixels |
| `background_asset` | Optional background image |
| `arrow_style` | Connection style: straight, curved, or dashed |
| `is_private` | If true, uses character's private inventory for costs; otherwise uses party inventory |
| `refund_factor` | 0-1 value for refund percentage (0 = non-refundable) |
| `skills` | Array of skill placements (see below) |

### Skill Placements

Each entry in a tree's `skills` array places a skill slot on the canvas:

| Field | Description |
|-------|-------------|
| `id` | Unique slot instance ID (different from skill slot ID) |
| `skill` | Reference to a skill slot |
| `x` / `y` | Position on the canvas |
| `max_upgrade_level` | How many times the skill can be upgraded (each upgrade = +1 status stack) |
| `price` | Currency cost to learn (uses item currencies) |
| `parent_skills` | Array of slot instance IDs that must be learned first |
| `params` | Optional actions and conditions (if, active, scene triggers, etc.) |

---

## Assigning Trees to Characters

In **Characters → Character Templates**, add skill tree IDs to the `skill_trees` field. A character can have multiple skill trees available.

---

## Public vs Private Skill Trees

Skills cost currency items to learn, similar to trading. The `is_private` field determines which inventory pays for skills:

| Mode | `is_private` | Currency Source | Use Case |
|------|--------------|-----------------|----------|
| Public | `false` | Party inventory | Shared currencies like gold coins |
| Private | `true` | Character's private inventory | Character-specific points (e.g., skill points, experience) |

### Public Trees (Default)

Currency is deducted from the **party inventory**. All party members share the same currency pool.

```
Skill Tree: "combat_skills"
is_private: false
Skill price: { gold: 100 }
→ 100 gold deducted from party inventory
```

### Private Trees

Currency is deducted from the **character's private inventory**. Each character has their own separate currency pool.

```
Skill Tree: "personal_talents"
is_private: true
Skill price: { skill_points: 1 }
→ 1 skill_point deducted from this character's private inventory
```

This is useful for:
- Level-up skill points that each character earns individually
- Class-specific currencies
- Per-character progression systems

---

## Learning Skills

Skills are learned through the in-game skill tree UI. Requirements:

1. **Parent skills** - At least one parent must be learned (if any are defined)
2. **Currency** - Character must afford the price
3. **Not maxed** - Current level must be below max_upgrade_level

### Action Learning

Use the `skill` action in scenes to grant skills directly (bypasses currency costs):

```
{skill: "alice.fire_magic.fireball"}
```

| Format | Description |
|--------|-------------|
| `"treeId.slotId"` | Learn for selected character |
| `"characterId.treeId.slotId"` | Learn for specific character |
| `"alice.fire_magic.fireball#3"` | Learn 3 levels at once |
| `"alice.fire_magic.fireball, bob.ice_magic.freeze"` | Learn multiple skills |

### Programmatic Learning

```js
const character = game.getCharacter("mc");

// Learn a skill (1 level)
character.learnSkill("combat_tree", "fireball_slot", 1);

// Unlearn a skill (triggers refund if refund_factor > 0)
character.unlearnSkill("combat_tree", "fireball_slot");
```

---

## Skill Requirements with `params`

Use the `params` field when adding Skill Slot to a Skill Tree to have conditions or trigger actions:

```json
{
  "if": "player_level >= 10",
  "scene": "unlock_celebration"
}
```

| Param | Effect |
|-------|--------|
| `if` / `ifOr` | Hide the skill until condition is true |
| `active` / `activeOr` | Show but disable the skill until condition is true |
| Any action | Execute when skill is learned |

---

## Refunding Skills

If `refund_factor` is set on the tree (e.g., 0.5 for 50%), players can refund learned skills:

- Refund amount = `price × skill_level × refund_factor` (rounded up)
- A skill cannot be refunded if it's the only learned parent of another learned skill

---

## Example Setup

### 1. Create Skill Slots

In **Characters → Skill Slots**:

**Fireball**
- id: `fireball`
- name: "Fireball"
- status: { stats: { magic_damage: 10 }, abilities: ["fireball_ability"] }

**Inferno**
- id: `inferno`
- name: "Inferno"
- status: { stats: { magic_damage: 25 } }

### 2. Create a Skill Tree

In **Characters → Skill Trees**:

- id: `fire_magic`
- name: "Fire Magic"
- width: 400, height: 300
- refund_factor: 0.5
- skills:
  - { id: "slot_fireball", skill: "fireball", x: 200, y: 50, price: { gold: 100 } }
  - { id: "slot_inferno", skill: "inferno", x: 200, y: 150, price: { gold: 250 }, parent_skills: ["slot_fireball"] }

### 3. Assign to Character

In the character template, add `fire_magic` to the `skill_trees` field.

---

## API Reference

### Character Methods

```js
// Add a skill tree to character
character.addSkillTree("fire_magic");

// Remove a skill tree
character.removeSkillTree("fire_magic");

// Learn a skill (level = number of levels to add)
character.learnSkill(treeId, slotId, level);

// Unlearn a skill (refunds if tree has refund_factor)
character.unlearnSkill(treeId, slotId);

// Get skill status ID (for checking if learned)
const statusId = character.getSkillStatusId("fire_magic", "slot_fireball");
// Returns: "_skill_fire_magic_slot_fireball"
```

### Events

```js
// Triggered when a skill is learned
game.on("skill_learned", (treeId, skillId, level) => {
  game.addFlash("Learned a new skill!");
});

// Triggered when a skill is unlearned
game.on("skill_unlearned", (treeId, skillId) => {
  console.log("Refunded:", skillId);
});
```

### Checking Skills

Use the `_skill` condition to check if a character has learned a skill:

```
_skill(alice.fire_magic.fireball) > 0   // check if learned
_skill(fire_magic.fireball) >= 3        // check level (selected character)
```

---

## Tips

- Use `parent_skills` to create progression paths (skill A → skill B → skill C)
- Set `max_upgrade_level` > 1 for skills that can be upgraded multiple times
- Use `is_private: true` for character-specific currencies
- The `params` field supports the same conditions as scene choices
- Skill status effects stack with equipment and other status sources
