import { Schema, SchemaToType } from '../utility/schema';

export const RecordSchema = {
    uid: { type: 'uid', required: true },
    id: { type: 'string', required: true, tooltip: 'Record ID used in [[id]] inline links and encyclopedia references.' },
    title: { type: 'string', required: true, tooltip: 'Display name shown in tooltips and the encyclopedia.' },
    summary: { type: 'htmlarea', tooltip: 'Short content shown in the inline tooltip popup. Supports the full text pipeline (placeholders, [[links]], bold/italic).' },
    content: { type: 'htmlarea', tooltip: 'Long content shown in the encyclopedia tab. Falls back to summary if empty.' },
    image: { type: 'file', fileType: 'image', tooltip: 'Optional illustration shown in the encyclopedia entry.' },
    auto_discovery: { type: 'boolean', defaultValue: true, tooltip: 'If true, the record is unlocked from game start. If false, it must be discovered via [[!id]] or {lore} action.' },
    parent_record: { type: 'chooseOne', fromFile: 'records', tooltip: 'If set, this record is a layered extension of the parent. It does NOT appear standalone in the encyclopedia — its summary/content are appended after the parent\'s when this child is itself discovered. Children render in discovery order, letting the parent entry grow as the story unfolds.' },
    character: { type: 'chooseOne', fromFile: 'character_templates', show: { parent_record: '$falsy' }, tooltip: 'The character this record is about. Once the player has met the character, the encyclopedia entry links to their gallery page and the gallery page links back here. The character needs a gallery entry for the link to show.' },
    reveal: { type: 'chooseOne', options: ['talk', 'appear'], show: { character: '$truthy' }, tooltip: 'Discover this record silently, with no {lore} action: talk = the first time its character speaks a line in a scene; appear = the first time the character is staged with {actor} or speaks a line, whichever comes first. Leave empty to discover it only by {lore} or [[!id]]. Only that exact character counts, not other characters made from its template.' },
    tags: { type: 'string[]', tooltip: 'Free-form tags for searching and filtering.' },
} as const satisfies Schema;

export type RecordObject = SchemaToType<typeof RecordSchema>;
