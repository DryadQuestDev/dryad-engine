import { Schema, SchemaToType } from '../utility/schema';

/**
 * A point layout: named points on a picture. Content switches a layout on with {inspect: "id"}; a choice
 * bound to one of its points ({point: "desk"}) is drawn on the picture at that point instead of in the menu,
 * and picking it zooms the frame toward the point. Words and behavior live in the content; this is geometry.
 */
export const ScenePointSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the layout.' },
    id: { type: 'string', required: true, tooltip: 'Layout ID, switched on in content with {inspect: "id"}.' },
    reference_asset: { type: 'chooseOne', fromFile: 'assets', tooltip: 'The picture the points are placed on. It is also their coordinate frame in play: points are mapped through it wherever it is drawn (cover-fit, zoomed, moved). When it is not on stage, the scene view is used instead.' },
    frame_assets: { type: 'chooseMany', fromFile: 'assets', tooltip: 'Other plates that zoom together with the reference picture, so a figure baked into one stays on its spot in the other.' },
    zoom: { type: 'number', defaultValue: 2, step: 0.1, tooltip: 'How far the frame zooms in when a point-bound choice is picked. 1 or empty: no zoom.' },
    aim_x: { type: 'number', defaultValue: 50, tooltip: 'Where a picked point lands on screen while zoomed, in % of the scene width.' },
    aim_y: { type: 'number', defaultValue: 45, tooltip: 'Where a picked point lands on screen while zoomed, in % of the scene height (keep it above the dialogue box).' },
    look_button: { type: 'boolean', tooltip: 'The points wait for the player to press Look around (top middle of the screen) instead of appearing as soon as the menu is up. Pressing it again, or picking an ordinary choice, stops looking.' },
    hide_actors: { type: 'boolean', tooltip: 'Fade the staged actors while the points are on screen and while the frame is zoomed in, so the picture shows. With look_button, only while the player is looking around.' },
    points: {
        type: 'schema[]', tooltip: 'The points. Place them with the Visual Editor.', objects: {
            uid: { type: 'uid', required: true },
            id: { type: 'string', required: true, tooltip: 'Point ID, used by {point: "id"} on a choice and by {zoom: "id"}.' },
            x: { type: 'number', step: 0.1, tooltip: 'Center of the point, in % of the reference picture\'s width.' },
            y: { type: 'number', step: 0.1, tooltip: 'Center of the point, in % of the reference picture\'s height.' },
            zoom: { type: 'number', step: 0.1, tooltip: 'Zoom for this point instead of the layout\'s (a corner point needs a deeper zoom to reach the aim without the picture\'s edge showing).' },
            character: { type: 'chooseOne', fromFile: 'character_templates', tooltip: 'Optional character that stands for the thing at this point: a character without a body. Scripts read its traits and stats through the point (e.g. a locked box with a guard stat).' },
        },
    },
} as const satisfies Schema;

export type ScenePointObject = SchemaToType<typeof ScenePointSchema>;
