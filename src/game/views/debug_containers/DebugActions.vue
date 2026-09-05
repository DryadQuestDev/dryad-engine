<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useStorage } from '@vueuse/core';
import { jsonrepair } from 'jsonrepair';
import Textarea from 'primevue/textarea';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import { Game } from '../../game';

const game = Game.getInstance();

const actionInput = useStorage<string>('debug-actions:input', '');
const actionError = ref<string>('');
const actionNames = ref<string[]>([]);
const searchQuery = ref<string>('');

const filteredActionNames = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return actionNames.value;
  return actionNames.value.filter(name => name.toLowerCase().includes(query));
});

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
    <div class="search-toolbar">
      <InputText v-model="searchQuery" class="search-input" placeholder="Search actions" />
      <span v-if="searchQuery" class="search-clear" @click="searchQuery = ''">✕</span>
    </div>
    <div class="action-list">
      <button v-for="name in filteredActionNames" :key="name" type="button" class="action-chip"
        @click="insertAction(name)">
        {{ name }}
      </button>
      <div v-if="!filteredActionNames.length" class="action-empty">No actions match your search</div>
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

.search-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  margin-top: 0.25rem;
}

.search-input {
  width: 100%;
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.375rem;
}

.search-input:focus {
  outline: none;
  border-color: #2b6cb0;
  box-shadow: 0 0 0 3px rgba(43, 108, 176, 0.1);
}

.search-clear {
  position: absolute;
  right: 0.75rem;
  cursor: pointer;
  color: #718096;
  font-size: 1.125rem;
  padding: 0.25rem;
  line-height: 1;
  user-select: none;
}

.search-clear:hover {
  color: #2d3748;
}

.action-empty {
  font-size: 0.8rem;
  color: #718096;
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
