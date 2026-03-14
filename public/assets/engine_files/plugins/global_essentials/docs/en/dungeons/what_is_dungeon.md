## What is a Dungeon?

In Dryad Engine, a **dungeon** is a self‑contained area of your game – a location, chapter, hub, or route – that holds:

- A **layout** of rooms and how they connect.  
- **Encounters** inside those rooms (things the player can click on or interact with).  
- **Events and scenes** that tell the story and react to the player.  

You can think of a dungeon as a **playable document**: you write content once, and the engine turns it into rooms, choices, and events the player can explore.

### Dungeon Types

When you create a dungeon, you choose its **type**:

 - **Map** – an explorable 2D map with rooms, paths, fog of war, and clickable encounters.  
 - **Screen** – a single background image (or “scene”) with hotspots the player can interact with. A Screen dungeon always has exactly one room with the special ID `main`.  
 - **Text** – a text‑based dungeon where navigation, encounters, and choices are all driven by narrative.

Under the hood, all three work the same way: the dungeon is made of **rooms**, **encounters**, and **scripted content**, just presented differently.

## Rooms: The Spaces Inside a Dungeon

A **room** is a single location inside a dungeon – a tile on a map, a node in a flowchart, or a step in a text adventure.

- Each room has an **ID** (like `entrance`, `hallway`, `boss_room`).  
- Rooms can be **connected** to each other with doors/links, forming your dungeon layout.  
- A room can have:
  - Default **assets** (background decorations, props).  
  - **Fog of war** settings (what’s visible to the player).  
  - **Room events** that fire when the player enters.

On the editor side, rooms live in the **Rooms** tab of a dungeon, and visually on the dungeon map (see the map editor).  
At runtime, rooms are managed by the **Exploration** state which keep track of the current room, visited rooms, and visibility.

## Encounters: Things You Interact With

An **encounter** is anything the player can interact with inside a room:

- A clickable character, door, chest, clue, or prop on a map.  
- A text‑only encounter in a text dungeon (for example, a line the player can select).  

Key ideas:

- Encounters belong to **rooms** (their IDs usually include the room ID, like `room1.door_left`).  
- They can be purely visual **props** or fully interactive elements that trigger scenes and choices.  
- In the map editor, you place and shape encounters visually; in the game, the **Exploration** state uses them to show what the player can click.

## Events and Scenes: Making the Dungeon Come Alive

Rooms and encounters are the **where**; events and scenes are the **what happens**.

Dryad Engine gives you:

- **Room events** – scripts that run **before** or **after** entering a room.  
- **Dungeon events** – scripts that run when the dungeon is created or entered.  
- **Inline events and scenes** – story blocks inside your dungeon content that:
  - Show text to the player.  
  - Trigger actions (change flags, move characters, add items, start battles, etc.).  
  - Present **choices** and branch based on conditions.

Behind the scenes, the **Dungeon System**:

- Reads your dungeon content.  
- Builds a sequence of **scenes**.  
- Automatically creates **choices** and connects them to the right events and rooms.  

You don’t have to think in terms of “functions” or “callbacks” – you write story and structure, and the engine wires it up.

## Google Docs Integration: Why Write Outside the Editor?

You *can* write all your dungeon content directly in the editor, but for story‑heavy games it’s usually better to:

- Draft and edit scenes in **Google Docs** (with comments, suggestions, and collaboration).  
- Use headings, tables, and comments to organize your flow.  
- Link that document to your dungeon via its **Google Doc ID**.

The engine’s document tools:

- Fetch the Google Doc.  
- Convert it into plain DryadScript.  
- Import it into your dungeon’s `dungeon_content` field.  

From there, the normal parsing pipeline kicks in, and your dungeons become fully playable – with rooms, encounters, choices, and events – all driven by text you wrote in a familiar editor.

If you want to see a real example, open the **Tutorial** dungeon in the editor and look at its config, rooms, encounters, and imported content side‑by‑side.

## Next Steps

- ->dungeons.dungeon_template – How to start writing your content.  
- ->dungeons.google_docs_integration – How to import your content into the game.  
- ->dungeons.glossary – The core scripting concepts behind dungeons.  