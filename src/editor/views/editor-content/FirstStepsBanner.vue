<script setup lang="ts">
import { computed } from 'vue';
import { Editor } from '../../editor';
import { Global } from '../../../global/global';
import { FIRST_STEPS, currentFirstSteps, dismissFirstSteps } from '../../firstSteps';

const editor = Editor.getInstance();
const global = Global.getInstance();

const steps = computed(() => {
  const done = currentFirstSteps.value?.done ?? [];
  const current = FIRST_STEPS.find(s => !done.includes(s.id))?.id;
  return FIRST_STEPS.map((s, i) => ({ ...s, n: i + 1, state: done.includes(s.id) ? 'done' : s.id === current ? 'current' : 'todo' }));
});
const allDone = computed(() => steps.value.every(s => s.state === 'done'));

function dismiss() {
  if (editor.selectedGame) dismissFirstSteps(editor.selectedGame);
}
</script>

<template>
  <div v-if="currentFirstSteps" class="first-steps">
    <span class="first-steps-title">{{ allDone ? 'That is the whole loop' : 'First steps' }}</span>
    <span v-for="s in steps" :key="s.id" class="first-step" :class="`first-step--${s.state}`">
      <b><i v-if="s.state === 'done'" class="pi pi-check" /><template v-else>{{ s.n }}</template></b>{{ s.label }}
    </span>
    <button type="button" class="first-steps-link"
      @click="global.openDocs('global_essentials', 'introduction/first_15_minutes')">
      Your first 15 minutes <i class="pi pi-arrow-right" />
    </button>
    <button type="button" class="first-steps-close" title="Hide" @click="dismiss"><i class="pi pi-times" /></button>
  </div>
</template>

<style scoped>
.first-steps {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin: 0.4rem 0.25rem 0.2rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--editor-accent) 35%, transparent);
  border-radius: 10px;
  background: var(--editor-tint-info);
  font-size: 0.88rem;
  flex: 0 0 auto;
}

.first-steps-title {
  font-weight: 700;
  margin-right: 0.2rem;
}

.first-step {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.2rem 0.65rem 0.2rem 0.25rem;
  border-radius: 999px;
  border: 1px solid var(--editor-border);
  background: var(--editor-surface-raised);
  color: var(--editor-text-muted);
}

.first-step b {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  font-size: 0.75rem;
  background: var(--editor-surface-sunken);
  color: var(--editor-text);
}

.first-step b .pi {
  font-size: 0.65rem;
}

.first-step--done {
  color: var(--editor-fg-success);
  background: var(--editor-tint-success);
  border-color: color-mix(in srgb, var(--editor-fg-success) 35%, transparent);
}

.first-step--done b {
  background: var(--editor-fg-success);
  color: #fff;
}

.first-step--current {
  background: var(--editor-accent);
  border-color: var(--editor-accent);
  color: var(--editor-accent-contrast);
}

.first-step--current b {
  background: var(--editor-accent-contrast);
  color: var(--editor-accent);
}

.first-steps-link,
.first-steps-close {
  border: none;
  background: none;
  font: inherit;
  cursor: pointer;
  color: var(--editor-accent);
}

.first-steps-link {
  margin-left: auto;
  font-weight: 600;
}

.first-steps-close {
  color: var(--editor-text-muted);
}
</style>
