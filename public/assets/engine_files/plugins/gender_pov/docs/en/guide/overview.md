# Gender & POV Plugin

Dynamic text substitution with two subsystems:

- **POV** (1st/2nd person) — for the main character. The player chooses whether narration uses "I/me/my" or "you/your/yourself".
- **Gender** (masculine/feminine pronouns) — for NPCs. Each character's `gender` attribute controls "he/she/him/her" resolution.

All pronouns and POV words are registered as placeholders — use them directly in narrative content, templates, and locale entries.

## What it provides

### Character attribute

- `gender` — `"male"` or `"female"`, set per character

### Game setting

- `point_of_view` — `"1st"` or `"2nd"`, toggled by the player.

## Usage in narrative content

The character ID passed to pronoun placeholders is the character's key in the encounter/scene.

```
|He(npc_alex)| grabs |my| wrist and pulls |me| toward |him(npc_alex)|.
|I| feel |his(npc_alex)| grip tighten as |he(npc_alex)| leans in.
```

When `point_of_view = "1st"` and `npc_alex` is male:
> He grabs my wrist and pulls me toward him. I feel his grip tighten as he leans in.

When `point_of_view = "2nd"` and `npc_alex` is female:
> She grabs your wrist and pulls you toward her. You feel her grip tighten as she leans in.
