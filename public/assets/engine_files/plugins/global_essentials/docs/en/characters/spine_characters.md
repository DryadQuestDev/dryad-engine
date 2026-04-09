# Spine Character Dolls

Characters can use Spine skeletal animations instead of static layered images. This provides smooth idle animations, dynamic poses, and attribute-driven skin swapping – all baked into the Spine file.

---

## Setting Up

In the engine editor, open a character template and fill in the **Spine** section:

- **Atlas** – the `.atlas` file
- **Skeleton** – the `.json` or `.skel` skeleton file
- **Default Animation** – animation name to play on creation (e.g., `idle`)

When a character has spine configured, `CharacterDoll` component automatically renders the Spine animation instead of static image layers.

---

## Skin Mapping (Convention-Based)

Character **attributes** drive which Spine skins are active. Each attribute's current value is used directly as a Spine skin name. Multiple attributes combine into a multi-skin.

| Attribute | Value | Spine skin activated |
|-----------|-------|---------------------|
| `outfit` | `leather` | `leather` |
| `hair` | `red_ponytail` | `red_ponytail` |

The artist names Spine skins to match the attribute values defined in the engine editor. Attribute values that don't match any Spine skin are silently ignored.

---

## Changing Animations

### From Content (No Code)

Use the `char` action with the `animation` type:

```
{char: "mc.animation=idle"}
```

Animations are driven by character attributes. Name spine animations using `attributeKey_value` convention (e.g. `belly_0`, `face_ahegao`). When the attribute changes, the matching animation plays automatically on its own track.

### From Scripts

```javascript
const mc = game.getCharacter('mc');

// Change belly animation (plays belly_2 on its dedicated track)
mc.setAttribute('belly', '2');

// Change face expression (plays face_ahegao on its dedicated track)
mc.setAttribute('face', 'ahegao');

// Check if animation exists
if (mc.hasSpineAnimation('belly_2')) {
  mc.setAttribute('belly', '2');
}
```

---

## API Reference

| Method / Property | Description |
|-------------------|-------------|
| `character.isSpineCharacter()` | Returns `true` if spine atlas and skeleton are configured |
| `character.isSpineForView(view)` | Returns `true` if spine exists for the given view (e.g. `"back"`) |
| `character.getSpineTrackAnimations(view?)` | Get current track-to-animation map based on attributes |
| `character.hasSpineAnimation(name, view?)` | Check if animation exists in the skeleton. Returns `false` if not loaded yet |
| `character.getSpineSkins()` | Returns array of Spine skin names from current attributes |
| `character.setAvailableSpineAnimations(view, names)` | Register animation names and build groups (called by engine on load) |

---

## Editor Support

All three character editor popups support spine preview:

- **Art Manager** (face picker) – position the face crop rectangle on the animated spine
- **Item Slot Picker** – drag item slot positions onto the spine character
- **Scene Slot Editor** – preview spine characters with scene transforms and animations
