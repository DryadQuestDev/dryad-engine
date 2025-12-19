import { Schema, SchemaToType } from '../utility/schema';

export const GallerySchema = {
    uid: { type: 'uid', required: true },
    id: { type: 'string', required: true, tooltip: 'Gallery ID used to reference this gallery for characters and assets.' },
    name: { type: 'string', tooltip: 'Name of the gallery.' },
    type: { type: 'chooseOne', options: ['assets', 'characters'], tooltip: 'Type of the gallery.', defaultValue: 'assets' },
} satisfies Schema;

export type GalleryObject = SchemaToType<typeof GallerySchema>;