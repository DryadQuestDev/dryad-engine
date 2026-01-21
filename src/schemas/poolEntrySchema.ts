import { Schema, SchemaToType } from '../utility/schema';

export const PoolEntrySchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the pool entry.' },
  id: { type: 'string', required: true, tooltip: 'Entry ID used to reference this entry.' },
  pool: {
    type: 'chooseOne',
    fromFile: 'pool_definitions',
    logic: 'build_filters',
    tooltip: 'The pool this entry belongs to.'
  },
  name: { type: 'string', tooltip: 'Name of the pool entry.' },
  entities: {
    type: 'schema[]',
    tooltip: 'List of entity groups to draw from this pool.',
    objects: {
      id: { type: 'string', tooltip: 'Optional Entity group ID.' },
      weight: { type: 'number', defaultValue: 1, tooltip: 'Relative weight for weight mode (any positive number).' },
      chance: { type: 'number', defaultValue: 50, min: 0, max: 100, tooltip: 'Percentage chance (0-100) for chance mode.' },
      count: { type: 'number', defaultValue: 1, tooltip: 'How many items to draw.' },
      filters_include: {
        type: 'schema',
        tooltip: 'Include items matching these criteria.',
        objects: {} // Dynamically populated based on pool.filter_fields
      },
      filters_exclude: {
        type: 'schema',
        tooltip: 'Exclude items matching these criteria.',
        objects: {} // Dynamically populated based on pool.filter_fields
      },
    }
  },
  tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering entries.' },
} as const satisfies Schema;

export type PoolEntryObject = SchemaToType<typeof PoolEntrySchema>;
