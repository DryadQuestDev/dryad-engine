import { Schema, SchemaToType } from '../utility/schema';

export const LocaleSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the locale entry.' },
    id: { type: 'string', required: true, tooltip: 'Locale key used to reference this text in code.' },
    val: { type: 'textarea', tooltip: 'Localized text value. Supports |placeholder| for dynamic content.' },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type LocaleObject = SchemaToType<typeof LocaleSchema>;
