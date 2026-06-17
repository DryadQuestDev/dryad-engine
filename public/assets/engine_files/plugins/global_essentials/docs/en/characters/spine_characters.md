# Spine Character Dolls

Characters can use Spine skeletal animations instead of (or alongside) static layered images. Both animation playback and skin selection are driven by **skin layers of `type: spine`** — the same authoring pipeline you already use for static image layers, with animation names and skin names instead of image paths.

---

## Setting Up

In the engine editor, open a character template and fill in the **Spine** section:

- **Atlas** – the `.atlas` file
- **Skeleton** – the `.json` or `.skel` skeleton file

You can declare more than one entry — one per view (default, `back`, etc.). Each entry has its own `art_dx`, `art_dy`, `art_scale` so each rig can be framed independently.

When a character has a spine configured for the current view, the engine renders the spine animation instead of static image layers (unless a static layer for the same view is also active — see "Static Action Overlays" below).

---

## Spine Skin Layers

Spine animations and skins are picked the same way static images are picked for layered characters — via **skin layers** that watch one or more **character attributes** and resolve to a value per attribute combination. The only difference is what the value is: a static layer maps each combo to an image file, while a spine layer maps each combo to an animation name (in `spine_animations`) or a skin name (in `spine_skins`). 
For more information on character attributes and skins read ->characters.characters_overview

A spine-type skin layer can drive an **animation**, a **skin**, or both — they're two facets of the same layer. The editor generates the per-attribute fields for you; just fill in the dropdowns and string fields.

Note: if your character animation is not playing, make sure you've filled in both attributes and skin_layers properties for that character template in the editor.

## Static Action Overlays

A spine-rendered view can be temporarily replaced by a static image. If you define a static layer that matches the same view (e.g. an `attack` layer keyed by a `battle_state` attribute), the engine hides the spine while the static frame is showing — typically used for hand-drawn action frames during attacks, hits, and casts. When the action ends and the attribute returns to idle, the spine resumes.

Worked example: Ane's `back` view has both a back spine and a `ane_back` static layer with images for `attack`, `cast`, `hit`. While `battle_state=idle`, the back spine plays. When she's hit, `battle_state=hit` activates the `ane_back_hit.webp` frame and the spine is hidden until the action ends.

## API

Spine animations and skins follow character attributes. Set an attribute, the engine resolves the new animation / skin name from the matching layer and crossfades to it.

```javascript
const mc = game.getCharacter('mc');

// belly layer resolves to 'belly_2'
mc.setAttribute('outfit', 'cute_dress');

// face layer resolves to 'face_ahegao'
mc.setAttribute('expression', 'angry');
```

There's no manual "play this animation" or "apply this skin" API — everything flows through skin layers + attributes.
