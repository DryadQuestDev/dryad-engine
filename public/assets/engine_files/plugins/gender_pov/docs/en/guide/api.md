# Service API

The plugin registers a `gender_pov` service for use by other scripts:

```js
const { resolvePronouns, resolvePOV } = game.getService('gender_pov');
```

## `resolvePronouns(charId)`

Returns an object with all pronoun forms resolved for the given character.

```js
const p = resolvePronouns('some_character_id');
p['he']   // "he" or "she"
p['his']  // "his" or "her"
p['Him']  // "Him" or "Her"
// ... all keys from the pronoun table
```

## `resolvePOV()`

Returns an object with all POV words resolved for the current `point_of_view` setting.

```js
const pov = resolvePOV();
pov['i']    // "I" or "you"
pov['my']   // "my" or "your"
pov['am']   // "am" or "are"
// ... all keys from the POV table
```

## `PRONOUN_KEYS` / `POV_KEYS`

Arrays of all registered placeholder keys, useful for iteration.

```js
const { PRONOUN_KEYS, POV_KEYS } = game.getService('gender_pov');
// PRONOUN_KEYS: ["he", "his", "him", "himself", "he's", "he'd", "he'll", "He", ...]
// POV_KEYS: ["i", "I", "me", "Me", "my", "My", "mine", "Mine", ...]
```
