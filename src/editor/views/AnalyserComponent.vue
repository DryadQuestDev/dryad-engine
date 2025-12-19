<script setup lang="ts">
import Button from 'primevue/button';
import { ref, onMounted, Ref, watch } from 'vue';
import { Analyser } from '../analyser';
import { Editor } from '../editor';
// Props definition (example)
// const props = defineProps<{
//   exampleProp: string;
// }>();

// Reactive state
const componentName = ref('AnalyserComponent');

let analyser = new Analyser();
let editor = Editor.getInstance();

function analyse() {
  analyser.analyse();
}

// Lifecycle hooks
onMounted(() => {
  console.log(`${componentName.value} component mounted.`);
});

watch(
  [() => editor.selectedGame, () => editor.selectedMod, () => editor.selectedDungeon],
  () => {
    analyser.analized.value = false;
  }
);

</script>

<template>
  <div class="analyser-component">

    <Button v-tooltip.left="'Synchronize Rooms and Encounters from the Dungeon Content Document with the game files.'"
      label="Synchronize Content Document" severity="help" icon="pi pi-check-circle" raised @click="analyse" />

    <div class="analyser-content" v-if="analyser.analized.value">
      <div class="warning" v-if="editor.hasUnsavedChanges.value">
        You have unsaved changes. Save your changes before synchronizing the document to ensure the data is in sync.
      </div>

      <div v-else class="block">

        <!-- Missing Rooms -->
        <div class="block" v-if="analyser.missingRooms.value.size > 0">
          <div class="warning">
            You have <b>unimplemented rooms</b>. Go to <b>Rooms Tab and select Action->Create Room. Then synchronize the
              document again</b>.
          </div>
          <div class="list">
            <div class="item" v-for="room in analyser.missingRooms.value">
              <div class="name">{{ room }}</div>
            </div>
          </div>
        </div>


        <!-- Redundant Rooms -->
        <div class="block" v-if="analyser.redundantRooms.value.size > 0">
          <div class="warning">
            You have <b>redundant rooms</b>. You can remove them in Rooms Tab or delete them automatically by clicking
            the button below.
          </div>
          <div class="list">
            <div class="item" v-for="room in analyser.redundantRooms.value">
              <div class="name">{{ room }}</div>
            </div>
          </div>
          <Button label="Delete Redundant Rooms" severity="success" @click="analyser.deleteRedundantRooms()" />
        </div>

        <template v-if="!analyser.missingRooms.value.size">
          <!-- Missing Encounters -->
          <div class="block" v-if="analyser.missingEncounters.value.length > 0">
            <div class="warning">
              You have <b>unimplemented encounters</b>. You can implement them in Encounters Tab or create them
              automatically by clicking the button below.
            </div>
            <div class="list">
              <div class="item" v-for="encounter in analyser.missingEncounters.value">
                <div class="name">{{ encounter.id }}</div>
              </div>
            </div>
            <Button label="Create Missing Encounters" severity="success" @click="analyser.createMissingEncounters()" />
          </div>

          <!-- Redundant Encounters -->
          <div class="block" v-if="analyser.redundantEncounters.value.length > 0">
            <div class="warning">
              You have <b>redundant encounters</b>. You can remove them in Encounters Tab or delete them automatically
              by clicking the button below.
            </div>
            <div class="list">
              <div class="item" v-for="encounter in analyser.redundantEncounters.value">
                <div class="name">{{ encounter.id }}</div>
              </div>
            </div>
            <Button label="Delete Redundant Encounters" severity="success"
              @click="analyser.deleteRedundantEncounters()" />
          </div>

          <div class="success" v-if="!analyser.missingEncounters.value.length
            && !analyser.redundantEncounters.value.length
            && !analyser.missingRooms.value.size
            && !analyser.redundantRooms.value.size
          ">

            Everything is in sync!

          </div>

        </template>
      </div>


    </div>
  </div>
</template>

<style scoped>
.analyser-component {
  margin-left: 15px;
  margin-bottom: 15px;
}

.analyser-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.warning {
  padding: 0.75rem;
  border: 1px solid #ffc107;
  /* Amber color for warning */
  border-radius: 4px;
  background-color: #fff3cd;
  /* Light amber background */
  color: #856404;
  /* Dark amber text */
}

.block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  background-color: #fff;
}

.block .warning {
  /* More specific warning style within a block */
  margin-bottom: 0.5rem;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding-left: 1rem;
  /* Indent list items */
}

.item {
  padding: 0.5rem;
  border: 1px solid #eee;
  border-radius: 4px;
  background-color: #fdfdfd;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.name {
  font-weight: bold;
}

/* Style for buttons within blocks if needed */
.block>.p-button {
  margin-top: 0.5rem;
  align-self: flex-start;
  /* Align button to the left */
}

.success {
  padding: 0.75rem;
  border: 1px solid #28a745;
  /* Green color for success */
  border-radius: 4px;
  background-color: #d4edda;
  /* Light green background */
  color: #155724;
  /* Dark green text */
  font-weight: bold;
}
</style>
