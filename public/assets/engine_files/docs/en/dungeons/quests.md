# Quest System

Quests in Dryad Engine are content-based and defined directly in your dungeon documents. No forms or editor setup required.

---

## Quest Structure

Quests use templates with a three-part naming convention:

```
$quest_name.goal_name.stage_name
```

| Part | Description |
|------|-------------|
| `quest_name` | Unique identifier for the quest |
| `goal_name` | A sub-objective within the quest |
| `stage_name` | The current state/log entry of that goal |

### The Special `main` Goal

The goal with ID `main` is special - it becomes the quest's visible title in the player's journal.

```
$explore.main
Learning Fundamentals

$explore.main.lets_do_it
I need to go to Riko's bedroom and explore it.
```

Here, "Learning Fundamentals" appears as the quest title because it's under `$explore.main`.

---

## Defining Quests

Quests are defined as `$templates` anywhere in your dungeon document. Unlike rooms (`^`) or scenes (`#`), templates aren't tied to specific rooms.

### Basic Quest Example

```
$rescue.main
Rescue the Villager

$rescue.main.started
Find the kidnapped villager in the forest.

$rescue.find_key
Find the Key

$rescue.find_key.start
I need to find a key to unlock the cell.

$rescue.find_key.found{progress: 1}
I found the rusty key under the guard's table.

$rescue.main.complete{progress: 2}
I rescued the villager and brought them to safety.
```

This creates:
- A quest titled "Rescue the Villager"
- Two goals: the main quest line and "Find the Key"
- Multiple stages with journal entries

---

## Triggering Quests

Use the `quest` action to add or advance quests:

```
{quest: "rescue.main.started"}
```

This:
1. Adds the quest to the journal (if not already there)
2. Adds/activates the goal (if not already there)
3. Sets the current stage and displays its text

### Multiple Quests at Once

```
{quest: "rescue.main.started, rescue.find_key.start, explore.main.begin"}
```

---

## Completing Goals and Quests

Attach the `progress` action to a stage template:

| Value | Effect |
|-------|--------|
| `{progress: 1}` | Marks the goal as complete |
| `{progress: 2}` | Marks the entire quest as complete |

### Example

```
$rescue.find_key.found{progress: 1}
I found the rusty key under the guard's table.

$rescue.main.complete{progress: 2}
I rescued the villager and brought them to safety.
```

When you trigger `{quest: "rescue.find_key.found"}`, the "Find the Key" goal is marked complete.

When you trigger `{quest: "rescue.main.complete"}`, the entire "Rescue the Villager" quest is marked complete.

---

## Quest Flow Example

Here's a complete workflow in a dungeon document:

```
^tavern
#talk_to_barkeep{if: true}
1
%
barkeep: Help! My daughter was taken by bandits!
{quest: "rescue.main.started"}

^forest
@clearing
!search_camp
A bandit camp lies ahead.

#clearing~search_camp
1
%
You find a rusty key under the guard's table.
{quest: "rescue.find_key.found"}

^dungeon
#free_villager
1
%
You unlock the cell and free the villager.
{quest: "rescue.main.complete"}

// Quest templates (can be anywhere in the document)
$rescue.main
Rescue the Villager

$rescue.main.started
Find the kidnapped villager in the forest.

$rescue.find_key
Find the Key

$rescue.find_key.start
Search the bandit camp for a key.

$rescue.find_key.found{progress: 1}
I found the rusty key.

$rescue.main.complete{progress: 2}
I rescued the villager!
```

---

## Viewing Quests

Players can view their quest journal by:
1. Clicking the quest icon in the UI
2. Opening the progression panel (left sidebar)

The journal shows:
- Active quests with their current stage text
- Completed goals (crossed out or marked)
- Completed quests (in a separate section if `is_show_completed_quests` state is true)

---

## API Reference

### Actions

| Action | Description | Example |
|--------|-------------|---------|
| `quest` | Add/advance a quest stage | `{quest: "rescue.main.started"}` |
| `progress` | Mark goal/quest complete (template only) | `{progress: 1}` or `{progress: 2}` |

### Game Methods

```js
// Get quest title
const title = game.getQuestTitle("dungeon_id", "quest_id");

// Get goal title
const goal = game.getGoalTitle("dungeon_id", "quest_id", "goal_id");

// Add a quest log entry programmatically
game.addQuestLog("dungeon_id", "quest_id", "goal_id", "stage_id");
```