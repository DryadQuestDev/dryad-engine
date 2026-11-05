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

### Starting Look of an Asset

The gallery shows an asset with the skins and animation of its template. A spine asset that a script dresses when a scene stages it (in `asset_render`) would open undressed, because the gallery never stages anything. Set its starting look in the [`gallery_asset_preview`](../builtins/game_emitters.md) event instead – the player can still change it with the gallery's pickers.

```js
game.on("gallery_asset_preview", (asset, seen) => {
  if (!asset.tags?.includes("riko")) return;
  asset.skins = ["default", "hair/hair" + game.getCharacter("riko")?.getAttribute("hairstyle")];
});
```

---

## Scene Galleries

Scene galleries work differently - they're tied to dungeons and require explicit marking.

### Setup

Attach the `view` action to any `#scene` you want to include in the gallery:

```
#greetings{if: true, view: "Greetings"}
```

The `view` value becomes the scene's display name in the gallery.

A replay plays the scene without entering its room: it stages the dungeon's and room's default assets, music and ambience, but nothing a previous scene staged. Characters keep the look the save gave them; a game that wants its cast in another look sets it in the `scene_replay_before` event. A scene that is reached from another scene and relies on its cast, looks or backdrop sets them up with `replay`. Its actions run only in a gallery replay, before the scene's first paragraph:

```
#tea_party{view: "Tea Time", replay: {actor: "alice->pos9, bob->pos7", attr: "bob.hat = true"}}
```

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