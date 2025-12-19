<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, PropType } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { Global, ARROWHEAD_SIZE } from '../../../global/global';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';
import { getShapePath, getShapeEdgePoint, getArrowPath, ShapeType, getArrowheadPath } from '../../../utility/shapes';
import BackgroundAsset from '../BackgroundAsset.vue';
import StatusStatsDisplay from './StatusStatsDisplay.vue';
import SkillSlot from './SkillSlot.vue';
import { isSkillVisible, isSkillDisabledByParams } from './useSkillParams';
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
const global = Global.getInstance();

// State
const activeTreeId = ref<string | null>(null);
const hoveredSkill = ref<{ treeId: string; skillId: string; slotId: string; skillSlot: any } | null>(null);

// Refs
const canvasWrapperRef = ref<HTMLElement | null>(null);
const referenceRef = ref<HTMLElement | null>(null);
const floatingRef = ref<HTMLElement | null>(null);

// Panning state
const isPanning = ref(false);
const panStart = ref({ x: 0, y: 0 });
const scrollStart = ref({ left: 0, top: 0 });

// Popup hover delay
let hidePopupTimeout: number | null = null;

// Tree selector state
const isTreeSelectorCollapsed = ref(false);
const hoveredTree = ref<SkillTreeObject | null>(null);
const treeReferenceRef = ref<HTMLElement | null>(null);
const treeFloatingRef = ref<HTMLElement | null>(null);
let hideTreePopupTimeout: number | null = null;

// Setup floating UI for skill popup
const { floatingStyles } = useFloating(referenceRef, floatingRef, {
  placement: 'right-start',
  strategy: 'fixed',
  middleware: [
    offset(-4),
    flip({ padding: 8 }),
    shift({ padding: 8 })
  ],
  whileElementsMounted: autoUpdate
});

// Setup floating UI for tree description popup
const { floatingStyles: treeFloatingStyles } = useFloating(treeReferenceRef, treeFloatingRef, {
  placement: 'right-start',
  strategy: 'fixed',
  middleware: [
    offset(8),
    flip({ padding: 8 }),
    shift({ padding: 8 })
  ],
  whileElementsMounted: autoUpdate
});

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

// Check if skill is learnable (at least one parent has level >= 1 and is visible)
function isSkillLearnable(skill: any): boolean {
  // Check if disabled by params
  if (isSkillDisabledByParams(skill)) {
    return false;
  }

  // If no parents, it's a root skill and always learnable
  if (!skill.parent_skills || skill.parent_skills.length === 0) {
    return true;
  }

  // Check if at least one parent slot is learned AND visible
  return skill.parent_skills.some((parentSlotId: string) => {
    // Find the parent skill
    const parentSkill = activeTree.value?.skills?.find((s: any) => s.id === parentSlotId);
    if (!parentSkill) return false;

    // Parent must be visible (based on its 'if' condition)
    if (!isSkillVisible(parentSkill)) {
      return false;
    }

    // Parent must be learned
    return getLearnedSkillLevelBySlotId(parentSlotId) >= 1;
  });
}

// Check if character can afford the skill
function canAffordSkill(skill: any): boolean {
  if (!skill.price || Object.keys(skill.price).length === 0) {
    return true;
  }

  const inventory = activeTree.value?.is_private
    ? props.character.getPrivateInventory()
    : props.character.getPartyInventory();

  if (!inventory) return false;

  return inventory.canAffordPrice(skill.price);
}

// Check if skill can be learned (learnable, affordable, not maxed)
function canLearnSkill(skill: any): boolean {
  const currentLevel = getLearnedSkillLevelBySlotId(skill.id);
  const maxLevel = skill.max_upgrade_level || 1;

  return isSkillLearnable(skill) && canAffordSkill(skill) && currentLevel < maxLevel;
}

// Learn a skill
function learnSkillHandler(skill: any) {
  if (!activeTreeId.value) return;
  if (!canLearnSkill(skill)) return;

  const inventory = activeTree.value?.is_private
    ? props.character.getPrivateInventory()
    : props.character.getPartyInventory();

  if (!inventory) {
    global.addNotification('No inventory available');
    return;
  }

  // Deduct currency
  if (skill.price && Object.keys(skill.price).length > 0) {
    const success = inventory.deductCurrency(skill.price);
    if (!success) {
      return; // deductCurrency already shows notification
    }
  }

  // Learn the skill using the unique skill slot id
  props.character.learnSkill(activeTreeId.value, skill.id, 1);

  global.addNotification(`Learned ${getSkillName(skill.skill)}!`);
}

// Check if a skill can be refunded (not the only parent of any learned child skill)
function canRefundSkill(slotId: string): boolean {
  if (!activeTree.value?.skills) return false;

  // Find all child skills that have this slot ID as a parent
  const childSkills = activeTree.value.skills.filter((s: any) =>
    s.parent_skills?.includes(slotId)
  );

  // Check each child skill
  for (const child of childSkills) {
    const childLevel = getLearnedSkillLevelBySlotId(child.id);
    if (childLevel > 0) {
      // Child is learned, check if this is the only learned parent
      const learnedParents = child.parent_skills?.filter((parentSlotId: string) =>
        getLearnedSkillLevelBySlotId(parentSlotId) > 0
      ) || [];

      if (learnedParents.length === 1) {
        // This is the only learned parent, cannot refund
        return false;
      }
    }
  }

  return true;
}

// Refund a skill
function refundSkillHandler(skill: any) {
  if (!activeTreeId.value) return;
  if (!canRefundSkill(skill.id)) return;

  // Unlearn the skill using the unique skill slot id (will handle refund internally)
  props.character.unlearnSkill(activeTreeId.value, skill.id);

  global.addNotification(`Refunded ${getSkillName(skill.skill)}!`);
}

// Get skill slot data
function getSkillSlotData(skillId: string): SkillSlotObject | null {
  return game.characterSystem.skillSlotsMap.get(skillId) || null;
}

// Get skill name
function getSkillName(skillId: string): string {
  const skillData = getSkillSlotData(skillId);
  return skillData?.name || skillId;
}

// Get skill shape
function getSkillShape(skillId: string | undefined): ShapeType {
  if (!skillId) return 'circle';
  const skillData = getSkillSlotData(skillId);
  return (skillData?.shape as ShapeType) || 'circle';
}

// Get skill size
function getSkillSize(skillId: string | undefined): number {
  if (!skillId) return 50;
  const skillData = getSkillSlotData(skillId);
  return skillData?.size || 50;
}

// Get skill image
function getSkillImage(skillId: string | undefined): string | null {
  if (!skillId) return null;
  const skillData = getSkillSlotData(skillId);
  return skillData?.image || null;
}

// Get formatted price for a skill with currency images and available amounts
function getFormattedPrice(skill: any) {
  if (!skill.price || Object.keys(skill.price).length === 0) {
    return [];
  }

  const inventory = activeTree.value?.is_private
    ? props.character.getPrivateInventory()
    : props.character.getPartyInventory();

  return Object.entries(skill.price).map(([currencyId, amount]) => {
    const template = game.itemSystem.itemTemplatesMap.get(currencyId);
    const availableAmount = inventory?.getCurrencyAmount(currencyId) || 0;

    return {
      id: currencyId,
      image: (template?.traits as any)?.image || '',
      price: amount,
      available: availableAmount
    };
  });
}

// Get formatted refund values for a skill (price × skill_level × refund_factor, rounded up)
function getFormattedRefund(skill: any) {
  const refundFactor = activeTree.value?.refund_factor || 0;
  if (refundFactor === 0 || !skill.price || Object.keys(skill.price).length === 0) {
    return [];
  }

  const skillLevel = getLearnedSkillLevelBySlotId(skill.id);
  if (skillLevel === 0) {
    return [];
  }

  return Object.entries(skill.price).map(([currencyId, amount]) => {
    const template = game.itemSystem.itemTemplatesMap.get(currencyId);
    const refundAmount = Math.ceil((amount as number) * skillLevel * refundFactor);

    return {
      id: currencyId,
      image: (template?.traits as any)?.image || '',
      amount: refundAmount
    };
  });
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

// Mouse handlers for skill hover
function handleSkillMouseEnter(event: MouseEvent, skill: any) {
  if (!activeTreeId.value) return;

  // Clear any pending hide timeout
  if (hidePopupTimeout !== null) {
    clearTimeout(hidePopupTimeout);
    hidePopupTimeout = null;
  }

  referenceRef.value = event.currentTarget as HTMLElement;
  hoveredSkill.value = {
    treeId: activeTreeId.value,
    skillId: skill.skill,
    slotId: skill.id,
    skillSlot: skill
  };
}

function handleSkillMouseLeave() {
  // Delay hiding to allow mouse to move to popup
  hidePopupTimeout = window.setTimeout(() => {
    hoveredSkill.value = null;
    referenceRef.value = null;
  }, 100);
}

function handlePopupMouseEnter() {
  // Clear hide timeout when mouse enters popup
  if (hidePopupTimeout !== null) {
    clearTimeout(hidePopupTimeout);
    hidePopupTimeout = null;
  }
}

function handlePopupMouseLeave() {
  // Hide popup when mouse leaves popup
  hoveredSkill.value = null;
  referenceRef.value = null;
}

// Tree hover handlers
function handleTreeMouseEnter(event: MouseEvent, tree: SkillTreeObject) {
  // Clear any pending hide timeout
  if (hideTreePopupTimeout !== null) {
    clearTimeout(hideTreePopupTimeout);
    hideTreePopupTimeout = null;
  }

  treeReferenceRef.value = event.currentTarget as HTMLElement;
  hoveredTree.value = tree;
}

function handleTreeMouseLeave() {
  // Delay hiding to allow mouse to move to popup
  hideTreePopupTimeout = window.setTimeout(() => {
    hoveredTree.value = null;
    treeReferenceRef.value = null;
  }, 100);
}

function handleTreePopupMouseEnter() {
  // Clear hide timeout when mouse enters popup
  if (hideTreePopupTimeout !== null) {
    clearTimeout(hideTreePopupTimeout);
    hideTreePopupTimeout = null;
  }
}

function handleTreePopupMouseLeave() {
  // Hide popup when mouse leaves popup
  hoveredTree.value = null;
  treeReferenceRef.value = null;
}

// Toggle tree selector collapse
function toggleTreeSelector() {
  isTreeSelectorCollapsed.value = !isTreeSelectorCollapsed.value;
}

// Get skill slot data for popup
const popupSkillData = computed(() => {
  if (!hoveredSkill.value) return null;
  return getSkillSlotData(hoveredSkill.value.skillId);
});

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
          @mouseenter="(e) => handleTreeMouseEnter(e, tree)" @mouseleave="handleTreeMouseLeave">
          {{ tree.name || tree.id }}
        </div>
      </div>
    </div>

    <!-- Main Canvas Wrapper with Background -->
    <div v-if="activeTree" ref="canvasWrapperRef" class="skill-tree-canvas-wrapper">
      <!-- Background Asset (outside canvas) -->
      <BackgroundAsset v-if="backgroundAsset" :asset="backgroundAsset" class="skill-tree-background" />

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
          :tree-id="activeTreeId!" :all-skills="activeTree.skills || []" @mouseenter="handleSkillMouseEnter"
          @mouseleave="handleSkillMouseLeave" />
      </svg>
    </div>

    <!-- No Trees Message -->
    <div v-else class="no-trees-message">
      <p>No skill trees available for this character.</p>
    </div>

    <!-- Floating Popup -->
    <div v-if="hoveredSkill && popupSkillData" ref="floatingRef" :style="floatingStyles" class="skill-popup"
      @mouseenter="handlePopupMouseEnter" @mouseleave="handlePopupMouseLeave">
      <div class="popup-header">
        <img v-if="popupSkillData.image" :src="popupSkillData.image" class="popup-icon" alt="Skill Icon" />
        <h3>{{ popupSkillData.name || hoveredSkill.skillId }}</h3>
      </div>

      <div v-if="popupSkillData.description" class="popup-description" v-html="popupSkillData.description"></div>

      <!-- Current Level -->
      <div class="popup-level">
        <span>Level: {{ getLearnedSkillLevelBySlotId(hoveredSkill.slotId) }} / {{
          hoveredSkill.skillSlot.max_upgrade_level
          || 1
          }}</span>
      </div>

      <!-- Stats (from status) -->
      <div v-if="popupSkillData.status?.stats" class="popup-stats">
        <StatusStatsDisplay :stats="popupSkillData.status.stats"
          :multiplier="getLearnedSkillLevelBySlotId(hoveredSkill.slotId) || undefined"
          :isActive="getLearnedSkillLevelBySlotId(hoveredSkill.slotId) > 0" />
      </div>

      <!-- Currency Price Display (only show if not maxed) -->
      <div
        v-if="getLearnedSkillLevelBySlotId(hoveredSkill.slotId) < (hoveredSkill.skillSlot.max_upgrade_level || 1) && getFormattedPrice(hoveredSkill.skillSlot).length > 0"
        class="popup-currency">
        <div v-for="currency in getFormattedPrice(hoveredSkill.skillSlot)" :key="currency.id" class="currency-item">
          <img v-if="currency.image" :src="currency.image" class="currency-icon" />
          <span class="currency-price">{{ currency.price }}</span>
          <span class="currency-separator">/</span>
          <span class="currency-available">{{ currency.available }}</span>
        </div>
      </div>

      <!-- Learn Button -->
      <button v-if="getLearnedSkillLevelBySlotId(hoveredSkill.slotId) < (hoveredSkill.skillSlot.max_upgrade_level || 1)"
        :disabled="!canLearnSkill(hoveredSkill.skillSlot)"
        :class="['learn-button', { disabled: !canLearnSkill(hoveredSkill.skillSlot) }]"
        @click="learnSkillHandler(hoveredSkill.skillSlot)">
        {{ canLearnSkill(hoveredSkill.skillSlot) ? 'Learn' : isSkillLearnable(hoveredSkill.skillSlot) ? 'Cannot Afford'
          :
          'Locked' }}
      </button>

      <!-- Refund Currency Display -->
      <div v-if="getFormattedRefund(hoveredSkill.skillSlot).length > 0" class="popup-refund">
        <div v-for="currency in getFormattedRefund(hoveredSkill.skillSlot)" :key="currency.id" class="refund-item">
          <img v-if="currency.image" :src="currency.image" class="currency-icon" />
          <span class="refund-amount">{{ currency.amount }}</span>
        </div>
      </div>

      <!-- Refund Button -->
      <button v-if="(activeTree?.refund_factor || 0) > 0 && getLearnedSkillLevelBySlotId(hoveredSkill.slotId) > 0"
        :disabled="!canRefundSkill(hoveredSkill.slotId)"
        :class="['refund-button', { disabled: !canRefundSkill(hoveredSkill.slotId) }]"
        @click="refundSkillHandler(hoveredSkill.skillSlot)">
        {{ canRefundSkill(hoveredSkill.slotId) ? 'Refund' : 'Cannot Refund' }}
      </button>
    </div>

    <!-- Tree Description Popup -->
    <div v-if="hoveredTree && hoveredTree.description" ref="treeFloatingRef" :style="treeFloatingStyles"
      class="tree-popup" @mouseenter="handleTreePopupMouseEnter" @mouseleave="handleTreePopupMouseLeave">
      <div class="tree-popup-header">
        <h3>{{ hoveredTree.name || hoveredTree.id }}</h3>
      </div>
      <div class="tree-popup-description" v-html="hoveredTree.description"></div>
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

/* Floating Popup */
.skill-popup {
  position: fixed;
  z-index: 9999;
  background-color: rgba(26, 26, 26, 0.95);
  border: 1px solid #42b983;
  border-radius: 8px;
  padding: 16px;
  max-width: 300px;
  color: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
}

.popup-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #42b983;
}

.popup-icon {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  object-fit: cover;
}

.popup-header h3 {
  margin: 0;
  font-size: 16px;
  color: #42b983;
}

.popup-description {
  font-size: 14px;
  color: #ccc;
  margin-bottom: 12px;
  line-height: 1.4;
}

.popup-level {
  font-size: 13px;
  color: #42b983;
  margin-bottom: 12px;
  font-weight: bold;
}

.popup-stats,
/* Popup Currency Display */
.popup-currency {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.currency-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(66, 185, 131, 0.4);
  border-radius: 4px;
}

.currency-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
}

.currency-price {
  font-size: 14px;
  font-weight: bold;
  color: #42b983;
}

.currency-separator {
  font-size: 14px;
  color: #666;
  margin: 0 2px;
}

.currency-available {
  font-size: 14px;
  font-weight: bold;
  color: #ccc;
}

.learn-button {
  width: 100%;
  padding: 10px;
  background-color: #42b983;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.learn-button:hover:not(.disabled) {
  background-color: #35a372;
}

.learn-button.disabled {
  background-color: #555;
  color: #888;
  cursor: not-allowed;
}

/* Popup Refund Display */
.popup-refund {
  margin-top: 12px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.refund-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background-color: rgba(231, 76, 60, 0.1);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 4px;
}

.refund-amount {
  font-size: 14px;
  font-weight: bold;
  color: #e74c3c;
}

.refund-button {
  width: 100%;
  padding: 10px;
  background-color: #e74c3c;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 8px;
}

.refund-button:hover:not(.disabled) {
  background-color: #c0392b;
}

.refund-button.disabled {
  background-color: #555;
  color: #888;
  cursor: not-allowed;
}

/* Tree Description Popup */
.tree-popup {
  position: fixed;
  z-index: 10000;
  background: linear-gradient(135deg, rgba(30, 30, 45, 0.98) 0%, rgba(20, 20, 35, 0.98) 100%);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(100, 150, 255, 0.3);
  border-radius: 10px;
  padding: 18px;
  max-width: 340px;
  color: #fff;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.7),
    0 0 0 1px rgba(255, 255, 255, 0.05) inset,
    0 0 20px rgba(100, 150, 255, 0.15);
  pointer-events: auto;
}

.tree-popup-header {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(100, 150, 255, 0.25);
}

.tree-popup-header h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: rgba(120, 170, 255, 1);
  text-shadow: 0 0 15px rgba(100, 150, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3);
  letter-spacing: 0.3px;
}

.tree-popup-description {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.6;
}
</style>
