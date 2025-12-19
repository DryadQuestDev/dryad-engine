## Creating a New Game

You can create a new game in Dryad Engine directly from the editor – no manual setup needed.

### 1. Start a New Game from the Editor

1. Open the **Editor**.  
2. Go to **New → New Game**.  
3. Fill in the form (game name, ID, description, etc.).  
4. Press **“Save New Game”**.

@en/new_game.png

After you save, Dryad Engine will automatically create **two folders** inside `/assets` folder.

### 2. Your Game Folders

You’ll see:

1. `games_files/[your_game_id]/_core`  
   - This is where **all of your game data** lives.  
   - You’ll populate it by filling in forms in the editor (characters, items, stats, dungeons, etc.).  

2. `games_assets/[your_game_id]/_core`  
   - This is where **you put your game assets** – images, sounds, and other files.  
   - These assets can be linked to your game through the editor’s built‑in file browser.  

The `games_files` folder follows a **specific structure** that the engine understands.  
The `games_assets` folder is more flexible: the engine can reference **any assets** there – and even assets from **other games** – as long as you point to them from your data.

### 3. Think of Your Game as a Layered Cake

Every game in Dryad Engine is built like a **layered cake**:

- When you create a new game, you’re creating the **base `_core` layer**.  
- Later, you (or your community) can create **mods** for that game. Each mod becomes a **new layer on top** of the previous ones.  
- A mod can:
  - Add new data (new characters, items, dungeons, etc.).  
  - Overwrite specific properties (for example, change a character’s starting health) while **leaving everything else untouched**.

This makes it easy to:

- Patch and update your game.  
- Build expansions and DLC.  
- Let the community create their own mods on top of your work.

### 4. Creating a Dungeon

Right now, your game exists, but it doesn’t have a real **starting point** yet.

In the game settings you define:

- `starting_dungeon_id` – which dungeon to start in.  
- `starting_dungeon_room_id` – which room inside that dungeon is the first one.

Let’s create a very simple starting dungeon now.

#### 4.1 Create the Dungeon

1. In the editor, go to **New → New Dungeon**.  
2. Fill in the basic info for your dungeon.  
3. To keep things simple, choose **`dungeon_type: text`**.  
4. Because we don’t have a background image to define the size yet, set the **dimensions manually** (for this example, use **`1000px`**).

When you save this dungeon, its data will be created under:

- `games_files/[your_game_id]/_core/dungeons/[dungeon_id]`

If you ever decide to completely remove this dungeon, you can delete it safely by **removing that folder** (just make sure nothing in your game still points to it).

#### 4.2 Add Simple Room Content

Normally it’s recommended to write dungeon content in **Google Docs**, but for this first test we’ll set the content directly into 'dungeon_content' field:

```text
^1
@description
You enter room '1'

^2
@description
You enter room '2'
```

This gives you content for **two rooms**: one with ID `1` and one with ID `2`.

@en/new_dungeon.png

#### 4.3 Create and Connect the Rooms

1. Go to **Dungeons → Rooms** in the editor.  
2. Create **two rooms** with IDs **`1`** and **`2`** (matching the content you just wrote).  
3. Connect the rooms together so you can move between them.

@en/rooms.png

At this point you have:

- A new game  
- A starting dungeon with two rooms (`1` and `2`)  
- Content describing what happens when you enter each room  

Now you’re ready to **test your game** – press the **Playtest** button in the editor and walk through your tiny dungeon.


