import { Schema, SchemaToType } from '../utility/schema';

export const CharacterSkinLayerSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the skin layer.' },
    id: { type: 'string', required: true, tooltip: 'Skin layer ID used to reference this layer.' },
    type: { type: 'chooseOne', options: ['static', 'spine'], defaultValue: 'static', tooltip: 'Layer type. static = renders an <img>. spine = drives one spine animation track.' },
    view: { type: 'chooseOne', fromFile: 'character_views', tooltip: 'View this layer belongs to (e.g. back, side). _default or empty = base layer, always rendered.' },
    z_index: { type: 'number', tooltip: 'The z-index of the skin layer. Higher values are rendered on top of lower values. For spine layers, also determines playback track ordering (sorted ascending; track index = sort position, not z_index value).' },
    attributes: { type: 'chooseMany', fromFile: 'character_attributes', logic: 'build_images', tooltip: 'Character attributes that determine which images/animations to use for this layer. When empty, a single entry keyed by the layer id is used.' },
    images: { type: 'schema', show: { type: ['static'] }, tooltip: 'Images of the skin layer, dynamically built based on attributes.' },
    masks: { type: 'schema', show: { type: ['static'] }, tooltip: 'Mask polygons per attribute combo (same key pattern as images). Behavior is set by mask_mode and mask_targets.' },
    mask_mode: { type: 'chooseOne', options: ['hide', 'keep'], defaultValue: 'hide', show: { type: ['static'] }, tooltip: 'hide: layers below are hidden INSIDE the mask polygon (cut a hole). keep: targeted layers are clipped TO the polygon (CSS clip-path semantics - only what is inside survives, e.g. hair trimmed to fit under a hat). Keep polygons are in the target layer\'s IMAGE coordinates; the doll remaps them into the letterboxed element.' },
    mask_targets: { type: 'chooseMany', fromFile: 'character_skin_layers', show: { type: ['static'] }, tooltip: 'Layers this layer\'s mask applies to. Empty = every layer below.' },
    spine_animations: { type: 'schema', show: { type: ['spine'] }, tooltip: 'Animation names per attribute combo, dynamically built from attributes. Same key pattern as images, but values are spine animation name strings.' },
    spine_skins: { type: 'schema', show: { type: ['spine'] }, tooltip: 'Spine skin names per attribute combo, dynamically built from attributes. Same key pattern as images/spine_animations, but values are spine skin name strings. A spine layer can populate spine_animations, spine_skins, or both.' },
    styles: { type: 'string[]', show: { type: ['static'] }, tooltip: 'Custom css classes to apply to the skin layer by default.' },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type CharacterSkinLayerObject = SchemaToType<typeof CharacterSkinLayerSchema>;