# Actor Slots

Actor slots display characters in VN-style scenes with positioning, animations, and transitions.

---

## How It Works

| Step | What happens |
|------|--------------|
| 1 | Define slot templates in Characters > Actor Slots |
| 2 | Use `{actor}` action to place characters in slots |
| 3 | Characters render with enter animations |
| 4 | Idle animations loop while displayed |
| 5 | Exit animations play on removal |

---

## Features

Actor slots support:

| Feature | Description |
|---------|-------------|
| **Positioning** | Place anywhere using x/y percentages, layer with z-index |
| **Transforms** | Scale, rotate, flip (mirror), adjust opacity and blur |
| **Enter transitions** | Animated appearance (fade, slide, zoom, bounce, etc.) |
| **Exit transitions** | Animated removal with same transition options |
| **Idle animations** | Looping animations while displayed (float, sway, pulse, etc.) |
| **Filter effects** | Brightness, contrast, saturation, sepia, hue rotation |
| **Anchors** | Control rotation pivot point |

---

## Adding/Removing Actors

### Using Actions

| Action | Description |
|--------|-------------|
| `{actor: "my_character->my_slot"}` | Add character to slot |
| `{actor: "my_character->my_slot(x=30, scale=1.2)"}` | Add with property overrides |
| `{actor: "alice->left, bob->right"}` | Add multiple actors |
| `{actor: "!my_character"}` | Remove character (with exit animation) |
| `{actor: "!my_character(exit=fade)"}` | Remove with custom exit |
| `{actor: "my_character(alpha=0.5)"}` | Update existing actor properties |
| `{actor: false}` | Clear all actors |

**Example - Two characters talking:**

```javascript
{actor: "alice->left(enter=fadeSlideRight), bob->right(enter=fadeSlideLeft)"}
```

**Example - Character leaves:**

```javascript
{actor: "!alice"}
```

**Example - Move character to different slot:**

```javascript
{actor: "alice->center"}
```

If a character is already in the scene, using `my_character->other_slot` moves them smoothly to the new position.

---

## Slot Templates

Create reusable slot positions in **Characters > Actor Slots**.

**Common slot setup:**

| Slot ID | x | y | Description |
|---------|---|---|-------------|
| `left` | 20 | 50 | Left side of screen |
| `center` | 50 | 50 | Center |
| `right` | 80 | 50 | Right side of screen |

Templates define default values. Inline properties override template values.

---

## Transitions

### Enter Transitions

| Category | Options |
|----------|---------|
| Fade | `fade`, `dissolve`, `blurIn` |
| Slide | `slideUp`, `slideDown`, `slideLeft`, `slideRight` |
| Move In | `moveInTop`, `moveInBottom`, `moveInLeft`, `moveInRight` |
| Fade Slide | `fadeSlideUp`, `fadeSlideDown`, `fadeSlideLeft`, `fadeSlideRight` |
| Zoom | `zoomIn`, `zoomOut`, `grow`, `shrink` |
| Rotate | `rotate`, `rotateIn`, `rotateOut` |
| Flip | `flip`, `flipVertical` |
| Bounce | `bounce`, `elastic`, `pop` |

### Exit Transitions

Same types available with directional variants (e.g., `slideOutLeft`, `fadeSlideDown`).

### Easing Options

`linear`, `power1`, `power2`, `power3`, `power4`, `back`, `elastic`, `bounce`, `circ`, `expo`, `sine`

---

## Idle Animations

Continuous looping animations while the character is displayed.

| Category | Options |
|----------|---------|
| Movement | `float`, `bounce`, `hop`, `pan`, `shake`, `shimmy` |
| Rotation | `sway`, `rock`, `rotate`, `nod`, `lean`, `wiggle` |
| Scale | `pulse`, `breathe` |
| Visual | `blink`, `glow`, `jitter`, `glitch` |
| Combined | `wave` |

**Example - Floating character:**

```javascript
{actor: "ghost->center(idle=float, idle_intensity=0.8)"}
```

---

## Events

Actors use the same character visual template as Character Sheet and Character Face. The `character_render` event applies to all contexts where a character is displayed.

| Event | When it fires | Parameters |
|-------|---------------|------------|
| `character_render` | Before character layers are built | `(character)` |

Use `character_render` to dynamically modify `character.renderedLayers` before display.

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Add character to slot | `{actor: "my_character->my_slot"}` |
| Add with animation | `{actor: "my_character->my_slot(enter=fade)"}` |
| Remove character | `{actor: "!my_character"}` |
| Move to new slot | `{actor: "my_character->other_slot"}` |
| Update properties | `{actor: "my_character(alpha=0.5)"}` |
| Flip horizontally | Set `mirror: true` on slot |
| Add looping animation | Set `idle: "float"` on slot |
| Clear all actors | `{actor: false}` |

---

## Next Steps

- ->characters.characters_overview - Character system basics
- ->resources.assets - Background assets for scenes

