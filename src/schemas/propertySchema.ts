import { Schema, SchemaToType } from '../utility/schema';

export const PropertySchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the property.' },
  id: { type: 'string', required: true, tooltip: 'Property ID used to reference this property in code.' },
  name: { type: 'string', tooltip: 'Display name for the property.' }, //todo: remove?
  description: { type: "textarea", tooltip: 'Detailed description of what this property represents.' },

  type: { type: 'chooseOne', options: ['number', 'string', 'boolean', 'array', 'object'], tooltip: 'Data type of the property value.' },

  // for numbers only
  precision: { type: 'number', tooltip: 'Number of decimal places. E.g., 0->69, 1->69.5, 2->69.57', show: { type: ['number'] } },
  is_negative: { type: 'boolean', tooltip: 'If true, reducing this value is positive (e.g., damage taken). Used for UI coloring.', show: { type: ['number'] } },
  min_value: { type: 'number', tooltip: 'Minimum allowed value for this property.', show: { type: ['number'] } },
  max_value: { type: 'number', tooltip: 'Maximum allowed value for this property.', show: { type: ['number'] } },
  can_overflow: { type: 'boolean', tooltip: 'If true, the value can exceed the maximum value.', show: { type: ['number'] } },

  // type-specific default values
  default_value_number: { type: 'number', tooltip: 'Default number value.', show: { type: ['number'] } },
  default_value_string: { type: 'string', tooltip: 'Default string value.', show: { type: ['string'] } },
  default_value_boolean: { type: 'boolean', tooltip: 'Default boolean value.', show: { type: ['boolean'] } },
  default_value_array: { type: 'string[]', tooltip: 'Default array values.', show: { type: ['array'] } },
  default_value_object: { type: 'textarea', tooltip: 'Default object value (JSON format).', show: { type: ['object'] } },

  tags: { type: 'string[]', tooltip: 'Tags to categorize the property.' },
} as const satisfies Schema;

export type PropertyObject = SchemaToType<typeof PropertySchema>;
