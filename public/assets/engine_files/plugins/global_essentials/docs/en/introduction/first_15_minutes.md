# Your First 15 Minutes

This page takes you from an empty editor to a scene you changed, playing in your own game. The loop you learn here – change, save, play – is the one you use for everything after.

## 1. Create a game

Open the **Editor**. It starts on the **Start** page; **Start** in the header brings you back to it at any time.

1. **Visual novel** is already picked.
2. Type a **Game name** and press **Create game**.

@en/images/first_steps/start_page.webp

The editor opens your first chapter on **Dungeons → Content**. The scene there already plays: Riko talks, changes her expression and asks you to pick one of two answers. Every line of it is explained in a comment – a line that starts with `//`, which the game skips.

The template's art and music are copied into your game's own folder, so you can replace them whenever you like.

@en/images/first_steps/content_tab.webp

## 2. Play it

Press **Playtest** in the header. Your game starts on that scene, and Riko says her first line.

The panel on the right is the **debug panel**. It only shows while you test.

@en/images/first_steps/playtest.webp

## 3. Back to the editor

Press **Back to Editor** at the top of the debug panel, right away. The game remembers the paragraph you were on – Riko's first line.

## 4. Change that line

Find it in the first card:

```text
riko: Hi, I'm Riko! This is your first scene.
```

Change the words after `riko:`, then press **Save** – the first button of the editor's toolbar.

@en/images/first_steps/change_line.webp

## 5. Continue

Press **Continue** in the header. The game reloads and replays the paragraph you left on, with your change.

@en/images/first_steps/continue.webp

That is the whole loop. The **First steps** banner above the editor ticks each step off as you do it.

Continue always replays the paragraph you left the game on. To see a change further back, play to it again, or go back one paragraph with **PageUp**. To test a scene deep in your story, press the ▷ on its header in the Content tab: it plays from there (->advanced.debugging).

## Keys while you play

| Key | What it does |
|---|---|
| **Shift+R** | Replay the paragraph on screen, with your latest saved changes |
| **PageUp** | Back one paragraph – use it to try the other answer of a menu |
| **Shift+S** | Save a snapshot of this moment, to load it again later |
| **Ctrl+P** (**Cmd+P**) | In the editor: start a Playtest |

## Write before the art exists

While you test, a speaker with no character yet still talks, and a picture that doesn't exist yet shows as a grey card with its name. Both are marked as missing, so you can write a whole chapter first and add the characters and art later. They never show in the released game – make the character and the asset before you share it.

@en/images/first_steps/placeholders.webp

## Hide empty tabs

A new game opens with **Hide empty tabs** on: the header shows only the tabs your game has data in, plus the dungeon tabs. The template fills the ones a story needs from the start, such as a sound in **Sounds**. An empty tab is still one hover away: each tab's menu lists its empty subtabs greyed, and **⋯** at the end of the row lists the tabs that are empty as a whole. Once a tab has data, it shows. To see every tab, switch **Hide empty tabs** off at the top of the **⋯** menu.

@en/images/first_steps/more_menu.webp

## Next

- ->dungeons.visual_editor – everything the Content editor can do
- ->dungeons.glossary – how scenes, choices and actions are written
- ->introduction.coming_from_renpy and ->introduction.coming_from_twine – what you already know, in Dryad terms
