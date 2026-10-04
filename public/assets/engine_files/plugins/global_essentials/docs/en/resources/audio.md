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

**Fade transition:** When changing music, the current track fades out (1 second unless its `fade_out` says otherwise) before the new music starts. Pass `true` as the second argument to `game.setMusic(...)` to switch instantly with no fades.

### Playing Music

| Action | Description |
|--------|-------------|
| `{music: "music_id"}` | Play music by ID |
| `{music: "music_id(fade_in=3, volume=0.6)"}` | Play with overrides for this play – see Volume and Fades |
| `{music: "!"}` | Stop the music (fading out) |
| `{music: "!(fade_out=4)"}` | Stop over a four-second fade |
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

### Random Variations

Tick `random` to make the files a pool instead: each play picks ONE file at random. Use it for a sound that repeats often – footsteps, hits, a slap on every beat – so a run of them does not sound like one take copied over and over. With `loop` also on, the files follow each other in random order.

### Looping

Tick `loop` on a sound to make it repeat – it plays every file in sequence, then restarts from the first. Use it for ambience: rain, a crackling forge, a hum under a scene.

Looping sounds keep playing until stopped with `{sound: "!sound_id"}` or `{sound: false}`. Where a loop is started decides how long it lives:

| Started from | Lifetime |
|--------------|----------|
| A scene | Ends with that scene |
| `room_enter_before` / `room_enter_after` | Keeps playing across the map until stopped |
| `dungeon_enter_after` / `dungeon_create` | Keeps playing across the map until stopped |

Use scene loops for a sound tied to one moment, and room or dungeon loops for ambience that should follow the player around.

### Room and dungeon ambience

The simplest ambience needs no script. Set **Default Sounds** on a room, or on the dungeon itself, next to its Default Assets. The dungeon's sounds play anywhere in it, and a room's play on top of them while the player is in that room. They keep playing through scenes, stop as the player walks out, and come back after a scene that silenced them. Pick looping sounds; a one-shot would replay on every entry.

| Set on | Plays |
|--------|-------|
| Dungeon config | Everywhere in the dungeon (a river's roar under the whole cave) |
| Room | Only in that room (the forge in the smithy) |

Looping sounds are saved with the run. Load a save and they resume from the top of their sequence – on the player's first click or keypress, since browsers block audio until the page has been interacted with.

Playing a loop that is already running leaves it running – it neither restarts nor layers a second copy. A new `volume` on the repeat still applies: `{sound: "rain(volume=0.3)"}` quiets the rain in place.

One-shot sounds always stop when the scene exits, and when the player walks to another room.

### Channels

Give sounds the same `channel` to make them replace each other. Starting one stops whatever else is playing on that channel, each over its own `fade_out`, so the new sound takes over instead of layering.

| Channel | Sounds | Effect |
|---------|--------|--------|
| `ambience` | `rain_loop`, `forest_loop`, `cave_loop` | Walking into the cave swaps the forest for the cave hum |
| `voice` | `sigh_1`, `gasp_1`, `laugh_1` | A new line cuts the one still speaking |

Sounds with no channel play alongside everything, as before.

### Playing Sounds

| Action | Description |
|--------|-------------|
| `{sound: "sound_id"}` | Play a sound effect |
| `{sound: "sound1, sound2"}` | Play multiple sounds in sequence |
| `{sound: "rain(volume=0.4, fade_in=2)"}` | Play with overrides for this play – see Volume and Fades |
| `{sound: "thunder(delay=0.8)"}` | Play after a delay |
| `{sound: "!sound_id"}` | Stop that sound, looping or not |
| `{sound: "!rain(fade_out=3)"}` | Stop over a three-second fade |
| `{sound: false}` | Stop every sound currently playing |

**Example:**

| Trigger | Action |
|---------|--------|
| Player attacks | `{sound: "sword_slash"}` |
| Door unlocks | `{sound: "key_turn, door_creak"}` |
| Enter a storm | `{sound: "rain_loop"}` |
| Step indoors | `{sound: "!rain_loop"}` |

---

## Volume and Fades

The player's music and sound sliders in the menu set the ceiling. Everything below scales under them.

Every music track and sound has these fields in the editor. Each can be overridden for one play with a `(prop=val)` tail on the id, the same form assets and actors take. An unset value falls back to the entity's field, then to the engine default; an explicit `0` means none.

| Field | Music | Sound | Default | Meaning |
|-------|-------|-------|---------|---------|
| `volume` | yes | yes | `1` | Gain 0–1, multiplied onto the slider |
| `fade_in` | yes | yes | `0` | Seconds from silence to full gain when it starts |
| `fade_out` | yes | yes | music `1`, sound `0` | Seconds to silence when it stops or is replaced |
| `delay` | – | yes | `0` | Seconds to wait before it starts |
| `shuffle` | yes | – | `true` | Random file order; off plays the files in listed order |

**On a music switch**, `fade_out` is how the *outgoing* track leaves and `fade_in` how the new one arrives:

```text
{music: "tense(fade_out=3, fade_in=1)"}
```

**On a stop**, `fade_out` is the stopping fade. A sound's own `fade_out` also applies when the scene ends or `{sound: false}` clears everything, so an ambience with `fade_out: 2` never cuts.

```text
{sound: "!rain(fade_out=3)"}
{music: "!(fade_out=4)"}
```

**Delay** lines a sound up with a beat or an asset's `enter_delay`:

```text
{asset: "lightning(enter_delay=0.5)", sound: "thunder(delay=0.8)"}
```

A save taken during a fade restores the sound at its full gain. Playing the track that is already playing is a no-op; the music never restarts on a repeated `{music}`.

---

## Methods

| Method | Description |
|--------|-------------|
| `game.setMusic(id)` | Play music by ID (fades out the current track). The id takes the same `(prop=val)` tail as the action |
| `game.setMusic("!")` | Stop the music; `"!(fade_out=N)"` sets the fade |
| `game.setMusic(id, true)` | Play music by ID with no fades (instant switch) |
| `game.setMusic(false)` | Play the current dungeon's music; stops music if the dungeon has none |
| `game.playSounds(id)` | Play sound effect; the id takes the `(prop=val)` tail |
| `game.playSounds([id1, id2])` | Play multiple sounds in sequence |
| `game.stopSounds(id)` | Stop that sound, looping or not, over its own `fade_out` |
| `game.stopSounds(id, 3)` | Stop over a three-second fade |
| `game.stopSounds()` | Stop every sound currently playing |

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Play background music | `{music: "music_id"}` |
| Play sound effect | `{sound: "sound_id"}` |
| Chain sound effects | `{sound: "sound1, sound2, sound3"}` |
| Loop ambience | Tick `loop` on the sound, then `{sound: "sound_id"}` |
| Fade ambience in | `{sound: "rain(fade_in=3)"}` |
| Quiet ambience | Set `volume` on the sound, or `{sound: "rain(volume=0.3)"}` |
| Swap one ambience for another | Give both the same `channel`, then play the new one |
| Vary a repeated sound | Put the takes in one sound's files and tick `random` |
| Stop one sound | `{sound: "!sound_id"}` |
| Fade one sound out | `{sound: "!sound_id(fade_out=2)"}` |
| Stop the music | `{music: "!"}` or `{music: "!(fade_out=4)"}` |
| Long crossfade | `{music: "next(fade_out=3, fade_in=3)"}` |
| Stop all sounds | `{sound: false}` |
| Reset to dungeon music | `{music: false}` |

---

## Next Steps

- ->resources.assets - Asset management

