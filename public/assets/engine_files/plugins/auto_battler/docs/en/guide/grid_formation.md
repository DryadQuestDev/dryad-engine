# Grid & Formation

## Grid Layout

Each side of the battle has a grid with configurable dimensions:

- **Rows** = breadth (characters side by side)
- **Columns** = depth (front to back, determines range)
- **Column 0** = front line (closest to the enemy)

Positions are stored as `"row_col"` strings (e.g., `"2_1"` = row 2, column 1).

The player grid is mirrored for display so column 0 (front) appears on the right, facing the enemy grid.

## Formation

Before battle, players arrange their party on the grid. Formation is persistent — positions are saved in the `battle_positions` store.

### Leadership Budget

The party leader's `leadership` stat determines the total formation budget. Each character has a `leadership_cost` stat. The total cost of all placed characters must not exceed the leader's budget.

```js
const { leaderId, budget, total, overflow } = game.getService('check_leadership').check();
// budget = leader's leadership stat
// total = sum of all placed characters' leadership_cost
// overflow = true if total > budget
```

The `_leadership_overflow` condition is `true` when the formation exceeds the budget. Battle cannot start while overflowing.

## Auto-Placement (Enemies)

Enemy formations are auto-placed by the AI using a scoring algorithm:

1. **Frontline score** — Characters with shields, melee range, and no healing abilities get higher scores (placed in front columns)
2. **Clustering vs spreading** — If the team has ally-targeting AoE abilities, characters cluster toward center rows to benefit from AoE buffs. Otherwise they spread out to avoid enemy AoE.
3. **Column distribution** — Characters are spread proportionally across columns based on their frontline score.

## Movement in Battle

Abilities can reposition characters during combat:

- `movement_x` / `movement_y` — Push/pull targets by grid cells
- `movement_target` — Who to move: `"target"` or `"caster"`
- `relocate_self` — Teleport caster to the target's tile after attacking

Movement is bounded by grid dimensions and occupied cells.
