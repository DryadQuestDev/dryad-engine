<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, markRaw, PropType } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { ARROWHEAD_SIZE } from '../../../global/global';
import { getShapePath, getShapeEdgePoint, getArrowPath, ShapeType, getArrowheadPath } from '../../../utility/shapes';
import BackgroundAsset from '../BackgroundAsset.vue';
import SkillSlot from './SkillSlot.vue';
import SkillTreeCard from '../popups/cards/SkillTreeCard.vue';
import { popover as vPopover } from '../../directives/popoverDirective';
import { isSkillVisible } from './useSkillParams';
import type { SkillTreeObject } from '../../../schemas/skillTreeSchema';
import type { SkillSlotObject } from '../../../schemas/skillSlotSchema';
import type { AssetObject } from '../../../schemas/assetSchema';

const props = defineProps({
  character: {
    type: Object as PropType<Character>,
    required: true
  }
});

const game = Game.getInstance();

// State
const activeTreeId = ref<string | null>(null);

// Refs
const canvasWrapperRef = ref<HTMLElement | null>(null);

// Panning state
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });
const scrollStart = ref({ left: 0, top: 0 });

// Tree selector state
const isTreeSelectorCollapsed = ref(false);

const SkillTreeCardComp = markRaw(SkillTreeCard);
function treePopoverBinding(tree: SkillTreeObject) {
  if (!tree.description) return null;
  return {
    component: SkillTreeCardComp,
    props: { treeId: tree.id, characterId: props.character.id },
    placement: 'right-start' as const,
  };
}

// Get all available skill trees for this character
const availableTrees = computed(() => {
  const trees: SkillTreeObject[] = [];
  props.character.skillTrees.forEach((treeId: string) => {
    const tree = game.characterSystem.skillTreesMap.get(treeId);
    if (tree) {
      trees.push(tree);
    }
  });
  return trees;
});

// Get active tree
const activeTree = computed(() => {
  if (!activeTreeId.value) return null;
  return game.characterSystem.skillTreesMap.get(activeTreeId.value);
});

// Canvas dimensions
const canvasWidth = computed(() => activeTree.value?.width || 800);
const canvasHeight = computed(() => activeTree.value?.height || 600);
const arrowStyle = computed(() => activeTree.value?.arrow_style || 'straight');

// Get learned skill level for a specific slot id
function getLearnedSkillLevelBySlotId(slotId: string | undefined): number {
  if (!slotId) return 0;
  const learned = props.character.learnedSkills.find(
    s => s.skillTreeId === activeTreeId.value && s.id === slotId
  );
  return learned?.level || 0;
}

// ── Skill slot lookup helpers (used by arrow rendering) ──
function getSkillSlotData(skillId: string): SkillSlotObject | null {
  return game.characterSystem.skillSlotsMap.get(skillId) || null;
}

function getSkillShape(skillId: string | undefined): ShapeType {
  if (!skillId) return 'circle';
  return (getSkillSlotData(skillId)?.shape as ShapeType) || 'circle';
}

function getSkillSize(skillId: string | undefined): number {
  if (!skillId) return 50;
  return getSkillSlotData(skillId)?.size || 50;
}

// Arrow connections (only for visible skills)
const arrowConnections = computed(() => {
  if (!activeTree.value?.skills) return [];

  const connections: Array<{ path: string; style: string; isActive: boolean }> = [];

  visibleSkills.value.forEach((skill: any) => {
    if (!skill.parent_skills || skill.parent_skills.length === 0) return;
    if (skill.x === undefined || skill.y === undefined) return;

    skill.parent_skills.forEach((parentSlotId: string) => {
      // Find parent skill by unique slot ID (not skill_id)
      const parentSkill = activeTree.value!.skills!.find((s: any) => s.id === parentSlotId);
      if (!parentSkill || parentSkill.x === undefined || parentSkill.y === undefined) return;

      // Only draw arrow if parent is visible
      if (!isSkillVisible(parentSkill)) return;

      const parentSize = getSkillSize(parentSkill.skill);
      const parentShape = getSkillShape(parentSkill.skill);
      const childSize = getSkillSize(skill.skill);
      const childShape = getSkillShape(skill.skill);

      const path = getArrowPath(
        parentSkill.x,
        parentSkill.y,
        parentSize,
        parentShape,
        skill.x,
        skill.y,
        childSize,
        childShape,
        arrowStyle.value
      );

      // Arrow is black if parent slot is learned (level >= 1), indicating unlocked path
      const parentLevel = getLearnedSkillLevelBySlotId(parentSlotId);
      const isUnlocked = parentLevel >= 1;

      connections.push({
        path,
        style: arrowStyle.value,
        isActive: isUnlocked
      });
    });
  });

  return connections;
});

// Toggle tree selector collapse
function toggleTreeSelector() {
  isTreeSelectorCollapsed.value = !isTreeSelectorCollapsed.value;
}

// Get background asset object
const backgroundAsset = computed((): AssetObject | null => {
  if (!activeTree.value?.background_asset) return null;

  // Find the asset in the game's dungeon system asset map
  const asset = game.dungeonSystem.assetsMap.get(activeTree.value.background_asset);
  return asset || null;
});

// Get visible skills (filtered by 'if' condition and parent visibility)
const visibleSkills = computed(() => {
  if (!activeTree.value?.skills) return [];

  return activeTree.value.skills.filter((skill: any) => {
    // Check if skill is visible based on its 'if' condition
    if (!isSkillVisible(skill)) {
      return false;
    }

    // If skill has parents, check if at least one parent is visible
    if (skill.parent_skills && skill.parent_skills.length > 0) {
      const hasVisibleParent = skill.parent_skills.some((parentSlotId: string) => {
        const parentSkill = activeTree.value?.skills?.find((s: any) => s.id === parentSlotId);
        return parentSkill && isSkillVisible(parentSkill);
      });

      if (!hasVisibleParent) {
        return false;
      }
    }

    return true;
  });
});

// Handle mouse panning
function handleMouseDown(event: MouseEvent) {
  if (!canvasWrapperRef.value) return;

  // Only pan with left mouse button and not when clicking on skills
  if (event.button !== 0) return;

  // Check if clicking on a skill (event target is SVG element)
  const target = event.target as HTMLElement;
  if (target.closest('.skill-slot')) return;

  isPanning.value = true;
  panStart.value = { x: event.clientX, y: event.clientY };
  scrollStart.value = {
    left: canvasWrapperRef.value.scrollLeft,
    top: canvasWrapperRef.value.scrollTop
  };

  canvasWrapperRef.value.style.cursor = 'grabbing';
  event.preventDefault();
}

function handleMouseMove(event: MouseEvent) {
  if (!isPanning.value || !canvasWrapperRef.value) return;

  const deltaX = event.clientX - panStart.value.x;
  const deltaY = event.clientY - panStart.value.y;

  canvasWrapperRef.value.scrollLeft = scrollStart.value.left - deltaX;
  canvasWrapperRef.value.scrollTop = scrollStart.value.top - deltaY;
}

function handleMouseUp() {
  if (!canvasWrapperRef.value) return;

  isPanning.value = false;
  canvasWrapperRef.value.style.cursor = 'grab';
}

function handleMouseLeave() {
  if (!canvasWrapperRef.value) return;

  isPanning.value = false;
  canvasWrapperRef.value.style.cursor = 'grab';
}

// Mount: select first tree and setup mouse listeners
onMounted(async () => {
  if (availableTrees.value.length > 0) {
    activeTreeId.value = availableTrees.value[0].id;
  }

  // Wait for DOM to update
  await nextTick();

  // Add mouse event listeners to canvas wrapper for panning
  if (canvasWrapperRef.value) {
    canvasWrapperRef.value.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    canvasWrapperRef.value.addEventListener('mouseleave', handleMouseLeave);
  }
});

// Cleanup on unmount
onUnmounted(() => {
  if (canvasWrapperRef.value) {
    canvasWrapperRef.value.removeEventListener('mousedown', handleMouseDown);
    canvasWrapperRef.value.removeEventListener('mouseleave', handleMouseLeave);
  }
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});

// Watch for character changes and reset active tree
watch(() => props.character, () => {
  // Reset to first tree when character changes
  if (availableTrees.value.length > 0) {
    activeTreeId.value = availableTrees.value[0].id;
  } else {
    activeTreeId.value = null;
  }
}, { immediate: false });
</script>

<template>
  <div class="skill-tree-container">
    <!-- Tree Selector (Top-Left, outside wrapper) -->
    <div v-if="availableTrees.length > 0" class="tree-selector" :class="{ collapsed: isTreeSelectorCollapsed }">
      <div class="tree-selector-header" @click="toggleTreeSelector">
        <span class="tree-selector-title">Skill Trees</span>
        <span class="tree-selector-toggle">{{ isTreeSelectorCollapsed ? '▶' : '▼' }}</span>
      </div>
      <div v-if="!isTreeSelectorCollapsed" class="tree-options">
        <div v-for="tree in availableTrees" :key="tree.id"
          :class="['tree-option', { active: tree.id === activeTreeId }]" @click="activeTreeId = tree.id"
          v-popover="treePopoverBinding(tree)">
          {{ tree.name || tree.id }}
        </div>
      </div>
    </div>

    <!-- Main Canvas Wrapper with Background -->
    <div v-if="activeTree" ref="canvasWrapperRef" class="skill-tree-canvas-wrapper">
      <!-- Background Asset (outside canvas) -->
      <BackgroundAsset v-if="backgroundAsset" :asset="backgroundAsset" :grade="false" class="skill-tree-background" />

      <!-- SVG Canvas (only for skill slots) -->
      <svg :width="canvasWidth" :height="canvasHeight" :viewBox="`0 0 ${canvasWidth} ${canvasHeight}`"
        class="skill-tree-canvas">
        <!-- Arrow Marker Definitions -->
        <defs>
          <marker id="arrowhead-inactive" :markerWidth="ARROWHEAD_SIZE * 1.5" :markerHeight="ARROWHEAD_SIZE"
            :refX="ARROWHEAD_SIZE * 1.5" :refY="ARROWHEAD_SIZE / 2" orient="auto" markerUnits="strokeWidth">
            <path :d="getArrowheadPath(ARROWHEAD_SIZE)" class="arrowhead-inactive" />
          </marker>
          <marker id="arrowhead-active" :markerWidth="ARROWHEAD_SIZE * 1.5" :markerHeight="ARROWHEAD_SIZE"
            :refX="ARROWHEAD_SIZE * 1.5" :refY="ARROWHEAD_SIZE / 2" orient="auto" markerUnits="strokeWidth">
            <path :d="getArrowheadPath(ARROWHEAD_SIZE)" class="arrowhead-active" />
          </marker>
        </defs>

        <!-- Arrow Connections -->
        <g class="arrows">
          <path v-for="(conn, index) in arrowConnections" :key="index" :d="conn.path"
            :class="['arrow-path', conn.style, conn.isActive ? 'arrow-active' : 'arrow-inactive']"
            :marker-end="conn.isActive ? 'url(#arrowhead-active)' : 'url(#arrowhead-inactive)'" />
        </g>

        <!-- Clip paths for each skill slot shape -->
        <defs>
          <clipPath v-for="skill in visibleSkills" :key="`clip-${skill.skill}`" :id="`clip-${skill.skill}`">
            <template v-if="getSkillShape(skill.skill) === 'circle'">
              <circle :r="getSkillSize(skill.skill) / 2" :cx="getSkillSize(skill.skill) / 2"
                :cy="getSkillSize(skill.skill) / 2" />
            </template>
            <template v-else>
              <path :d="getShapePath(getSkillShape(skill.skill), getSkillSize(skill.skill))" />
            </template>
          </clipPath>
        </defs>

        <!-- Skills -->
        <SkillSlot v-for="skill in visibleSkills" :key="skill.id" :skill="skill" :character="character"
          :tree-id="activeTreeId!" :all-skills="activeTree.skills || []" />
      </svg>
    </div>

    <!-- No Trees Message -->
    <div v-else class="no-trees-message">
      <p>No skill trees available for this character.</p>
    </div>
  </div>
</template>

<style scoped>
.skill-tree-container {
  --arrow-active-color: #000000;
  --arrow-inactive-color: #666666;

  position: relative;
  width: 100%;
  height: 100%;
  /*background-color: #1a1a1a;*/
  overflow: hidden;
}

/* Tree Selector */
.tree-selector {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 100;
  background: rgba(20, 20, 30, 0.75);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 0;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
  min-width: 180px;
  transition: all 0.3s ease;
}

.tree-selector.collapsed {
  min-width: auto;
}

.tree-selector-header {
  padding: 12px 14px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  border-radius: 8px 8px 0 0;
  user-select: none;
  transition: all 0.2s ease;
}

.tree-selector-header:hover {
  background: rgba(255, 255, 255, 0.08);
}

.tree-selector-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.tree-selector-toggle {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  transition: transform 0.2s ease;
}

.tree-options {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
}

.tree-option {
  padding: 10px 12px;
  cursor: pointer;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  transition: all 0.2s ease;
  backdrop-filter: blur(5px);
  position: relative;
  overflow: hidden;
}

.tree-option::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 100%);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.tree-option:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
  color: #fff;
  transform: translateX(2px);
}

.tree-option:hover::before {
  opacity: 1;
}

.tree-option.active {
  background: linear-gradient(135deg, rgba(100, 150, 255, 0.3) 0%, rgba(80, 120, 220, 0.2) 100%);
  border-color: rgba(100, 150, 255, 0.5);
  color: #fff;
  box-shadow: 0 0 15px rgba(100, 150, 255, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.tree-option.active::before {
  opacity: 1;
}

/* Canvas Wrapper */
.skill-tree-canvas-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: auto;
  cursor: grab;
  user-select: none;
}

/* Background */
.skill-tree-background {
  position: absolute;
  top: 0;
  left: 0;
  width: v-bind(canvasWidth + 'px');
  height: v-bind(canvasHeight + 'px');
  pointer-events: none;
  z-index: 0;
}

/* SVG Canvas */
.skill-tree-canvas {
  position: relative;
  z-index: 1;
  display: block;
}

/* Arrows */
.arrowhead-inactive {
  fill: var(--arrow-inactive-color);
}

.arrowhead-active {
  fill: var(--arrow-active-color);
}

.arrow-inactive {
  stroke: var(--arrow-inactive-color);
}

.arrow-active {
  stroke: var(--arrow-active-color);
}

.arrows path {
  stroke-width: 2;
  fill: none;
}



.arrows path.dashed {
  stroke-dasharray: 5, 5;
}

/* No Trees Message */
.no-trees-message {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: #888;
  font-size: 18px;
}

</style>
