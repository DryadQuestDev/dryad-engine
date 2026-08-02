# Narrative System

The narrative system generates dynamic text by selecting and composing **segments** based on live game state. Instead of writing branching if/else text blocks, you define reusable text fragments (segments) with conditions, and the engine picks the best match at runtime.

---

## Key Concepts

### Slots

A slot is a named insertion point in the narrative. When the engine encounters `|@slotId|` in any text, it resolves the slot by selecting the best matching segment.

Each slot has:

| Field | Description |
|-------|-------------|
| `id` | Slot ID used in `\|@slotId\|` syntax |
| `description` | What this slot represents |
| `fallback_content` | Default text when no segment matches |

Slots are defined in the editor under **Narrative > Slots**.

### States

States connect the narrative to live game data. Each state has a **type** (boolean, number, range, chooseOne, chooseMany) and a **mode** that controls matching behavior:

| Mode | Behavior |
|------|----------|
| **Gate** | Hard filter — if the segment's gate value doesn't match the runtime state, the segment is eliminated |
| **Identity** | Soft preference — match adds specificity (segment ranks higher), mismatch is ignored |

States are defined in the editor under **Narrative > States**.

### Tags

Tags are categorized value pools used by states. A tag entry groups related values under a category ID.

Example: a `culture` tag with values `["military", "religious", "wild", "noble"]`. An identity state can reference these values — segments tagged with matching culture values rank higher.

Tags are defined in the editor under **Narrative > Tags**.

### Segments

A segment is a text fragment that fills a specific slot. Each segment has:

| Field | Description |
|-------|-------------|
| `type` | Which slot this fills |
| `gates` | Hard conditions — mismatch eliminates |
| `identity` | Soft preferences — match increases priority |
| `weight` | Frequency weight within same priority tier |
| `content` | The narrative content (supports full text pipeline) |

Segments are defined in the editor under **Narrative > Segments**.

---

## How Selection Works

When `|@slotId|` is resolved, the engine runs this pipeline:

1. **Collect** — find all segments assigned to this slot
2. **Filter by gates** — eliminate segments whose gate values don't match runtime state
3. **Score identity** — add specificity for each matching identity value
4. **Top tier** — keep only the highest-specificity segments
5. **Anti-repeat** — exclude the last 2 segments used for this slot
6. **Weighted random** — pick one from remaining candidates using weight values
7. **Resolve content** — process the chosen segment's `content` through the full text pipeline

If no segments match, the slot's `fallback_content` is used.

### Specificity Scoring

Each filled state adds its `specificity` value (default 1) when matched:

- **Gate match**: +specificity
- **Gate mismatch**: segment eliminated
- **Identity match**: +specificity
- **Identity mismatch**: ignored (no penalty)

For `chooseMany` identity states, each overlapping value adds specificity independently. A segment matching 3 out of 5 culture tags gets 3x the specificity bonus.

Segments with more matching conditions rank higher than generic ones, ensuring the most contextually appropriate text wins.

---

## State Types

| Type | Gate behavior | Identity behavior |
|------|--------------|-------------------|
| `boolean` | Must match exactly | Match adds specificity |
| `number` | Must match exactly | Match adds specificity |
| `range` | Value must be within min/max | Value within bounds adds specificity |
| `chooseOne` | Must match exactly | Match adds specificity |
| `chooseMany` | Must include ALL values | Each overlapping value adds specificity |

---

## Text Syntax

Segment content supports the full text resolution pipeline:

| Syntax | Description | Example |
|--------|-------------|---------|
| `\|placeholder\|` | Dynamic value substitution | `\|faction\| warriors approach` |
| `\|placeholder(args)\|` | Placeholder with arguments | `\|sire(1)\| leads the group` |
| `if{condition}text.else{}text.fi` | Conditional text | `if{has_leader}The leader speaks.fi` |
| `\|@slotId\|` | Nested slot (recursive) | `\|@approach\| \|@main\|` |
| `\|@slotId(args)\|` | Nested slot with arguments | `\|@action(1)\|` — passes `1` to the segment |
| `\|$templateId\|` | Template reference | `\|$greeting\|` |
| `*text*` | Italic | `*whispered*` |
| `**text**` | Bold | `**important**` |
| `+text+` | Initial state (`.initial` span) | `+The machine sleeps.+` |
| `++text++` | Altered state (`.altered` span) | `++The machine roars.++` |

Slots can nest other slots, enabling hierarchical narrative composition:

```
Root slot fallback: |@header| |@approach| |@main| |@after|
```

Each sub-slot independently selects the best segment based on current state.

### Slot Arguments

Slots accept arguments via `|@slotId(arg1, arg2)|`. Inside the selected segment, `$1`, `$2`, etc. are replaced with the corresponding argument values before the content is resolved.

```
// Parent segment calls a sub-slot with character index:
|name(1)| approaches you. |@talk(1)| Then, |name(2)| joins in. |@talk(2)|

// Sub-slot `talk` segment content uses $1 as the character reference:
|name($1)| talks about this and that
```

When `|@action(1)|` resolves, `$1` in the chosen segment becomes `1`, so `|name($1)|` → `|name(1)|` or becomes `2`, so `|name($1)|` → `|name(2)|`, depending on the passed parameter.

Arguments are substituted before string resolution, so `$N` works inside any placeholder, template or if condition syntax.

---

## Scripting API

### Registering States

Game scripts must register evaluator functions that provide runtime values for each state.

```js
// Boolean state — does the troop have a leader?
game.registerNarrativeState("has_leader", () => leaderId != null);

// Number state — exact match
game.registerNarrativeState("faction_tier", () => currentFaction.tier);

// Range state — checked against segment's min/max
game.registerNarrativeState("troop_size", () => troopIds.length);

// Array state — provides available tags for chooseMany matching
game.registerNarrativeState("faction_culture", () => {
    const faction = factionsData.get(currentFactionId);
    return faction?.culture_tags || [];
});
```

### Triggering Narrative Resolution

Use `game.resolveString()` with the `|@slotId|` syntax:

```js
// Resolve a single slot
const text = game.resolveString("|@root_scene|").output;

// Slots work inside any resolved string
const message = game.resolveString("The |faction| warriors: |@approach|").output;
```

### Registering Placeholders

Placeholders provide dynamic values for text substitution inside segment content:

```js
game.registerPlaceholder("faction", () => currentFaction?.name || "");
game.registerPlaceholder("leader", () => getCharacter(leaderId)?.getName() || "");
game.registerPlaceholder("count", () => String(troopIds.length));

// With arguments
game.registerPlaceholder("sire", (index) => getSire(index)?.getName() || "");
// Usage in segment: |sire(1)| and |sire(2)|
```

---

## Example: Faction-Aware Narrative

### Setup

**Tags** (Narrative > Tags):

| id | values |
|----|--------|
| `culture` | `military`, `religious`, `wild`, `noble`, `scavenger` |

**States** (Narrative > States):

| id | mode | type |
|----|------|------|
| `has_leader` | gate | boolean |
| `troop_size` | gate | range |
| `faction_culture` | identity | chooseMany (from `culture` tag) |

**Slots** (Narrative > Slots):

| id | fallback_content |
|----|-----------------|
| `approach` | The creatures draw near. |

### Segments

**Generic approach** (no gates, no identity):
```
content: "The |faction| troop approaches cautiously."
specificity: 0
```

**Military approach with leader** (gate: has_leader=true, identity: faction_culture=["military"]):
```
content: "The |leader| barks an order. The soldiers of the |faction| form ranks and march forward."
specificity: 2 (gate match + identity match)
```

**Wild approach, large troop** (gate: troop_size min=4, identity: faction_culture=["wild"]):
```
content: "A pack of |count| creatures bursts from the treeline, snarling and snapping."
specificity: 2 (gate match + identity match)
```

### Script

```js
const factionsData = game.getData("plugins_data/my_plugin/factions", true);

// Register state evaluators
game.registerNarrativeState("has_leader", () => ctx?.leaderId != null);
game.registerNarrativeState("troop_size", () => ctx?.sireIds?.length ?? 0);
game.registerNarrativeState("faction_culture", () => {
    const faction = factionsData.get(ctx?.factionId);
    return faction?.culture_tags || [];
});

// Register text placeholders
game.registerPlaceholder("faction", () => ctx?.factionName || "");
game.registerPlaceholder("leader", () => getChar(ctx?.leaderId)?.getName() || "");
game.registerPlaceholder("count", () => String(ctx?.sireIds?.length ?? 0));

// Resolve — engine picks the best segment automatically
const result = game.resolveString("|@approach|").output;
```

When a military faction with a leader resolves `|@approach|`, the military+leader segment wins (specificity 2 > 0). For a wild faction with 5 creatures, the wild+large segment wins instead. A faction with no matching segments falls back to the generic approach.

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Define insertion points | Narrative > Slots — create slots with fallback content |
| Define matching conditions | Narrative > States — create states with gate or identity mode |
| Define value categories | Narrative > Tags — create tag groups |
| Write narrative fragments | Narrative > Segments — assign to slot, set gates/identity, write content |
| Connect to game state | `game.registerNarrativeState(id, evaluator)` in scripts |
| Provide text values | `game.registerPlaceholder(id, func)` in scripts |
| Trigger resolution | `game.resolveString("\|@slotId\|")` |
| Nest slots in content | Use `\|@otherSlot\|` inside segment content |
| Pass context to sub-slots | Use `\|@slot(arg)\|` — segment uses `$1`, `$2` for arguments |
