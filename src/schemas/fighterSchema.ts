import {Schema, SchemaToType} from '../utility/schema';

export const FighterSchema = {
  uid: { type: 'uid', required: true},
  id: { type: 'string', required: true},
  stats:{type: 'schema', objects: {
    strength: {type: 'number', tooltip: 'Strength of the fighter'},
    agility: {type: 'number', tooltip: 'Agility of the fighter'},
    intelligence: {type: 'number', tooltip: 'Intelligence of the fighter'},
    tags: {type: 'string[]', tooltip: 'Tags for the fighter'},
  }, tooltip: 'Stats of the fighter'},
  statsArr_arr:{type: 'schema[]', objects: {
    uid: {type: 'uid'},
    id: {type: 'string'},
    strength: {type: 'number', tooltip: 'Nested Strength of the fighter'},
    agility: {type: 'number', tooltip: 'Nested Agility of the fighter'},
    intelligence: {type: 'number', tooltip: 'Nested Intelligence of the fighter'},
    tags: {type: 'string[]', tooltip: 'Nested Tags for the fighter'},
  }, tooltip: 'Nested Array Stats of the fighter'},
  image: { type: 'file', required: false, fileType: 'image', tooltip: 'Image of the fighter' },
  images: { type: 'file[]', required: false, fileType: 'image', tooltip: 'Images of the fighter' },
  name: { type: 'string', defaultValue: 'Bob', required: false , tooltip: 'Fighters name'},
  attack_type:{type: 'chooseOne', options: ['melee', 'ranged', 'magic'], tooltip: 'Attack type of the fighter'},
  attack_bonuses:{type: 'chooseMany', options: ['fire', 'water', 'earth', 'air'], tooltip: 'Attack bonuses of the fighter'},
  is_big: { type: 'boolean', required: false, tooltip: 'If the fighter is big, it will take more space on the grid' },
  health: { type: 'number', required: false, tooltip: 'Health of the fighter' },
  damage: { type: 'number', required: false, tooltip: 'Damage per hit' },
  tags: { type: 'string[]', required: false, tooltip: 'Tags for the fighter' },
  text_description: { type: 'textarea', required: false, tooltip: 'Description of the fighter' },
  html_description: { type: 'htmlarea', required: false, tooltip: 'Description of the fighter' },
} as const satisfies Schema;

export type FighterObject = SchemaToType<typeof FighterSchema>;
