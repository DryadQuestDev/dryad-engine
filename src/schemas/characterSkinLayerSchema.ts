import { Schema, SchemaToType } from '../utility/schema';

export const CharacterSkinLayerSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the skin layer.' },
    id: { type: 'string', required: true, tooltip: 'Skin layer ID used to reference this layer.' },
    z_index: { type: 'number', tooltip: 'The z-index of the skin layer. Higher values are rendered on top of lower values.' },
    attributes: { type: 'chooseMany', fromFile: 'character_attributes', logic: 'build_images', tooltip: 'Character attributes that determine which images to use for this layer.' },
    images: { type: 'schema', tooltip: 'Images of the skin layer, dynamically built based on attributes.' }, // change to build imgs dinamically
    masks: { type: 'schema', tooltip: 'Clip all image layers below this layer inside this mask boundaries.' },
    styles: { type: 'string[]', tooltip: 'Custom css classes to apply to the skin layer by default.' },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type CharacterSkinLayerObject = SchemaToType<typeof CharacterSkinLayerSchema>;