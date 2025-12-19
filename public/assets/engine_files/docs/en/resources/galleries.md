# Galleries

The engine features a built-in gallery system that automatically tracks content the player has discovered during gameplay.

Galleries are defined in the engine editor under **General → Galleries**.

---

## Gallery Types

| Type | Description |
|------|-------------|
| `characters` | Character sprites |
| `assets` | Background images and scene assets |
| `scenes` | Replayable story scenes |

---

## Characters & Assets Galleries

For characters and assets, discovery is automatic.

### Setup

1. Create a gallery in **General → Galleries**
2. Set the gallery `type` to `characters` or `assets`
3. In the character/asset template, fill in the `gallery` field with the gallery ID

### How Discovery Works

When a player encounters a character or asset during gameplay, it's automatically added to the discovered list. No additional actions required.

---

## Scene Galleries

Scene galleries work differently - they're tied to dungeons and require explicit marking.

### Setup

Attach the `view` action to any `#scene` you want to include in the gallery:

```
#greetings{if: true, view: "Greetings"}
```

The `view` value becomes the scene's display name in the gallery.

### How It Works

- Each dungeon contains its own collection of viewable scenes
- Scenes with `view` are grouped by dungeon in the gallery
- Players can replay discovered scenes from the gallery menu

### Example

```
^room1
#intro{if: true, view: "First Meeting"}
1
%
Character dialogue here...

#secret_ending{view: "Secret Ending"}
1
%
Hidden scene content...
```