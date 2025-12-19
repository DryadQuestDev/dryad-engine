### DryadScript Markup: How Dungeons Are Written

Dungeon content uses a lightweight markup called **DryadScript**.  
You’ll usually write it in **Google Docs** or directly in the editor’s `dungeon_content` field.

At a high level, you use special markers to tell the engine what each piece of text is:

- `^room_id` – start content for a **room**.  
- `@description` – the **description encounter** for that room.  
- `@some_encounter` – a specific **encounter** in that room.  
- `!` and `~` – **choices** and branching logic.  
- `#` – **events** that can be triggered manually or automatically when conditions are met.

The engine parses this text into structured data and uses it to drive:

- What the player sees when they enter a room.  
- Which encounters are visible or clickable.  
- Which choices appear and where they lead.  
- When events fire and how they change the game state.

You can build surprisingly rich dungeons just by writing text and using these markers.

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

- **Flow & navigation** – `scene`, `enter`, `exit`, `redirect`, `choices`, `choicesOver`.  
- **State & progression** – `flag`, `state`, `quest`.  
- **Visuals & audio** – `music`, `sound`, `asset`, `actor`.  
- **UI & systems** – `popup`, `notification`, `loot`, `trade`, `learnRecipe`, etc.

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