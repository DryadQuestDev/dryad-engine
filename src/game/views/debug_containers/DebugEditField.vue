<script lang="ts">
export type EditFieldEditor = 'select' | 'text' | 'number' | 'boolean' | 'readonly';
</script>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { DevValue } from '../../utils/devChanges';

/**
 * One value's control in a debug field row. Text and numbers commit on Enter or blur, never per
 * keystroke: each commit runs a real action, and a half-typed "1" on the way to "15" must not.
 */
const props = defineProps<{
  editor: EditFieldEditor;
  value: DevValue;
  options?: string[];
}>();

const emit = defineEmits<{ commit: [value: string | number | boolean] }>();

const text = computed(() => props.value === null || props.value === undefined ? '' : String(props.value));

// The typed text lives here while the field has focus, so a live re-render can't overwrite it.
const draft = ref<string | null>(null);

const selectOptions = computed(() => {
  const options = props.options ?? [];
  return props.value !== null && !options.includes(text.value) ? [text.value, ...options] : options;
});

function commitDraft() {
  const typed = draft.value;
  draft.value = null;
  if (typed === null || typed === text.value) return;
  if (props.editor === 'number') {
    const n = typed.trim() === '' ? NaN : Number(typed);
    if (Number.isFinite(n) && n !== props.value) emit('commit', n);
    return;
  }
  emit('commit', typed);
}

// Escape is bound with .prevent: the game opens its menu on any Escape left unhandled.
function cancelDraft(event: Event) {
  draft.value = null;
  (event.target as HTMLInputElement).blur();
}

function blurField(event: Event) {
  (event.target as HTMLInputElement).blur();
}

const readonlyText = computed(() => {
  try {
    return JSON.stringify(props.value);
  } catch {
    return String(props.value);
  }
});
</script>

<template>
  <select v-if="editor === 'select'" class="edit-control edit-select" :value="value === null ? '' : text"
    @change="emit('commit', ($event.target as HTMLSelectElement).value)">
    <option v-if="value === null" value="" disabled>unset</option>
    <option v-for="option in selectOptions" :key="option" :value="option">{{ option }}</option>
  </select>

  <input v-else-if="editor === 'boolean'" type="checkbox" class="edit-check" :checked="value === true"
    @change="emit('commit', ($event.target as HTMLInputElement).checked)" />

  <code v-else-if="editor === 'readonly'" class="edit-control edit-readonly" :title="readonlyText">{{ readonlyText }}</code>

  <input v-else class="edit-control edit-input" :class="{ 'is-number': editor === 'number' }" type="text"
    :inputmode="editor === 'number' ? 'decimal' : undefined" :value="draft ?? text" :title="text" spellcheck="false"
    :placeholder="value === null ? 'unset' : undefined" @focus="draft = text"
    @input="draft = ($event.target as HTMLInputElement).value" @blur="commitDraft" @keydown.enter="blurField"
    @keydown.esc.prevent="cancelDraft" />
</template>

<style scoped>
.edit-control {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 0.2rem 0.4rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-radius: 4px;
  background: var(--dp-control-hover, var(--editor-surface));
  color: var(--editor-text);
  font: inherit;
}

.edit-control:hover {
  border-color: var(--dp-border-hover, var(--editor-border-strong));
}

.edit-control:focus {
  outline: none;
  border-color: var(--editor-accent);
}

.edit-select {
  cursor: pointer;
}

.edit-input.is-number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.edit-input::placeholder {
  color: var(--editor-text-faint);
  font-style: italic;
}

.edit-readonly {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--editor-text-muted);
  font-size: 0.85em;
  background: transparent;
}

.edit-check {
  justify-self: start;
  width: 1rem;
  height: 1rem;
  margin: 0.2rem 0;
  accent-color: var(--editor-accent);
  cursor: pointer;
}
</style>
