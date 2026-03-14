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
| **Transforms** | Scale, rotate, flip, adjust opacity and blur |
| **Fit modes** | Control how assets fill their container (cover, contain, fill, etc.) |
| **Enter transitions** | Animated appearance (fade, slide, zoom, bounce, special effects) |
| **Exit transitions** | Animated removal with same transition options |
| **Idle animations** | Looping animations while displayed (float, pulse, sway, etc.) |
| **Spine support** | Play animations, combine skins, control playback speed |

---

## Adding/Removing Assets

### Using Actions

| Action | Description |
|--------|-------------|
| `{asset: "asset_id"}` | Add asset from template |
| `{asset: "asset1, asset2"}` | Add multiple assets |
| `{asset: "!asset_id"}` | Remove asset (with exit animation) |
| `{asset: "asset_id(x=50, scale=2)"}` | Add with property overrides |
| `{asset: false}` | Clear all assets |

**Example - Scene with background with custom enter:**

```javascript
{asset: "forest_bg(enter=fadeSlideLeft)"}
```

**Example - Remove the asset:**

```javascript
{asset: "!character_portrait"}
```

### Default Room Assets

Set `default_assets` on room templates to automatically load assets when entering a room.

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
| `asset_render` | Before asset is rendered | `(asset)` |

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
    // Fetch asset template from game data with id "my_background"
    const assetTemplate = game.getData("assets").get("my_background");
    // Create reactive copy
    const asset = vue.ref({ ...assetTemplate });
    return { asset };
  },
  // Pass asset as prop
  template: `<BackgroundAsset :asset="asset" /><div>some other content</div>`
});
```

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Add background image | `{asset: "bg_forest"}` |
| Add with animation | `{asset: "bg_forest(enter=fade)"}` |
| Remove asset | `{asset: "!bg_forest"}` |
| Position asset | `{asset: "bg_forest(x=80, y=20)"}` |
| Layer assets | Set `z` field (higher = on top) |
| Flip horizontally | Set `xscale: -1` |
| Add looping animation | Set `idle: "float"` |

---

## Next Steps

- ->resources.audio - Music and sound effects

