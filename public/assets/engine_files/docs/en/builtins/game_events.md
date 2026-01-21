# Game Events Reference

All built-in game events you can listen to using `game.on()`.

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

### dungeon_enter

Triggered when entering a dungeon.

**Use cases:**
- Initialize dungeon-specific flags
- Set up random encounters
- Apply difficulty modifiers
- Play area-specific music
- Show location name popup
- Track exploration progress

```js
game.on("dungeon_enter", (dungeonId, roomId) => {
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

Triggered after unequipping.

**Use cases:**
- Remove set bonuses
- Update character appearance
- Log equipment changes

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

