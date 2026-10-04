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

On a choice, `battle` also marks the option as a fight: crossed swords before its label and the
`fight-choice` class on the row.

```js
~Attack her{battle: "forest_ambush"}
```

| Selector | Element |
|---|---|
| `.choice-list .choice.fight-choice` | The whole option row |
| `.fight-badge` | Badge wrapper (unmasked; its `::before` / `::after` can bracket the icon) |
| `.fight-icon` | The crossed-swords glyph, painted in the text colour |

### `fight`

The fight badge on a choice whose battle starts later, in the scene it leads to. Starts nothing.

```js
~Fight{fight: true, scene: "ambush"}
```

### `win`

Mark a battle definition defeated from a scene — the same flag a fight victory sets, firing
`battle_defeated` once and opening `_defeated(battleId)` gates:

```js
{ win: "forest_ambush" }
```

Use it on the closing paragraph of a branch that defeats the enemy without fighting (a seduction,
a trick, a scripted kill). The action is `delayed`: it fires on the continue-click after the
paragraph is read, so `battle_defeated` listeners (e.g. a defeat-rewards popup) can present their
UI over the finished paragraph and gate the scene until dismissed. Already-defeated battles are a
no-op.

### `set_defeated`

Mark one or more battle definitions defeated with no victory at all — the clear is recorded
(`battle_defeated` fires once per definition, `_defeated(battleId)` gates open) but nothing is
announced: no `battle_finished`, no rewards, no delay.

```js
{ set_defeated: "cellar_golem, cellar_golem_2" }
```

Use it when the fight never happens on the page — an enemy the player bypasses, disables or never
meets — where `win` would claim a victory the scene did not show. Already-defeated battles are a
no-op.

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
| `battle_overlay_x_offset` | number | Horizontal fine-adjust (%) for the battle overlay from the slot center. Usually 0 – Art Manager tuning centers the body. Positive = right |
| `battle_overlay_y_offset` | number | Vertical fine-adjust (%) for the battle overlay from the slot top. Tune per character height. Positive = down |
| `battle_idle` | chooseOne | Looping idle animation for this character's battle slot — `float`, `bounce`, `hop`, `pan`, `pulse`, `breathe`, `ghost`, `glow`. Unset = still. Applies to enemy and player slots alike, in every battle and wave. The remaining engine idles are left out: they either animate the element the battle tweens own, or duplicate the battler's damage feedback |

## Character Views

| View | Description |
|---|---|
| `back` | Back-facing view used for player characters in battle |
