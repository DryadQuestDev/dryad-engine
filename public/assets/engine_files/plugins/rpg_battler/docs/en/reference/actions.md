# Actions & Data

## DryadScript Actions

### `battle`

Start a battle from DryadScript. Pass a battle definition ID as a string:

```js
{ battle: "forest_ambush" }
```

Or pass a full configuration object:

```js
{ battle: {
    battleId: "forest_ambush",
    playerParty: ["hero_knight", "hero_mage"],
    background: "dark_forest_bg"
}}
```

The action is `delayed`, meaning it executes after the current DryadScript sequence completes.

## Config Fields

| Field | Type | Default | Description |
|---|---|---|---|
| `max_party_size` | number | 4 | Maximum number of characters on the player side |

## States

| State | Default | Description |
|---|---|---|
| `rpg_battle_log_minimized` | `false` | Whether the battle log panel is minimized |
| `disable_saves` | -- | Set to `true` during battle to prevent saving. Restored after battle ends |
| `block_party_inventory` | -- | Set to `true` during battle to block party inventory access. Restored after battle ends |

## Game Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `rpg_battle_speed` | chooseOne | `medium` | Battle animation speed: `slow`, `medium`, `fast` |

## Character Attributes

| Attribute | Values | Description |
|---|---|---|
| `battle_state` | `idle`, `idle_wounded`, `attack`, `cast`, `hit`, `death` | Character animation state during battle |

## Character Traits

| Trait | Type | Description |
|---|---|---|
| `battle_overlay_x_offset` | number | Horizontal offset (%) for the battle overlay (health bar, tokens). Positive = right |
| `battle_overlay_y_offset` | number | Vertical offset (%) for the battle overlay (health bar, tokens). Positive = up |

## Character Views

| View | Description |
|---|---|
| `back` | Back-facing view used for player characters in battle |
