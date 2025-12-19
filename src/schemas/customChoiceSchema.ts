import { Schema, SchemaToType } from '../utility/schema';

export const CustomChoiceSchema = {
    uid: { type: 'uid', required: true, tooltip: 'Unique identifier for the entity trait.' },
    id: { type: 'string', required: true, tooltip: 'Trait ID used to reference this trait in code.' },
    group: { type: 'chooseOne', options: ['any', 'character', 'item', 'debug'], tooltip: 'Group the choice belongs to.' },
    name: { type: 'string', tooltip: 'Display name of the choice.' },
    params: {
        type: 'textarea', tooltip: `Action to perform when the choice is clicked. You can also include if, ifOr, active, activeOr to hide/disable this choice dynamically the same way it's done for scene choices. Example:
{
scene: "my_dungeon.scene",
state: "progression_state=false",
if: "_selected_character = alice"
}
` },
    description: { type: 'textarea', tooltip: 'Description of the choice.' },
    order: { type: 'number', tooltip: 'Display order in the choices list (lower numbers appear first).' },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },

} as const satisfies Schema;

export type CustomChoiceObject = SchemaToType<typeof CustomChoiceSchema>;