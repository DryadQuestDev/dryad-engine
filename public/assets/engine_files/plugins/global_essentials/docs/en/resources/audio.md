# Audio System

The audio system handles **music** (background tracks) and **sounds** (effects).

| Type | Behavior |
|------|----------|
| Music | Forms a playlist, plays random tracks in loop |
| Sound | Plays files in sequence, once |

---

## Music

Music entries contain multiple track files. When you set music, the system:

| Step | What happens |
|------|--------------|
| 1 | Shuffles all tracks randomly |
| 2 | Plays the first track |
| 3 | When track ends, plays next in shuffled order |
| 4 | When all played, reshuffles and loops |

**Fade transition:** When changing music, the current track fades out over ~1 second before the new music starts.

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

### Playing Sounds

| Action | Description |
|--------|-------------|
| `{sound: "sound_id"}` | Play a sound effect |
| `{sound: "sound1, sound2"}` | Play multiple sounds in sequence |

**Example:**

| Trigger | Action |
|---------|--------|
| Player attacks | `{sound: "sword_slash"}` |
| Door unlocks | `{sound: "key_turn, door_creak"}` |

---

## Volume

Volume is controlled by user settings via Menu.

---

## Methods

| Method | Description |
|--------|-------------|
| `game.setMusic(id)` | Play music by ID |
| `game.setMusic(false)` | Use dungeon default music |
| `game.playSounds(id)` | Play sound effect |
| `game.playSounds([id1, id2])` | Play multiple sounds in sequence |

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Play background music | `{music: "music_id"}` |
| Play sound effect | `{sound: "sound_id"}` |
| Chain sound effects | `{sound: "sound1, sound2, sound3"}` |
| Reset to dungeon music | `{music: false}` |

---

## Next Steps

- ->resources.assets - Asset management

