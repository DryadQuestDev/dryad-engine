# Lore & Encyclopedia

The lore system gives you **inline hover tooltips** and a browseable **Encyclopedia** tab from a single source of records. Use it for lore terms ("Kingdom of Luminaria"), tutorial concepts ("Freeze status"), bestiary entries, NPC profiles – anything the player should be able to look up.

One source of truth, two render surfaces:

- Inline `[[link]]` in any text → hover popup with the record's summary, anchored to the link. Supports nested links (popup-in-popup, BG3 / CK3 style).
- The Encyclopedia tab → browseable codex grouped by tabs and groups, showing the long-form `content`.

---

## Key Concepts

### Records

A record is a single lore/tutorial entry. It has:

| Field | Description |
|-------|-------------|
| `id` | Stable id used in `[[id]]` links and from the Encyclopedia trees |
| `title` | Display name shown in tooltips and the Encyclopedia |
| `summary` | Short HTML shown in the inline hover popup |
| `content` | Long HTML shown in the Encyclopedia tab. Falls back to `summary` if empty |
| `image` | Optional illustration shown above `content` in the Encyclopedia |
| `auto_discovery` | If true, unlocked from game start. If false, must be discovered first (see Discovery below) |
| `tags` | Free-form tags for searching/filtering |

Records are authored in the editor under **Narrative > Records**.

`summary` and `content` go through the full text resolution pipeline, so they can contain placeholders, `if{}` conditions, narrative slots, and even nested `[[links]]` to other records.

### Encyclopedia Trees

A tree organizes records into a tab. Each tree has:

| Field | Description |
|-------|-------------|
| `tab` | Badge label shown in the Encyclopedia sidebar |
| `order` | Lower values appear first |
| `groups[]` | Ordered list of groups (a group is a name + ordered list of record references) |

Trees are authored in the editor under **Narrative > Encyclopedia Trees**. A record can appear in zero, one, or multiple trees – the data is reusable.

Records that exist but aren't referenced by any tree work fine inline as tooltips; they just won't show up in the Encyclopedia.

---

## Inline Link Syntax

Drop a reference into any text that goes through the text transformation pipeline (scene narrative, item descriptions, ability descriptions, quest logs, etc.):

### Records

| Syntax | Behavior |
|--------|----------|
| `[[id]]` | Standard record link. If the record is discovered, renders as a clickable hoverable link. If not discovered, renders as plain text (the record's title). Stealth-gates lore reveals. |
| `[[record:id]]` | Explicit form of `[[id]]`. Useful when reading alongside `[[item:...]]` / `[[status:...]]` for consistency. |
| `[[!id]]` | **Discover-on-encounter**. The first time this token is rendered, marks the record as discovered. Useful in scene narrative that introduces a concept ("you learn about [[!the_kingdom]]"). After that, all subsequent `[[the_kingdom]]` references show as links. |
| `[[id>label]]` | Custom display label. Renders the link with `label` instead of the record's title. Lets you say "the kingdom" inline instead of always "Kingdom of Luminaria". |
| `[[!id>label]]` | Combined: discover-on-encounter with a custom label. |

`[[!id]]` discovery only fires for branches that survive `if{}` conditional evaluation – `[[!id]]` inside a discarded branch will not unlock the record.

Ids may contain letters, digits, underscores and hyphens – both `[[my_record]]` and `[[my-record]]` resolve. A token whose id matches no record logs an error and falls back to rendering the label.

### Items and Statuses

The same `[[...]]` syntax also drives popovers for **items** and **character statuses**, using a kind prefix:

| Syntax | Behavior |
|--------|----------|
| `[[item:id]]` | Renders a link to an item template. Hovering opens the ItemCard popover (name, description, rarity color, stat block, price). The link text is tinted with the item's rarity color (common = grey, epic = purple, etc.). |
| `[[status:id]]` | Renders a link to a character status. Hovering opens the StatusCard popover (name, description, stats granted, abilities granted). |
| `[[item:id>label]]` | Custom label form, same as records. |
| `[[status:id>label]]` | Custom label form, same as records. |

Items and statuses are **always shown as clickable** – there's no discovery gate (the `!` prefix is silently ignored for these kinds). Unknown ids log an error and render as the label / raw id.

**Example:**

```
Riko lays three pieces on the counter: [[item:sword]], [[item:book]], and [[item:shield]]. Interested?

---

## Discovery

A record is "discovered" if any of these is true:

1. Its `auto_discovery` field is `true`.
2. A `[[!id]]` link in some rendered text marked it discovered.
3. A `{lore: id}` action ran (see below).

Discovered records render their inline links and appear with full content in the Encyclopedia. Undiscovered records:

- Inline: render as plain text (the record's title).
- Encyclopedia: appear as `???` in the sidebar; the entry body is locked.

Discovery state is persisted in saves (Set of discovered ids).

### `lore` action

Fires inside any event/scene action JSON. Accepts a single id or a comma-separated list:

```
{lore: "kingdom_of_luminaria"}
{lore: "kingdom_of_luminaria, riko_diary, freeze_status"}
```

Use this when you want discovery without relying on `[[!id]]` rendering – for example, on entering a room, completing a quest, or looting an item.

---

## Authoring Workflow

### Step 1: Create records

Go to **Narrative > Records**, click new, fill in:

- `id`: e.g. `kingdom_of_luminaria`
- `title`: e.g. `Kingdom of Luminaria`
- `summary`: 1–2 sentence description shown in tooltip popups.
- `content`: Long-form description for the Encyclopedia (or leave empty to reuse `summary`).
- `auto_discovery`: leave on for tutorial entries that should be visible from the start; turn off for lore that's revealed progressively.

### Step 2: Reference records inline

In any text content, write `[[id]]` (or `[[id>label]]`):

```
The road leads west toward [[kingdom_of_luminaria]], past the [[!ironwood_forest]].
```

When the player reads this scene, `kingdom_of_luminaria` shows as a hoverable link if discovered, and `ironwood_forest` is automatically discovered on first read.

### Step 3: Build the Encyclopedia

Go to **Narrative > Encyclopedia Trees**, create one tree per top-level tab in the Encyclopedia UI. For each tree:

- Set `tab` (the visible badge label), e.g. "Bestiary", "Lore", "Tutorial"
- Set `order` (lower = appears first)
- Add `groups`, each with a `name` and an ordered list of records

Records can appear in multiple trees. Order within a group is preserved (use `schema[]` with reorder controls in the editor).

---

## Rendering DryadScript text in custom components

If you build your own Vue component (a plugin, a custom progression panel, etc.) that displays text containing `[[lore-links]]`, placeholders, or any other DryadScript syntax, use the **`v-script`** directive instead of `v-html`. It runs the text through the engine's resolver and attaches the hover/click event delegation that opens lore popups; with plain `v-html` the styled link would render but it wouldn't react to hover or click.

```js
const { vue } = window.engine;
const { defineComponent } = vue;

const MyPanel = defineComponent({
    props: ['choice'],
    template: /*html*/ `
        <div v-if="choice?.description" v-script="choice.description" class="my-description"></div>
    `
});
```

See ->advanced.custom_vue for `v-script`'s full options (object form with `resolver`, `navMode`, `onNavigate`, `disabled`).

---

## Scripting API

```js
// Get a record's data
const record = game.getRecord('kingdom_of_luminaria');

// Mark a record discovered (persists in save)
game.discoverRecord('kingdom_of_luminaria');

// Check discovery
if (game.isRecordDiscovered('kingdom_of_luminaria')) { ... }

// Get all encyclopedia trees, sorted by order
const trees = game.getEncyclopediaTrees();
```

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Define a lore/tutorial entry | Narrative > Records – set id, title, summary, content |
| Group entries into Encyclopedia tabs | Narrative > Encyclopedia Trees – set tab, order, groups |
| Show a record tooltip in scene text | Write `[[id]]` |
| Show an item card on hover | Write `[[item:id]]` (rarity-colored automatically) |
| Show a status card on hover | Write `[[status:id]]` |
| Show a tooltip with custom label | Write `[[id>the kingdom]]` (works with `item:` / `status:` too) |
| Discover a record on first scene read | Write `[[!id]]` (records only) |
| Discover a record from an action | Use `{lore: "id"}` |
| Check discovery in a script | `game.isRecordDiscovered(id)` |
| Auto-unlock from game start | Set `auto_discovery: true` on the record |
