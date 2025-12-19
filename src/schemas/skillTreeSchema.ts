import { Schema, SchemaToType } from '../utility/schema';

export const SkillTreeSchema = {
    uid: { type: 'uid' },
    id: { type: 'string', required: true, tooltip: 'Skill tree ID used to reference this skill tree for a character.' },
    name: { type: 'string', tooltip: 'Display name of the skill tree.' },
    width: { type: 'number', tooltip: 'Width of the skill tree container.' },
    height: { type: 'number', tooltip: 'Height of the skill tree container.' },
    description: { type: 'htmlarea', tooltip: 'Description of the skill tree.' },
    background_asset: { type: 'chooseOne', fromFile: 'assets', tooltip: 'Background asset of the skill tree.' },
    arrow_style: { type: 'chooseOne', options: ['straight', 'curved', 'dashed'], defaultValue: 'straight', tooltip: 'Visual style for arrows connecting parent skills to child skills.' },
    is_private: { type: 'boolean', tooltip: 'If true, the character will have to use their private inventory to pay for unlocking this skill tree. Otherwise, the party inventory will be used.' },
    refund_factor: { type: 'number', tooltip: 'Refund factor from 0 to 1. When refunding a skill, the refunded amount will be (price × skill_level × refund_factor), rounded up. 0 or undefined means non-refundable.' },
    skills: {
        type: 'schema[]', tooltip: 'Skills slots in the skill tree.', objects: {
            id: { type: 'string', tooltip: 'Unique identifier for the item slot.' },
            skill: { type: 'chooseOne', tooltip: 'Skill id.', fromFile: 'skill_slots' },
            max_upgrade_level: { type: 'number', tooltip: 'Maximum upgrade level of the skill. Each upgrade gives 1 stack to the skill\'s status effect.', defaultValue: 1 },
            price: { type: 'schema', fromFile: 'item_templates', fromFileType: 'number', fromFileTypeAnd: { is_currency: true }, tooltip: 'Price of the skill to learn. Item currencies are used.' },
            x: { type: 'number', tooltip: 'X coordinate of the skill in the skill tree.' },
            y: { type: 'number', tooltip: 'Y coordinate of the skill in the skill tree.' },
            parent_skills: { type: 'string[]', tooltip: 'Array of parent skill slot IDs (unique slot IDs, not the skill field). If set, at least one of the parent slots must be learned to learn this skill.' },
            params: {
                type: 'textarea', tooltip: `Action to perform when the skill is learned. You can also include if, ifOr, active, activeOr to hide/disable this skill dynamically the same way it’s done for scene choices. Example:
        {
        scene: “my_dungeon.scene”,
        state: "progression_state=false",
        if: “my_dungeon.my_flag = 1”
        }
        ` },
        }
    },
    tags: { type: 'string[]', tooltip: 'Used for categorizing and filtering.' },
} as const satisfies Schema;

export type SkillTreeObject = SchemaToType<typeof SkillTreeSchema>;