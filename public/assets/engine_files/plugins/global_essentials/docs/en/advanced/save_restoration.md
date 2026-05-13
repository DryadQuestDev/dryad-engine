# Save Restoration

When a game is shipped as ongoing chapters, the data shape changes constantly: a stat gets renamed, a status loses a tag, a property is added to a template. Saved characters and items carry the OLD shape — extra keys, missing new keys, outdated status grants. Without a restoration pass, players load old saves and find their characters subtly broken.

The engine ships a default migration helper that rebuilds every character and every item from the current data definitions whenever the save's version differs from the current one.

## The helper

```js
const { game } = window.engine;

game.on('game_initiated', () => {
    game.runDefaultSaveMigration({
        ignoreStats: [],
        ignoreTraits: [],
        ignoreAttributes: [],
        ignoreItemTraits: [],
        ignoreItemAttributes: [],
    });
});
```

It will rebuild every character and every item in the world on version change ignoring the properties listed in the ignore list.

Drop the snippet in any `.mjs` file that's imported by your game's main script.

---

## Triggering a migration

Bump `manifest.version`. That's it.

The new value mismatches the old save's stamped version on next load, the migration runs once, the save is re-stamped, and subsequent loads are no-ops until the next bump.

Mods get the same treatment — each mod's version is part of the signature. If a mod ships an update with a breaking data shape, players see the migration run on first load with the new mod.

---

## Ignore lists

The defaults reset every template-driven field on every entity. Sometimes you want a field to **survive** the reset because it carries player-set state.

Common example: a character `info` trait holding biography prose that gets mutated during scenes. You don't want it reset to the template's default each time you bump the version.

```js
game.runDefaultSaveMigration({
    ignoreTraits: ['info', 'sire_id', 'sire_name', 'mother', 'conceived_day', 'born_day'],
    ignoreAttributes: ['life_stage'],
});
```

- `ignoreStats`, `ignoreTraits`, `ignoreAttributes` — character fields.
- `ignoreItemTraits`, `ignoreItemAttributes` — item fields. Items don't have stats; the analogous "ignore" wouldn't apply.

Keep the lists small and well-justified. Each entry is a field where you're saying "I trust the save more than the definition." Default to *not* ignoring — easier to add later than to remove.

---

## What this won't fix

- **Characters whose template was removed** (e.g. a mod was uninstalled). Their `templateId` doesn't resolve to anything, so the helper skips them. They linger in the save with stale state but don't crash anything. You can delete them manually if needed.
- **Direct `setStat` calls** outside of statuses. Those get wiped as they mutate characters _core Status that we're trying to restore from the template value. Route persistent boosts through status-grants instead, or add the stat to `ignoreStats`.