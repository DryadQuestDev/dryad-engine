<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import Dialog from 'primevue/dialog';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import FloatLabel from 'primevue/floatlabel';
import Button from 'primevue/button';
import { Editor } from '../../editor';
import { Global } from '../../../global/global';

const editor = Editor.getInstance();
const global = Global.getInstance();

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'game-created'): void;
}>();

const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
});

// Form state
const templates = ref<{ id: string; name: string }[]>([]);
const selectedTemplate = ref('');
const gameName = ref('');
const author = ref('');
const dungeonName = ref('');
const creating = ref(false);

// ID generation
function toId(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const gameId = computed(() => toId(gameName.value));
const dungeonId = computed(() => toId(dungeonName.value));

const canCreate = computed(() =>
  selectedTemplate.value.length > 0 &&
  gameId.value.length > 0 &&
  dungeonId.value.length > 0 &&
  author.value.trim().length > 0 &&
  !creating.value
);

// Load available templates
async function loadTemplates() {
  try {
    const folders = await global.listFolders('engine_files/examples');
    const loaded: { id: string; name: string }[] = [];
    for (const folder of folders) {
      try {
        const manifest = await global.readJson(`engine_files/examples/${folder}/_core/manifest.json`);
        loaded.push({ id: folder, name: manifest?.name || folder });
      } catch {
        loaded.push({ id: folder, name: folder });
      }
    }
    templates.value = loaded;
    if (loaded.length > 0) {
      selectedTemplate.value = loaded[0].id;
    }
  } catch {
    templates.value = [];
  }
}

async function createGame() {
  if (!canCreate.value) return;

  creating.value = true;
  const success = await editor.createGameFromTemplate(
    selectedTemplate.value,
    gameId.value,
    gameName.value.trim(),
    author.value.trim(),
    dungeonId.value
  );
  creating.value = false;

  if (success) {
    localVisible.value = false;
    emit('game-created');
  }
}

onMounted(loadTemplates);
</script>

<template>
  <Dialog v-model:visible="localVisible" modal header="Create Game from Template" :style="{ width: '550px' }">
    <div class="wizard-content">
      <div class="wizard-field">
        <FloatLabel variant="on">
          <Select v-model="selectedTemplate" :options="templates" optionLabel="name" optionValue="id" class="w-full"
            :disabled="templates.length === 0" />
          <label>Template</label>
        </FloatLabel>
        <small v-if="templates.length === 0" class="field-hint error">No templates found in
          engine_files/examples/</small>
      </div>

      <div class="wizard-field">
        <FloatLabel variant="on">
          <!-- @vue-ignore FloatLabel slot typing -->
          <InputText v-model="gameName" class="w-full" />
          <label>Game Name</label>
        </FloatLabel>
        <small v-if="gameId" class="field-hint">ID: <code>{{ gameId }}</code></small>
      </div>

      <div class="wizard-field">
        <FloatLabel variant="on">
          <!-- @vue-ignore FloatLabel slot typing -->
          <InputText v-model="author" class="w-full" />
          <label>Author</label>
        </FloatLabel>
      </div>

      <div class="wizard-field">
        <FloatLabel variant="on">
          <!-- @vue-ignore FloatLabel slot typing -->
          <InputText v-model="dungeonName" class="w-full" />
          <label>Starting Dungeon Name</label>
        </FloatLabel>
        <small v-if="dungeonId" class="field-hint">ID: <code>{{ dungeonId }}</code></small>
      </div>
    </div>

    <template #footer>
      <Button label="Cancel" class="p-button-text" @click="localVisible = false" :disabled="creating" />
      <Button label="Create Game" icon="pi pi-plus" @click="createGame" :disabled="!canCreate" :loading="creating" />
    </template>
  </Dialog>
</template>

<style scoped>
.wizard-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 0.5rem 0;
}

.wizard-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field-hint {
  font-size: 0.8rem;
  color: #888;
}

.field-hint code {
  padding: 1px 5px;
  border-radius: 3px;
  font-family: monospace;
}

.field-hint.error {
  color: #f44336;
}

.w-full {
  width: 100%;
}
</style>
