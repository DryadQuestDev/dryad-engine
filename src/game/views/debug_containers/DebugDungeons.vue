<script setup lang="ts">
import { Game } from '../../game';
import { ref, computed } from 'vue';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import FloatLabel from 'primevue/floatlabel';
import InputNumber from 'primevue/inputnumber';

const game = Game.getInstance();
const currentDungeonId = game.dungeonSystem.currentDungeonId;
const roomId = ref('');
const newFlagId = ref('');
const newFlagValue = ref<number | null>(null);

const dungeons = computed(() => {
  let dungeonOptions = Array.from(game.dungeonSystem.dungeonLines.keys()).map(dungeonId => ({ name: dungeonId, id: dungeonId }));

  // Find and move the current dungeon to the top
  const currentId = currentDungeonId.value;
  if (currentId) {
    const currentDungeonIndex = dungeonOptions.findIndex(d => d.id === currentId);
    if (currentDungeonIndex > -1) {
      const currentDungeon = dungeonOptions.splice(currentDungeonIndex, 1)[0];
      currentDungeon.name += ' (current)';
      dungeonOptions.unshift(currentDungeon);
    }
  }
  return dungeonOptions;
});

const selectedDungeonData = computed(() => {
  let selectedDungeonId = game.coreSystem.debugSettings.value.selected_dungeon;
  if (!selectedDungeonId) {
    return null;
  }
  return game.dungeonSystem.dungeonDatas.value.get(selectedDungeonId);
});

const addNewFlag = () => {
  if (newFlagId.value && newFlagValue.value !== null) {
    selectedDungeonData.value?.setFlag(newFlagId.value, newFlagValue.value);
    newFlagId.value = ''; // Reset input
    newFlagValue.value = null; // Reset input
  }
};
</script>

<template>
  <div class="debug-dungeons">
    <div class="debug-info">
      <div>currentDungeonId: {{ game.dungeonSystem.currentDungeonId.value }}</div>
      <div>currentRoomId: {{ game.dungeonSystem.currentRoomId.value }}</div>
      <div>currentSceneId: {{ game.dungeonSystem.currentSceneId.value }}</div>
      <hr>
      <div>activeDungeonId: {{ game.dungeonSystem.activeDungeonId.value }}</div>
      <div>activeRoomId: {{ game.dungeonSystem.activeRoomId.value }}</div>
      <div>choiceType: {{ game.dungeonSystem.choiceType.value }}</div>
      <hr>
      <div>isRootScene: {{ game.dungeonSystem.isRootScene.value }}</div>
    </div>


    <Select v-model="game.coreSystem.debugSettings.value.selected_dungeon" filter optionLabel="name" optionValue="id"
      :options="dungeons" placeholder="Select an option" class="w-full md:w-56" />
    <div class="block">
      <div class="mt-2">
        <FloatLabel variant="on">
          <InputText v-model="roomId" class="w-full md:w-56" />
          <label for="room-id-input">Room ID</label>
        </FloatLabel>
      </div>
      <div class="mt-2">
        <Button label="Enter"
          @click="game.dungeonSystem.enterDungeon(game.coreSystem.debugSettings.value.selected_dungeon!, roomId)"
          :disabled="!game.coreSystem.debugSettings.value.selected_dungeon || !roomId" class="w-full md:w-56" />
      </div>
    </div>

    <div class="block" v-if="selectedDungeonData">
      <h3>Dungeon Flags</h3>

      <div class="new-flag-form mb-4 p-fluid">
        <div class="p-field mb-2">
          <FloatLabel variant="on">
            <InputText v-model="newFlagId" class="w-full md:w-56" />
            <label for="new-flag-id">New Flag ID</label>
          </FloatLabel>
        </div>
        <div class="p-field mb-2">
          <FloatLabel variant="on">
            <InputNumber v-model="newFlagValue" showButtons class="w-full md:w-56" />
            <label for="new-flag-value">New Flag Value</label>
          </FloatLabel>
        </div>
        <Button label="Add Flag" @click="addNewFlag" class="w-full md:w-56" />
      </div>

      <div>
        <div v-for="([flagId, flagValue], index) in selectedDungeonData.flags" :key="flagId" class="mt-2 flag-row">
          <label :for="'flag-input-' + flagId" class="mr-2 flag-label">{{ flagId }}</label>
          <InputNumber :inputId="'flag-input-' + flagId" :model-value="flagValue"
            @update:model-value="selectedDungeonData.setFlag(flagId, $event)" showButtons class="flag-input" />
          <Button icon="pi pi-trash" class="p-button-danger p-button-text ml-2 flag-delete-button"
            @click="selectedDungeonData.removeFlag(flagId)" />
        </div>
      </div>

      <!-- visited scene events-->
      <div>
        <h3>Visited Scenes</h3>
        <div v-for="event in selectedDungeonData.visitedEvents" :key="event" class="mt-2 flag-row">
          <label :for="'event-input-' + event" class="mr-2 flag-label">{{ event }}</label>
          <Button icon="pi pi-trash" class="p-button-danger p-button-text ml-2 flag-delete-button"
            @click="selectedDungeonData.removeVisitedEvent(event)" />
        </div>
      </div>

      <!-- visited choices-->
      <div>
        <h3>Visited Choices</h3>
        <div v-for="choice in selectedDungeonData.visitedChoices" :key="choice" class="mt-2 flag-row">
          <label :for="'choice-input-' + choice" class="mr-2 flag-label">{{ choice }}</label>
          <Button icon="pi pi-trash" class="p-button-danger p-button-text ml-2 flag-delete-button"
            @click="selectedDungeonData.removeVisitedChoice(choice)" />
        </div>
      </div>

      <!-- visited rooms-->
      <div>
        <h3>Visited Rooms</h3>
        <div v-for="room in selectedDungeonData.visitedRooms" :key="room" class="mt-2 flag-row">
          <label :for="'room-input-' + room" class="mr-2 flag-label">{{ room }}</label>
          <Button icon="pi pi-trash" class="p-button-danger p-button-text ml-2 flag-delete-button"
            @click="selectedDungeonData.removeVisitedRoom(room)" />
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.debug-dungeons {
  padding: 1rem;
}


.debug-info {
  margin-bottom: 1rem;
  padding: 0.5rem;
  background: #ececec;
  border: 1px solid #dee2e6;
}

.block {
  margin-top: 1rem;
}

.new-flag-form {
  margin-bottom: 1.5rem;
}

.p-fluid .p-field {
  margin-bottom: 1rem;
}

.flag-row {
  display: grid;
  grid-template-columns: auto auto auto;
  align-items: center;
  justify-content: left;
  margin-bottom: 0.5rem;
  gap: 0.5rem;
}

.flag-label {
  text-align: right;
  word-wrap: break-word;
}

.flag-input {
  width: 100px;
}

.flag-delete-button {
  flex-shrink: 0;
}
</style>
