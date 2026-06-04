# Stagger

Stagger is a pressure-and-burst combat mechanic. Heavy-hitter abilities apply `stagger` status stacks to a target; when the count reaches the target's stagger threshold, the target is **stunned** for one turn and the stagger is fully consumed. After the stun resolves, the target gains the **Braced** status, temporarily doubling their threshold so they can't be stun-locked.

The point of stagger is to give turn-based combat a rhythmic build-and-release loop: chip away, wait for the burst window, exploit it.

## Stats

| Stat | Default | Purpose |
|---|---|---|
| `stagger_threshold` | 0 | Base count of stagger stacks needed to trigger a stun. Set per-character on their template. Typical: 3-5 for fragile characters, 5-8 for normal enemies, 8-15 for tanks and bosses. A value of 0 means the character cannot be staggered at all. |
| `stagger_threshold_pct` | 0 | Additive percentage bonus to the threshold from any source. Braced grants +100. Effective threshold = `stagger_threshold * (1 + stagger_threshold_pct / 100)`. |
| `bonus_stun_damage` | 0 | Extra damage percentage dealt by this character to **staggered** targets — those that are currently stunned **or** still `braced` (the recovery window after a stun). Mirrors the shape of `crit_chance` / `crit_multi`. |

## How a stun fires

1. An ability applies one or more `stagger` stacks to a target (via the standard `status_apply_target` aspect with `status_apply_target: ["stagger"]` + `status_stacks_target: N`).
2. If the target is **already stunned**, the stagger application is silently skipped. Stunned targets cannot accumulate stagger.
3. Otherwise the stagger stacks are added (as a new instance — stagger is `multi_stack: true`), and immediately after, the threshold check runs. If `current stagger ≥ effective threshold`:
   - All stagger instances are stripped (no overflow carry-over).
   - The `stun` status (1 stack) is applied.
   - Any **channel** the stunned character was casting ends: every `is_channel` status whose `source` is this character is removed, wherever it is held (see [Statuses](statuses.md)).
   - The `braced` status is applied (or refreshed if already present): `+100%` threshold for 3 turns.
4. The target's next turn begins → the engine consumes the stun stack at turn start → the target skips their action.

**Exposed window.** A staggered target takes `bonus_stun_damage` for the whole stagger window — while stunned **and** through the `braced` recovery that follows. So a stagger opens a reliable multi-turn damage window (not just the single skipped turn), even though Braced also makes the target harder to re-stagger. The window ends when Braced expires.

## When Braced expires (bonus-loss bookkeeping)

When Braced falls off (3 turns after it was applied or last refreshed), the effective threshold drops back to base. Stagger that was accumulated **in the bonus zone** drops off with the bonus — it doesn't carry over into base.

Mechanically: when Braced (or any threshold-bonus status) expires, the engine removes `min(current_stagger, bonus_lost)` stagger stacks. `bonus_lost` is the difference between the threshold before and after the status came off.

Worked examples (base 5, Braced +100% → effective threshold 10 while active):

- **Stagger 3 was applied during Braced** → Braced expires → `min(3, 5) = 3` stacks removed → **0/5** remaining.
- **Stagger 8 was applied during Braced** → Braced expires → `min(8, 5) = 5` stacks removed → **3/5** remaining.

This makes Braced genuine protection during AND after the buff — no "stockpile during Braced, surprise stun the moment it drops" trap. The grey pips in the UI represent exactly this bonus zone; when Braced drops, the grey pips disappear along with any stagger filling them.

Multi-source: if two different statuses both grant threshold bonuses and only one expires, only that one's contribution counts toward `bonus_lost`. The math handles it without special casing.

Limitation: only duration-expiry triggers the bookkeeping (it runs at character-turn-start). If a Braced is mid-battle cleansed via an ability, the bonus stacks persist until next turn-start re-evaluation. Almost no abilities cleanse Braced, so this is rarely an issue in practice.

## Effect order matters (intentional design surface)

Within a single ability that has multiple effects (e.g. `[status_apply_target: stagger, damage]`), effects resolve in array order. This lets ability authors choose whether a hit benefits from the stun it just caused:

- **`[status_apply_target: [stagger], damage]`** — stagger applies first → if the threshold is crossed, the stun is applied → the damage effect runs next → the target is now stunned → `bonus_stun_damage` multiplies. **The same ability sets up AND exploits the stun.**
- **`[damage, status_apply_target: [stagger]]`** — damage hits a non-stunned target first → stagger applies after → no self-benefit on this ability's damage.

Use this deliberately. A heavy stagger-finisher (a shatter swing, a big-club slam) reads naturally as **stagger first, damage second** — the impact lands harder *because* it broke through. A skirmisher attack that happens to apply some incidental stagger reads naturally as **damage first, stagger second** — the stagger is a side-effect, not the point.

## Authoring guidelines

- Only heavy-hitter abilities should apply stagger. Sprinkling 1 stagger on every basic attack defeats the rhythmic build-and-burst feel.
- Typical per-hit stagger application: 1-3 stacks. Larger numbers (5+) make stuns feel automatic instead of earned.
- The `stagger` status has no `meta.power_scaling` flag — damage stats don't inflate stagger application. Stagger reads cleanly off the ability's authored `status_stacks_target`.
- For "execute" finisher abilities, give the caster a self-buff status that boosts `bonus_stun_damage` for one turn instead of hard-coding the multiplier into the ability. That keeps `bonus_stun_damage` as the single source of truth.
- Set `stagger_threshold` on character templates with the same care as HP — it tunes how often a character gets stunned. Leave it at 0 on characters that should never be staggered (bosses, scripted enemies).
- **Use flat `stagger_threshold` bonuses for new statuses; `stagger_threshold_pct` is reserved for Braced.** Flat bonuses are predictable and read the same on every character. The pct stat exists only because "Braced doubles your threshold" needs to scale with each character's base. A new status like "Iron Will" that grants +1 threshold while at full HP, or a trinket that grants +2 permanent threshold, should add to `stagger_threshold` directly via `stats: { stagger_threshold: 1 }` — not via `stagger_threshold_pct`. The bonus-loss bookkeeping handles both cases identically (it diffs the effective threshold), but flat is cleaner to author and reason about.

## UI

Stagger pips render in the character overlay. The pip row appears whenever the character has a non-zero stagger threshold or any stagger stacks.

- **Grey/ghosted pips** = current temporary bonus zone (from Braced or any other status that boosts `stagger_threshold_pct`). Rendered on the **left**.
- **Orange pips** = base threshold. Rendered to the **right** of the bonus pips.
- **Filled pips** = current stagger stack count, **filling grey-first then orange**. This mirrors the math: bonus zone fills before base, and bonus drops off first when the status expires.

The Braced status appears as a regular status icon — players read "this character is Braced" from the status icon, and the extra grey pips from the pip row.
