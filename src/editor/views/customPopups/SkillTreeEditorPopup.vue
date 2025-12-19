<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Editor } from '../../editor';
import type { EditorCustomPopupProps } from '../../editor';
import type { SkillSlotObject } from '../../../schemas/skillSlotSchema';
import type { AssetObject } from '../../../schemas/assetSchema';
import { getShapePath, getArrowPath, getArrowheadPath, type ShapeType } from '../../../utility/shapes';
import { ARROWHEAD_SIZE } from '../../../global/global';
import Checkbox from 'primevue/checkbox';
import InputNumber from 'primevue/inputnumber';
import BackgroundAsset from '../../../game/views/BackgroundAsset.vue';

const props = defineProps<EditorCustomPopupProps>();
const emit = defineEmits<{ 'update:item': [item: any] }>();

const editor = Editor.getInstance();

// Constants
const DEFAULT_SKILL_SIZE = 40;

// Local copy for editing (this is already a deep copy from the wrapper)
const localItem = ref(props.item);

// Core item reference (from parent)
const coreItem = ref(props.coreItem);

// Skill slots data
const skillSlots = ref<SkillSlotObject[]>([]);

// Background asset data
const backgroundAsset = ref<AssetObject | undefined>(undefined);
const showBackgroundImage = ref(false);

// Dragging state
const draggedSkillIndex = ref<number | null>(null);
const dragOffsetX = ref(0);
const dragOffsetY = ref(0);

// Grid settings
const gridEnabled = ref(true);
const gridSize = ref(20);

// SVG container ref
const svgContainer = ref<SVGSVGElement | null>(null);

// Canvas dimensions from skill tree (fallback to core values)
const canvasWidth = computed(() => localItem.value.width ?? coreItem.value?.width ?? 800);
const canvasHeight = computed(() => localItem.value.height ?? coreItem.value?.height ?? 600);

// Arrow style
const arrowStyle = computed(() => localItem.value.arrow_style || 'straight');

// Combined skills (local + core)
const allSkills = computed(() => {
  const localSkills = (localItem.value.skills || []).map((skill: any, index: number) => ({
    ...skill,
    isCore: false,
    localIndex: index
  }));

  // Add core skills if they exist and we're editing a mod
  if (coreItem.value?.skills && Array.isArray(coreItem.value.skills)) {
    const coreSkills = coreItem.value.skills.map((skill: any) => ({
      ...skill,
      isCore: true,
      localIndex: -1 // Not editable
    }));
    return [...coreSkills, ...localSkills];
  }

  return localSkills;
});

// Load skill slots and background asset data
onMounted(async () => {
  try {
    // Load skill slots using loadFullData for proper mod support
    const skillSlotsData = await editor.loadFullData('skill_slots');
    skillSlots.value = skillSlotsData || [];

    // Load background asset if specified, fallback to core
    const backgroundAssetId = localItem.value.background_asset ?? coreItem.value?.background_asset;
    if (backgroundAssetId) {
      const assetsData = await editor.loadFullData('assets');
      backgroundAsset.value = assetsData?.find((asset: AssetObject) => asset.id === backgroundAssetId);
    }
  } catch (error) {
    console.error('Failed to load data:', error);
    skillSlots.value = [];
  }
});

// Watch for prop changes (in case item is updated externally)
watch(() => props.item, (newItem) => {
  localItem.value = newItem;
}, { deep: true });

// Watch for item changes and emit updates
watch(() => localItem.value, (newValue) => {
  emit('update:item', newValue);
}, { deep: true });

// Get skill slot by ID
function getSkillSlot(skillId: string | undefined): SkillSlotObject | undefined {
  if (!skillId) return undefined;
  return skillSlots.value.find(slot => slot.id === skillId);
}

// Get skill position
function getSkillPosition(skill: any) {
  if (!skill) return { x: 0, y: 0 };
  return { x: skill.x || 0, y: skill.y || 0 };
}

// Snap to grid
function snapToGrid(value: number): number {
  if (!gridEnabled.value) return value;
  return Math.round(value / gridSize.value) * gridSize.value;
}

// Mouse down on skill - start dragging
function onSkillMouseDown(event: MouseEvent, skill: any) {
  // Don't allow dragging core skills
  if (skill.isCore) return;

  event.preventDefault();
  draggedSkillIndex.value = skill.localIndex;

  if (!skill || !svgContainer.value) return;

  const rect = svgContainer.value.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  dragOffsetX.value = mouseX - (skill.x || 0);
  dragOffsetY.value = mouseY - (skill.y || 0);
}

// Mouse move - update dragged skill position
function onMouseMove(event: MouseEvent) {
  if (draggedSkillIndex.value === null || !svgContainer.value) return;

  const rect = svgContainer.value.getBoundingClientRect();
  const mouseX = event.clientX - rect.left;
  const mouseY = event.clientY - rect.top;

  const skill = localItem.value.skills?.[draggedSkillIndex.value];
  if (!skill) return;

  let newX = mouseX - dragOffsetX.value;
  let newY = mouseY - dragOffsetY.value;

  // Snap to grid if enabled
  newX = snapToGrid(newX);
  newY = snapToGrid(newY);

  // Clamp to canvas bounds
  const skillSlot = getSkillSlot(skill.skill_id);
  const size = skillSlot?.size || DEFAULT_SKILL_SIZE;
  newX = Math.max(0, Math.min(canvasWidth.value - size, newX));
  newY = Math.max(0, Math.min(canvasHeight.value - size, newY));

  skill.x = newX;
  skill.y = newY;
}

// Mouse up - stop dragging
function onMouseUp() {
  draggedSkillIndex.value = null;
}

// Get all parent-child arrow connections
const arrowConnections = computed(() => {
  const connections: Array<{ path: string; style: string }> = [];

  if (!allSkills.value) return connections;

  allSkills.value.forEach((skill: any) => {
    if (!skill.parent_skills || skill.parent_skills.length === 0) return;

    const childSlot = getSkillSlot(skill.skill);
    const childSize = childSlot?.size || DEFAULT_SKILL_SIZE;
    const childPos = getSkillPosition(skill);

    skill.parent_skills.forEach((parentSlotId: string) => {
      // Find parent skill by unique slot ID (not skill field)
      const parentSkill = allSkills.value.find((s: any) => s.id === parentSlotId);
      if (!parentSkill) return;

      const parentSlot = getSkillSlot(parentSkill.skill);
      const parentSize = parentSlot?.size || DEFAULT_SKILL_SIZE;
      const parentShape = (parentSlot?.shape || 'square') as ShapeType;
      const parentPos = getSkillPosition(parentSkill);

      const childShape = (childSlot?.shape || 'square') as ShapeType;

      const path = getArrowPath(
        parentPos.x,
        parentPos.y,
        parentSize,
        parentShape,
        childPos.x,
        childPos.y,
        childSize,
        childShape,
        arrowStyle.value
      );

      connections.push({ path, style: arrowStyle.value });
    });
  });

  return connections;
});
</script>

<template>
  <div class="skill-tree-editor">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="toolbar-item canvas-size-inputs">
        <span class="size-label">Canvas Size:</span>
        <InputNumber v-model="localItem.width" inputId="canvasWidth" :min="100" :max="5000" :step="50"
          class="canvas-dimension-input" placeholder="Width" />
        <span class="dimension-separator">×</span>
        <InputNumber v-model="localItem.height" inputId="canvasHeight" :min="100" :max="5000" :step="50"
          class="canvas-dimension-input" placeholder="Height" />
      </div>
      <div class="toolbar-item">
        <Checkbox v-model="gridEnabled" inputId="gridEnabled" binary />
        <label for="gridEnabled" class="ml-2">Grid Snap</label>
      </div>
      <div class="toolbar-item">
        <label for="gridSize" class="mr-2">Grid Size:</label>
        <InputNumber v-model="gridSize" inputId="gridSize" :min="5" :max="100" :step="5" :disabled="!gridEnabled"
          class="grid-size-input" />
      </div>
      <div class="toolbar-item" v-if="backgroundAsset">
        <Checkbox v-model="showBackgroundImage" inputId="showBackground" binary />
        <label for="showBackground" class="ml-2">Show Background</label>
      </div>
    </div>

    <!-- Canvas -->
    <div class="canvas-container">
      <!-- Background image (positioned absolutely behind SVG) -->
      <BackgroundAsset v-if="showBackgroundImage && backgroundAsset" :asset="backgroundAsset" class="skill-tree-background" />

      <svg ref="svgContainer" :width="canvasWidth" :height="canvasHeight" class="skill-tree-canvas"
        @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
        <!-- Grid background -->
        <defs>
          <pattern v-if="gridEnabled" id="grid" :width="gridSize" :height="gridSize" patternUnits="userSpaceOnUse">
            <path :d="`M ${gridSize} 0 L 0 0 0 ${gridSize}`" fill="none" stroke="#e0e0e0" stroke-width="0.5" />
          </pattern>
        </defs>
        <rect v-if="gridEnabled" width="100%" height="100%" fill="url(#grid)" />

        <!-- Canvas boundary border -->
        <rect :width="canvasWidth" :height="canvasHeight" fill="none" stroke="#999" stroke-width="2" stroke-dasharray="10,5" class="canvas-boundary" />

        <!-- Canvas size label (bottom-right corner) -->
        <text :x="canvasWidth - 10" :y="canvasHeight - 10" text-anchor="end" class="canvas-size-label" fill="#666" font-size="12" opacity="0.7">
          {{ canvasWidth }} × {{ canvasHeight }}
        </text>

        <!-- Arrows (render behind skills but above background) -->
        <g class="arrows">
          <path v-for="(connection, index) in arrowConnections" :key="`arrow-${index}`" :d="connection.path" fill="none"
            stroke="#000000" stroke-width="2" :stroke-dasharray="connection.style === 'dashed' ? '5,5' : 'none'"
            marker-end="url(#arrowhead)" />
        </g>

        <!-- Arrowhead marker -->
        <defs>
          <marker id="arrowhead" :markerWidth="ARROWHEAD_SIZE * 1.5" :markerHeight="ARROWHEAD_SIZE"
            :refX="ARROWHEAD_SIZE * 1.5" :refY="ARROWHEAD_SIZE / 2" orient="auto" markerUnits="strokeWidth">
            <path :d="getArrowheadPath(ARROWHEAD_SIZE)" fill="#000000" />
          </marker>

          <!-- Clip paths for each skill slot shape -->
          <clipPath v-for="(skill, index) in allSkills" :key="`clip-${index}`" :id="`clip-skill-${index}`">
            <template v-if="getSkillSlot(skill.skill)?.shape === 'circle'">
              <circle :r="(getSkillSlot(skill.skill)?.size || DEFAULT_SKILL_SIZE) / 2"
                :cx="(getSkillSlot(skill.skill)?.size || DEFAULT_SKILL_SIZE) / 2"
                :cy="(getSkillSlot(skill.skill)?.size || DEFAULT_SKILL_SIZE) / 2" />
            </template>
            <template v-else>
              <path
                :d="getShapePath((getSkillSlot(skill.skill)?.shape || 'square') as ShapeType, getSkillSlot(skill.skill)?.size || DEFAULT_SKILL_SIZE)" />
            </template>
          </clipPath>
        </defs>

        <!-- Skills -->
        <g v-for="(skill, index) in allSkills" :key="skill.id || `skill-${index}`" class="skill-slot"
          :class="{ dragging: draggedSkillIndex === skill.localIndex && !skill.isCore, 'core-skill': skill.isCore }" :transform="`translate(${skill.x || 0}, ${skill.y || 0})`"
          @mousedown="(e) => onSkillMouseDown(e, skill)">
          <template v-if="getSkillSlot(skill.skill)">
            <!-- Skill image (clipped to shape and fills the full area) -->
            <image v-if="getSkillSlot(skill.skill)?.image" :href="getSkillSlot(skill.skill)?.image" :x="0" :y="0"
              :width="getSkillSlot(skill.skill)?.size || DEFAULT_SKILL_SIZE"
              :height="getSkillSlot(skill.skill)?.size || DEFAULT_SKILL_SIZE" preserveAspectRatio="xMidYMid slice"
              :clip-path="`url(#clip-skill-${index})`" />

            <!-- Skill slot ID text (unique identifier for this slot) -->
            <text :x="(getSkillSlot(skill.skill)?.size || DEFAULT_SKILL_SIZE) / 2"
              :y="(getSkillSlot(skill.skill)?.size || DEFAULT_SKILL_SIZE) / 2" text-anchor="middle"
              dominant-baseline="middle" fill="#000000" font-size="10" font-weight="bold" pointer-events="none"
              class="skill-id-text" stroke="#ffffff" stroke-width="3" paint-order="stroke">
              {{ skill.id }}
            </text>
          </template>
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.skill-tree-editor {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
}

.toolbar {
  display: flex;
  gap: 1.5rem;
  align-items: center;
  padding: 0.75rem;
  background-color: #f5f5f5;
  border-radius: 4px;
}

.toolbar-item {
  display: flex;
  align-items: center;
}

.canvas-size-inputs {
  gap: 0.5rem;
}

.size-label {
  color: #666;
  font-size: 0.9rem;
  margin-right: 0.3rem;
  white-space: nowrap;
}

.canvas-dimension-input {
  width: 90px;
}

.dimension-separator {
  color: #999;
  font-weight: 600;
  padding: 0 0.3rem;
}

.grid-size-input {
  width: 80px;
}

.canvas-container {
  flex: 1;
  overflow: auto;
  border: 1px solid #ccc;
  background-color: #fafafa;
  max-height: 65vh;
  min-height: 400px;
  position: relative;
}

.skill-tree-canvas {
  display: block;
  background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%);
  cursor: default;
  min-width: 100%;
  min-height: 100%;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.05);
}

.skill-slot {
  cursor: grab;
  transition: opacity 0.1s;
}

.skill-slot:hover {
  opacity: 0.9;
}

.skill-slot.dragging {
  cursor: grabbing;
  opacity: 0.7;
}

.arrows path {
  pointer-events: none;
}

.skill-tree-background {
  position: absolute;
  top: 0;
  left: 0;
  width: v-bind(canvasWidth + 'px');
  height: v-bind(canvasHeight + 'px');
  opacity: 0.5;
  pointer-events: none;
  z-index: 0;
}

/* Core skills (non-editable, greyed out) */
.skill-slot.core-skill {
  cursor: not-allowed;
  opacity: 0.5;
}

.skill-slot.core-skill:hover {
  opacity: 0.5;
}

.skill-slot.core-skill image {
  filter: grayscale(50%);
}

.skill-slot.core-skill .skill-id-text {
  fill: #9E9E9E;
  stroke: #f0f0f0;
}

.canvas-boundary {
  pointer-events: none;
}

.canvas-size-label {
  pointer-events: none;
  user-select: none;
}

.canvas-size-label {
  font-family: var(--font-family-mono);
}
</style>
