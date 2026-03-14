import { Schema, SchemaToType } from '../utility/schema';
import { CustomValueSchema } from './schemaParts';

export const NarrativeTagSchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier.' },
  id: { type: 'string', required: true, tooltip: 'Tag category ID (e.g. "culture", "mood", "terrain").' },
  values: { type: 'string[]', tooltip: 'Tag values within this category (e.g. ["military", "religious", "wild"]).' },
} as const satisfies Schema;

export type NarrativeTagObject = SchemaToType<typeof NarrativeTagSchema>;

export const NarrativeSlotSchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier.' },
  id: { type: 'string', required: true, tooltip: 'Slot ID used in |@slotId| syntax and as segment type.' },
  description: { type: 'textarea', tooltip: 'What this slot represents in the narrative flow.' },
  fallback_content: { type: 'htmlarea', tooltip: 'Default content used when no matching segment is found.' },
} as const satisfies Schema;

export type NarrativeSlotObject = SchemaToType<typeof NarrativeSlotSchema>;

export const NarrativeStateSchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier.' },
  id: { type: 'string', required: true, tooltip: 'State ID matching a registered narrative state.' },
  mode: { type: 'chooseOne', options: ['gate', 'identity'], defaultValue: 'gate', tooltip: 'Gate: hard filter — mismatch eliminates segment. Identity: soft preference — mismatch ignored, match adds specificity.' },
  ...CustomValueSchema,
  specificity: { type: 'number', defaultValue: 1, tooltip: 'How much this state contributes to segment ranking when filled.' },
  tooltip: { type: 'textarea', tooltip: 'Help text shown when editing segment states.' },
} as const satisfies Schema;

export type NarrativeStateObject = SchemaToType<typeof NarrativeStateSchema>;

export const NarrativeSegmentSchema = {
  uid: { type: 'uid', required: true, tooltip: 'Unique identifier.' },
  id: { type: 'string', required: true, tooltip: 'Unique segment ID.' },
  type: { type: 'chooseOne', fromFile: 'narrative_slots', tooltip: 'Which slot this segment fills.' },
  gates: { type: 'schema', fromFile: 'narrative_states', fromFileType: 'custom', fromFileTypeAnd: { mode: 'gate' }, tooltip: 'Hard conditions for selection. Mismatch eliminates this segment.' },
  identity: { type: 'schema', fromFile: 'narrative_states', fromFileType: 'custom', fromFileTypeAnd: { mode: 'identity' }, tooltip: 'Soft preferences. Match adds specificity but mismatch does not eliminate.' },
  weight: { type: 'number', defaultValue: 1, tooltip: 'Frequency weight within same specificity tier (higher = more likely).' },
  content: { type: 'htmlarea', tooltip: 'Narrative content. Supports |placeholders|, if{} blocks, |$templates|, and nested |@slotType| references.' },
} as const satisfies Schema;

export type NarrativeSegmentObject = SchemaToType<typeof NarrativeSegmentSchema>;
