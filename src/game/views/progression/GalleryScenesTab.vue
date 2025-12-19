<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Game } from '../../game';
import type { ReplaySceneObject } from '../../systems/dungeonSystem';
import CustomComponentContainer from '../CustomComponentContainer.vue';

const game = Game.getInstance();

// Update unlock status for all scenes based on current dungeon data
const data = game.dungeonSystem.getReplaySceneObject();

// Mutate unlock status directly
for (const dungeon of data.dungeons || []) {
  const dungeonData = game.dungeonSystem.dungeonDatas.value.get(dungeon.id);
  for (const scene of dungeon.scenes || []) {
    scene.unlocked = dungeonData?.isEventVisited(scene.id) ?? false;
  }
}


// Check if dungeon is discovered (has any visited events)
const isDungeonDiscovered = (dungeonId: string): boolean => {
  const dungeonData = game.dungeonSystem.dungeonDatas.value.get(dungeonId);
  if (!dungeonData) return false;
  return dungeonData.visitedEvents.size > 0;
};

// Get display name for dungeon
const getDungeonDisplayName = (dungeon: { id: string; name: string }): string => {
  return isDungeonDiscovered(dungeon.id) ? dungeon.name : '???';
};

// Get display name for scene
const getSceneDisplayName = (scene: { name: string; unlocked: boolean }): string => {
  return scene.unlocked ? scene.name : '???';
};

// Exit replay mode by loading the saved game
const exitReplayMode = () => {
  game.loadGame('__replay_scene__');
};

</script>

<template>
  <div class="scenes-tab-container">
    <!-- Exit Replay Mode button -->
    <div v-if="game.getState('replay_mode')" class="replay-mode-bar">
      <button class="exit-replay-btn" @click="exitReplayMode">
        <i class="pi pi-sign-out"></i>
        Exit Replay Mode
      </button>
    </div>

    <CustomComponentContainer :slot="'replay-custom-block'" v-if="game.getState('replay_mode')" />

    <div v-if="!data?.dungeons?.length" class="empty-state">
      No scenes available in the gallery
    </div>

    <div v-else class="scenes-columns">
      <div v-for="dungeon in data.dungeons" :key="dungeon.id" class="dungeon-group">
        <div class="dungeon-header">
          {{ getDungeonDisplayName(dungeon) }}
        </div>
        <div class="scenes-list">
          <div v-for="scene in dungeon.scenes" :key="scene.id" class="scene-item"
            @click="game.dungeonSystem.replayScene(scene.id, dungeon.id, scene.unlocked)"
            :class="{ 'locked': !scene.unlocked }">
            {{ getSceneDisplayName(scene) }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scenes-tab-container {
  height: 100%;
  overflow-y: auto;
}

.replay-mode-bar {
  margin-bottom: 16px;
  border-radius: 8px;
  display: flex;
}

.exit-replay-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: rgb(249 173 32);
  border: 1px solid rgb(255, 166, 0);
  border-radius: 6px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.exit-replay-btn:hover {
  background: rgb(255, 172, 17);
}

.exit-replay-btn i {
  font-size: 16px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
}

.scenes-columns {
  column-count: 4;
  column-gap: 20px;
  max-width: 1400px;
}

.dungeon-group {
  break-inside: avoid;
  margin-bottom: 20px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
}

.dungeon-header {
  background: rgba(0, 0, 0, 0.4);
  padding: 12px 16px;
  font-weight: 600;
  color: white;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.scenes-list {
  padding: 8px;
}

.scene-item {
  padding: 8px 12px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.05);
  margin-bottom: 4px;
  color: white;
}

.scene-item:last-child {
  margin-bottom: 0;
}

.scene-item:hover {
  background: rgba(255, 255, 255, 0.15);
}

.scene-item.locked {
  font-style: italic;
  opacity: 0.6;
  cursor: default;
}

.scene-item.locked:hover {
  background: rgba(255, 255, 255, 0.05);
}

/* Scrollbar Styling */
.scenes-tab-container::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.scenes-tab-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.scenes-tab-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.scenes-tab-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Responsive columns */
@media (max-width: 1500px) {
  .scenes-columns {
    column-count: 3;
  }
}

@media (max-width: 1200px) {
  .scenes-columns {
    column-count: 2;
  }
}

@media (max-width: 900px) {
  .scenes-columns {
    column-count: 1;
  }
}
</style>
