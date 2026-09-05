# Glossary

### DryadScript Markup: How Dungeons Are Written

Dungeon content uses a lightweight markup called **DryadScript**.  
You'll usually write it in the **->dungeons.visual_editor** (recommended); you can also author in **->dungeons.google_docs_integration** for collaboration.

At a high level, you use special markers to tell the engine what each piece of text is:

- `^room_id` – start content for a **room**.
- `@description` – the **description encounter** for that room.
- `@some_encounter` – a specific **encounter** in that room.
- `#` – **events** that can be triggered manually or automatically when conditions are met.
- `character_id:` – prefix dialogue with a character ID to set the **speaker**.

There are three kinds of **choice**, and they differ in where they attach:

| Marker | Name | Attaches to |
|---|---|---|
| `!` | **Choice** | an encounter – the buttons shown when you look at it |
| `~` | **Branch choice** | the *next row* of a scene – picking one steps into that branch's prose |
| `>` | **Inline choice** | the paragraph directly above it |

All three take the same params: `if` / `ifOr` to hide a choice, `active` / `activeOr` to grey it out, `clue` to highlight it until the player takes it, and any action. Mark a choice `{clue: true}` and it stands out as an unfollowed hint – and in map dungeons the encounter holding it glows too, until you've picked it. See ->builtins.actions.

The engine parses this text into structured data and uses it to drive:

- What the player sees when they enter a room.  
- Which encounters are visible or clickable.  
- Which choices appear and where they lead.  
- When events fire and how they change the game state.

You can build surprisingly rich dungeons just by writing text and using these markers.

---

### Comments: Notes the Engine Ignores

A line starting with `//` is a comment. It must begin at the very start of the line, and it comments out the whole line – the engine drops it before parsing, so you can park an action or a reminder without it running.

```
// TODO: add the footsteps sound here
// {sound: "footsteps"}
riko: This line is shown to the player.
```

A `//` anywhere else on the line is ordinary text – `riko: Meet me at 10 // sharp` prints the `// sharp` to the player. Keep `//` flush against the left edge, since indenting it turns the line back into prose.

---

### Flags: Dungeon Memory

**Flags** are small numeric values the dungeon uses to remember what has happened:

- Whether a room was visited, a choice was picked, a chest was opened, a scene was seen, etc.  
- They live in the dungeon’s data and are saved/loaded with the game.

Key ideas:

- Flags are referenced by **ID**, like `door_opened` or `tutorial.completed_intro`.  
- You can scope a flag to another dungeon using `dungeon_id.flag_id` (for example, `tutorial.seen_intro`).  
- Flags can be **set** or **modified** via the `flag` action, e.g.:
  - `door_opened=1` – set a value.  
  - `coins>5` – add 5 coins.  
  - `coins<2` – subtract 2 coins.

You usually:

- **Change flags** in actions blocks (for example when a choice is picked).  
- **Read flags** in conditions (for branching) or via the `flag` placeholder (see below) to show values in text.

---

### Anchors: Named Jump Points in Content

**Anchors** let you mark important spots in your dungeon content and jump to them later.

- Conceptually, an anchor is a **named scene target** inside a dungeon.  
- You can reference an anchor in **scene‑type actions** using the `&` prefix:
  - `&my_anchor` – jump to an anchor in the **current dungeon**.  
  - `&other_dungeon.my_anchor` – jump to an anchor in another dungeon.

The engine’s dungeon system resolves these via its scene resolver, so you can:

- Keep your document readable (anchors have human‑friendly names).  
- Reuse the same content from multiple rooms, encounters, or even other dungeons.

---

### Actions: Things That Happen

**Actions** are commands executed when a scene, event, or choice runs.  
They live inside curly‑brace blocks in your content (usually coming from Google Docs), for example:

- `{flag: "door_opened=1"}`  
- `{enter: "tutorial.entrance"}`  
- `{scene: "&intro_scene"}`  
- `{asset: "bg_room"}`  
- `{quest: "my_cool_quest.main.first_stage"}`  

Broad groups of actions (see the Actions Reference for full lists):

- **Flow & navigation** – `scene`, `enter`, `exit`, `redirect`, `choices`, `choices_over`.
- **State & progression** – `flag`, `state`, `quest`.
- **Visuals & audio** – `music`, `sound`, `asset`, `actor`.
- **UI & systems** – `popup`, `notification`, `loot`, `trade`, `learn_recipe`, etc.

You can also define **custom actions** in JavaScript via `game.registerAction(...)` (see the Tutorial’s `script1.mjs` for examples) and then call them from your content the same way you call built‑in ones.

Example – custom `genderbend` action (from the Tutorial game):

```js
// In your script file, e.g. /assets/games_assets/[game]/_core/scripts/script1.mjs
game.registerAction("genderbend", () => {
  const mc = game.getCharacter("mc");         // get main character
  const sex = mc.getAttribute("sex");         // read current sex attribute

  if (sex === "male") {
    mc.setAttribute("sex", "female");
  } else {
    mc.setAttribute("sex", "male");
  }
});
```

Then in your dungeon content you can call it like any other action:

```text
riko: Want to try something different?
{ genderbend: true }
```

---

### Inline Choices: Buttons On a Paragraph

An **inline choice** is a line starting with `>`. It hangs off the paragraph directly above it, and replaces the normal "click to continue":

```text
#troglodyte
1
%
The troglodytes are guarding their territory, nothing more. They won't give chase.
Or you could give them a fight and be done with it.
>Fight{scene: "&fight_troglodyte"}
>Run{enter: "10b"}
```

The text after `>` is the button label. It supports the same `|placeholders|` and `**bold**` / `*italic*` styling as body prose. Everything in `{…}` is the same params object a `~` branch choice takes – any registered action, plus `if` / `ifOr` / `active` / `activeOr`.

**They can sit anywhere in a block, not just at the end.** A choice on a middle paragraph interrupts the read; the rest of the block continues after it:

```text
%
The apple hangs low enough to reach.
>Take it{add_item: "apple", scene: "next"}
>Leave it be{scene: "next"}

The path winds on past the orchard.
```

**Navigation is always explicit.** A choice carrying no flow action (`scene`, `enter`, `exit`, …) fires its actions and **stays on the paragraph** – the menu is still there, and the choice can be picked again. To move on, say so: `{scene: "next"}` advances to the next paragraph (or the next row at a block's end). Put it after the other actions, so they land before the story moves. Staying put is useful too – a choice that opens a popup or tweaks state without ending the moment.

**At a block boundary they share the menu with `~` branches.** If an inline choice sits on the *last* paragraph of a block and the next row has `~` branches, the player sees both in one list.

`if` hides a choice; `active` greys it out but leaves it visible:

```text
>Pick the lock{active: "_item_on(riko, lockpick) = true", scene: "&lock_opened"}
>Smash the door{if: "_char(riko.stat.strength) > 5", scene: "&door_smashed"}
```

Inline choices only work inside scenes (`#`). Encounters use `!` instead.

---

### Hidden Encounters: `discover`

Give an `@` encounter a `discover` threshold and it stays invisible until somebody in the party is sharp enough to spot it:

```text
@bats{discover: "perception#6", if: "_defeated(bats) = false"}
!listen
!attack{battle: "bats"}
Something shifts in the dark above you.
```

The syntax is `statId#number` – "this stat, at least this high". It's checked against **every party member**, so the sharpest eyes in the group find it. Use a comma for several stats (`"perception#6, wits#4"`); each one has to be met by *someone*.

**Discovery is permanent.** The first time the party clears the threshold, the engine writes the encounter into the save. Drop the stat afterwards – swap out the gear, bench the character, lose the buff – and the encounter stays found. That's the whole point: you can't un-notice a thing.

**`if` keeps working alongside it.** `discover` decides whether you've *found* the encounter; `if` decides whether it's *there right now*, and it keeps evaluating. In the example the bats are revealed forever once you're perceptive enough, yet still vanish once you've killed them.

The check runs when you **enter a room** and when you **leave a scene** – the two moments a stat can have changed. A buff gained while standing in a room won't reveal anything until you step out and back in. A script that moves a stat in place can force the check itself with `game.scanDiscoverableEncounters()`; the turn_system plugin already does this on every turn, so waiting a buff out (or into existence) uncovers what it should.

The engine renders a cue on the encounter when it was found this way:

```text
Perception[6] check success
```

Listen for the moment of discovery with the ->builtins.game_emitters `encounter_discovered` emitter.

> Cues render in text dungeons. In map dungeons the encounter simply appears on the map.

---

### Collectables: Items You Pick Up From the Map

A **collectable** is an encounter the player clicks to gain an item – a patch of herbs, a dropped coin, a mushroom ring. Author it entirely in the **Encounters tab**: set the encounter's type to `collectable`, pick the item, and place it. It needs **no entry in the content document** – the engine synthesizes a **Collect** choice and a description from the item's name and description.

Fields on a `collectable` encounter:

| Field | Meaning |
|---|---|
| `collect_item` | The item granted |
| `collect_pool` | Gather table name (e.g. `gather`) – the item is drawn at dungeon creation instead of authored. Overrides `collect_item` |
| `collect_quantity` | How many one Collect grants (default 1) |
| `regrow` | Turns until it comes back after collecting. Empty/0 = one-time |
| `collect_clue` | Glow on the map until collected |

Clicking **Collect** adds the item(s) to the party inventory (with the usual "added" flash) and the encounter fades out. One-time collectables stay gone – the engine remembers, no flags needed. With `regrow`, the node returns after that many map turns (**requires the turn_system plugin** or another time plugin that calls `game.tickCollectables`).

**The content document is optional here.** Write an `@` line with the collectable's id to replace the auto-description with your own prose, or to gate it – `if:` and `discover:` compose with the collected state:

```text
@berry_bush{discover: "perception#6"}
A tangle of dark leaves – and under them, heavy clusters of fruit.
```

Inside a collectable's `@` line, `|title|` and `|description|` substitute the granted item's name (in its rarity color) and description – the way to keep prose valid on `collect_pool` spots, whose item differs per save:

```text
@herb_patch
|title|. |description| It grows in the shade of the north wall.
```

You can also write your own choice with a custom label instead of the synthesized Collect – give any `!` choice a `{collect: "item_id#qty"}` param.

Running **Synchronize Content Document** never flags a collectable as redundant – unlike regular encounters, they legitimately live outside the content document.

Listen for pickups with the ->builtins.game_emitters `encounter_collected` emitter. Scripts can also call `game.uncollectEncounter(id)` / `game.isEncounterCollected(id)`.

---

### Placeholders: Live Values Inside Text

**Placeholders** let you inject dynamic values into text, using the syntax:

- `|placeholderName(arg1, arg2)|`

Examples:

- `|flag(coins)|` – show the current value of a dungeon flag called `coins`.  
- `|item|` – show the display name of an active item.  
- `|mc|` – show the main character’s name (as implemented in the Tutorial script).

Under the hood:

- The engine provides some built‑in placeholders (like `flag` and `item`).  
- You can register your own via `game.registerPlaceholder("name", (args...) => value)`.

Example – custom `mc` placeholder (from the Tutorial game):

```js
// Shows the main character's current name when you use |mc| in text
game.registerPlaceholder("mc", () => {
  const mc = game.getCharacter("mc");
  return mc.getTrait("name") || "";
});
```

Usage in dungeon content:

```text
mc: My name is |mc|.
```

Placeholders are great for:

- Referring to **flag values** in narration (for example, “You have |flag(coins)| coins left.”).  
- Showing character names, item names, and other data that can change during play.

---

### Text Styling: Emphasis and State Markers

Prose supports standard markdown emphasis plus two **state markers** for things that change during play:

| Syntax | Renders as | Use for |
|--------|-----------|---------|
| `*text*` | italic | emphasis |
| `**text**` | bold | strong emphasis |
| `+text+` | `<span class="initial">` – purple bold | how a thing looks **before** the world changes |
| `++text++` | `<span class="altered">` – orange bold | how it looks **after** |

```text
+The great machine sits silent, cold to the touch.+
if{machine_on}++The great machine roars, pistons hammering.++fi
```

- Override the default colors by restyling `.initial` / `.altered` in your game CSS.
- A stray `+` in prose stays literal: `Here's +43 health`, `gain +2 str and +4 agi`, and `C++` are never styled. The marked text must start with a letter and hug its `+` signs.

---

### If: Conditional Actions and Inline Text

The **`if`** keyword comes in two closely related flavors:

1. As an **action**, attached to a choice, encounter, or event.  
2. As an **inline text block**, which can also include `else` branches.

Both use the **same condition syntax**.

#### 1) `if` as an action on choices / encounters / events

You can attach `if` directly to a choice, encounter, or event via its action block.  
If the condition is **false**, that block simply **won’t run** (for example, the choice won’t appear).

Example – a clickable encounter that only appears when a button is working:

```text
!click{if: "button_working = 1"}
Press the button.
```

Here:

- `if: "button_working = 1"` uses the same comparison syntax as other conditions.  
- When the player has `button_working = 1`, the `!click` choice is available.  
- Otherwise, the engine skips this choice entirely.

#### 2) `if` / `else` / `fi` inside dungeon text

Inside normal dungeon text you can use **inline if‑blocks** to show different lines based on conditions.  
Unlike the action form, **inline if‑blocks support `else` and `else if`**, using this pattern:

- `if{condition}` – start a conditional block.  
- `else{condition}` – optional “else if” branch (the condition is optional).  
- `else{}` – final “else” branch (no condition).  
- `fi{}` – closes the whole block.

Example – describing a button differently based on how many times it was pressed:

```text
You see a button. It is
if{button_pressed < 2}
working
else{button_pressed < 3}
almost broken
else{}
broken
fi{}
```

In words:

- If `button_pressed < 2`, the player sees “working”.  
- Else, if `button_pressed < 3`, they see “almost broken”.  
- Otherwise they see “broken”.

This lets you keep your narrative **branchy and reactive** directly in the text, without splitting everything into separate events.

---

### Rooms: Sharing Encounters and Events Across Rooms

Normally a `@encounter` or `#event` belongs to the single room its ID starts with (`^room_id`). The **`rooms`** param makes it **also** available in other rooms, without copying its content.

- For an `@encounter`, it becomes **clickable** in the listed rooms too.
- For a `#event`, it can **trigger** in the listed rooms too.

The value is a comma‑separated list of room IDs. It is **additive** – the encounter or event still works in its own room, plus every room you list.

Example – a wagon parked between two rooms, clickable from both:

```text
@wagon{rooms: "11"}
A wagon stands abandoned near the bridge.
```

Here `@wagon` lives in its own room (say `^10`) but is also clickable while the player is in room `11`.

You can combine `rooms` with `if` to gate the shared availability:

```text
@squeeze{rooms: "f1_8", if: "push = 1"}
A narrow gap you can squeeze through.
```

The same works for events:

```text
#warning{rooms: "3, 4, 6", if: true}
A distant horn echoes through the corridors.
```

This event, defined in its own room, can also fire when the player enters rooms `3`, `4`, or `6`.

---

### Conditions: Branching and Checks

**Conditions** works the same way as flags but provide custom logic to decide whether a block of content should run or a choice should be available.

They are used inside if statements and compare a **left‑hand side** to a **right‑hand side**, for example:

- `_room_visited(tutorial.entrance) = true`  
- `_selected_character = alice`  
- `_item_on(alice, sword) = true`  
- `_char(alice.attribute.sex) = female`

Concepts:

- Condition names starting with `_` (underscore) refer to **condition functions**, registered in code via `game.registerCondition(...)`.  
- The engine comes with several built‑ins for dungeons, like:
  - `_room_visited(dungeonId.roomId)` – has the room ever been visited?  
  - `_scene` – is there an active scene right now?  
  - `_selected_character` – ID of the currently selected character.  
  - `_item_on(characterId, itemId)` – whether a character has an item equipped.  
  - `_char(charId.type.key)` – access character traits, attributes, stats, resources, or skin styles.
- You can define your own conditions (for example `_female(mc) = true`) in scripts and use them directly in dungeon text.

Example – custom `_female` condition (from the Tutorial game):

```js
// Returns true if the given character is female
game.registerCondition("_female", (charId) => {
  const char = game.getCharacter(charId);
  return char.getAttribute("sex") === "female";
});
```

Usage in dungeon content (for example, inside an inline `if{}` block or an `if` action):

```text
if{_female(mc) = true}
She smiles in a way that only makes sense if MC is female.
fi{}
```

Conditions are what make your dungeons **reactive** – they look at inventory, party, or any custom logic and decide what the player can see or do.

---

### Templates: Reusable Text Blocks

**Templates** are dungeon lines whose ID starts with `$`. They let you store reusable text snippets and compose them into larger narratives.

- Reference a template in text with `|$template_id|`.
- The engine resolves the template's content through the full text pipeline (placeholders, conditions, nested templates, etc.).
- Cross-dungeon: `|$other_dungeon.template_id|` fetches from a different dungeon.

#### Variants (`~N`)

Any template can have numbered variants using the `~` suffix:

```text
$greeting
Hello there!

$greeting~2
Hey, what's up?

$greeting~3
Greetings, traveler.
```

When the engine resolves `|$greeting|`, it automatically detects all variants (`$greeting`, `$greeting~2`, `$greeting~3`) and **randomly picks one**. No special syntax needed from the caller – just write `|$greeting|` and the engine handles the rest.

A template (and each of its variants) accepts `if` / `ifOr` params. Variants whose condition fails are skipped before the random pick; when none pass, the reference renders as an empty string. Chain complementary templates to swap a description by state:

```
$guard_awake{if: "guard_drugged = 0"}
The **guard** paces the gate.

$guard_asleep{if: "guard_drugged = 1"}
The **guard** snores against the gatepost.

@guard
!talk<Talk>
|$guard_awake||$guard_asleep|
```

This is useful for adding variety to repeated text (encounter descriptions, NPC reactions, flavor text) without any scripting.

#### Composition

Templates can reference other templates, creating a composition tree:

```text
$battle_scene
|$battle_intro| |$battle_body|

$battle_intro
The enemy charges forward.

$battle_body
if{_has_allies = true}Your allies stand beside you.else{}You face them alone.fi{}
```

---

### Talking Characters: Speaker Attribution

When writing dialogue, you can prefix a line with a **character ID** followed by a colon to indicate who is speaking:

```text
riko: Hey there! I'm Riko. Welcome to this tutorial!

mc: Nice to meet you.
```

The engine automatically:

1. Extracts the character ID (e.g., `riko` or `mc`) from the prefix.
2. Sets the current speaker, so the UI can display their name, portrait, and dialogue box styling.
3. Returns just the dialogue text (everything after the colon) for display.

**Important:** The character ID must match a **live character instance** – meaning the character must be defined in the editor and exist in the game's character system. If the ID doesn't match any registered character, the engine won't know which portrait or name to display.

To create and configure characters, see ->characters.characters_overview.

To see a list of all registered characters during development, use ->advanced.debugging – the debug panel shows which characters are currently loaded.