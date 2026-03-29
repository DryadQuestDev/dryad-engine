# Actions & Data

## DryadScript Actions

### `battle`

Start a battle from DryadScript. Pass enemy character IDs as a comma-separated string:

```js
{ battle: "goblin, troll" }
```

## Config Fields

| Field | Type | Description |
|---|---|---|
| `rows_size` | number | Battlefield breadth — how many characters fit in a single column |
| `columns_size` | number | Battlefield depth (used for ranged attacks) |
| `formation_stat_tags` | string[] | Stat tags to display in the formation panel |
| `turn_speed` | number | Virtual turn clock speed. Higher = faster rounds. Default: 50 |
| `mult_floor` | number | Min multiplier floor for % modifiers. Default: 0.1 (10%) |
| `starting_leader_id` | string | Character ID to use as leader at game start |
| `retreat` | chooseOne | Default retreat behavior: `enabled` / `disabled`. Default: enabled. Can be overridden per battle via `noRetreat` param |

## States

| State | Type | Description |
|---|---|---|
| `battle_speed` | number | Playback speed multiplier (0, 0.5, 1, 2, 3, 5) |
| `leader_id` | string | Current party leader character ID |

## Stores

| Store | Description |
|---|---|
| `battle_positions` | Map of `"row_col"` → characterId for the player's persistent formation |
