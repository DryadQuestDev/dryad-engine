# Achievements

Achievements are data your game drives. You define them in the editor, your scripts decide when progress moves, and the engine does the rest: it stores the progress in the save, scores the reward points, pops the unlock notification, and renders the Achievements tab.

The split matters. The engine ships **no** achievements of its own and does **no** tracking, and neither do plugins — a plugin's job is only to make sure the moments worth tracking are covered by emitters. Nothing in the engine knows what "Anal Slut" means or how many loads it takes; that lives entirely in your game's data and one tracking script.

---

## The three tabs

The editor's **Achievements** section has three files:

- **Achievements** — the entries themselves.
- **Tiers** — bronze, silver, gold, whatever your game uses. A tier carries the card color and the default reward points for everything at that tier, so retuning a whole rank is one edit.
- **Groups** — the sub-tabs the Achievements tab is split into (Combat, Exploration, ...), in the order you give them. The player browses one group at a time; the summary and tier ladder above them always count the whole catalog.

Every field is documented by its tooltip in the editor. The concepts worth knowing before you author are below.

**Target.** Progress needed to complete. `1` makes a simple flag ("bear your first sprout"), a bigger number makes a counter ("bear thirty sprouts"). Leave it empty when the number comes from your data instead — see *Targets counted from data*.

**Hidden.** Masks the name and description until earned, for spoilers and surprises. The tier stays visible, so the player still knows something is there.

**Tags.** Free-form labels that let one call drive a whole family — see *Families*.

The tab appears only when a game actually defines achievements. Ship none and the player never sees an empty screen.

---

## Moving progress

Three calls, all on `game`:

```js
game.progressAccolade('first_seedling');            // +1
game.progressAccolade('tidewater', volume);         // +N
game.setAccoladeProgress('overkill', hit.damage);   // raise to this value
```

`setAccoladeProgress` **only ever raises**. A write lower than the stored progress is dropped, and progress is clamped at the target so a finished counter reads exactly `50 / 50`. That one rule is what makes tracking code simple to write:

- **Best-of values** need no bookkeeping. Call it on every hit and the biggest one stays: `setAccoladeProgress('overkill', damage)`.
- **Set sizes** are safe to recompute. Keep your own set of what she's worn, and push its size on every equip; a rebuild that comes back smaller can't erase the record.
- **Per-scene records** need no window machinery. Write the running count live during the scene and reset your own counter when the scene ends — the wildest scene is already recorded.

There is no way to lower progress or un-earn an achievement. Progress models "the furthest she ever got", which is what an achievement wants.

---

## Families

Tiered achievements — ten loads, fifty, two hundred — are one event driving several entries. Tag them in the editor rather than listing ids in code:

```js
// every achievement tagged "seed_ass" advances; each stops at its own target
game.progressAccoladesByTag('seed_ass');

// or push an absolute value to the whole family
game.setAccoladeProgressByTag('mc_level', level);
```

Adding a fourth tier later is then an editor change, not a code change. `game.getAccoladesByTag(tag)` returns the ids if you need them yourself.

---

## Targets counted from data

"Wear every outfit" has no honest number to hard-code: the moment you add an outfit, the achievement completes one short. Leave `target` empty in the editor and count it at load instead:

```js
let outfits = 0;
for (const template of game.getData('item_templates').values()) {
    if ((template.slots || []).includes('outfit')) outfits += 1;
}
game.setAccoladeTarget('well_dressed', outfits);
```

Run that at script-load time, every boot. An achievement with no target — neither authored nor set — can never complete, so a typo fails loudly rather than handing out a free unlock.

---

## Reward points

Each achievement is worth points: its own `points` if you set one, otherwise its tier's. Read the score with `game.getEarnedPoints()` and `game.getTotalPoints()`, or ask what a single entry is worth with `game.getAccoladePoints(id)`. The tab shows the running total.

Points are a score, not a currency — the engine never spends them. To pay out something real, listen for the unlock:

```js
game.on('accolade_completed', (accoladeId, points) => {
    game.getCharacter('mc').addResource('gold', points * 10);
});
```

That fires the moment progress reaches the target, once per achievement, before any reward exists — so what an achievement actually pays is your game's decision.

---

## When progress is ignored

Writes are silently dropped in three cases, by design:

- **Gallery replay.** Replayed scenes run their actions for real, so without this a re-watch would earn achievements again.
- **`accolades_frozen`.** Set this state from your debug tooling so seeding a test save doesn't unlock the catalog.
- **Disabled entries.** A retired achievement never completes and never shows. Prefer disabling over deleting so old saves keep making sense, and add a new id rather than rewriting a shipped one.

An unknown achievement id logs an error instead of failing quietly.

---

## A tracking script

Everything above in practice — one file, imported from your game's main script:

```js
const { game } = window.engine;

// targets that come from data
game.setAccoladeTarget('complete_kitchen', game.getData('item_recipes').size);

// tiered family, driven by tag
game.on('sprout_birth', () => game.progressAccoladesByTag('births'));

// best-of, safe to call on every hit
game.on('battle_action_applied', (caster, ev) => {
    if (ev.damage > 0) game.setAccoladeProgress('overkill', ev.damage);
});

// distinct counting, with your own saved set
const seen = game.createStore('achievement_track');
game.on('status_added', (character, status) => {
    const list = seen.get('statuses') || [];
    if (!list.includes(status.id)) {
        list.push(status.id);
        seen.set('statuses', list);
    }
    game.setAccoladeProgress('afflicted', list.length);
});
```

Keep it in one file. The engine gives you the storage, the notification and the screen; this script is the only place that knows what your game considers an achievement.
