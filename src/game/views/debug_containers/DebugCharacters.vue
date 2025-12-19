<script setup lang="ts">
import { Game } from '../../game';
import { ref, computed, reactive } from 'vue';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import FloatLabel from 'primevue/floatlabel';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import type { Character } from '../../core/character/character';
import { debugSerialize } from '../../../utility/debug-serializer';
import { Status } from '../../core/character/status';

const game = Game.getInstance();
const selectedCharacter = ref<string | null>(null);
const newCharacterId = ref<string>('');
const selectedStatus = ref<string | null>(null);

const characters = computed<Character[]>(() => {
  return Array.from(game.characterSystem.characters.value.values());
});

function createCharacter() {
  if (selectedCharacter.value && newCharacterId.value) {
    let character = game.characterSystem.createCharacterFromTemplate(newCharacterId.value, selectedCharacter.value);
    if (character) {
      game.characterSystem.addCharacter(character, true);
    }
  }
}

function addStatusToCharacter(character: Character, statusId: string | null) {
  if (!statusId) {
    console.warn('No status selected');
    return;
  }

  const statusTemplate = game.characterSystem.statusesMap.get(statusId);
  if (!statusTemplate) {
    console.error(`Status template "${statusId}" not found`);
    return;
  }

  // Create a new Status instance
  const status = reactive(new Status());
  status.id = statusId;
  status.setValues(statusTemplate);

  // Add status to character
  character.addStatus(status);

  console.log(`Added status "${statusId}" to character "${character.id}"`);
}

function formatCharacterData(character: any) {
  return debugSerialize(character, 1);
}
</script>

<template>
  <div class="debug-characters">
    <div class="create-character-section">
      <h3>Create New Character</h3>
      <Select v-model="selectedCharacter" :options="Array.from(game.characterSystem.templatesMap.keys())"
        placeholder="Select an option" class="input-control" />
      <FloatLabel variant="on">
        <!-- @vue-ignore -->
        <InputText v-model="newCharacterId" class="input-control" />
        <label for="new-character-id">Character ID</label>
      </FloatLabel>
      <Button label="Create Character" @click="createCharacter" />
    </div>

    <div class="characters-list">
      <h3>All Characters ({{ characters.length }})</h3>
      <Accordion v-if="characters.length > 0">
        <AccordionPanel v-for="character in characters" :key="character.id" :value="character.id">
          <AccordionHeader>
            <span class="character-header">
              <strong>{{ character.id }}</strong>
              <span v-if="character.templateId" class="character-template"></span>
            </span>
          </AccordionHeader>
          <AccordionContent>
            <div class="character-actions">
              <h4>Add Status Effect</h4>
              <div class="status-controls">
                <Select v-model="selectedStatus" :options="Array.from(game.characterSystem.statusesMap.keys())"
                  placeholder="Select status" class="status-select" />
                <Button label="Add Status" @click="addStatusToCharacter(character, selectedStatus)" />
              </div>
            </div>
            <pre class="character-data">{{ formatCharacterData(character) }}</pre>
          </AccordionContent>
        </AccordionPanel>
      </Accordion>
      <p v-else class="no-characters">No characters found</p>
    </div>
  </div>
</template>

<style scoped>
.debug-characters {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.create-character-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--surface-border);
}

.create-character-section h3 {
  margin: 0;
}

.input-control {
  width: 100%;
  max-width: 14rem;
}

.characters-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.characters-list h3 {
  margin: 0;
}

.character-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.character-name {
  color: var(--text-color-secondary);
}

.character-template {
  color: var(--primary-color);
  font-size: 0.9em;
}

.character-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem;
  background-color: var(--surface-section);
  border-radius: 4px;
  margin-bottom: 1rem;
}

.character-actions h4 {
  margin: 0;
  font-size: 0.95em;
  font-weight: 600;
}

.status-controls {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-start;
}

.status-select {
  width: 100%;
  max-width: 14rem;
}

.character-data {
  background-color: var(--surface-ground);
  border-radius: 4px;
  overflow-x: auto;
  margin: 0;
  font-size: 0.9em;
  line-height: 1.5;
}

.no-characters {
  color: var(--text-color-secondary);
  font-style: italic;
}
</style>
