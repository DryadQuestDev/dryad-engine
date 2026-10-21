# Reputation

What each character thinks of the player, kept as a number on the character. Choices change it, conditions read it, and every change the player should feel adds a line under the dialogue text – "Rosa will remember that." – without saying which way it went.

## Quick Setup

### 1. Enable the plugin

Add `reputation` to your game's manifest plugin list.

### 2. Track a character

Give the character's template a `reputation` trait. `0` is a neutral start; a character who meets the player already hostile starts below it.

```json
"traits": { "name": "Rosa", "reputation": 0 }
```

A character without the trait is untracked: conditions read it as `0`, and the first `reputation` action that names it starts tracking it.

### 3. Change it from a choice

```js
~Search them anyway
I go through their clothes...{reputation: "rosa -= 1"}
```

The note shows under the paragraph that made the change and clears when the story moves to the next paragraph. Use `reputation_silent` for a change the player should not be told about, and `=` to set a value (always silent).

### 4. Read it back

```js
~Ask for the family discount{if: "_reputation(rosa) >= 2"}
```

## Save and load

Reputation belongs to the save. The plugin keeps the trait out of save migration, so a game that resyncs traits from its templates on load never resets it – nothing to add to your own `registerSaveMigration`.

## Config

| Field | Default | Description |
|---|---|---|
| `min` | `-10` | Lowest value; changes past it stop here |
| `max` | `10` | Highest value |
| `show_direction` | `false` | Mark the note with ▲ or ▼. Off, gains and losses read the same |

## Debug

The debug panel's **Reputation** tab lists every tracked character with its current and starting value, the last change and the scene it came from, and ±1 / reset buttons that go through the normal action (so the note shows).

## Where the note shows

The note is a component on the `scene-content-bottom` slot – under the dialogue text and its choices, in every dungeon type. It belongs to the paragraph that made the change: it clears when the next paragraph plays and when the scene ends. Style it with `.rep-notes` / `.rep-note` (`.rep-up`, `.rep-down` with `show_direction`).
