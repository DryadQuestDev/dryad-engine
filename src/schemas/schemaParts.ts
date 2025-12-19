import { Schema } from "../utility/schema";

export const CustomValueSchema = {
    type: { type: 'chooseOne', options: ['number', 'string', 'boolean', 'chooseOne', 'chooseMany', 'color', 'image', 'video', 'array', 'textarea', 'htmlarea'], tooltip: 'Data type of the value.' },
    values: { type: 'string[]', tooltip: 'Values for the chooseOne or chooseMany type.', show: { type: ['chooseOne', 'chooseMany'] } },
} as const satisfies Schema;