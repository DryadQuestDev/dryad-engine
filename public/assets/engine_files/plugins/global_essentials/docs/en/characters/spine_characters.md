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

Animation is a keyless type – no sub-key needed, just `charId.animation=value`.

### From Scripts

```javascript
const mc = game.getCharacter('mc');
mc.setSpineAnimation('idle');

// One-shot animation (play once, return to idle)
mc.setSpineAnimation('attack', '', 1);

// One-shot on a specific view
mc.setSpineAnimation('attack', 'back', 1);

// Check if animation exists before playing
if (mc.hasSpineAnimation('hit', 'back')) {
  mc.setSpineAnimation('hit', 'back', 1);
}
```

---

## API Reference

| Method / Property | Description |
|-------------------|-------------|
| `character.isSpineCharacter()` | Returns `true` if spine atlas and skeleton are configured |
| `character.isSpineForView(view)` | Returns `true` if spine exists for the given view (e.g. `"back"`) |
| `character.setSpineAnimation(name, view?, times?)` | Switch animation. `times` = play count (omit for loop, `1` for one-shot) |
| `character.hasSpineAnimation(name, view?)` | Check if animation exists in the skeleton. Returns `false` if not loaded yet |
| `character.getSpineSkins()` | Returns array of Spine skin names from current attributes |
| `character.setAvailableSpineAnimations(view, names)` | Register animation names (called by engine on load) |

---

## Editor Support

All three character editor popups support spine preview:

- **Art Manager** (face picker) – position the face crop rectangle on the animated spine
- **Item Slot Picker** – drag item slot positions onto the spine character
- **Scene Slot Editor** – preview spine characters with scene transforms and animations
