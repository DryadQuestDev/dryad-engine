# Save Restoration

When a game is shipped as ongoing chapters, the data shape changes constantly: a stat gets renamed, a status loses a tag, a property is added to a template, a face crop is recalibrated. Saved characters and items carry the OLD shape — extra keys, missing new keys, outdated status grants. Without a restoration pass, players load old saves and find their characters subtly broken.

The engine ships a default migration pass that rebuilds characters and items from the current data definitions whenever the save's version differs from the current one. You declare what it should do; the engine runs it.

## Declaring one

```js
const { game } = window.engine;

game.registerSaveMigration('_core', {});
```

That bare declaration rebuilds every character and every item in the world from the current definitions. Drop it at the top level of any `.mjs` file that's imported by your game's main script — **not** inside a listener. Scripts load before the save does, and the engine runs the merged pass itself on every save load, right before `game_initiated` fires.

The first argument is who's declaring: `_core` is the game itself, a mod or plugin passes its own id. Registering the same source twice replaces its earlier declaration.

---

## Triggering a migration

Bump `manifest.version`. That's it.

The new value mismatches the old save's stamped version on next load, the migration runs once, the save is re-stamped, and subsequent loads are no-ops until the next bump.

Mods get the same treatment — each mod's version is part of the signature. If a mod ships an update with a breaking data shape, players see the migration run on first load with the new mod.

In dev mode the version check is skipped: the migration runs on every save load, so editor edits reach your dev saves without a version bump.

---

## Modes

Every section takes `true` (sync the whole section), `false` (skip it), `{ only: [ids] }` or `{ skip: [ids] }`. `mode` decides what happens to the sections you don't mention at all.

```js
// opt-out (default) — sync everything, the lists name what to SKIP
game.registerSaveMigration('_core', {
    traits: { skip: ['info', 'sire_id', 'sire_name', 'mother', 'conceived_day', 'born_day'] },
    attributes: { skip: ['life_stage'] },
});

// opt-in — sync nothing, the lists name what to SYNC
game.registerSaveMigration('_core', {
    mode: 'opt-in',
    traits: { only: ['face_shift_x', 'face_shift_y', 'face_shift_scale'] },
    spine: true,
    staticArt: true,
    skinLayers: true,
});
```

An omitted section follows the mode: everything in opt-out, nothing in opt-in. Both lists can appear on the same section — the allowed ids are then `only` minus `skip`.

Reach for opt-out when the data model changed and saved entities should catch up. Reach for opt-in when one specific thing changed and you want the rest of the save left exactly as the player left it — re-pushing art calibration is the classic case: a doll's face crop, skeletons and static art offsets live in the save, so recalibrating in the editor never reaches an existing save on its own.

---

## Mods

Each mod declares its own migration under its mod id, and the engine merges them all into one pass:

```js
// in a mod's script
game.registerSaveMigration('my_mod', {
    stats: { only: ['mod_corruption'] },   // my new stat should catch up
    traits: { skip: ['mod_journal'] },     // player writes into this one — never reset it
});
```

The merge is **restrictive**: a mod can widen coverage for its own content but can never resurrect state another source meant to keep.

| Declared | Merged result |
|---|---|
| `false` from any source | Section is off for everyone. Wins over everything else. |
| `skip` from any source | Those ids are skipped, whatever else asked for. Subtracts last. |
| `only` from several sources | The lists union — each source gets its own ids covered. |
| `true` from any source | Widens the section to every id (still minus the skips). |
| `mode` | Read from the `_core` declaration only. A mod setting it is ignored with a console warning. |

Order doesn't matter — load a mod before or after another and the merged pass is identical.

---

## Sections

| Key | Ids in the list | What it syncs |
|---|---|---|
| `stats` | stat ids | Reset to the template value, purge stats that no longer exist. |
| `traits` | trait ids | Same, for traits. |
| `attributes` | attribute ids | Same, for attributes. |
| `abilities` | ability ids | Resync the core-status ability set to the template's. |
| `skinLayers` | skin layer ids | Resync the core-status layer set to the template's. |
| `spine` | view ids (`_default` for the default view) | Rebuild the core-status spine views (atlas, skeleton and their placement) from the template. |
| `staticArt` | view ids (`_default` for the default view) | Rebuild the core-status static-art views — `art_dx` / `art_dy` / `art_scale` for dolls rendered as images instead of skeletons. A character can use spine on one view and static art on another. |
| `itemSlots` | template slot ids | Backfill slots the character is missing and reposition the ones that exist. Slot x/y are saved per character, so this is the only way an editor reposition reaches an old save. The slot's type and its equipped item are left alone, and slots are never removed. |
| `skillTrees` | tree ids | Backfill template trees, purge deleted ones. |
| `learnedSkills` | skill (tree slot) ids | Rebuild learned-skill statuses from current definitions. Levels are preserved, clamped to the new max. |
| `statuses` | status ids | Re-apply held statuses, stack counts preserved, so their grants pick up new definitions. |
| `itemTraits` | item trait ids | Reset every inventory item's traits to its template. Keyed by trait id, so the traits an instance owns (charges, wear) can be skipped while the rest catch up. |
| `items` | item template ids | Rebuild every other template-owned field of each inventory item: equip-status object, price, consume payloads, slots, category, tags, actions, choices. Identity, quantity, the equipped flag and trade prices never move. |

A few things the pass always does, in every mode:

- **Resource pools are never touched.** They're snapshot before the pass and restored verbatim after, so a stats sync or a status reapply can't clamp or refill them.
- **Worn items are re-bound.** Every equipped item's status is rebuilt from its status object at the end of the pass, whoever changed it.
- **Runtime state is left alone.** Statuses with no definition behind them (item statuses, plugin-spawned, hand-rolled `createStatus`), skill trees granted at runtime, and item slots that were added by the `item_slot` action all survive. Slots added by the action carry a generated id, so they never match a template slot.
- **Characters whose template is gone are skipped** — see below.

---

## Choosing what to skip

In opt-out mode the defaults reset every template-driven field on every entity. Sometimes you want a field to **survive** the reset because it carries player-set state.

Common example: a character `info` trait holding biography prose that gets mutated during scenes. You don't want it reset to the template's default each time you bump the version.

Keep the lists small and well-justified. Each entry is a field where you're saying "I trust the save more than the definition." Default to *not* skipping — easier to add later than to remove.

Watch out for state that's written at runtime onto the core status:

- **Direct `setStat` calls** outside of statuses get reset to the template value. Route persistent boosts through status grants instead, or add the stat to `stats: { skip: [...] }`.
- **Skin layers added by the `skin_layer` action** land on the core status too, so a full `skinLayers` sync removes them. Add those layers to `skinLayers: { skip: [...] }` to keep them.

---

## Hooks: putting back what you derive

A saved item is a snapshot of its template at creation, and `item_create` does not fire on load. So anything an `item_create` listener derived per instance — a level-scaled stat block, a choice added for items with a certain trait — is gone once the `items` section resets the item. The pass fires two emitters so that work can be redone:

- `item_migrate(item, template)` — once per inventory item, right after its fields were reset, with a copy of its template.
- `save_migrated()` — once at the end, for whole-save repairs (states, stores, flags).

Both fire before the engine re-binds worn items and puts resource pools back, so an equip-status object edited in a listener is bound, and a stat moved there can't clamp a pool. They fire only when the pass actually runs: an old save, or any load in dev mode.

```js
// item_create adds the choice to fresh instances; item_migrate puts it back on saved ones.
function ensureEngravingChoice(item) {
    if (item.traits.engraved && !item.choices.includes('read_engraving')) item.choices.push('read_engraving');
}
game.on('item_create', ensureEngravingChoice);
game.on('item_migrate', ensureEngravingChoice);
```

The experience plugin does the same for level scaling: its `item_migrate` listener rescales every level-stamped equipment item from the template baseline at its stamped `item_level`, so a retuned weapon reaches old saves at the right level.

---

## What this won't fix

- **Characters whose template was removed** (e.g. a mod was uninstalled). Their `templateId` doesn't resolve to anything, so the pass skips them. They linger in the save with stale state but don't crash anything. You can delete them manually if needed.
- **Anything outside characters and items** — registered states, stores and flags are yours. Do those repairs in a `save_migrated` listener (see above), which fires exactly when the pass runs:

```js
game.registerSaveMigration('_core', {});

game.on('save_migrated', () => {
    // one-off repair the generic pass can't express
});
```

`game.runDefaultSaveMigration(options)` still exists for the rare case where a pass has to run at some other moment. It takes the same options, ignores every registered declaration, and runs immediately.
