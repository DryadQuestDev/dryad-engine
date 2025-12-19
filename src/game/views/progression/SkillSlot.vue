<script setup lang="ts">
import { computed, PropType } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { getShapePath, ShapeType } from '../../../utility/shapes';
import { useSkillParams, isSkillVisible } from './useSkillParams';

const props = defineProps({
  skill: {
    type: Object as PropType<any>,
    required: true
  },
  character: {
    type: Object as PropType<Character>,
    required: true
  },
  treeId: {
    type: String,
    required: true
  },
  allSkills: {
    type: Array as PropType<any[]>,
    required: true
  }
});

const emit = defineEmits<{
  mouseenter: [event: MouseEvent, skill: any];
  mouseleave: [];
}>();

const game = Game.getInstance();

// Use composable for reactive skill params
const { isVisible, isDisabledByParams } = useSkillParams(props.skill);

// Get learned skill level for this slot
const learnedLevel = computed(() => {
  const learned = props.character.learnedSkills.find(
    s => s.skillTreeId === props.treeId && s.id === props.skill.id
  );
  return learned?.level || 0;
});

// Check if skill is learnable (at least one parent has level >= 1 and is visible)
const isLearnable = computed(() => {
  // Check if disabled by params
  if (isDisabledByParams.value) {
    return false;
  }

  // If no parents, it's a root skill and always learnable
  if (!props.skill.parent_skills || props.skill.parent_skills.length === 0) {
    return true;
  }

  // Check if at least one parent slot is learned AND visible
  return props.skill.parent_skills.some((parentSlotId: string) => {
    // Find the parent skill
    const parentSkill = props.allSkills.find((s: any) => s.id === parentSlotId);
    if (!parentSkill) return false;

    // Parent must be visible (based on its 'if' condition)
    if (!isSkillVisible(parentSkill)) {
      return false;
    }

    // Parent must be learned
    const parentLearned = props.character.learnedSkills.find(
      s => s.skillTreeId === props.treeId && s.id === parentSlotId
    );
    return (parentLearned?.level || 0) >= 1;
  });
});

// Check if character can afford the skill
const canAfford = computed(() => {
  if (!props.skill.price || Object.keys(props.skill.price).length === 0) {
    return true;
  }

  // This needs to be passed from parent or we need tree info
  // For now, we'll assume it's accessible through character
  return true; // Placeholder - should be implemented properly
});

// Get skill slot data
function getSkillSlotData(skillId: string) {
  return game.characterSystem.skillSlotsMap.get(skillId) || null;
}

// Get skill shape
const skillShape = computed((): ShapeType => {
  if (!props.skill.skill) return 'circle';
  const skillData = getSkillSlotData(props.skill.skill);
  return (skillData?.shape as ShapeType) || 'circle';
});

// Get skill size
const skillSize = computed(() => {
  if (!props.skill.skill) return 50;
  const skillData = getSkillSlotData(props.skill.skill);
  return skillData?.size || 50;
});

// Get skill image
const skillImage = computed(() => {
  if (!props.skill.skill) return null;
  const skillData = getSkillSlotData(props.skill.skill);
  return skillData?.image || null;
});

// Compute classes
const slotClasses = computed(() => ({
  'skill-slot': true,
  'learned': learnedLevel.value > 0,
  'locked': !isLearnable.value,
  'unaffordable': isLearnable.value && !canAfford.value,
  'maxed': learnedLevel.value >= (props.skill.max_upgrade_level || 1)
}));

// Handle mouse events
function handleMouseEnter(event: MouseEvent) {
  emit('mouseenter', event, props.skill);
}

function handleMouseLeave() {
  emit('mouseleave');
}
</script>

<template>
  <g :class="slotClasses" :transform="`translate(${skill.x}, ${skill.y})`" @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave">
    <!-- Skill Image (clipped to shape and fills the full area) -->
    <image v-if="skillImage" :href="skillImage" :x="0" :y="0" :width="skillSize" :height="skillSize"
      preserveAspectRatio="xMidYMid slice" :clip-path="`url(#clip-${skill.skill})`" />

    <!-- Border for skills based on learned level -->
    <template v-if="learnedLevel === 0">
      <!-- Unlearned skills (gray border) -->
      <circle v-if="skillShape === 'circle'" :r="skillSize / 2" :cx="skillSize / 2" :cy="skillSize / 2" fill="none"
        stroke="#666666" stroke-width="2" />
      <path v-else :d="getShapePath(skillShape, skillSize)" fill="none" stroke="#666666" stroke-width="2" />
    </template>
    <template v-else-if="learnedLevel > 0 && learnedLevel < (skill.max_upgrade_level || 1)">
      <!-- Partially learned skills (green border) -->
      <circle v-if="skillShape === 'circle'" :r="skillSize / 2" :cx="skillSize / 2" :cy="skillSize / 2" fill="none"
        stroke="#4CAF50" stroke-width="2" />
      <path v-else :d="getShapePath(skillShape, skillSize)" fill="none" stroke="#4CAF50" stroke-width="2" />
    </template>
    <template v-else-if="learnedLevel >= (skill.max_upgrade_level || 1)">
      <!-- Maxed skills (yellow border) -->
      <circle v-if="skillShape === 'circle'" :r="skillSize / 2" :cx="skillSize / 2" :cy="skillSize / 2" fill="none"
        stroke="#FFC107" stroke-width="2" />
      <path v-else :d="getShapePath(skillShape, skillSize)" fill="none" stroke="#FFC107" stroke-width="2" />
    </template>

    <!-- Level Indicator (only show if max level > 1) -->
    <text v-if="learnedLevel > 0 && (skill.max_upgrade_level || 1) > 1" class="level-indicator" :x="skillSize / 2"
      :y="skillSize / 2 + 15" text-anchor="middle">
      Lv {{ learnedLevel }}
    </text>
  </g>
</template>

<style scoped>
.skill-slot {
  cursor: pointer;
}

.skill-slot:hover {
  filter: brightness(1.3);
}

.skill-slot.locked {
  filter: grayscale(100%) opacity(0.5);
}

.skill-slot.unaffordable {
  filter: grayscale(100%) opacity(0.7);
}

.skill-slot.learned {
  filter: brightness(1.2);
}

.skill-slot.maxed path {
  stroke: gold !important;
  stroke-width: 2;
}

.level-indicator {
  fill: #fff;
  font-size: 12px;
  font-weight: bold;
  text-shadow: 1px 1px 2px #000;
}
</style>
