import { Schema, SchemaToType } from '../utility/schema';

export const AccoladeTierSchema = {
    uid: { type: 'uid', required: true },
    id: { type: 'string', required: true, tooltip: 'Tier id referenced by accolades (e.g. bronze, silver, gold, platinum).' },
    name: { type: 'string', required: true, tooltip: 'Display name shown on cards and in the tier ladder.' },
    color: { type: 'color', tooltip: 'Tier accent color — card border, medallion, and unlock-notification glow.' },
    text_color: { type: 'color', tooltip: 'Optional label color where the accent is used on text. Falls back to the accent color.' },
    icon: { type: 'file', fileType: 'image', tooltip: 'Optional tier icon — the medallion used when an accolade has no icon of its own.' },
    points: { type: 'number', defaultValue: 0, tooltip: 'Default reward points for accolades of this tier. An accolade with its own points overrides this.' },
    order: { type: 'number', defaultValue: 0, tooltip: 'Ladder order, lowest tier first (bronze before platinum).' },
} as const satisfies Schema;

export type AccoladeTierObject = SchemaToType<typeof AccoladeTierSchema>;
