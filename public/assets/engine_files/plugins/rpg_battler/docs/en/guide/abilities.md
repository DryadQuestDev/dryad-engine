# Abilities

Abilities are defined through the engine's ability system. The RPG Battler plugin extends ability definitions with metadata (gating conditions) and aspects (effects).

## Targeting

### Target Types

| Target | Description |
|---|---|
| `self` | Caster only. Auto-executes without target selection. |
| `ally` | Any allied character (excluding self). |
| `self_and_ally` | Any allied character (including self). |
| `all_allies` | All allied characters. Auto-executes. |
| `enemy` | Any enemy character. |
| `all_enemies` | All enemy characters. Auto-executes. |
| `any` | Any character on either side. |

When a target type requires manual selection (`enemy`, `ally`, `self_and_ally`, `any`), the UI enters targeting mode. The player clicks a valid target to execute the ability. Self-targeting and AoE abilities (`self`, `all_enemies`, `all_allies`) execute immediately without target selection.

### Taunt Enforcement

If any enemy has the `taunt` token, single-target enemy abilities can only target taunting enemies. The player receives a notification if they try to target a non-taunting enemy.

## Meta Fields (Gating)

These fields control **when** an ability can be used:

| Field | Type | Description |
|---|---|---|
| `target` | chooseOne | What this ability can target (see target types above). Default: `enemy`. |
| `preparation` | boolean | Requires and consumes 1 Preparation token stack on caster. |
| `combo` | -- | See aspect `combo` below. The meta field `combo` on abilities from the auto battler is handled as an aspect here. |
| `caster_min_health` | number | Caster must have MORE than X% HP for the ability to be usable. |
| `caster_max_health` | number | Caster must have LESS than X% HP for the ability to be usable. |
| `target_min_health` | number | Target must have LESS than X% HP (execute abilities). |
| `target_max_health` | number | Target must have MORE than X% HP. |
| `cooldown` | number | Turns of cooldown after use. Defined in global_essentials. |
| `charges` | number | Maximum uses per battle. 0 = unlimited (cooldown only). Resets between battles. |
| `cd_on_battle_start` | number | Initial cooldown applied when battle starts (delays first use). |
| `cd_group` | string | Shared cooldown group. When cast, all abilities with the same `cd_group` on this character also go on cooldown (using the cast ability's cooldown value). |
| `base_weight` | number | AI priority weight. Higher values make the AI prefer this ability. |
| `order` | number | Sort order in the ability panel. Lower values appear first. |
| `is_hidden` | boolean | If true, ability is hidden from the ability panel and usability checks. |

## Aspect Fields (Effects)

These fields define **what** the ability does. An ability can have multiple effects, each with its own set of aspects:

### Damage & Healing

| Field | Type | Description |
|---|---|---|
| `chance` | number | Probability of this effect triggering (0--1). Undefined = always. |
| `damage` | number | Damage as % of caster's power. 120 = 120% of power. |
| `damage_type` | chooseOne | `physical`, `fire`, `water`, `air`, `earth`, `arcane`, `poison`, `light`, `dark`, `absolute`. |
| `healing` | number | Healing as % of caster's power. 100 = 100% of power. |
| `lifesteal` | number | % of total damage dealt by this effect healed back to caster. |

### Tokens

| Field | Type | Description |
|---|---|---|
| `token_apply` | chooseOne | Token ID to apply on target(s). |
| `token_stacks` | number | Number of stacks to apply. Power-scaled if token has `power_scaling`. |
| `token_duration` | number | Duration in turns. Omit for permanent tokens. |
| `token_apply_self` | chooseOne | Token ID to apply on caster after all targets are processed. |
| `token_stacks_self` | number | Stacks to apply on caster. |
| `token_duration_self` | number | Duration for self-applied token. |

### Status Effects

| Field | Type | Description |
|---|---|---|
| `status_apply` | chooseMany | Status IDs to apply on target(s). |
| `status_apply_self` | chooseMany | Status IDs to apply on caster. |
| `status_remove` | chooseMany | Status IDs to remove from target(s). |

### Cooldown & Charges

| Field | Type | Description |
|---|---|---|
| `cooldown_change` | number | Modify all ability cooldowns on target (signed). Negative = refresh. |
| `charges_change` | number | Modify all ability charges on target (signed). Positive = add. |

### Other

| Field | Type | Description |
|---|---|---|
| `combo` | boolean | Requires and consumes 1 Combo token stack per target. Targets without combo stacks are skipped. |
| `cleanse` | boolean | Remove cleansable tokens. Ally target: removes negative tokens. Enemy target: removes positive tokens. |
| `splash` | number | Also hits up to N neighbors of the primary target in their party lineup. Works for both enemy and ally targets. |
| `splash_only` | boolean | Excludes the primary target from this effect -- only splash neighbors are hit. Requires `splash`. |

## Cooldowns & Charges

- **Cooldown** -- After use, the ability enters cooldown for N turns. Reduced by 1 at the start of that character's turn.
- **Charges** -- Limited uses per battle. Set to -1 internally for unlimited. When charges hit 0, the ability cannot be used.
- **`cd_on_battle_start`** -- Some abilities start on cooldown (e.g., ultimates that should not be available on turn 1).

Cooldowns and charges are tracked per-character per-ability and reset between battles.

## Resource Costs

Abilities can have resource costs defined through the engine's built-in `costs` field on ability definitions. Costs reference resource-type character stats (stats with `is_resource: true`). If the character lacks sufficient resources, the ability is unusable. Costs are deducted when the ability is cast.
