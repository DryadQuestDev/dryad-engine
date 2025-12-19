<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Game } from '../../game';
import CustomComponentContainer from '../CustomComponentContainer.vue';

const game = Game.getInstance();
const dungeonSystem = game.dungeonSystem;
const logicSystem = game.logicSystem;

const COMPONENT_ID = 'quests-tab';

// Selected quest for right panel
const selectedQuestKey = ref<string | null>(null);

// Collapsible goal state
const collapsedGoals = ref<Set<string>>(new Set());

const selectedQuest = computed(() => {
  if (!selectedQuestKey.value) return null;
  return dungeonSystem.quests.value.get(selectedQuestKey.value);
});

// Auto-select first quest when quests become available
watch(() => dungeonSystem.questsByDungeon.value, (questsByDungeon) => {
  // If no quest is selected and there are quests available, select the first one
  if (!selectedQuestKey.value && questsByDungeon.size > 0) {
    const firstDungeonQuests = questsByDungeon.values().next().value;
    if (firstDungeonQuests && firstDungeonQuests.length > 0) {
      const firstQuest = firstDungeonQuests[0];
      selectedQuestKey.value = `${firstQuest.dungeonId}.${firstQuest.id}`;
    }
  }

  // If the currently selected quest no longer exists, clear selection or select first available
  if (selectedQuestKey.value && !dungeonSystem.quests.value.has(selectedQuestKey.value)) {
    if (questsByDungeon.size > 0) {
      const firstDungeonQuests = questsByDungeon.values().next().value;
      if (firstDungeonQuests && firstDungeonQuests.length > 0) {
        const firstQuest = firstDungeonQuests[0];
        selectedQuestKey.value = `${firstQuest.dungeonId}.${firstQuest.id}`;
      }
    } else {
      selectedQuestKey.value = null;
    }
  }
}, { immediate: true });

function toggleShowCompleted() {
  game.coreSystem.setState('is_show_completed_quests', !game.coreSystem.getState<boolean>('is_show_completed_quests'));
}

function selectQuest(dungeonId: string, questId: string) {
  const questKey = `${dungeonId}.${questId}`;
  selectedQuestKey.value = questKey;
}

function toggleGoal(goalId: string) {
  const key = `${selectedQuestKey.value}.${goalId}`;
  if (collapsedGoals.value.has(key)) {
    collapsedGoals.value.delete(key);
  } else {
    collapsedGoals.value.add(key);
  }
  // Trigger reactivity
  collapsedGoals.value = new Set(collapsedGoals.value);
}

function isGoalCollapsed(goalId: string): boolean {
  if (!selectedQuestKey.value) return false;
  return collapsedGoals.value.has(`${selectedQuestKey.value}.${goalId}`);
}

function getLogText(dungeonId: string, questId: string, goalId: string, logId: string): string {
  const line = dungeonSystem.getQuestLine(dungeonId, questId, goalId, logId);
  if (!line) return logId;

  return game.logicSystem.resolveString(line.val).output;
}

function getMainLogs() {
  if (!selectedQuest.value) return [];
  const mainGoal = selectedQuest.value.goals.find(g => g.id === 'main');
  return mainGoal?.logs || [];
}

function getOtherGoals() {
  if (!selectedQuest.value) return [];
  return selectedQuest.value.goals.filter(g => g.id !== 'main');
}

function isQuestCompleted(quest: any): boolean {
  return dungeonSystem.isQuestCompleted(quest);
}

function isGoalCompleted(goalId: string): boolean {
  if (!selectedQuest.value) return false;
  return dungeonSystem.isGoalCompleted(selectedQuest.value, goalId);
}
</script>

<template>
  <div :id="COMPONENT_ID" class="quests-tab">
    <!-- Two column layout -->
    <div class="quest-container">
      <!-- Left Column: Quest List -->
      <div class="quest-list-column">
        <div class="quest-list-header">
          <h2>Quests</h2>
          <label class="toggle-completed-label">
            <input type="checkbox" class="toggle-completed-checkbox"
              :checked="game.coreSystem.getState('is_show_completed_quests')" @change="toggleShowCompleted" />
            <span class="toggle-completed-text">Show Completed</span>
          </label>
        </div>

        <div class="quest-list-content">
          <template v-for="[dungeonId, quests] in dungeonSystem.questsByDungeon.value" :key="dungeonId">
            <div class="dungeon-group">
              <h3 class="dungeon-name">{{ dungeonSystem.getDungeonName(dungeonId) }}</h3>

              <div v-for="quest in quests" :key="quest.id" class="quest-item" :class="{
                selected: selectedQuestKey === `${dungeonId}.${quest.id}`,
                completed: isQuestCompleted(quest)
              }" @click="selectQuest(dungeonId, quest.id)">
                <span class="quest-status-icon"></span>
                <span class="quest-title">{{ dungeonSystem.getQuestTitle(dungeonId, quest.id) }}</span>
              </div>
            </div>
          </template>

          <div v-if="dungeonSystem.questsByDungeon.value.size === 0" class="no-quests">
            No active quests
          </div>
        </div>
      </div>

      <!-- Right Column: Quest Details -->
      <div class="quest-details-column">
        <div v-if="selectedQuest" class="quest-details">
          <h2 class="quest-details-title" :class="{ completed: isQuestCompleted(selectedQuest) }">
            <span v-if="isQuestCompleted(selectedQuest)" class="title-check-icon"></span>
            {{ dungeonSystem.getQuestTitle(selectedQuest.dungeonId, selectedQuest.id) }}
          </h2>

          <!-- Main logs (non-collapsible, shown at top) -->
          <div class="main-logs-section">
            <div v-for="logId in getMainLogs()" :key="logId" class="log-entry main-log"
              v-html="getLogText(selectedQuest.dungeonId, selectedQuest.id, 'main', logId)"></div>
          </div>

          <!-- Other goals (collapsible) -->
          <div class="goals-section">
            <div v-for="goal in getOtherGoals()" :key="goal.id" class="goal-group">
              <div class="goal-header"
                :class="{ completed: isGoalCompleted(goal.id), collapsed: isGoalCollapsed(goal.id) }"
                @click="toggleGoal(goal.id)">
                <span class="collapse-icon"></span>
                <span class="goal-status-icon"></span>
                <span class="goal-title">{{ dungeonSystem.getGoalTitle(selectedQuest.dungeonId, selectedQuest.id,
                  goal.id)
                  }}</span>
              </div>

              <div v-if="!isGoalCollapsed(goal.id)" class="goal-logs">
                <div v-for="logId in goal.logs" :key="logId" class="log-entry"
                  v-html="getLogText(selectedQuest.dungeonId, selectedQuest.id, goal.id, logId)"></div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="no-quest-selected">
          Select a quest to view details
        </div>
      </div>
    </div>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" />
  </div>
</template>

<style scoped>
.quests-tab {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.quest-container {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
  height: 100%;
  overflow: hidden;
}

/* Left Column Styles */
.quest-list-column {
  display: flex;
  flex-direction: column;
  border-right: 2px solid #3a3a3a;
  background-color: #1a1a1a;
  overflow: hidden;
}

.quest-list-header {
  padding: 15px;
  border-bottom: 2px solid #3a3a3a;
  background-color: #252525;
}

.quest-list-header h2 {
  margin: 0 0 10px 0;
  font-size: 1.5rem;
  color: #d4af37;
}

.toggle-completed-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  padding: 8px 12px;
  background-color: #2a2a2a;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.toggle-completed-label:hover {
  background-color: #333;
}

.toggle-completed-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #d4af37;
}

.toggle-completed-text {
  color: #e5e7eb;
  font-size: 0.95rem;
}

.quest-list-content {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.dungeon-group {
  margin-bottom: 20px;
}

.dungeon-name {
  font-size: 1.1rem;
  color: #9ca3af;
  margin: 0 0 8px 0;
  padding: 5px 0;
  border-bottom: 1px solid #374151;
}

.quest-item {
  padding: 10px 12px;
  margin: 4px 0;
  background-color: #2a2a2a;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 0px;
}

.quest-item:hover {
  background-color: #333;
  border-left-color: #d4af37;
}

.quest-item.selected {
  background-color: #3a3a3a;
  border-left-color: #d4af37;
}

.quest-item.completed {
  opacity: 0.5;
}

.quest-item.completed .quest-title {
  color: #6b7280;
}

.quest-status-icon {
  font-size: 1.2rem;
  color: #d4af37;
  min-width: 15px;
}

.quest-status-icon::before {
  content: '•';
}

.quest-item.completed .quest-status-icon::before {
  content: '✓';
}

.quest-title {
  color: #e5e7eb;
  flex: 1;
}

.no-quests {
  padding: 20px;
  text-align: center;
  color: #6b7280;
  font-style: italic;
}

/* Right Column Styles */
.quest-details-column {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #1a1a1a;
  padding: 20px;
}

.quest-details {
  overflow-y: auto;
  flex: 1;
}

.quest-details-title {
  font-size: 1.8rem;
  color: #d4af37;
  margin: 0 0 20px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid #3a3a3a;
  display: flex;
  align-items: center;
  gap: 10px;
}

.quest-details-title.completed {
  color: #9ca3af;
}

.title-check-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background-color: #6ee7b7;
  color: #1a1a1a;
  border-radius: 50%;
  font-size: 1.2rem;
  font-weight: bold;
  flex-shrink: 0;
}

.title-check-icon::before {
  content: '✓';
}

.main-logs-section {
  margin-bottom: 25px;
}

.log-entry {
  padding: 12px 15px;
  margin: 8px 0;
  background-color: #2a2a2a;
  border-left: 3px solid #4b5563;
  color: #d1d5db;
  line-height: 1.6;
}

.log-entry.main-log {
  border-left-color: #d4af37;
  background-color: #2d2520;
  font-weight: 500;
}

.goals-section {
  margin-top: 10px;
}

.goal-group {
  margin-bottom: 15px;
}

.goal-header {
  padding: 10px 12px;
  background-color: #252525;
  border: 1px solid #3a3a3a;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0px;
  transition: all 0.2s;
}

.goal-header:hover {
  background-color: #2a2a2a;
  border-color: #4b5563;
}

.goal-header.completed {
  opacity: 0.8;
}

.goal-header.completed .goal-title {
  text-decoration: line-through;
  color: #888;
}

.collapse-icon {
  color: #9ca3af;
  font-size: 0.8rem;
  min-width: 15px;
}

.collapse-icon::before {
  content: '▼';
}

.goal-header.collapsed .collapse-icon::before {
  content: '▶';
}

.goal-status-icon {
  color: #6ee7b7;
  font-size: 1rem;
  min-width: 15px;
}

.goal-status-icon::before {
  content: '○';
}

.goal-header.completed .goal-status-icon::before {
  content: '✓';
}

.goal-title {
  color: #e5e7eb;
  font-weight: 500;
  flex: 1;
}

.goal-logs {
  padding-left: 20px;
  margin-top: 5px;
}

.no-quest-selected {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6b7280;
  font-size: 1.2rem;
  font-style: italic;
}

/* Scrollbar Styles */
.quest-list-content::-webkit-scrollbar,
.quest-details::-webkit-scrollbar {
  width: 8px;
}

.quest-list-content::-webkit-scrollbar-track,
.quest-details::-webkit-scrollbar-track {
  background: #1a1a1a;
}

.quest-list-content::-webkit-scrollbar-thumb,
.quest-details::-webkit-scrollbar-thumb {
  background: #4b5563;
  border-radius: 4px;
}

.quest-list-content::-webkit-scrollbar-thumb:hover,
.quest-details::-webkit-scrollbar-thumb:hover {
  background: #6b7280;
}
</style>
