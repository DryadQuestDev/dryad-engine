# Save Restoration

When a game is shipped as ongoing chapters, the data shape changes constantly: a stat gets renamed, a status loses a tag, a property is added to a template, a face crop is recalibrated. Saved characters and items carry the OLD shape — extra keys, missing new keys, outdated status grants. Without a restoration pass, players load old saves and find their characters subtly broken.

The engine ships a default migration helper that rebuilds characters and items from the current data definitions whenever the save's version differs from the current one.

## The helper

```js
const { game } = window.engine;

game.on('game_initiated', () => {
    game.runDefaultSaveMigration();
});
```

That bare call rebuilds every character and every item in the world from the current definitions. Drop the snippet in any `.mjs` file that's imported by your game's main script.

---

## Triggering a migration

Bump `manifest.version`. That's it.

The new value mismatches the old save's stamped version on next load, the migration runs once, the save is re-stamped, and subsequent loads are no-ops until the next bump.

Mods get the same treatment — each mod's version is part of the signature. If a mod ships an update with a breaking data shape, players see the migration run on first load with the new mod.

In dev mode the version check is skipped: the migration runs on every save load, so editor edits reach your dev saves without a version bump.

---

## Modes

Every section takes `true` (sync the whole section), `false` (skip it), or a list of ids. `mode` decides what a list means.

```js
// opt-out (default) — sync everything, the lists name what to SKIP
game.runDefaultSaveMigration({
    traits: ['info', 'sire_id', 'sire_name', 'mother', 'conceived_day', 'born_day'],
    attributes: ['life_stage'],
});

// opt-in — sync nothing, the lists name what to SYNC
game.runDefaultSaveMigration({
    mode: 'opt-in',
    traits: ['face_shift_x', 'face_shift_y', 'face_shift_scale'],
    spine: true,
    skinLayers: true,
});
```

An omitted section follows the mode: everything in opt-out, nothing in opt-in.

Reach for opt-out when the data model changed and saved entities should catch up. Reach for opt-in when one specific thing changed and you want the rest of the save left exactly as the player left it — re-pushing art calibration is the classic case: a doll's face crop and skeletons live in the save, so recalibrating in the editor never reaches an existing save on its own.

---

## Sections

| Key | Ids in the list | What it syncs |
|---|---|---|
| `stats` | stat ids | Reset to the template value, purge stats that no longer exist. |
| `traits` | trait ids | Same, for traits. |
| `attributes` | attribute ids | Same, for attributes. |
| `abilities` | ability ids | Resync the core-status ability set to the template's. |
| `skinLayers` | skin layer ids | Resync the core-status layer set to the template's. |
| `spine` | view ids (`_default` for the default view) | Rebuild core-status spine and static-art views from the template. |
| `itemSlots` | template slot ids | Backfill slots the character is missing and reposition the ones that exist. Slot x/y are saved per character, so this is the only way an editor reposition reaches an old save. The slot's type and its equipped item are left alone, and slots are never removed. |
| `skillTrees` | tree ids | Backfill template trees, purge deleted ones. |
| `learnedSkills` | skill (tree slot) ids | Rebuild learned-skill statuses from current definitions. Levels are preserved, clamped to the new max. |
| `statuses` | status ids | Re-apply held statuses, stack counts preserved, so their grants pick up new definitions. |
| `itemTraits` | item trait ids | Reset every inventory item's traits to its template. |
| `itemAttributes` | item attribute ids | Same, for item attributes. |
| `itemProperties` | item property ids | Purge stale properties, backfill new template ones. Current *values* are preserved. |
| `itemStatuses` | item template ids | Refresh each item's equip-status object from its template and re-bind it on whoever wears it. |

A few things the helper always does, in every mode:

- **Resource pools are never touched.** They're snapshot before the pass and restored verbatim after, so a stats sync or a status reapply can't clamp or refill them.
- **Runtime state is left alone.** Statuses with no definition behind them (item statuses, plugin-spawned, hand-rolled `createStatus`), skill trees granted at runtime, and item slots that were added by the `item_slot` action all survive. Slots added by the action carry a generated id, so they never match a template slot.
- **Characters whose template is gone are skipped** — see below.

---

## Choosing what to skip

In opt-out mode the defaults reset every template-driven field on every entity. Sometimes you want a field to **survive** the reset because it carries player-set state.

Common example: a character `info` trait holding biography prose that gets mutated during scenes. You don't want it reset to the template's default each time you bump the version.

Keep the lists small and well-justified. Each entry is a field where you're saying "I trust the save more than the definition." Default to *not* skipping — easier to add later than to remove.

Watch out for state that's written at runtime onto the core status:

- **Direct `setStat` calls** outside of statuses get reset to the template value. Route persistent boosts through status grants instead, or list the stat in `stats`.
- **Skin layers added by the `skin_layer` action** land on the core status too, so a full `skinLayers` sync removes them. List those layers to keep them.

---

## What this won't fix

- **Characters whose template was removed** (e.g. a mod was uninstalled). Their `templateId` doesn't resolve to anything, so the helper skips them. They linger in the save with stale state but don't crash anything. You can delete them manually if needed.
- **Anything outside characters and items** — registered states, stores and flags are yours. Pair the helper with `game.isOldSave()` for one-off retroactive fixes:

```js
game.on('game_initiated', () => {
    game.runDefaultSaveMigration();

    if (game.isOldSave()) {
        // one-off repair the generic pass can't express
    }
});
```
