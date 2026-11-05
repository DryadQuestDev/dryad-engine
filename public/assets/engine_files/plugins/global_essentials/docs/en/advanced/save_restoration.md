# Save Restoration

When a game is shipped as ongoing chapters, the data shape changes constantly: a stat gets renamed, a status loses a tag, a property is added to a template, a face crop is recalibrated. Saved characters and items carry the OLD shape — extra keys, missing new keys, outdated status grants. Without a restoration pass, players load old saves and find their characters subtly broken.

The engine restores saves on its own. You don't declare anything for it: every character is rebuilt from its current template with what your game wrote on top, and every item picks up its template's current fields. `registerSaveMigration` is only there to tune that pass.

---

## What the engine does on its own

### When it runs

On save load, right before `game_initiated`, whenever the save was made on another version of the game or its mods. Bump `manifest.version` and the next load of an older save runs the pass once, re-stamps the save, and later loads skip it until the next bump. A mod's version counts too, so a mod update with a new data shape reaches the saves made with its old one.

In dev mode the version check is skipped: the pass runs on every load, so editor edits reach your dev saves without a version bump.

### Characters: the template, then the story

The engine records every write your game makes to a character, in the form it was made. On restoration it rebuilds the character from the current template, then plays the record back on top:

| The game wrote | Restored as |
|---|---|
| `{stat: "mc.charisma = 5"}`, `setStat()` | Exactly 5, whatever the template says now. |
| `{stat: "mc.charisma += 1"}`, `addStat()` | One above the template's current value: a template raised from 5 to 10 turns a saved 6 into 11. |
| `{trait: ...}`, `setTrait()`, `{attr: ...}`, `setAttribute()` | The value written. |
| A skin layer turned on or off, `addSkinLayers()` / `removeSkinLayers()` | The template's layers, plus the ones turned on, minus the ones turned off. |
| `{ability: ...}`, `addAbility()` / `removeAbility()` | The template's abilities, plus the ones granted, minus the ones removed. |

Everything the game never wrote follows the template, so a retuned stat, a new trait or a recalibrated face reaches the save. A `+=` after a `=` adds to that exact value. Pick `+=` whenever a change is relative to what the character had: an `=` pins the stat, and a later template change no longer reaches it.

A character's record is `character.coreWrites`. In a playtest, the debug panel's Characters tab tags every field in it (`=90`, `+5`, `story`), and clicking a tag forgets that write. The record fills in as the game plays, so a save made before your game ran on this engine has none, and its characters sync to their templates outright on its first restoration.

These are never recorded:

- **Writes made inside the pass.** That includes `save_migrated` and the other hooks below: they run again on every pass, so what they write is redone each time.
- **Statuses.** They are their own layer. The pass re-applies each held status from its current definition and keeps its stacks, remaining duration and source.
- **Resources.** Pools are snapshot before the pass and put back verbatim after, so a stat change can't clamp or refill them.

### Items: template fields, not traits

A saved item is a snapshot of its template at creation. The pass rebuilds every template-owned field from the current template: the equip status, price, consume payloads, slots, category, tags, actions and choices. Identity, quantity, the equipped flag and trade prices are the instance's own and never move.

Item traits stay as the save has them, since they hold what an instance owns: charges, wear, a stored load. Turn them on in your declaration when they should catch up too.

### What the pass always does

- **Worn items are re-bound.** Every equipped item's status is rebuilt from its status object at the end of the pass, whoever changed it.
- **Runtime state is left alone.** Statuses with no definition behind them (item statuses, plugin-spawned, hand-rolled `createStatus`), skill trees granted at runtime, and item slots added by the `item_slot` action all survive.
- **Characters whose template is gone are skipped.** Their `templateId` doesn't resolve (a mod was uninstalled), so they linger in the save with stale state but don't crash anything.

---

## Tuning it with `registerSaveMigration`

### Declaring one

```js
const { game } = window.engine;

game.registerSaveMigration('_core', {
    traits: { skip: ['bio'] },
});
```

Drop it at the top level of any `.mjs` file that's imported by your game's main script — **not** inside a listener. Scripts load before the save does, and the engine reads every declaration when the pass runs.

The first argument is who's declaring: `_core` is the game itself, a mod or plugin passes its own id. Registering the same source twice replaces its earlier declaration.

### Sections

Every section takes `true` (sync the whole section), `false` (skip it), `{ only: [ids] }` or `{ skip: [ids] }`. When both lists appear, the allowed ids are `only` minus `skip`. A skipped id keeps exactly what the save has: no template value, no replay.

| Key | Ids in the list | What it syncs |
|---|---|---|
| `stats` | stat ids | Template value with the recorded writes on top; purge stats that no longer exist. |
| `traits` | trait ids | Same, for traits. |
| `attributes` | attribute ids | Same, for attributes. |
| `abilities` | ability ids | The template's set with the recorded grants and removals. |
| `skinLayers` | skin layer ids | The template's set with the recorded layers turned on and off. |
| `spine` | view ids (`_default` for the default view) | Rebuild the core-status spine views (atlas, skeleton and their placement) from the template. |
| `staticArt` | view ids (`_default` for the default view) | Rebuild the core-status static-art views — `art_dx` / `art_dy` / `art_scale` for dolls rendered as images instead of skeletons. A character can use spine on one view and static art on another. |
| `itemSlots` | template slot ids | Backfill slots the character is missing and reposition the ones that exist. Slot x/y are saved per character, so this is the only way an editor reposition reaches an old save. The slot's type and its equipped item are left alone, and slots are never removed. |
| `skillTrees` | tree ids | Backfill template trees, purge deleted ones. |
| `learnedSkills` | skill (tree slot) ids | Rebuild learned-skill statuses from current definitions. Levels are preserved, clamped to the new max. |
| `statuses` | status ids | Re-apply held statuses so their grants pick up new definitions. Stacks, remaining durations and sources are preserved. |
| `itemTraits` | item trait ids | Reset every inventory item's traits to its template. Keyed by trait id, so the traits an instance owns (charges, wear) can be skipped while the rest catch up. |
| `items` | item template ids | Rebuild every other template-owned field of each inventory item (see above). |

### Modes

`mode` decides the sections nobody names:

- **Omitted** — every section syncs except `itemTraits`. This is the pass the engine runs with no declaration at all.
- **`opt-out`** — `itemTraits` syncs too. The lists name what to keep.
- **`opt-in`** — nothing syncs unless `true` or `only` turns it on. The lists name what to sync.

A `skip` only takes ids out: it never turns a section on.

```js
// opt-out — item traits catch up as well, except what an instance owns
game.registerSaveMigration('_core', {
    mode: 'opt-out',
    itemTraits: { skip: ['charges', 'durability'] },
});

// opt-in — re-push art calibration from the editor, touch nothing else
game.registerSaveMigration('_core', {
    mode: 'opt-in',
    traits: { only: ['face_shift_x', 'face_shift_y', 'face_shift_scale'] },
    spine: true,
    staticArt: true,
    skinLayers: true,
});
```

Reach for opt-in when one specific thing changed and you want the rest of the save left exactly as the player left it. Re-pushing art calibration is the classic case: a doll's face crop, skeletons and static art offsets live in the save, so recalibrating in the editor reaches an existing save only through the pass.

### Choosing what to skip

With the record in place, a skip list is rarely needed. Skip an id when the save should win over both the template and the record:

- **A value written before the record existed.** The first restoration of an older save syncs every unskipped id to its template, so list what that save holds that the template can't give back (a player-picked name, a stat the story raised).
- **A value written behind the engine's back.** Only writes through the methods and actions in the table above are recorded. A script that edits `getCoreStatus()` fields directly isn't, and the pass resets those ids.

Keep the lists small and well-justified. Each entry is a field where you're saying "I trust the save more than the definition."

### Mods and plugins

Each mod declares its own migration under its mod id, and the engine merges them all into one pass:

```js
// in a mod's script
game.registerSaveMigration('my_mod', {
    traits: { skip: ['mod_journal'] },   // player writes into this one — keep the save's value
});
```

The merge is **restrictive**: a mod can never resurrect state another source meant to keep.

| Declared | Merged result |
|---|---|
| `false` from any source | Section is off for everyone. Wins over everything else. |
| `skip` from any source | Those ids are skipped, whatever else asked for. Subtracts last. |
| `only` from several sources | The lists union — each source gets its own ids covered. Only the game's own `only` narrows a section the mode already syncs. |
| `true` from any source | Widens the section to every id (still minus the skips). |
| `mode` | Read from the `_core` declaration only. A mod setting it is ignored with a console warning. |

Order doesn't matter — load a mod before or after another and the merged pass is identical.

### Hooks: putting back what you derive

`item_create` does not fire on load. So anything an `item_create` listener derived per instance — a level-scaled stat block, a choice added for items with a certain trait — is gone once the `items` section resets the item. The pass fires these emitters so that work can be redone:

- `item_migrate(item, template)` — once per inventory item, right after its fields were reset, with a copy of its template.
- `status_migrate(character, status, previous)` — once per status the `statuses` section recreates from its definition, before it is added back, with the instance it replaces. Anything set on the status when it was applied (stats scaled to an item, a stamped `meta` value) is rebuilt here.
- `save_migrated()` — once at the end, for whole-save repairs (states, stores, flags).

They all fire before the engine re-binds worn items and puts resource pools back, so an equip-status object edited in a listener is bound, and a stat moved there can't clamp a pool. They fire whenever the pass runs — on an old save, or any load in dev mode. `save_migrated` fires then even when every section is off.

```js
// item_create adds the choice to fresh instances; item_migrate puts it back on saved ones.
function ensureEngravingChoice(item) {
    if (item.traits.engraved && !item.choices.includes('read_engraving')) item.choices.push('read_engraving');
}
game.on('item_create', ensureEngravingChoice);
game.on('item_migrate', ensureEngravingChoice);
```

The experience plugin does the same for level scaling: its `item_migrate` listener rescales every level-stamped equipment item from the template baseline at its stamped `item_level`, so a retuned weapon reaches old saves at the right level.

### What this won't fix

Registered states, stores and flags are yours. The pass never touches them, so do those repairs in a `save_migrated` listener:

```js
game.on('save_migrated', () => {
    // repair the generic pass can't express
});
```

`game.runDefaultSaveMigration(options)` still exists for the rare case where a pass has to run at some other moment. It takes the same options, ignores every registered declaration, and runs immediately.
