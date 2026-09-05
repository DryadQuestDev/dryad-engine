<script setup lang="ts">
import { computed, ref } from 'vue';
import { Game } from '../game';
import { DungeonEncounter } from '../core/dungeon/dungeonEncounter';
import TextMap from './TextMap.vue';

const game = Game.getInstance();

const isFullMapOpen = ref(false);

function openFullMap() {
  isFullMapOpen.value = true;
}

function closeFullMap() {
  isFullMapOpen.value = false;
}

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

// Text only. This runs on every render of every listed encounter, so it must never execute
// their inline actions — enterRoom fires those once for the whole room instead.
function getEncounterContent(encounter: DungeonEncounter): string {
  return game.logicSystem.resolveString(encounter.rawContent, true).output;
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
    <div class="text-dungeon-content">
      <!-- All encounters (including description) with their content and choices -->
      <div v-for="(encounter, index) in allEncounters" :key="encounter.id" class="text-dungeon-encounter"
        :class="{ 'first-encounter': index === 0 }">
        <!-- Direction arrows: floated left inside description encounter so text wraps around -->
        <div v-if="encounter === game.dungeonSystem.currentRoom.value?.descriptionEncounter"
          class="direction-arrows embedded-direction-arrows">
          <template v-for="neighbor in game.dungeonSystem.currentRoom.value?.neighborsWithDirection"
            :key="neighbor.angle">
            <div class="direction-arrow" :style="{ '--rotation': neighbor.angle + 'deg' }"
              @click.stop="navigateToNeighbor(neighbor)">
            </div>
          </template>
        </div>
        <!-- Mini map floated right inside the description encounter so its text + choices wrap around it -->
        <TextMap v-if="encounter === game.dungeonSystem.currentRoom.value?.descriptionEncounter" mode="mini"
          class="embedded-mini-map" @openFullMap="openFullMap" @closeFullMap="closeFullMap" />
        <div v-if="encounter.discoverSpec" class="encounter-discover-cue">{{ encounter.getDiscoverCue() }}</div>
        <div class="text-dungeon-encounter-content"
          v-script="{ html: getEncounterContent(encounter), resolver: false }"></div>
        <div v-if="getEncounterVisibleChoices(encounter).length > 0" class="text-dungeon-encounter-choices">
          <div v-for="choice in getEncounterVisibleChoices(encounter)" :key="choice.id" class="text-dungeon-choice"
            :class="{ unavailable: !choice.isAvailable, clue: choice.isClue() }"
            @click.stop="handleEncounterChoice(choice)">
            <span v-script="{ html: (choice.nameComputed as unknown as string) || choice.name, resolver: false }"></span>
          </div>
        </div>
      </div>
    </div>

    <!-- Full map modal -->
    <Teleport to="body">
      <div v-if="isFullMapOpen" class="full-map-overlay" @click.self="closeFullMap">
        <TextMap mode="full" @openFullMap="openFullMap" @closeFullMap="closeFullMap" />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.text-dungeon-layout {
  display: block;
}

.text-dungeon-content {
  width: 100%;
}

.text-dungeon-encounter {
  margin-top: 12px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
}

.text-dungeon-encounter.first-encounter {
  margin-top: 0;
  min-height: 250px;
}

.encounter-discover-cue {
  font-weight: bold;
  text-align: center;
  color: #7ddc8a;
  margin-bottom: 0.4em;
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

/* An untaken {clue: true} hint. Same orange as the map encounter glow. Declared BEFORE
   .unavailable so that a greyed-out choice wins on equal specificity. */
.text-dungeon-choice.clue {
  color: #ff6600;
  text-shadow: 0 0 6px rgba(255, 102, 0, 0.5);
}

.text-dungeon-choice.unavailable {
  color: red;
  pointer-events: none;
}

/* Direction arrows floated left inside the description encounter so prose wraps around them */
.embedded-direction-arrows {
  float: left;
  margin: 0 16px 12px 0;
  shape-outside: margin-box;
}

/* Mini map floated right inside the description encounter so prose wraps around it */
.embedded-mini-map {
  float: right;
  width: 220px;
  margin: 0 0 12px 16px;
  shape-outside: margin-box;
}

/* Full map modal overlay (teleported to body) */
.full-map-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
</style>
