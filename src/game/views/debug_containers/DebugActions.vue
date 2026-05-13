<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { jsonrepair } from 'jsonrepair';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';
import { Game } from '../../game';

const game = Game.getInstance();

const actionInput = ref<string>('');
const actionError = ref<string>('');
const actionNames = ref<string[]>([]);

onMounted(() => {
  actionNames.value = Array.from(game.logicSystem.actionRegistry.keys()).sort();
});

function executeActions() {
  const text = actionInput.value.trim();
  if (!text) return;
  try {
    const obj = JSON.parse(jsonrepair(text));
    game.execute(obj);
    actionError.value = '';
  } catch (e: any) {
    actionError.value = e?.message ?? String(e);
  }
}

function insertAction(name: string) {
  const text = actionInput.value.trim();
  if (!text) {
    actionInput.value = `{ ${name}: "_placeholder_" }`;
    return;
  }
  try {
    const obj = JSON.parse(jsonrepair(text));
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      obj[name] = '_placeholder_';
      actionInput.value = JSON.stringify(obj, null, 2);
      return;
    }
  } catch { }
  actionInput.value = `${text}\n${name}: "_placeholder_"`;
}
</script>

<template>
  <div class="debug-actions">
    <label class="action-runner-label">Run custom actions</label>
    <Textarea v-model="actionInput" rows="6" class="action-runner-input"
      placeholder='{ "char": "alice.stat.brawn>1", "flash": "Hello world" }' />
    <div class="action-runner-row">
      <Button label="Execute" @click="executeActions" />
      <div v-if="actionError" class="action-error">{{ actionError }}</div>
    </div>
    <div class="action-list">
      <button v-for="name in actionNames" :key="name" type="button" class="action-chip" @click="insertAction(name)">
        {{ name }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.debug-actions {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.action-runner-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #2d3748;
}

.action-runner-input {
  width: 100%;
  font-family: monospace;
  font-size: 0.85rem;
}

.action-runner-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.action-error {
  color: #c53030;
  font-size: 0.8rem;
  font-family: monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.action-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.25rem;
}

.action-chip {
  padding: 0.25rem 0.6rem;
  background: #4a5568;
  color: #e2e8f0;
  border: 1px solid #2d3748;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-family: monospace;
  cursor: pointer;
  transition: background 0.15s ease;
}

.action-chip:hover {
  background: #5a6578;
}
</style>
