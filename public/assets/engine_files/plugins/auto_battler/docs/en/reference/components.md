# Components

The plugin registers the following Vue components:

## FormationTab

Party formation editor. Displays the grid with draggable character placement and leadership budget.

## BattleScreen

Main battle UI container. Includes speed controls, initiative bar, battle grids, combat log, and character viewer.

## BattleGrid

Renders one side of the battle (player or enemy). Shows characters in their grid positions with health bars and token indicators. Animates movement between cells.

## BattleLog

Combat log grouped by turn, then by actor, then by ability. Displays damage, healing, token application, status changes, and deaths.

## InitiativeBar

Scrollable horizontal bar showing the next ~10 actors in ATB order, with turn markers between them.

## ActiveActor

Displays the currently acting character's name, speed, and ability chips. Ability chips show cooldown/charge badges and highlight the chosen ability.

## GridActor

Individual character on the battle grid. Shows the character face, health bar, active status icons, and token brick indicators.

## FloatingCombatText

Animated numbers that float upward from characters when damage or healing occurs. Color-coded by damage type. Multiple hits on the same character stack vertically.

## TokenBricks

Token display for the character viewer panel. Shows colored bricks for each active token with hover tooltips showing stacks, duration, source, and effect descriptions.

## HealthOverlay

Red overlay bar on character portraits in the party list, showing the percentage of health lost.
