# Character Views

Character Views is an advanced feature for rendering characters from different angles or perspectives. It is used by plugins and custom components that need alternative character visuals -- for example, showing a character's back during RPG battles or a side profile in a cutscene.

**You do not need Character Views for standard use.** Scenes, character sheets, dialogue portraits, and galleries all use the default base rendering automatically. Only define views when building custom rendering systems (e.g., battle plugins) that require non-standard character art.

## How It Works

Characters are rendered using **skin layers** (static images) and optionally **Spine animations**. By default, all layers without a `view` tag are rendered -- these are the base layers.

When a `view` is defined in the **Characters > Views** editor tab, it can be assigned to specific skin layers or spine configurations. Those tagged layers are then **excluded from default rendering** and only appear when explicitly requested by a component.

### Defining Views

1. Go to **Characters > Views** in the engine editor
2. Create a new view entry (e.g., `id: "back"`, `name: "Back"`)

### Tagging Skin Layers

1. Go to **Characters > Skin Layers**
2. On any layer, set the `view` dropdown to your defined view (e.g., "back")
3. That layer will no longer render in default mode -- it only renders when the view is requested

### Spine Views

Character templates and statuses support `spine_views` -- an array of Spine configurations for specific views:

```json
"spine_views": [
  { "id": "back", "atlas": "path/to/back.atlas", "skeleton": "path/to/back.skel", "default_animation": "idle" }
]
```

Each entry overrides the default Spine rendering when the matching view is requested. A character can have a static base doll and a Spine back-view, or vice versa.

## Using Views in Components

Pass the `view` prop to `CharacterDoll` or `CharacterSlot` to request a specific view:

```javascript
// Render the character's back view
<CharacterSlot :character="char" :slot="slot" view="back" />

// Default rendering (base layers only, no view prop needed)
<CharacterDoll :character="char" />
```

When `view` is provided:
- Base layers (no `view` tag) are **not rendered**
- Only layers matching the requested view are rendered
- If a matching spine entry exists for that view, it overrides the default Spine config

## Script API

```javascript
// Check if a character has a spine config for a specific view
character.isSpineForView('back');

// Get the spine config for a view (returns null if not defined)
const config = character.getSpineForView('back');

// Get filtered image layers for a specific view
const layers = character.getImageLayersForView('back');
```
