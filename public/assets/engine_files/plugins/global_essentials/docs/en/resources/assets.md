# Assets

Assets are visual elements displayed in scenes: images, videos, or Spine animations. They support positioning, transformations, and animated transitions. Assets can also be used as backgrounds for Skill Trees.

---

## Asset Types

| Type | Description |
|------|-------------|
| `image` | Static image (PNG, JPG, etc.) |
| `video` | Video file (autoplay, loops) |
| `spine` | Spine skeletal animation |

---

## Features

Assets support:

| Feature | Description |
|---------|-------------|
| **Positioning** | Place anywhere using x/y percentages, layer with z-index |
| **Transforms** | Scale, rotate, flip, adjust opacity |
| **Filter effects** | Blur, brightness, contrast, saturation, sepia, hue rotation |
| **Fit modes** | Control how assets fill their container (cover, contain, fill, etc.) |
| **Enter transitions** | Animated appearance (fade, slide, zoom, bounce, special effects) |
| **Exit transitions** | Animated removal with same transition options |
| **Idle animations** | Looping animations while displayed (float, pulse, sway, etc.) |
| **Spine support** | Play animations, combine skins, control playback speed |
| **Layers** | Stack several image plates into one asset (`image` type) |

---

## Layered Images

An `image` asset can stack extra plates on top of `file_image` via its `layers` list. The whole
stack shares one wrapper, so fit mode, position, scale, rotation, opacity, filters, the scene
colour grade and every enter/exit/idle transition apply to the finished picture rather than to
each plate — author the plates pre-registered at the same canvas size.

| Field | Description |
|-------|-------------|
| `file_image` | The bottom plate. Always rendered. |
| `layers` | Extra plates stacked on top, in order. |

Listen to [`asset_resolve`](../builtins/game_emitters.md) to decide which plates a render
actually uses: filter the list to drop the ones you don't want, or replace an entry with an
object to say more about one plate. It fires on every render path, so the scene, the gallery and
the editor preview all agree.

| Entry field | Description |
|-------------|-------------|
| `file` | The image path. |
| `classes` | Css classes for this plate alone, e.g. a recolor. |
| `fade` | Crossfade the plate as it comes and goes, instead of appearing on one frame. |

### Alternatives vs overlays

Two kinds of plate behave differently, and `fade` is how you tell them apart.

An **alternative** is one of several mutually exclusive options — one body plate per skin tone.
It keeps its slot in the stack and swaps source on a single frame. Never set `fade` on one:
crossfading leaves both options in the stack at once, and whatever they cover (the plate below,
usually opaque) shows through the pair for the length of the fade.

An **overlay** adds to a finished picture and has nothing taking its place — sweat, weather, a
glow. Set `fade` and it blooms in and out. Keep overlays at the top of the stack; removed from
the middle, every plate above one shifts a slot and re-decodes for nothing.

```javascript
// One illustration, one plate per skin tone, plus an overlay the scene turns on.
// {asset: "cg_1"}  →  base + body_tan
// {asset: "cg_1(fx = true)"}  →  base + body_tan + fx
game.on("asset_resolve", (asset) => {
  if (!asset.layers) return;
  const skin = game.getCharacter("riko")?.getAttribute("skin");
  asset.layers = asset.layers.filter((file) => {
    const body = file.match(/body_(\w+)\./);
    if (body) return body[1] === skin;
    if (file.includes("fx.")) return !!asset.fx;
    return true;
  });
});
```

---

## Adding/Removing Assets

### Using Actions

| Action | Description |
|--------|-------------|
| `{asset: "asset_id"}` | Add asset from template |
| `{asset: "asset1, asset2"}` | Add multiple assets |
| `{asset: "!asset_id"}` | Remove asset (with exit animation) |
| `{asset: "asset_id(x=50, scale=2)"}` | Add with property overrides |
| `{asset: "!asset_id(exit=fade, exit_duration=2)"}` | Remove with exit overrides |
| `{asset: false}` | Clear all assets |

Any asset field can be overridden inline, including the transition fields: `enter`, `enter_duration`, `enter_delay`, `enter_ease`, `exit`, `exit_duration`, `exit_ease`. Overrides on a staged asset update it in place.

**Example - Scene with background with custom enter:**

```javascript
{asset: "forest_bg(enter=fadeSlideLeft, enter_duration=1.5)"}
```

**Example - Remove the asset:**

```javascript
{asset: "!character_portrait"}
```

**Example - Remove with a one-off exit:**

```javascript
{asset: "!character_portrait(exit=fadeSlideLeft, exit_duration=2)"}
```

### Default Room Assets

Set `default_assets` on room templates to automatically load assets when entering a room. Its neighbor `default_sounds` does the same for ambience — see ->resources.audio.

---

## Methods

| Method | Description |
|--------|-------------|
| `game.addAssets(id)` | Add asset by ID |
| `game.addAssets([id1, id2])` | Add multiple assets |
| `game.addAssets({id, x, y, ...})` | Add with property overrides |
| `game.removeAssets(id)` | Remove asset (triggers exit animation) |

---

## Events

| Event | When it fires | Parameters |
|-------|---------------|------------|
| `asset_render` | When an asset is staged or updated | `(asset)` |
| `asset_exit` | When a staged asset starts leaving the stage | `(asset)` |
| `asset_resolve` | While an asset's image layers are built, on every render path | `(asset)` |
| `spine_event` | When a spine asset's animation passes an event key authored in the rig | `(asset, name, data)` |

Use `asset_render` to modify asset properties dynamically before display.

**Example - Darken background at night:**

```javascript
game.on("asset_render", (asset) => {
  if (asset.tags.includes("background")) {
    const isNight = game.getStore("world").get("time_of_day") === "night";
    asset.alpha = isNight ? 0.6 : 1;
  }
});
```

**Example - A sound on every beat of a spine animation:** key an event named `step` in the rig's animation (in the Spine editor), then answer it.

```javascript
game.on("spine_event", (asset, name) => {
  if (name === "step") game.playSounds("footstep");
});
```

The event fires each loop pass at the animation's playing speed, so the sound stays on the beat at any `timescale`.

---

## Asset Meta

Assets can carry a **meta** data bag – custom fields you define in the `Asset Meta` editor tab and read from your own scripts or plugins as `asset.meta`. Once a field is defined, every asset shows it in its form. Pair it with the events above, e.g. a `loop_sound` field that an `asset_render` listener plays and an `asset_exit` listener stops:

```javascript
game.on("asset_render", (asset) => {
  if (asset.meta?.loop_sound) game.playSounds(asset.meta.loop_sound);
});
game.on("asset_exit", (asset) => {
  if (asset.meta?.loop_sound) game.stopSounds(asset.meta.loop_sound);
});
```

---

## Gallery Integration

Assets with `gallery` field configured are added to the gallery when displayed:

| Field | Description |
|-------|-------------|
| `gallery.gallery_id` | Gallery to add to |
| `gallery.entity_name` | Display name |
| `gallery.entity_description` | Description text |

---

## Using BackgroundAsset Component

The `BackgroundAsset` component is available for use in custom Vue components. It renders an asset with full support for transitions, idle animations, and all asset features.

**Example - Custom component with background:**

```javascript
// Access engine exports
const { vue, components, game } = window.engine;
const { BackgroundAsset } = components;

const MyComponent = vue.defineComponent({
  // Register the component
  components: { BackgroundAsset },
  setup() {
    // getData() returns its own copy of the asset; pass it straight through
    const asset = game.getData("assets").get("my_background");
    return { asset };
  },
  // Pass asset as prop
  template: `<BackgroundAsset :asset="asset" /><div>some other content</div>`
});
```

`getData()` returns a static (non-reactive) copy of the editor's source data, so the asset never changes on its own — pass it straight to the prop for a one-time render. Wrap it in `vue.ref(...)` only if you intend to swap it at runtime (e.g. `asset.value = ...`) so the component re-renders.

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Add background image | `{asset: "bg_forest"}` |
| Add with animation | `{asset: "bg_forest(enter=fade)"}` |
| Set transition length | `{asset: "bg_forest(enter=fade, enter_duration=2)"}` |
| Remove asset | `{asset: "!bg_forest"}` |
| Remove with animation | `{asset: "!bg_forest(exit=fade, exit_duration=2)"}` |
| Position asset | `{asset: "bg_forest(x=80, y=20)"}` |
| Layer assets | Set `z` field (higher = on top) |
| Flip horizontally | Set `xscale: -1` |
| Add looping animation | Set `idle: "float"` |

---

## Next Steps

- ->resources.audio - Music and sound effects

