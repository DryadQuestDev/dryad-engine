# Music

The RPG Battler plugin automatically manages music transitions during battles.

## How It Works

| Event | Music |
|-------|-------|
| Battle starts | Plays the **battle** album |
| Player wins | Switches to the **victory** album |
| Battle exits | Restores the dungeon's configured music |

On defeat, the battle music continues playing until the player dismisses the result screen.

## Setup

Create two music albums in the **Engine Editor** under the Music tab:

- **battle** – Looping combat tracks that play during the fight.
- **victory** – A fanfare or track that plays on the result screen after winning.

Each album can contain multiple tracks – the engine shuffles and picks one automatically.

If an album is missing, no music will play for that phase (the previous track fades out silently).
