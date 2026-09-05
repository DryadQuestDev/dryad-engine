# Turn System

A global map-turn clock. Every room entry advances a saved `turn` counter by 1, and each turn ticks limited status durations on all characters. Scenes and scripts can pass extra turns (e.g. resting).

## Quick Setup

### 1. Enable the plugin

Add `turn_system` to your game's manifest plugin list. That's it — the clock starts at 0 and advances as the player moves between rooms, and a **Wait** button appears in the map toolbar.

### 2. Give a status a duration

Statuses with `duration > 0` tick down one per turn and expire when they hit 0:

```json
{
  "id": "well_fed",
  "name": "Well Fed",
  "duration": 10,
  "stats": { "health": 20 }
}
```

Ten room moves later, the status expires. Permanent statuses (`duration: -1`, the default) and passive ones (`duration: 0`) are untouched.

### Stack bleeding — stacks as the timer

For multi-stack statuses where the stack count itself should decay with time, set `stack_bleeding` in the status meta instead of a duration:

```json
{
  "id": "crest_charge",
  "name": "Crest Charge",
  "meta": { "stack_bleeding": 1 },
  "stats": { "crit_chance": 2 }
}
```

Every turn removes that many stacks (oldest first); the status disappears when it bleeds to 0. Gaining stacks is the only way to extend it — power and remaining time are the same number, visible on the status card.

When a status fully expires on a **party member** — by duration or by bleeding out — a notification is shown (locale line `turn_status_expired`, override it in your game's locale to reword).

### 3. Pass time from scenes

```js
// Resting at an inn passes 5 turns
You wake at dawn, rested.
{turn: 5}
```

## The Wait button

The plugin adds a Wait button to the map toolbar: one click passes one turn where the player stands. Statuses tick, collectables regrow, and the engine re-runs its `discover` scan — so waiting out a buff (or into one) can uncover a hidden encounter without leaving the room.

**Turn Config → Show turn counter** (off by default) renders the current turn number beside the button, turning the toolbar into the clock display.

## Reading the clock

- **State:** `game.getState('turn')` — the current turn number (saved with the game).
- **Service:** `game.getService('turns')` — `getTurn()` and `advance(n)` for scripts. See ->reference.services.
- **Emitter:** `turn_advanced` — hook per-turn systems (regeneration, timers, resource generation). See ->reference.emitters.

## Battle statuses

Battle plugins (e.g. `rpg_battler`) manage their own in-battle durations and remove battle statuses when the fight ends, so map turns and battle turns never touch the same statuses.

## Collectable regrow

Collectable encounters with a `regrow` value come back that many turns after being collected. The plugin drives this with a single line — `game.tickCollectables(turnsElapsed)` on `turn_advanced` — the countdown itself lives in the engine's dungeon data and is saved with the game. Without this plugin (or another time system calling `tickCollectables`), collectables are one-time.
