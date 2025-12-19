<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../game';
import { DungeonEncounter } from '../core/dungeon/dungeonEncounter';

const game = Game.getInstance();

// Get all encounters for current room including description
const allEncounters = computed(() => {
  const currentRoom = game.dungeonSystem.currentRoom.value;
  const currentDungeon = game.dungeonSystem.currentDungeon.value;

  if (!currentRoom || !currentDungeon) {
    return [];
  }

  const encounters: DungeonEncounter[] = [];

  // Add description encounter first (if visible)
  if (currentRoom.descriptionEncounter?.getVisibilityState()) {
    encounters.push(currentRoom.descriptionEncounter);
  }

  // Add all other visible encounters in the room
  for (const encounter of currentDungeon.encounters.values()) {
    if (encounter.getVisibilityState() &&
      encounter.isHere(currentRoom) &&
      encounter !== currentRoom.descriptionEncounter &&
      !game.dungeonSystem.currentSceneId.value) {
      encounters.push(encounter);
    }
  }

  return encounters;
});

function getEncounterContent(encounter: DungeonEncounter): string {
  return game.logicSystem.resolveString(encounter.rawContent).output;
}

function getEncounterVisibleChoices(encounter: DungeonEncounter) {
  return encounter.choices.filter(choice => choice?.isVisible && choice.name);
}

function handleEncounterChoice(choice: any) {
  if (game.coreSystem.getState('disable_ui')) {
    return;
  }
  choice.do();
}

function navigateToNeighbor(neighborRoom: any) {
  if (game.coreSystem.getState('disable_ui')) {
    return;
  }
  game.dungeonSystem.enterRoom(neighborRoom.room.id);
}
</script>

<template>
  <div class="text-dungeon-layout">
    <!-- Direction arrows for room navigation -->
    <div class="direction-arrows">
      <template v-for="neighbor in game.dungeonSystem.currentRoom.value?.neighborsWithDirection" :key="neighbor.angle">
        <div class="direction-arrow" :style="{ '--rotation': neighbor.angle + 'deg' }"
          @click.stop="navigateToNeighbor(neighbor)">
        </div>
      </template>
    </div>

    <div class="text-dungeon-content">
      <!-- All encounters (including description) with their content and choices -->
      <div v-for="(encounter, index) in allEncounters" :key="encounter.id" class="text-dungeon-encounter"
        :class="{ 'first-encounter': index === 0 }">
        <div class="text-dungeon-encounter-content" v-html="getEncounterContent(encounter)"></div>
        <div v-if="getEncounterVisibleChoices(encounter).length > 0" class="text-dungeon-encounter-choices">
          <div v-for="choice in getEncounterVisibleChoices(encounter)" :key="choice.id" class="text-dungeon-choice"
            :class="{ unavailable: !choice.isAvailable }" @click.stop="handleEncounterChoice(choice)">
            {{ choice.name }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.text-dungeon-layout {
  display: flex;
  gap: 15px;
  align-items: flex-start;
}

.text-dungeon-content {
  flex: 1;
}

.text-dungeon-encounter {
  margin-top: 1.5em;
  padding-top: 1em;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

.text-dungeon-encounter.first-encounter {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.text-dungeon-encounter-content {
  line-height: 1.4em;
}

.text-dungeon-encounter-choices {
  margin-top: 0.75em;
  padding-left: 1em;
}

.text-dungeon-choice {
  cursor: pointer;
  color: #79a4e6;
  font-weight: bold;
  line-height: 1.3em;
  padding: 0.25em 0;
}

.text-dungeon-choice:hover {
  color: #2584ea;
}

.text-dungeon-choice:hover::before {
  content: "➺";
}

.text-dungeon-choice.unavailable {
  color: red;
  pointer-events: none;
}
</style>
