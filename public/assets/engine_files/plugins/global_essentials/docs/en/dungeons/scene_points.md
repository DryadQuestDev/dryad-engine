# Scene Points

Scene points are named spots on a scene's picture. A choice can be drawn at one of them instead of in the menu, so the player studies a room or a moment by clicking the things in it: the girl on the altar, the brazier, the desk. Picking one can zoom the picture toward it.

Points are geometry only. Where they sit lives in a data tab; what they're called and what they do lives in the content document, as ordinary choices.

## Placing points

Open **General → Scene Points** and add a layout. A layout is a set of points on one picture.

- **reference_asset** – the picture the points are placed on. It is also their frame in play: a point is stored in % of this picture, and the engine finds it wherever the picture is drawn, cover-fitted, zoomed or moved. When the picture isn't on stage, the points are read against the whole scene view.
- **frame_assets** – other plates that zoom with the picture, so a figure on its own plate stays on its spot.
- **zoom**, **aim_x**, **aim_y** – how far the picture zooms toward a picked point, and where on screen the point lands while zoomed (keep it above the dialogue box). A zoom of 1 or less means no zoom.
- **look_button** – keep the points hidden until the player presses **Look around** (see below). Off, they show as soon as the menu is up.
- **hide_actors** – fade the staged actors while the points are up and while the picture is zoomed in, so the picture shows. With **look_button**, only while the player is looking around.
- **points** – each with an id, x / y and an optional **zoom** of its own (a corner point needs a deeper zoom to reach the aim without the picture's edge showing) and an optional **character** that stands for the thing at the point (see below).

Press **Visual Editor** on a layout to place points by eye: pick the picture, click to add a point, drag to move it, right-click to remove it.

## Using them in content

Switch the layout on with `inspect` on the paragraph that carries the menu, and give choices a `point`:

```text
&study_hub
Books fill the shelves to the beams, and a fire crackles in the hearth.{inspect: "wren_study"}
2
~The desk{point: "desk", scene: "&look_desk"}
~The box{point: "box", if: "box_seen = 1", active: "_item_count(box_key) > 0", scene: "&open_box"}
~Leave
```

- A choice with `point` is drawn on the picture at that point, labeled with its own text. Everything else about it is an ordinary choice: `if` hides it, `active` greys it, and a choice already taken shows a grey ring.
- Picking it zooms the picture toward the point, then runs the choice.
- Coming back to the menu (the paragraph that carries `inspect`) zooms the picture back out. The markers wait until it has settled.
- A `point` that names no point of the layout in force stays an ordinary button.
- `{inspect: false}` switches the layout off. Leaving the scene does too.

Zoom without a click with `{zoom: "desk"}`, and back out with `{zoom: false}`.

## The Look around button

With **look_button** on, a menu with point choices shows a **Look around** button at the top middle of the screen instead of the markers. Pressing it shows the markers (and fades the actors, with **hide_actors**); the button then reads **Stop looking**. The look lasts through picking points and coming back to the menu. It ends when the player presses the button again, picks an ordinary choice from that menu, or the layout switches off.

The button is the component `scene-look-around` in the `ui-top-center` slot. A game can rename it through its own locale (`scene_points.look_around`, `scene_points.stop_looking`), or replace it with `game.removeComponent("scene-look-around")` and a button of its own. See ->builtins.component_slots.

A paragraph whose menu holds only point choices waits for a point to be clicked (behind the Look around button, with **look_button**).

## In scripts

`game.getScenePoints()` lists the points of the layout in force with where each sits on screen, in viewport pixels, the `character` the layout names for it, and the `choice` bound to it while its marker shows. Use it to draw effects at a point or to target things in the scene.

```js
for (const p of game.getScenePoints()) {
  console.log(p.id, p.x, p.y, p.character, !!p.choice);
}
```

A point's **character** is a character without a body: a template whose traits and stats describe the thing at the point (a locked box with a guard stat, a mirror with something to say). The engine only passes the id along; scripts give it meaning.

`game.getActorRect(id)` is the same kind of answer for a staged actor: its on-screen box, the frame the face_shift traits are measured in. Its `hidden` is true while the body is staged but not shown, such as when a layout's **hide_actors** fades it, so an effect aimed at it can go somewhere else.

The `scene_point_pick` emitter fires when a marker is clicked, before its choice runs. Return `false` to refuse the pick:

```js
game.on("scene_point_pick", (layoutId, pointId, choice) => {
  if (game.getFlag("glances_left") <= 0) return false;
});
```

## Spots on the map

For a labeled point on a map dungeon rather than on a scene's picture, use a `spot` encounter: see **Spots** in ->dungeons.glossary.
