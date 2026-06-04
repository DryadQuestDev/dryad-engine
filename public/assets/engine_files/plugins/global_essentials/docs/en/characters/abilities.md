# Abilities

The engine provides a complete ability system:

1. **Define & Author** — create ability definitions (fields like damage, cooldown, element) and ability templates in the editor
2. **Attach** — grant abilities to characters through templates, items, skill trees, or buff statuses
3. **Trigger Battle** — the built-in **Auto Battler** plugin consumes your abilities for a grid-based battle system with formations, AI, tokens, and damage formulas

You can use everything out of the box, or build your own battle system (or use a community plugin) on top of the same data layer.

---

## Abilities Are Part of the Status System

Like everything in the character system, abilities are granted through statuses:

- **Character template** - base abilities the character starts with
- **Equipped item** - abilities granted while wearing the item
- **Learned skill** - permanent abilities from skill trees
- **Applied buff** - temporary abilities from effects

When a status with abilities is added, the character gains those abilities. When removed, they lose them.

---

## The Two-Layer System

### 1. Ability Definitions

First, define what **fields** abilities can have in your game.

Go to **Characters > Ability Definitions** and create fields like:

| Field | Type | Role |
|-------|------|------|
| name | string | meta |
| icon | image | meta |
| cooldown | number | meta |
| damage | number | aspect |
| element | chooseOne (fire, ice, lightning) | aspect |

Each field has a **role**:
- **meta** - Presentation data (name, icon, description, cooldown)
- **aspect** - Mechanical data (damage, range, element type)

Think of definitions as "what CAN an ability have?" - you're designing the structure.

### 2. Ability Templates

Then create actual abilities using those fields.

Go to **Characters > Ability Templates** and create abilities like:

**Fireball**
- **meta section:**
  - name: "Fireball"
  - icon: (select image)
  - cooldown: 3
- **effects section:**
  - Effect "main_damage":
    - damage: 50
    - element: fire
  - Effect "burn":
    - damage: 10
    - element: fire

**Why effects are a list:** One ability can do multiple things. Fireball might deal direct damage AND apply a burn effect. Each effect has its own aspects.

---

## Granting Abilities

Add abilities to any status via the **abilities** field in the editor.

**In a character template:**
Go to **Characters > Character Templates**, select your character, and in the abilities field select the abilities you want.

**In an item:**
Go to **Characters > Item Templates**, select your item, and add abilities to the abilities field.

**In a buff status:**
Go to **Characters > Character Statuses**, create a buff, and add abilities to grant while the buff is active.

Characters accumulate abilities from all their active statuses. The same ability from multiple sources doesn't duplicate - each ability ID appears once.

---

## Ability Modifiers

Statuses can also **modify** existing abilities without changing the base template.

In any status form, the **abilities** section uses the same form as ability templates. To create a modifier, set the `modifies` field to the ID of the ability you want to modify, then fill in the fields you want to change:

**Fire Mastery Buff**
- modifies: fireball
- effects:
  - Effect "main_damage":
    - damage: +25

**How modifiers merge:**
- **Numbers** sum together (damage 50 + modifier 25 = 75)
- **Arrays** concatenate
- **Other types** last value wins

This lets you create buffs like "Fire Mastery: +25 damage to Fireball" without editing the base ability template.

---

## Accessing Abilities in Code

| Method | Returns |
|--------|---------|
| `character.abilities` | Set of ability IDs the character has |
| `character.getAbility(id)` | Single merged ability (base + all modifiers) |
| `character.getAbilities()` | All abilities as a reactive object |
| `character.addAbility(id)` | Add an ability template to the character (persists through save/load) |
| `character.removeAbility(id)` | Remove an ability from the character |

The merged ability object contains:
- `meta` - presentation fields (name, icon, cooldown, etc.)
- `effects` - object of effect IDs to their aspects

Each effect record may contain `__name` (the effect's display name from the template or modifier). This is a reserved key - skip it when iterating aspects:

```js
const ability = character.getAbility("fireball");
for (const effectId in ability.effects) {
    const effect = ability.effects[effectId];
    const effectName = effect.__name; // "Fire Strike"
    for (const aspectId in effect) {
        if (aspectId.startsWith('__')) continue; // skip reserved keys
        // process aspect...
    }
}
```

---

## Battle Systems & Plugins

The engine provides the ability data layer, but the battle system itself is handled by plugins.

**Built-in: Auto Battler plugin** — a grid-based auto battler with formations, tokens, AI targeting, and damage formulas. Enable it in your game's manifest and define abilities using its format (damage, damage_type, range, area_shape, etc.). See the Auto Battler plugin docs for details.

**Custom or community plugins** — you can build your own battle system or use community plugins. The ability API gives you everything you need: `character.getAbilities()` for data, `character.getAbility(id)` for merged values, and `game.buildAbilityEffectsDescription()` for auto-generated tooltips. Your plugin just provides the UI and game logic on top.

---

## Auto-Generated Descriptions

Ability definitions with `ingame_description` templates can auto-generate player-facing text. Set these on **aspect** or **meta** role definitions:

- **ingame_description** - Template string. `[v]` = this aspect's value, `[sibling_id]` = another aspect's value in the same effect.
- **ingame_description_ref** - For fromFile definitions, the dot-path to the display name (e.g., `"name"`, `"traits.name"`). Falls back to `"name"`, then raw ID.

Aspects without `ingame_description` are silently skipped (useful for auxiliary fields like `damage_type` that are consumed by other templates).

**Auto-linkification.** When an aspect's value references a `fromFile` entity by id (e.g. a status id in `status_apply`), the resolver looks up the entity's display name and — if a narrative record exists with the same id — wraps the result in a lore link automatically. So `Apply [v] for [status_duration] turns` produces a clickable record link when the applied status has one, and plain text otherwise. No need to wrap `[v]` in `[[ ... ]]` manually; the engine handles it per-id.

**`[v:status]` mode.** When an aspect's value is *always* a status id (or array of status ids) and you want the rich status popup — name, description, live stats, granted abilities — write `[v:status]` instead of `[v]`:

```
"ingame_description": "Apply [status_stacks] [v:status] [status_duration]"
```

This emits a clickable element per id; hovering opens a popup rendered from the status definition itself, not from a record. No record authoring required. Pick between modes per aspect:

| Use | When |
|---|---|
| `[v]` | opportunistic record link — value points at any fromFile entity that *might* have a record |
| `[v:status]` | value is always a status id; show the status popup with live stats and abilities |
| `[v:id]` | raw id text, no lookup or link |

Sibling form `[X:status]` works the same — pulls value from sibling aspect `X` and renders status links.

```js
// Grouped by effect (default)
const effects = game.buildAbilityEffectsDescription("fireball");
// [
//   { name: "Fire Strike", lines: ["Deal 50 fire damage"] },
//   { name: "Burn", lines: ["30% chance", "Deal 10 fire damage", "Apply Burning"] }
// ]

// Flat list (names dropped)
const flat = game.buildAbilityEffectsDescription("fireball", undefined, true);
// ["Deal 50 fire damage", "30% chance", "Deal 10 fire damage", "Apply Burning"]

// With character modifiers applied
const merged = game.buildAbilityEffectsDescription("fireball", "player_1");
// Uses merged ability data (base + all modifier buffs)

// Meta descriptions (range, charges, requirements)
const meta = game.buildAbilityMetaDescription("fireball");
// ["Range: <b>3</b>", "Charges: <b>2</b>"]
```

---

## Custom Aspect Renderers

By default, an `ingame_description` template renders the aspect's value as plain bold text (`<b>20</b>`). For values that scale at runtime — damage that grows with caster power, status stacks computed from a stat, etc. — register a custom renderer to surface the derivation in the tooltip.

```js
game.registerAspectRenderer(aspectId, ({ value, aspects, character }) => htmlString);
```

The renderer receives:
- `value` — the aspect's literal authored value
- `aspects` — sibling aspects in the same effect (read `damage_type`, `status_apply`, etc.)
- `character` — present when the tooltip is built with a `characterId` prop (e.g. on an equipped ability card); `undefined` in template-preview contexts
- `ability` — the merged ability data (`{ meta, effects }`); useful to branch on `ability.meta.costs`, `ability.meta.cooldown`, etc.

The return value (HTML string) replaces the default `<b>value</b>` for both the aspect's own `[v]` token **and** any sibling `[id]` reference to it from other aspects' templates.

**Example — show "% of power" with optional scaled value:**

```js
game.registerAspectRenderer('damage', ({ value, character }) => {
  let txt = `<b>${value}% of power</b>`;
  if (character) {
    const scaled = Math.round(character.getStat('power') * value / 100);
    txt += ` <b>(${scaled})</b>`;
  }
  return txt;
});
```

Result:
- No character context: "Deal **100% of power** fire damage"
- With character (power 200): "Deal **100% of power (200)** fire damage"

Remember to drop redundant prose from the `ingame_description` template once a renderer takes over its `[v]` slot. If the template still reads `"Deal [v]% [damage_type] damage"`, the renderer's `% of power` suffix will collide with the literal `%`. Trim to `"Deal [v] [damage_type] damage"`.

---

## Greying Out Unusable Abilities

The engine doesn't know your battle rules, so it can't tell on its own whether a character may use an ability right now (on cooldown, can't afford the cost, gated, …). Instead, a gameplay system (e.g. a battle plugin) **registers a usability checker**, and the engine's ability card greys out abilities the checker reports as unusable — handy for inspecting another character mid-battle to see what they can do.

```js
game.registerAbilityUsabilityChecker((characterId, abilityId) => boolean);
```

- The function returns **`true` = usable / `false` = blocks**.
- **Multiple systems** may register; an ability is usable only if **every** checker passes (`game.isAbilityUsable(characterId, abilityId)` — used by the UI). With no checkers registered, abilities are always usable, so non-battle screens are never greyed.
- The check runs reactively, so the greyed state updates live as cooldowns tick down or resources refill.

`AbilityCard` greys an ability when `isAbilityUsable(characterId, abilityId)` is false — so it only applies when the card is rendered **with a `characterId`** (it needs to know whose ability it is). Cards shown without a character are never greyed.

**Now vs. on-their-turn.** Keep the *authoritative* "can act right now" gate (used to actually allow a cast, and by AI) separate from the checker you register for the UI. The UI checker is for *display* — when inspecting a character whose turn hasn't started, prefer to answer "will they be able to use this **on their turn**" (e.g. account for a cooldown that ticks down at their turn start, ignore transient states), so a 1-turn-from-ready ability isn't misleadingly greyed.

```js
// In a battle plugin:
game.registerAbilityUsabilityChecker(previewAbilityUsable); // forward-looking, lenient display check
```

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Define what fields abilities have | Characters > Ability Definitions |
| Create an ability | Characters > Ability Templates |
| Give a character an ability | Add to **abilities** field in any status |
| Add an ability from code | `character.addAbility(id)` |
| Remove an ability from code | `character.removeAbility(id)` |
| Buff an existing ability | Add to **ability_modifiers** in a status |
| Access ability data in code | `character.getAbility(id)` |
| Register a custom aspect renderer | `game.registerAspectRenderer("damage", fn)` |
| Grey out unusable abilities in the UI | `game.registerAbilityUsabilityChecker(fn)` |
| Check if an ability is usable | `game.isAbilityUsable(characterId, abilityId)` |
| Use a battle system | Enable the Auto Battler plugin or build your own |

