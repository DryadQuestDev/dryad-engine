<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';
import type { Row } from '../../../../utility/dungeonEditor/ast';
import { inputMatchesSearch } from './searchState';
import { flashElement, focusFieldAt, type RevealRequest } from './reveal';

const props = defineProps<{
  row: Row;
  index: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  sceneExists?: boolean;
  /** The row's `{params}` failed lint — outline the input. */
  paramsError?: boolean;
  /** Focus request aimed at this row; `null` otherwise. */
  reveal?: RevealRequest | null;
}>();

const rootRef = ref<HTMLElement | null>(null);
const paramsRef = ref<InstanceType<typeof InputText> | null>(null);
const codeRef = ref<InstanceType<typeof Textarea> | null>(null);

watch(() => props.reveal, (r) => {
  if (!r) return;
  nextTick(() => {
    if (r.at.target === 'row-params') focusFieldAt(paramsRef.value, r.at.start, r.at.end);
    else if (r.at.target === 'row-text') focusFieldAt(codeRef.value, r.at.start, r.at.end);
    flashElement(rootRef.value);
  });
});

const emit = defineEmits<{
  'update:row': [row: Row];
  'remove': [];
  'move-up': [];
  'move-down': [];
  'insert-scene': [];
}>();

const sigil = computed(() => {
  switch (props.row.kind) {
    case 'choice': return '!';
    case 'comment': return '//';
    case 'code': return '[ ]';
    case 'empty': return '';
    case 'text':
    case 'raw':
    default: return '';
  }
});

const sigilClass = computed(() => `sigil sigil--${props.row.kind}`);

function updateField(key: string, value: any) {
  emit('update:row', { ...props.row, [key]: value } as Row);
}
</script>

<template>
  <div ref="rootRef" class="row-editor" :class="`row--${row.kind}`">
    <div class="row-left" :class="{ 'row-drag-handle': row.kind === 'choice' }"
      v-tooltip.top="row.kind === 'choice' ? 'Drag to reorder' : ''">
      <span :class="sigilClass">{{ sigil }}</span>
    </div>

    <div class="row-body">
      <!-- choice: !name<value>{params} — name is the engine id, value is the display title -->
      <template v-if="row.kind === 'choice'">
        <InputText
          :model-value="row.name"
          @update:model-value="(v: any) => updateField('name', v ?? '')"
          placeholder="id"
          class="choice-id-input"
          :class="{ 'input-search-hit': inputMatchesSearch(row.name) }"
        />
        <span class="angle">&lt;</span>
        <InputText
          :model-value="row.value ?? ''"
          @update:model-value="(v: any) => updateField('value', v === '' ? undefined : v)"
          placeholder="title"
          class="value-input"
          :class="{ 'input-search-hit': inputMatchesSearch(row.value) }"
        />
        <span class="angle">&gt;</span>
        <InputText
          ref="paramsRef"
          :model-value="row.paramsRaw ?? ''"
          @update:model-value="(v: any) => updateField('paramsRaw', v ? v : undefined)"
          placeholder="{params}"
          class="params-input"
          :class="{ 'params-input--error': paramsError, 'input-search-hit': inputMatchesSearch(row.paramsRaw) }"
        />
      </template>

      <!-- text -->
      <template v-else-if="row.kind === 'text'">
        <Textarea
          :model-value="row.text"
          @update:model-value="(v: any) => updateField('text', v ?? '')"
          placeholder="prose content"
          class="flex-1 text-area"
          rows="1"
          autoResize
        />
      </template>

      <!-- empty line -->
      <template v-else-if="row.kind === 'empty'">
        <span class="hint">paragraph break</span>
      </template>

      <!-- comment -->
      <template v-else-if="row.kind === 'comment'">
        <InputText
          :model-value="row.text"
          @update:model-value="(v: any) => updateField('text', v ?? '')"
          placeholder="//comment"
          class="flex-1 comment-input"
          :class="{ 'input-search-hit': inputMatchesSearch(row.text) }"
        />
      </template>

      <!-- code block -->
      <template v-else-if="row.kind === 'code'">
        <Textarea
          ref="codeRef"
          :model-value="row.text"
          @update:model-value="(v: any) => updateField('text', v ?? '')"
          class="flex-1 code-area"
          rows="2"
          autoResize
        />
      </template>

      <!-- fallback raw -->
      <template v-else>
        <InputText
          :model-value="(row as any).text ?? ''"
          @update:model-value="(v: any) => updateField('text', v ?? '')"
          placeholder="raw"
          class="flex-1"
          :class="{ 'input-search-hit': inputMatchesSearch((row as any).text) }"
        />
      </template>
    </div>

    <div class="row-actions">
      <Button v-if="row.kind === 'choice'" icon="pi pi-sign-in" severity="success" text rounded
        :disabled="sceneExists" class="insert-scene-btn" :class="{ 'insert-scene-btn--disabled': sceneExists }"
        @click="emit('insert-scene')"
        :aria-label="sceneExists ? 'Scene already exists for this choice' : 'Insert scene for this choice'"
        :title="sceneExists ? 'Scene already exists for this choice' : 'Insert scene for this choice'" />
      <Button icon="pi pi-chevron-up" severity="secondary" text rounded
        :disabled="!canMoveUp" @click="emit('move-up')" aria-label="Move up" />
      <Button icon="pi pi-chevron-down" severity="secondary" text rounded
        :disabled="!canMoveDown" @click="emit('move-down')" aria-label="Move down" />
      <Button icon="pi pi-times" severity="danger" text rounded
        @click="emit('remove')" aria-label="Remove" />
    </div>
  </div>
</template>

<style scoped>
.row-editor {
  display: grid;
  grid-template-columns: 2.25rem 1fr auto;
  gap: 0.5rem;
  align-items: start;
  padding: 0.25rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
}

.row-left {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 2.25rem;
}

.row-drag-handle {
  cursor: grab;
}

.row-drag-handle:active {
  cursor: grabbing;
}

.choice-drag-ghost {
  opacity: 0.5;
  background: rgba(46, 125, 50, 0.12);
}

.sigil {
  font-family: var(--font-family-mono, monospace);
  font-weight: 600;
  font-size: 0.95rem;
  color: #888;
}

.sigil--choice { color: #9c27b0; }
.sigil--comment { color: #666; }
.sigil--code { color: #9575cd; }

.row-body {
  display: flex;
  gap: 0.4rem;
  align-items: flex-start;
  min-width: 0;
  flex-wrap: wrap;
}

.row-body :deep(input),
.row-body :deep(textarea) {
  font-family: inherit;
}

.flex-1 {
  flex: 1 1 200px;
  min-width: 0;
}

.choice-id-input { flex: 0 1 180px; }
.value-input { flex: 0 1 140px; }
.params-input {
  flex: 1 1 180px;
}

input.params-input {
  color: #9c27b0 !important;
  font-weight: 600;
}

input.params-input--error,
.params-input--error :deep(input) {
  outline: 2px solid #d32f2f;
  outline-offset: -1px;
}

.row-editor.flash {
  animation: row-flash 1.2s ease-out;
  border-radius: 4px;
}

@keyframes row-flash {
  0% { box-shadow: 0 0 0 0 rgba(255, 82, 82, 0.6); background: rgba(255, 82, 82, 0.25); }
  30% { box-shadow: 0 0 0 4px rgba(255, 82, 82, 0.4); }
  100% { box-shadow: 0 0 0 0 rgba(255, 82, 82, 0); background: transparent; }
}

.text-area :deep(textarea) {
  resize: vertical;
  min-height: 2.25rem;
}

.code-area :deep(textarea) {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.85rem;
}

.comment-input :deep(input) {
  color: #888;
  font-style: italic;
}

.angle {
  color: #666;
  font-family: var(--font-family-mono, monospace);
  padding: 0 0.2rem;
  align-self: center;
}

.hint {
  color: #666;
  font-style: italic;
  font-size: 0.85rem;
  align-self: center;
}

.row-actions {
  display: flex;
  gap: 0.1rem;
  flex: 0 0 auto;
}

.row--empty {
  background: rgba(255, 255, 255, 0.02);
}

/* Make the disabled "insert scene" button visibly gray (overrides PrimeVue's success-tinted disabled state). */
.insert-scene-btn--disabled :deep(.p-button-icon),
.insert-scene-btn--disabled :deep(.pi) {
  color: #aaa !important;
}

.insert-scene-btn--disabled {
  opacity: 0.6 !important;
}
</style>
