import { Schema } from "../utility/schema";

export const CustomValueSchema = {
    type: { type: 'chooseOne', options: ['number', 'string', 'boolean', 'chooseOne', 'chooseMany', 'schema', 'color', 'image', 'video', 'array', 'textarea', 'htmlarea', 'range'], tooltip: 'Data type of the value.' },
    values: { type: 'string[]', tooltip: 'Values for the chooseOne or chooseMany type.', show: { type: ['chooseOne', 'chooseMany'] } },
    fromFile: { type: 'string', tooltip: 'Load options from this file (for chooseOne/chooseMany).', show: { type: ['chooseOne', 'chooseMany', 'schema'] } },
    fromFileType: { type: 'chooseOne', options: ['number', 'string', 'boolean', 'chooseOne', 'chooseMany', 'custom', 'values'], tooltip: 'Type for loaded fields. Use "custom" to read item.type from data. Use "values" to read item.values arrays. Defaults to "custom" if not set.', show: { type: ['chooseOne', 'chooseMany', 'schema'] } },
    fromFileTypeAnd: { type: 'textarea', tooltip: 'Filter: ALL conditions must match (AND logic). Example: { role: "meta" }', show: { type: ['chooseOne', 'chooseMany', 'schema'] } },
    fromFileTypeOr: { type: 'textarea', tooltip: 'Filter: AT LEAST ONE condition must match (OR logic).', show: { type: ['chooseOne', 'chooseMany', 'schema'] } },
} as const satisfies Schema;