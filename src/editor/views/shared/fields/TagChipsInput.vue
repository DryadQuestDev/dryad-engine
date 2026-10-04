<script setup lang="ts">
import { computed, ref } from 'vue';

// A compact tags field: chips with a remove button, Enter or comma adds, Backspace on an
// empty input removes the last chip. Suggestions come from the tags the tab already uses.
const props = defineProps<{
  modelValue: string[] | null | undefined;
  suggestions?: string[];
  placeholder?: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();

const draft = ref('');
const listId = `tag-suggestions-${Math.random().toString(36).slice(2, 8)}`;
const tags = computed<string[]>(() => (Array.isArray(props.modelValue) ? props.modelValue : []));
const offered = computed(() => (props.suggestions ?? []).filter(tag => !tags.value.includes(tag)));

function add() {
  const parts = draft.value.split(',').map(part => part.trim()).filter(Boolean);
  draft.value = '';
  const next = [...tags.value];
  for (const part of parts) if (!next.includes(part)) next.push(part);
  if (next.length !== tags.value.length) emit('update:modelValue', next);
}

function remove(tag: string) {
  emit('update:modelValue', tags.value.filter(existing => existing !== tag));
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    add();
  } else if (event.key === 'Backspace' && !draft.value && tags.value.length) {
    remove(tags.value[tags.value.length - 1]);
  }
}
</script>

<template>
  <div class="tag-chips">
    <span v-for="tag in tags" :key="tag" class="tc-chip">
      {{ tag }}
      <button type="button" class="tc-remove" @click="remove(tag)">×</button>
    </span>
    <input v-model="draft" class="tc-input" :list="listId" :placeholder="tags.length ? '' : placeholder"
      @keydown="onKeydown" @blur="add" />
    <datalist :id="listId">
      <option v-for="tag in offered" :key="tag" :value="tag" />
    </datalist>
  </div>
</template>

<style scoped>
.tag-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  min-height: 2.2rem;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--p-inputtext-border-color, var(--editor-border-strong));
  border-radius: var(--p-border-radius, 6px);
  background: var(--p-inputtext-background, var(--editor-surface));
}

.tc-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.05rem 0.2rem 0.05rem 0.5rem;
  border-radius: 999px;
  background: var(--editor-surface-hover);
  color: var(--editor-text);
  font-size: 0.8rem;
}

.tc-remove {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--editor-text-muted);
  font-size: 0.9rem;
  line-height: 1;
  padding: 0 0.2rem;
}

.tc-remove:hover {
  color: var(--editor-fg-danger);
}

.tc-input {
  flex: 1;
  min-width: 6rem;
  border: none;
  outline: none;
  background: transparent;
  color: var(--editor-text);
  font: inherit;
  font-size: 0.85rem;
}
</style>
