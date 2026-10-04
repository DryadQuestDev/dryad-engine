import { Schema, SchemaToType } from '../utility/schema';

/**
 * Editor-only presentation data for definition-driven form fields, stored per game or mod in
 * `dev/editor_layouts.json`. The game runtime never reads it. Plugins ship defaults for the
 * fields they define through plugin data keyed `dev/editor_layouts`; a game or mod adds entries
 * or overrides them by id.
 *
 * Each entry targets one form through `scope`, written `<tab file>:<field path>`. Entries that
 * share a scope combine: groups and hints merge by their own id (later entry wins field by
 * field, group members add up), so a game can extend a plugin's group with its own fields.
 */
export const DevEditorLayoutSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the layout entry.' },
    id: { type: 'string', required: true, tooltip: 'Merge key. An entry with the same id as a plugin or core entry overrides it.' },
    scope: { type: 'string', required: true, tooltip: "Form this entry lays out, written <tab file>:<field path>. The ability editor reads 'ability_templates:meta' (meta panel), 'ability_templates:effects.aspects' (effect aspects) and 'ability_templates:sheet' (Balance Sheet column sets); the item editor reads 'item_templates:traits'." },
    name: { type: 'string', tooltip: 'Label of the entry. Column sets show it on their chip.' },
    order: { type: 'number', tooltip: 'Entries sharing a scope combine in this order, lowest first. A later entry wins a field both set.' },
    groups: {
        type: 'schema[]', tooltip: 'Named groups of fields. They become section headers in forms and in the Add menus.', objects: {
            id: { type: 'string', required: true, tooltip: 'Group id. Entries sharing a scope merge groups with the same id.' },
            name: { type: 'string', tooltip: 'Group title.' },
            order: { type: 'number', tooltip: 'Display order of the group, lowest first.' },
            color: { type: 'color', tooltip: 'Accent stripe on the group and on the rows of its members.' },
            collapsed: { type: 'boolean', tooltip: 'Start the group collapsed.' },
            members: { type: 'string[]', tooltip: 'Field keys, in display order. A key listed in two groups stays in the first.' },
        }
    },
    hints: {
        type: 'schema[]', tooltip: 'Per-field input hints.', objects: {
            id: { type: 'string', required: true, tooltip: 'Key of the field the hint applies to.' },
            suffix: { type: 'string', tooltip: 'Unit shown after the value, such as "%" or "turns".' },
            step: { type: 'number', tooltip: 'Step of the number buttons and the slider.' },
            min: { type: 'number', tooltip: 'Lowest value the input accepts.' },
            max: { type: 'number', tooltip: 'Highest value the input accepts.' },
            widget: { type: 'chooseOne', options: ['auto', 'stepper', 'slider', 'buttons', 'toggle'], tooltip: 'auto picks by type. stepper: a number with +/- buttons. slider: a number slider, needs min and max. buttons: one button per option, for short choice lists. toggle: a switch for booleans.' },
            default_value: { type: 'string', tooltip: 'Value filled in when the field is added. Numbers and true/false are parsed; multi-choice fields take comma-separated ids.' },
            pinned: { type: 'boolean', tooltip: 'Always show the field, even while it is empty.' },
            hidden: { type: 'boolean', tooltip: 'Leave the field out of the Add menus, for a retired or script-only field. A value already set still shows.' },
        }
    },
    columns: { type: 'string[]', tooltip: 'Column set of a sheet scope, in display order: meta.<field>, meta.<field>.<key> for a number map such as costs, aspect.<aspect id>.' },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type DevEditorLayoutObject = SchemaToType<typeof DevEditorLayoutSchema>;
