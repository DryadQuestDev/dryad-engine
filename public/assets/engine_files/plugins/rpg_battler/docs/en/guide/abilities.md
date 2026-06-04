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

If any enemy has the `taunt` status, single-target enemy abilities can only target taunting enemies. The player receives a notification if they try to target a non-taunting enemy.

## Meta Fields (Gating)

These fields control **when** an ability can be used:

| Field | Type | Description |
|---|---|---|
| `target` | chooseOne | What this ability can target (see target types above). Default: `enemy`. |
| `require_status_self` | chooseOne (`character_statuses`) | Usability gate: the caster must have ≥1 stack of this status or the ability is unusable (greyed out). |
| `require_status_self_consume` | boolean | When true, removes 1 stack of `require_status_self` from the caster on cast. (e.g. `require_status_self: preparation` + consume = the old Preparation behavior.) |
| `caster_min_health` | number | Caster must have MORE than X% HP for the ability to be usable. |
| `caster_max_health` | number | Caster must have LESS than X% HP for the ability to be usable. |
| `target_min_health` | number | Target must have LESS than X% HP (execute abilities). |
| `target_max_health` | number | Target must have MORE than X% HP. |
| `cooldown` | number | Turns of cooldown after use. Defined in global_essentials. |
| `charges` | number | Maximum uses per battle. 0 = unlimited (cooldown only). Resets between battles. |
| `cd_on_battle_start` | number | Initial cooldown applied when battle starts (delays first use). |
| `cd_group` | string | Shared cooldown group. When cast, all abilities with the same `cd_group` on this character also go on cooldown (using the cast ability's cooldown value). |
| `unamplified` | boolean | When true, the ability scales from raw `power` only; `power_amplifier` is ignored. |
| `channel` | boolean | Marks the ability as a **channel** (see below). |
| `school` | chooseOne | Flavour/synergy tag (`fire`, `water`, `light`, ...) from `plugins_data/rpg_battler/schools`. Does **not** affect mitigation — reserved for future school-synergy systems. |
| `projectile` | chooseOne | VFX definition from the **Projectiles** tab (`plugins_data/rpg_battler/projectiles`). **Leave empty for a melee cast** (caster lunges). The def drives the animation: a `travel_image` makes a sprite fly caster→target then play the hit VFX; a def with only a `hit_image` manifests the VFX at the target (no travel). Each sprite can be a single image or a spritesheet (`*_type: sheet` + `*_frames`/`*_fps`); a sheet may be a single horizontal row or a grid via `*_cols` (frames-per-row — a partial last row is trimmed). On-screen sizes come from `projectile_travel_size` / `projectile_hit_size` in the battler **Config** tab. Reusable across abilities. |
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
| `damage_type` | chooseOne | `physical` (→ `physical_armor`), `magic` (→ `magical_armor`), or `absolute` (ignores armor). Elemental flavour goes on the ability's `meta.school`, not here. |
| `healing` | number | Healing as % of caster's power, applied to the effect's **target(s)**. 100 = 100% of power. |
| `healing_self` | number | Heal the **caster** for this % of caster power, regardless of the ability's target (useful on offensive abilities). |
| `lifesteal` | number | % of the **ability's total damage** (summed across all of its effects/targets this cast) healed back to the caster, scaled by the caster's `heal_amplification` and `heal_received_mult`. Put it on any one effect — it need not be the damaging one; if several effects set it, the highest applies. |

### Statuses

| Field | Type | Description |
|---|---|---|
Status apply/remove come in four **scopes** — `_target` (the ability's target(s) + splash), `_self` (the caster), `_allies` (the caster's whole living side, **including the caster**), `_enemies` (the caster's living enemies). Allies/enemies are independent of the ability's `target`, so one ability can e.g. damage all enemies *and* cleanse the party.

| Field | Type | Description |
|---|---|---|
| `status_apply_target` | chooseMany | Status IDs to apply on the target(s). For each id: refresh-on-reapply if single-stack, append a new instance if `multi_stack: true`. |
| `status_stacks_target` | number | Stacks per status in `status_apply_target`. Default 1. Power-scaled if the status's `meta.power_scaling` is true. |
| `status_duration_target` | number | Duration in turns. Overrides the status template's `duration`. Omit for the status's default. |
| `status_remove_target` | chooseMany | Status IDs to remove from the target(s). |
| `status_remove_stacks_target` | number | Stacks to remove per status in `status_remove_target`. Unset = clear all stacks. |
| `status_apply_self` / `status_stacks_self` / `status_duration_self` | chooseMany / number / number | Same, applied to the **caster**. |
| `status_remove_self` / `status_remove_stacks_self` | chooseMany / number | Remove from the **caster**. |
| `status_apply_allies` / `status_stacks_allies` / `status_duration_allies` | chooseMany / number / number | Apply to **all living allies** (includes the caster). |
| `status_remove_allies` / `status_remove_stacks_allies` | chooseMany / number | Remove from **all living allies** (includes the caster). |
| `status_apply_enemies` / `status_stacks_enemies` / `status_duration_enemies` | chooseMany / number / number | Apply to **all living enemies**. |
| `status_remove_enemies` / `status_remove_stacks_enemies` | chooseMany / number | Remove from **all living enemies**. |

### Cooldown & Charges

| Field | Type | Description |
|---|---|---|
| `cooldown_change` | number | Modify all ability cooldowns on target (signed). Negative = refresh. |
| `charges_change` | number | Modify all ability charges on target (signed). Positive = add. |

### Other

| Field | Type | Description |
|---|---|---|
| `require_status_target` | chooseOne (`character_statuses`) | The effect only applies to targets that have ≥1 stack of this status; others are skipped. |
| `require_status_target_consume` | boolean | When true, removes 1 stack of `require_status_target` from each target the effect applies to. (e.g. `require_status_target: combo` + consume = the old Combo behavior.) |
| `cleanse` | boolean | Remove cleansable `meta.is_battle` statuses. Ally target: removes negative. Enemy target: removes positive. |
| `splash` | number | Also hits up to N neighbors of the primary target in their party lineup. Works for both enemy and ally targets. |
| `splash_only` | boolean | Excludes the primary target from this effect -- only splash neighbors are hit. Requires `splash`. |
| `bounce` | number | After the ability resolves, the **whole ability** re-resolves N more times on random targets of the same side, with a short delay per bounce. By default a hop can't land on the previous target; the chain ends early if no valid target remains. Bounces re-apply effects only -- they do **not** re-pay cost or re-trigger cooldown/charges. |
| `bounce_same` | boolean | When true, a bounce may land on the **same** target as the previous hop (allows repeats). Default false (consecutive hops must differ). |
| `summon` | chooseOne (`character_templates`) | Spawn a combatant from the chosen character template onto the **caster's side**. It joins the battle and acts this round based on its speed (it is **not** added to the persistent party). One summon per effect — add more effects to summon multiple creatures. Independent of the ability's `target`; ignored on bounces. |

## Cooldowns & Charges

- **Cooldown** -- After use, the ability enters cooldown for N turns. Reduced by 1 at the start of that character's turn.
- **Charges** -- Limited uses per battle. Set to -1 internally for unlimited. When charges hit 0, the ability cannot be used.
- **`cd_on_battle_start`** -- Some abilities start on cooldown (e.g., ultimates that should not be available on turn 1).

Cooldowns and charges are tracked per-character per-ability and reset between battles.

## Resource Costs

Abilities can have resource costs defined through the engine's built-in `costs` field on ability definitions. Costs reference resource-type character stats (stats with `is_resource: true`). If the character lacks sufficient resources, the ability is unusable. Costs are deducted when the ability is cast.

## Channelled Abilities (`channel`)

Set `meta.channel: true` to make an ability a **channel**. On cast, the plugin:

1. Resolves the ability normally (pays cost, applies all effects, animates).
2. Places a **channel token** on the caster — a runtime status built from the ability itself (it shows the ability's `icon` and `name` in the status row). The token holds a **frozen snapshot** of the resolved ability (its effects at the cast-time potency tier) and the caster's cast-time effective power.

On each of the caster's following turns, the channel **re-fires that frozen snapshot** automatically (floating numbers; no projectile VFX). Because power and effects are snapshotted at cast, anything that changes the caster's stats or which ability tier is active afterwards (e.g. a self-buff, or a game-side reservoir/potency switch) does **not** alter the in-flight channel. The caster still takes their normal action on channel turns.

The channel ends when the caster is **stunned** — the token is a `meta.is_channel` status, so the stun sweep removes it (and the channel stops). It is also wiped at battle end like any `meta.is_battle` status.

A character can channel **one** ability at a time: casting a channel removes the caster's existing channel first.

Author the per-turn payload as normal effects on the ability (damage, status applies, etc.) — they re-fire every turn. Combine with a self-applied `stagger` effect for a self-limiting channel (the caster eventually stuns themselves, ending it).
