import { Schema, SchemaToType } from '../utility/schema';
import { BaseStatusSchema } from './characterStatusSchema';

export const SkillSlotSchema = {
    uid: { type: 'uid' },
    id: { type: 'string', required: true, tooltip: 'Skill slotID used to reference this skill slot in the skill tree.' },
    name: { type: 'string', tooltip: 'Display name of the skill slot.' },
    description: { type: 'htmlarea', tooltip: 'Description of the skill slot.' },
    image: { type: 'file', fileType: 'image', tooltip: 'Image of the skill slot.' },
    size: { type: 'number', tooltip: 'Size of the skill slot in pixels.' },
    shape: { type: 'chooseOne', options: ['circle', 'square', 'triangle', 'diamond', 'hexagon', 'octagon'], tooltip: 'Shape of the skill slot.' },
    status: {
        type: 'schema', tooltip: 'The status to apply to the character when the skill is learned.', objects: {
            ...BaseStatusSchema
        }
    },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type SkillSlotObject = SchemaToType<typeof SkillSlotSchema>;
