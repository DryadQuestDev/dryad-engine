# Audio System

The audio system handles **music** (background tracks) and **sounds** (effects).

| Type | Behavior |
|------|----------|
| Music | Forms a playlist, plays random tracks in loop |
| Sound | Plays files in sequence, once – or on repeat with the `loop` flag |

---

## Music

Music entries contain multiple track files. When you set music, the system:

| Step | What happens |
|------|--------------|
| 1 | Shuffles all tracks randomly |
| 2 | Plays the first track |
| 3 | When track ends, plays next in shuffled order |
| 4 | When all played, reshuffles and loops |

**Fade transition:** When changing music, the current track fades out over ~1 second before the new music starts. Pass `true` as the second argument to `game.setMusic(...)` to switch instantly with no crossfade.

### Playing Music

| Action | Description |
|--------|-------------|
| `{music: "music_id"}` | Play music by ID |
| `{music: false}` | Use dungeon's default music |

**Example:**

| Trigger | Action |
|---------|--------|
| Enter boss room | `{music: "boss_battle"}` |
| Leave dungeon | `{music: "overworld"}` |

### Default Dungeon Music

Set default music in the dungeon template config:

| Field | Description |
|-------|-------------|
| `music` | Music ID to play when entering this dungeon |

When `{music: false}` is used, the system reverts to the dungeon's configured music.

---

## Sounds

Sound entries can contain multiple files. When you play a sound, the system:

| Step | What happens |
|------|--------------|
| 1 | Loads all sound files |
| 2 | Plays first file |
| 3 | When it ends, plays the next |
| 4 | Continues until all files played |

Sounds play **in sequence** (one after another), not simultaneously.

### Looping

Tick `loop` on a sound to make it repeat – it plays every file in sequence, then restarts from the first. Use it for ambience: rain, a crackling forge, a hum under a scene.

Looping sounds keep playing until stopped with `{sound: "!sound_id"}` or `{sound: false}`. Where a loop is started decides how long it lives:

| Started from | Lifetime |
|--------------|----------|
| A scene | Ends with that scene |
| `room_enter_before` / `room_enter_after` | Keeps playing across the map until stopped |
| `dungeon_enter` / `dungeon_create` | Keeps playing across the map until stopped |

Use scene loops for a sound tied to one moment, and room or dungeon loops for ambience that should follow the player around.

Looping sounds are saved with the run. Load a save and they resume from the top of their sequence – on the player's first click or keypress, since browsers block audio until the page has been interacted with.

Re-triggering a loop that is already playing restarts it rather than layering a second copy.

One-shot sounds always stop when the scene exits, and when the player walks to another room.

### Playing Sounds

| Action | Description |
|--------|-------------|
| `{sound: "sound_id"}` | Play a sound effect |
| `{sound: "sound1, sound2"}` | Play multiple sounds in sequence |
| `{sound: "!sound_id"}` | Stop that sound, looping or not |
| `{sound: false}` | Stop every sound currently playing |

**Example:**

| Trigger | Action |
|---------|--------|
| Player attacks | `{sound: "sword_slash"}` |
| Door unlocks | `{sound: "key_turn, door_creak"}` |
| Enter a storm | `{sound: "rain_loop"}` |
| Step indoors | `{sound: "!rain_loop"}` |

---

## Volume

Volume is controlled by user settings via Menu.

---

## Methods

| Method | Description |
|--------|-------------|
| `game.setMusic(id)` | Play music by ID (crossfades from the current track) |
| `game.setMusic(id, true)` | Play music by ID without the crossfade (instant switch) |
| `game.setMusic(false)` | Play the current dungeon's music; stops music if the dungeon has none |
| `game.playSounds(id)` | Play sound effect |
| `game.playSounds([id1, id2])` | Play multiple sounds in sequence |
| `game.stopSounds(id)` | Stop that sound, looping or not |
| `game.stopSounds()` | Stop every sound currently playing |

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Play background music | `{music: "music_id"}` |
| Play sound effect | `{sound: "sound_id"}` |
| Chain sound effects | `{sound: "sound1, sound2, sound3"}` |
| Loop ambience | Tick `loop` on the sound, then `{sound: "sound_id"}` |
| Stop one sound | `{sound: "!sound_id"}` |
| Stop all sounds | `{sound: false}` |
| Reset to dungeon music | `{music: false}` |

---

## Next Steps

- ->resources.assets - Asset management

