# Projectiles & VFX

An ability's battle animation comes from the projectile it names. A projectile is a definition in the battler's **Projectiles** tab (`plugins_data/rpg_battler/projectiles`), and an ability points at one with `meta.projectile` (see [Abilities](abilities.md)). One definition can serve any number of abilities.

## The Projectile Editor

Each entry of the **Projectiles** tab has a **Projectile Editor** button. The popup puts the fields in groups (Travel, Impact, Look, Hit feel, Sound) beside a battle laid out as the game lays it out, with the party along the bottom and the enemies above, and plays the effect on it the way the battler does. A party cast is shown the way the player's turn frames it, the camera zoomed in on the caster; an enemy's cast zoomed out. Cast it from the party or from an enemy, at one target or the whole side, and slow it to ½× or ¼×. The party and the enemies can be real characters from the game instead of silhouettes.

Under the battle, each sheet shows its frames with the cuts drawn in, and warns when the image does not divide into its frame count. The impact sheet outlines the frame the impact lands on. The quick buttons set `starting_rotation` from the way the art points and toggle the presets, and **Used by** lists the abilities that name the definition, each opening that ability after a save.

## What an ability shows

| The ability's projectile | What plays |
|---|---|
| none (or a definition with no images) | The caster's animation alone. |
| a `travel_image` | A sprite flies from the caster to the target, then the `hit_image` plays there. |
| only a `hit_image` | The impact appears on the target. After a lunge it plays at the moment of contact; otherwise the damage lands on its landing frame (see below). |

**The caster's animation** is the definition's `caster_animation`:

| `caster_animation` | The caster |
|---|---|
| `melee` | Lunges at the target in the `attack` battle state. An impact plays at the moment of contact; a travel sprite launches at the lunge's peak, which suits a thrown bomb or an arrow shot. |
| `cast` | Stays in place in the `cast` battle state, with a nudge toward another ally or a wobble when there are no images. |
| empty | A self or ally ability casts. A hostile ability lunges when the definition has no images (or there is no definition), and casts with a travel sprite or an impact. |

**Area abilities** (`all_enemies`, `all_allies`) play the effect on every living target, each started a moment after the last, and a lunge goes at the first. **Bounces** fly from the previous landing point, so a chain keeps going after the prior target falls. **Flurry** strikes replay the effect for each strike.

## Images

Each sprite is a single image (`*_type: single`) or a sheet (`*_type: sheet`) of `*_frames` frames played at `*_fps`. A sheet is one horizontal row, or a grid when `*_cols` sets the frames per row (a partial last row is trimmed). Frames keep their own shape; there is no need to pad them to squares. The travel sheet loops for the whole flight; the impact sheet plays once. Frame rates follow the player's battle-speed setting like every other battle animation.

An impact that plays on its own (no travel sprite, no lunge) deals its damage on its **landing frame**, while the rest of the sheet plays on: a strike lands when the bolt hits the ground, not after its sparks have faded. By default that is the sheet's fullest frame, found when the entry is saved (from the tab form or any popup) and stored on it as `hit_frame_auto`. `hit_frame` picks another (1 = the first frame). A single image lands as it appears. After a flight or a lunge, the damage lands on contact.

Draw a travel sprite pointing **up**. The battler turns it toward its target; if the art points another way, `starting_rotation` corrects it (a sprite drawn pointing left needs `90`, pointing right `-90`).

## Size and placement

Sizes are a percentage of the battle viewport's height, measured along the sprite's longer side. Characters are laid out the same way (a front-row enemy is about 35% of the viewport), so effects keep their proportion to the bodies on any screen size.

| Field | Where | Default |
|---|---|---|
| `projectile_travel_size` | Config tab | 9 |
| `projectile_hit_size` | Config tab | 18 |
| `travel_size`, `hit_size` | on a projectile | the Config values |

`hit_anchor` places the impact on its target: `center` (default), `feet` (the sprite's bottom edge sits on the target's sole, for ground rings and eruptions) or `head`.

## Motion

`speed` is in pixels per second; a flight lasts distance / speed. With `arc` on, the sprite is lobbed along a parabola that peaks a quarter of the distance above the straight line, and it turns along the curve so it climbs, tips over and dives.

## Tints, blending and presets

`filter` is a CSS filter applied to both sprites, so one sheet can serve several effects:

```text
hue-rotate(300deg) saturate(1.4)              a water bolt turned wine-red
sepia(1) saturate(1.6) brightness(0.75)       any sprite turned to mud
```

`css_class` adds classes to the sprites. The battler ships these presets:

| Class | Effect |
|---|---|
| `vfx-add` | Additive blending, for glowing effects drawn on black. |
| `vfx-screen` | Screen blending, a softer glow. |
| `vfx-glow` | A soft white halo (it stacks after `filter`). |
| `vfx-spin` | Spins a single-image sprite, such as a thrown rock. |
| `vfx-wobble` | Rocks it back and forth, such as a vine or a blade. |
| `vfx-squash` | Squashes and stretches it, such as a slime blob. |

The motion presets add to the facing rotation, so a spinning rock still flies at its target. A game can define its own classes the same way.

## Hit feel

Every damaging hit lands with a little extra punch. The struck body flashes near-white and holds still for a moment (the *hit-stop*) before it recoils. A burst and a spray of sparks go off where the effect struck, in the effect's colour, and the screen jolts. A killing blow holds twice as long. Heals, buffs, misses and damage-over-time ticks get none of it.

| Field | Does |
|---|---|
| `impact_strength` | how hard this effect lands: `light`, `medium` (default) or `heavy`. It scales the hit-stop, the sparks, the jolt and the burst. `none` turns it off for this effect. |
| `impact_color` | the burst's, sparks' and glow's colour. Left empty, it is read off the hit sprite (or the travel sprite), tint included, when the entry is saved, and stored as `impact_color_auto`. |

The **Config** tab sets the amounts for a medium hit: `hit_stop_ms` (70), `hit_sparks` (12) and `hit_shake` (3 px on a 1080p screen). `hit_juice` turns the whole thing off, which brings back the plain red flash and shake. Damage with no effect behind it, such as thorns, lands light and white.

## Sounds

Both are audio files, picked like an image.

| Field | Plays |
|---|---|
| `sound` | as the effect starts: each travel sprite's launch, a melee lunge's start, or once as an impact-only effect appears |
| `hit_sound` | with every impact: a landing, an impact-only effect on each target, a melee contact |

They play at the player's sound volume, like every other sound. A definition with sounds and no images gives a plain lunge its swing and its contact.
