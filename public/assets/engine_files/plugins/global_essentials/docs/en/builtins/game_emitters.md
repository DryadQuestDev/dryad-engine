# Game Emitters Reference

All built-in game emitters you can listen to using `game.on()`.

---

## Lifecycle Events

### game_initiated

Triggered when the game finishes initialization (after all data is loaded).

**Use cases:**
- Set up initial game state

```js
game.on("game_initiated", () => {
    game.getProperty('my_property').setCurrentValue(1); 
});
```

### game_save

Triggered when the game is being saved.

**Use cases:**
- Clean up temporary data before saving
- Log save analytics
- Validate save state

```js
game.on("game_save", (saveName) => {
  console.log("Saving:", saveName);
});
```

### save_load_before

Triggered with the raw save JSON immediately before deserialization. Listeners may mutate `saveData` in place to migrate old-shape data. Return `false` to abort the load entirely.

**Use cases:**
- Schema migration of saved data when the engine or game has changed in ways the engine doesn't auto-handle (renamed fields, restructured per-character data, etc.)
- Stripping legacy fields from imported saves
- Abort-with-warning on saves from an incompatible version

```js
game.on("save_load_before", (saveData) => {
  if (saveData?.saveMeta?.engineVersion === "0.9.0") {
    // rewrite an old field shape on every character
    for (const id in saveData.characters || {}) {
      const c = saveData.characters[id];
      if (c?.oldField !== undefined) {
        c.newField = c.oldField;
        delete c.oldField;
      }
    }
  }
});
```

### save_migrated

Triggered inside the save-migration pass (`registerSaveMigration`), after every declared section has synced and every `item_migrate` has fired, before equip statuses are re-bound and resource pools put back. Fires only when the pass runs: an old save, or any load in dev mode.

**Use cases:**
- Repair states, stores and flags the generic pass can't express
- Re-stamp per-instance character state after a template resync

```js
game.on("save_migrated", () => {
  const flags = game.getState("story_flags");
  if (flags.chapter >= 3 && !flags.met_smith) flags.met_smith = true;
});
```

### html_mount

Triggered when the game HTML mounts to the DOM. Note: though available for possible edge cases, it's strongly recommended you use slot-based component system instead of relying on this event as most of the html content is rerendered during the game cycle.

**Use cases:**
- Initialize third-party libraries
- Set up global event listeners

```js
game.on("html_mount", () => {
  console.log("Html is ready:");
});
```

---

## State Events

### state_change

Triggered when any state value changes.

**Use cases:**
- React to UI state changes globally
- Log state transitions for debugging
- Trigger side effects based on specific states

```js
game.on("state_change", (id, newVal) => {
  if (id === "game_state") console.log(newVal);
});
```

---

## Dungeon Events

### dungeon_create

Triggered when a dungeon is created (including on save load).

- Interact with data that is not supposed to be serialized(persist between save files)

```js
game.on("dungeon_create", (dungeon) => {
  console.log("Dungeon is ready:");
});
```

### dungeon_enter_before

Triggered before a cross-dungeon entry, before any dungeon state changes. Return `false` to abort the entry. Room-to-room movement inside the current dungeon fires `room_enter_before` instead.

**Parameters:**
- `dungeonId` - The ID of the dungeon being entered
- `roomId` - The ID of the room being entered

```js
game.on("dungeon_enter_before", (dungeonId, roomId) => {
  if (dungeonId === "deep_mine" && !game.getFlag("lantern_lit")) {
    game.showNotification("Too dark to go down.");
    return false;
  }
});
```

### dungeon_enter_after

Triggered when entering a dungeon.

**Use cases:**
- Initialize dungeon-specific flags
- Set up random encounters
- Apply difficulty modifiers
- Play area-specific music
- Show location name popup
- Track exploration progress

```js
game.on("dungeon_enter_after", (dungeonId, roomId) => {
  let visits = game.getFlag(dungeonId + ".visits") || 0;
  game.setFlag(dungeonId + ".visits", visits + 1);
  game.showNotification("Entered " + dungeonId);
});
```

### room_enter_before

Triggered before entering a room. Return `false` to abort entering the room.

**Parameters:**
- `roomId` - The ID of the room being entered
- `dungeonId` - The ID of the dungeon containing the room

**Use cases:**
- Block access to locked rooms
- Check for required items or keys
- Implement level requirements

```js
game.on("room_enter_before", (roomId, dungeonId) => {
  let isLocked = game.getFlag(roomId + "_locked");
  if (isLocked) {
    game.showNotification("This room is locked!");
    return false;
  }
});
```

### room_enter_after

Triggered after entering a room.

**Parameters:**
- `roomId` - The ID of the room that was entered
- `dungeonId` - The ID of the dungeon containing the room

**Use cases:**
- Track visited rooms
- Trigger room-specific events
- Update minimap state

```js
game.on("room_enter_after", (roomId, dungeonId) => {
  game.setFlag("last_room", roomId);
});
```

### encounter_selected

Triggered when an encounter is selected — a click on the map or screen, or the toolbar's next-encounter button. Props never fire it. Return `false` to block the selection. Text dungeons render every encounter at once and never select one, so nothing fires there.

**Parameters:**
- `encounterId` - The ID of the selected encounter (`room.encounter`)
- `dungeonId` - The ID of the dungeon containing it

**Use cases:**
- Act on the selection itself, with no choice to press (a statue that grants a stat, a lever that flips)
- Gate an encounter behind a key item and explain why it will not open
- Play a per-encounter sound

```js
game.on("encounter_selected", (encounterId, dungeonId) => {
  if (encounterId !== "crypt.sealed_door") return;
  if (game.getFlag("has_key")) return;
  game.showNotification("The door will not budge.");
  return false; // the encounter stays unselected
});
```

### encounter_discovered

Triggered when a hidden encounter (`@x{discover: "perception#6"}`) is revealed. Fires once — the first time the party meets the threshold — and never again, since discovery is permanent.

**Parameters:**
- `encounterId` - The ID of the encounter that was revealed (`room.encounter`)
- `dungeonId` - The ID of the dungeon containing it

**Use cases:**
- Play a sting or a "you notice something" flash
- Award experience for spotting it
- Track how many secrets the player has found

```js
game.on("encounter_discovered", (encounterId, dungeonId) => {
  game.playSounds("discovery");
});
```

### encounter_collected

Triggered when a collectable encounter is collected (its item granted, the node hidden). Regrow needs no listener — time plugins call `game.tickCollectables` instead.

**Parameters:**
- `encounterId` - The collected encounter's ID (`room.encounter`)
- `itemSpec` - What was granted, add_item grammar (e.g. `"berry#2"`)
- `dungeonId` - The dungeon containing it

**Use cases:**
- Pickup sounds
- Gathering experience
- Quest progress on specific finds

```js
game.on("encounter_collected", (encounterId, itemSpec, dungeonId) => {
  game.playSounds("pickup");
});
```

### scene_play_before

Triggered before a scene plays.

**Use cases:**
- Set up scene-specific UI state
- Preload assets
- Log scene analytics

```js
game.on("scene_play_before", (sceneId) => {
  console.log("Playing:", sceneId);
});
```

### scene_play_after

Triggered after a scene plays.

**Use cases:**
- Unlock achievements
- Update quest progress

```js
game.on("scene_play_after", (sceneId) => {
  game.setFlag(sceneId + "_seen", true);
});
```

### event_end

Triggered when an event/dialogue ends.

**Use cases:**
- Reset character states after dialogue
- Re-enable UI after cutscenes
- Clean up temporary assets

```js
game.on("event_end", () => {
  // Reset character mood to normal after each event
  let riko = game.getCharacter("riko");
  riko.setAttribute("mood", "normal");
});
```

---

## Character Events

### character_create

Triggered when a character is created.

**Use cases:**
- Initialize starting resources
- Apply character bonuses
- Set up character-specific flags

```js
game.on("character_create", (char) => {
  char.setResource("health", 100);
});
```

### character_resource_change

Triggered when a character's resource changes.

**Use cases:**
- Detect death/knockout conditions
- Show low health warnings
- Trigger status effects

```js
game.on("character_resource_change", (char, stat, old, val) => {
  if (val <= 0) game.showNotification(char.getName() + " fainted!");
});
```

### character_delete

Triggered when a character is deleted.

**Use cases:**
- Clean up character-related data
- Log character removal
- Update party UI

```js
game.on("character_delete", (char) => {
  console.log("Deleted:", char.id);
});
```

### character_join_party

Triggered when a character joins the party.

**Use cases:**
- Show join notification
- Grant party bonuses
- Trigger recruitment quests

```js
game.on("character_join_party", (char) => {
  game.showNotification(char.getName() + " joined!");
});
```

### character_leave_party

Triggered when a character leaves the party.

**Use cases:**
- Show departure notification
- Remove party bonuses
- Unequip character items

```js
game.on("character_leave_party", (char) => {
  game.showNotification(char.getName() + " left");
});
```

### character_render

Triggered when character layers are built for display.

**Use cases:**
- Hide layers based on equipment
- Apply visual effects conditionally
- Filter layers by tags

```js
game.on("character_render", (char) => {
  // Hide certain body layers when character is wearing clothes
  let hasClothes = char.renderedLayers.some(l => l.tags?.includes("clothes"));
  if (hasClothes) {
    char.renderedLayers = char.renderedLayers.filter(l => !l.tags?.includes("nsfw"));
  }
});
```

---

## Render Events

### asset_render

Triggered when an asset is rendered (can modify before display).

**Use cases:**
- Set dynamic skins on spine assets
- Apply conditional visual changes
- Modify asset positioning

```js
game.on("asset_render", (asset) => {
  // Set character skins on spine animations based on character attributes
  if (asset.tags?.includes("riko")) {
    let riko = game.getCharacter("riko");
    let hairStyle = riko.getAttribute("hairstyle");
    asset.skins = ["default", "hair/hair" + hairStyle];
  }
});
```

### asset_resolve

Triggered while an image asset's `layers` stack is built, on every render path — the staged
scene, the gallery, the fullscreen overlay, the editor preview. The listener receives a
throwaway copy, so filtering `layers` never touches the template.

Must be **pure**: it runs inside a computed, so writing reactive state from a listener risks a
render loop, and the copy is never staged or saved.

**Use cases:**
- Pick one of several mutually exclusive plates from a character's attributes
- Withhold an overlay plate until the scene asks for it
- Put css classes on a single plate (a per-layer recolor)
- Ask for `fade` so an overlay plate blooms in rather than landing on one frame

```js
game.on("asset_resolve", (asset) => {
  if (!asset.tags?.includes("composed") || !asset.layers) return;

  const hero = game.getCharacter("riko");
  const skin = hero?.getAttribute("skin") || "pale";

  asset.layers = asset.layers
    // body_pale / body_tan / … are alternatives: keep the matching one
    .filter((file) => {
      const body = file.match(/body_(\w+)\./);
      if (body) return body[1] === skin;
      if (file.includes("fx.")) return !!asset.fx;   // {asset: "id(fx = true)"}
      return true;
    })
    .map((file) => {
      // reuse the doll's own tint classes so the still can't drift from the character
      if (file.includes("hair.")) {
        return { file, classes: hero?.skinLayerStyles?.get("hair_front")?.join(" ") || "" };
      }
      // an overlay with nothing taking its place — safe to crossfade
      if (file.includes("fx.")) return { file, fade: true };
      return file;
    });
});
```

---

## Item Events

### item_create

Triggered when an item is created.

**Use cases:**
- Log item generation
- Apply random modifiers
- Initialize item state

```js
game.on("item_create", (item) => {
  console.log("Created:", item.getName());
});
```

### item_migrate

Triggered for every inventory item the save-migration pass visits, right after its template-owned fields were reset, with a copy of its template. Saved items are deserialized, so `item_create` never fires for them on load.

**Use cases:**
- Put back what an `item_create` listener derived per instance (level scaling, a runtime-added choice)

```js
game.on("item_migrate", (item, template) => {
  if (item.traits.engraved && !item.choices.includes("read_engraving")) item.choices.push("read_engraving");
});
```

### item_drop_render

Triggered to decide whether a **discard affordance renders** for an item — the item card's Drop choice and the experience plugin's reward-panel trash button both ask. Return `false` to hide it.

This is the game's veto for its own protected kinds. The engine's own rules (equipped gear, `quest` rarity, `quest` category) live in `item.isDroppable()`, which each of those UIs checks alongside the emitter — so a game only writes what the engine can't know.

Pure predicate: it runs on every render, so listeners must only return — never show a notification, mutate, or play a scene from here.

**Use cases:**
- Protect key items from being thrown away
- Hide the button on gear a quest still needs

```js
game.on("item_drop_render", (item) => {
  if (item.category === "keys") return false;
});
```

### item_drop_before

Triggered before an item is discarded via the `drop_item` action, after the player confirms in the popup. Return `false` to cancel — the engine just closes the popup silently, so a listener that blocks a drop owns the explanation (a notification, a scene, or nothing).

To simply protect a kind of item, use `item_drop_render` instead — the button never appears, so this never fires. Reach for `item_drop_before` when the drop itself is the event you care about: a condition that only resolves at confirm time, or a side effect on the way out.

```js
game.on("item_drop_before", (item, char) => {
  if (item.hasTag("bound") && !game.getFlag("curse_lifted")) {
    game.execute({ scene: "cursed_item_refuses" });
    return false;
  }
});
```

### item_equip_before

Triggered before equipping. Return `false` to cancel.

**Use cases:**
- Block cursed item removal
- Check class/level requirements
- Validate equipment slots

```js
game.on("item_equip_before", (item, char) => {
  if (item.hasTag("cursed")) {
    game.showNotification("Cursed!");
    return false;
  }
});
```

### item_equip_after

Triggered after equipping.

**Use cases:**
- Show equip notification
- Apply set bonuses
- Update character appearance

```js
game.on("item_equip_after", (item, char) => {
  game.showNotification(char.getName() + " equipped " + item.getName());
});
```

### item_unequip_before

Triggered before unequipping. Return `false` to cancel.

**Use cases:**
- Prevent cursed item removal
- Trigger special scenes before undressing
- Check character-specific restrictions

```js
game.on("item_unequip_before", (item, char) => {
  // Block undressing for specific character unless condition is met
  let isAllowed = game.getProperty("lewds").getCurrentValue();
  if (char.id === "riko" && !isAllowed) {
    game.execute({ scene: "riko_nope_clothes" });
    return false;
  }
});
```

### item_unequip_after

Triggered after unequipping. `item` is the item **as it now exists in the inventory** — the merge-back can replace the equipped instance with a new one (different `uid`), so mutate the item you receive, not a reference captured earlier.

**Use cases:**
- Remove set bonuses
- Update character appearance
- Log equipment changes
- Undo per-equip mutations written onto the item's status object

```js
game.on("item_unequip_after", (item, char) => {
  console.log("Unequipped:", item.id);
});
```

---

## Inventory Events

### inventory_open

Triggered when an inventory is opened.

**Use cases:**
- Play UI sound effects
- Pause game time
- Track inventory usage

```js
game.on("inventory_open", (inv) => {
  game.playSounds("bag_open");
});
```

### inventory_close

Triggered when an inventory is closed.

**Use cases:**
- Play closing sound
- Resume game time
- Auto-sort inventory

```js
game.on("inventory_close", (inv) => {
  game.playSounds("bag_close");
});
```

### inventory_apply

Triggered when the apply/craft button is clicked in an inventory. Return `false` to cancel.

**Use cases:**
- Block crafting if requirements not met
- Play crafting sound effects
- Grant crafting XP
- Show custom crafting feedback

```js
game.on("inventory_apply", (inv) => {
  let mc = game.getCharacter("mc");
  if (mc.getResource("energy") < 10) {
    game.showNotification("Not enough energy to craft!");
    return false;
  }
  mc.addResource("energy", -10);
  game.playSounds("craft_anvil");
});
```

### inventory_transfer

Triggered when items are transferred.

**Use cases:**
- Handle gold transactions
- Track trade history
- Apply transfer fees

```js
game.on("inventory_transfer", (inv, target, item, qty, isTrade) => {
  if (isTrade) {
    game.setFlag("gold", game.getFlag("gold") - item.traits.price * qty);
  }
});
```

### trade_init

Triggered for each item in both inventories when trade opens. Use to modify trade prices.

- `tradePrice.player` - what trader pays when buying from player
- `tradePrice.trader` - what trader charges when selling to player
- Set to empty `{}` to make item untradeable in that direction

**Use cases:**
- Set buy/sell price ratios (e.g., traders buy at 50%)
- Restrict items by merchant type
- Apply reputation-based discounts

```js
// Traders buy items at 50% of base price
game.on("trade_init", (traderInventory, item) => {
  for (const currency in item.price) {
    item.tradePrice.player[currency] = Math.round(item.price[currency] * 0.5);
  }
});

// Mage merchant only trades arcane items
game.on("trade_init", (traderInventory, item) => {
  if (traderInventory.id === "merchant_mage" && !item.hasTag("arcane")) {
    item.tradePrice.player = {};  // Can't sell to this merchant
    item.tradePrice.trader = {};  // Can't buy from this merchant
  }
});
```

---

### inventory_transfer_after

Triggered after items moved between inventories — the post-mutation counterpart of `inventory_transfer`, which fires *before* the move and can veto it.

**Parameters:**
- `inventory` - Source inventory
- `targetInventory` - Destination inventory
- `item` - The live target-side stack (may be a pre-existing stack the transfer merged into, not the instance that left the source)
- `quantity` - How many moved
- `isTrade` - True when the move is part of a trade

**Use cases:**
- Count items bought or sold
- React to loot actually landing in the party bag

```js
game.on("inventory_transfer_after", (inv, target, item, quantity, isTrade) => {
  if (isTrade) console.log("traded " + quantity + " " + item.id);
});
```

### currency_change

Triggered after a trade moved currency in or out of an inventory. Fires once per currency id, and only for genuine currency templates — `deductCurrency` doubles as a generic item remover, and those calls stay silent.

**Parameters:**
- `inventory` - The inventory whose stacks changed
- `currencyId` - Currency template id
- `delta` - Negative when paid, positive when received

**Use cases:**
- Track gold spent at traders
- Economy statistics

```js
game.on("currency_change", (inventory, currencyId, delta) => {
  if (delta < 0) game.progressAccolade("merchants_friend", -delta);
});
```

### inventory_craft

Triggered after a recipe was crafted — inputs consumed, outputs already added.

**Parameters:**
- `inventory` - The crafting inventory
- `recipe` - The recipe that was crafted

**Use cases:**
- Crafting counts and achievements
- Unlock follow-up recipes

```js
game.on("inventory_craft", (inventory, recipe) => {
  console.log("crafted " + recipe.id);
});
```

## Progression Events

### recipe_learned

Triggered when a recipe is learned.

**Use cases:**
- Show unlock notification
- Grant achievements
- Update crafting UI

```js
game.on("recipe_learned", (id) => {
  game.showNotification("Learned recipe: " + id);
});
```

### item_discovered

Triggered once per save when an item is discovered — its recipe learned from the scroll, the book
read to its last page, the painting viewed. Drives the check mark on item cards.

```js
game.on("item_discovered", (itemId) => {
  if (game.getDiscoveredItems().size === 38) game.showNotification("Collection complete!");
});
```

### key_used

Triggered when a key item was auto-used on a locked room or inventory. `targetId` is
`"dungeonId.roomId"` for rooms, the inventory id for chests. Informational — the unlock already
happened.

```js
game.on("key_used", (keyItemId, targetId) => {
  game.setFlag("used_" + keyItemId, 1);
});
```

### skill_learned

Triggered when a skill is learned.

**Use cases:**
- Show skill unlock popup
- Apply passive effects
- Update skill tree UI

```js
game.on("skill_learned", (tree, skill, lvl) => {
  game.showNotification("Skill unlocked!");
});
```

### skill_unlearned

Triggered when a skill is unlearned.

**Use cases:**
- Remove passive effects
- Refund skill points
- Log respec actions

```js
game.on("skill_unlearned", (tree, skill) => {
  console.log("Unlearned:", skill);
});
```


### quest_updated

Triggered after a quest log line landed. Deduped — replaying a log the quest already has does not fire it.

**Parameters:**
- `questId` - The quest's id
- `goalId` - The goal the log belongs to
- `result` - `{ isNewQuest, wasQuestCompleted, isQuestCompletedNow, questTitle }`
- `dungeonId` - The dungeon the quest belongs to

**Use cases:**
- Quest completion counts
- Chain a follow-up quest

```js
game.on("quest_updated", (questId, goalId, result, dungeonId) => {
  if (result.isQuestCompletedNow && !result.wasQuestCompleted) {
    game.progressAccolade("first_errand");
  }
});
```

## Status Events

### status_apply_before

Triggered before a status is applied, including reapplies of a status the character already holds. Return `false` to prevent it. When `args` is present, mutate it to change the stacks or duration that land.

**Use cases:**
- Immunity to a status or a whole status group
- Halve or cap incoming stacks (resistances)
- Refuse a debuff while a ward is up, and spend the ward

```js
game.on("status_apply_before", (char, status, args) => {
  if (status.id === "burn" && char.getStat("fire_immune")) return false;
  if (args?.stacks) args.stacks = Math.ceil(args.stacks / 2);
});
```

### status_added

Triggered after a NEW status is added. Reapplies of a status the character already holds do not fire this — use `status_apply_before` to observe those.

**Use cases:**
- Notify on gaining a debuff
- Start visual effects tied to a status

```js
game.on("status_added", (char, status) => {
  game.showNotification(char.getName() + " gains " + status.name);
});
```

### status_removed

Triggered after a status is removed.

**Use cases:**
- Stop visual effects
- Trigger on-expire payoffs

```js
game.on("status_removed", (char, status) => {
  console.log(char.getName() + " lost " + status.id);
});
```

### status_expired

Triggered per expired instance when the status duration drops to 0 or below.

**Use cases:**
- Detonate a timed status
- Log per-instance expiry for multi-stack statuses

```js
game.on("status_expired", (char, status, instance) => {
  console.log(status.id + " expired with " + instance.stacks + " stacks");
});
```

## Achievement Events

### accolade_completed

Triggered when an achievement's progress reaches its target — once per achievement. The engine has already scored the points and queued the notification; this is where a game hands out anything the achievement should actually pay.

**Parameters:**
- `accoladeId` - The completed achievement's id
- `points` - Its reward points (its own, or its tier's default)

**Use cases:**
- Grant currency or an item on completion
- Play a fanfare for platinum-tier unlocks

```js
game.on("accolade_completed", (accoladeId, points) => {
  game.getCharacter("mc").addResource("gold", points * 10);
});
```
