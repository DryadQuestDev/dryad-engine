import { Schema, SchemaToType } from '../utility/schema';

/**
 * A saved set of filter-form values for one editor tab, stored per game or mod in
 * `dev/filter_presets.json`. The `sifter` mirrors the `Sifter` shape the filter form
 * builds (see `utility/sifterManager.ts`), so a preset is applied by writing it back
 * into the form.
 */
export const DevFilterPresetSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the preset.' },
    id: { type: 'string', required: true, tooltip: 'Merge key. A mod preset with the same id as a core preset replaces it. The filter form saves presets as <scope>__<name>.' },
    name: { type: 'string', required: true, tooltip: 'Label shown on the preset chip.' },
    scope: { type: 'string', required: true, tooltip: "Editor tab the preset belongs to, written as the tab's file path: 'items/templates', '[dungeon]/encounters', 'plugins_data/<plugin>/<tab>'. A dungeon scope serves every dungeon." },
    sifter: {
        type: 'schema', tooltip: 'Filter values written into the form when the preset is picked. Field paths that no longer exist on the tab are skipped.', objects: {
            id: { type: 'string', tooltip: 'ID contains.' },
            search: { type: 'string', tooltip: 'Search any value.' },
            key: { type: 'string', tooltip: "Key appears. Prefix with '!' for 'does not appear'." },
            range: {
                type: 'schema[]', tooltip: 'Numeric range filters.', objects: {
                    key: { type: 'string', required: true, tooltip: 'Field path, e.g. stats.health.' },
                    min: { type: 'number', tooltip: 'Inclusive minimum. Leave empty for no lower bound.' },
                    max: { type: 'number', tooltip: 'Inclusive maximum. Leave empty for no upper bound.' },
                }
            },
            selected: {
                type: 'schema[]', tooltip: 'Selection filters: the field must equal one of the values.', objects: {
                    key: { type: 'string', required: true, tooltip: 'Field path, e.g. rarity.' },
                    values: { type: 'string[]', tooltip: 'Accepted values.' },
                }
            },
            tag: {
                type: 'schema[]', tooltip: 'Tag filters on list fields.', objects: {
                    key: { type: 'string', required: true, tooltip: 'Field path, e.g. tags.' },
                    logic: { type: 'chooseOne', options: ['or', 'and'], defaultValue: 'or', tooltip: 'or: any listed value present. and: every listed value present.' },
                    values: { type: 'string[]', tooltip: 'Values to look for.' },
                }
            },
        }
    },
} as const satisfies Schema;

export type DevFilterPresetObject = SchemaToType<typeof DevFilterPresetSchema>;
