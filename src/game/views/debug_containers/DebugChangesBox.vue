<script setup lang="ts">
import { computed, ref } from 'vue';
import { Global } from '../../../global/global';
import {
  devChanges, devChangesAction, isInEffect, undoDevChanges, reapplyDevChanges, type DevChange,
} from '../../utils/devChanges';

/** The changes this playtest made to one tab's subject, as one action to copy. */
const props = defineProps<{ changes: DevChange[] }>();

const actionText = computed(() => devChangesAction(props.changes));

// A reload (Shift+R, PageUp) or the story can move the game off what was set; the change still
// stands for the content to write, and Reapply puts it back in the game.
const stale = computed(() => props.changes.filter(c => !isInEffect(c)));

const others = computed(() => devChanges.value.length - props.changes.length);

const copied = ref<'scope' | 'all' | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

async function copy(which: 'scope' | 'all') {
  const text = which === 'all' ? devChangesAction(devChanges.value) : actionText.value;
  try {
    await navigator.clipboard.writeText(text);
    copied.value = which;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copied.value = null; }, 1500);
  } catch {
    Global.getInstance().addNotification('Could not reach the clipboard');
  }
}

function report(error: string | null) {
  if (error) Global.getInstance().addNotification(error);
}
</script>

<template>
  <div v-if="changes.length" class="changes-box">
    <div class="changes-head">
      <strong>{{ changes.length }} {{ changes.length === 1 ? 'change' : 'changes' }} this playtest</strong>
      <button class="changes-link" title="Put back what was there before the first edit"
        @click="report(undoDevChanges(changes))">{{ changes.length === 1 ? 'Undo' : 'Undo all' }}</button>
    </div>
    <pre class="changes-code">{{ actionText }}</pre>
    <div class="changes-copy-row">
      <button class="changes-copy" @click="copy('scope')">
        <i :class="copied === 'scope' ? 'pi pi-check' : 'pi pi-copy'"></i>
        {{ copied === 'scope' ? 'Copied' : 'Copy as action' }}
      </button>
      <span class="changes-hint">paste it into a { } line</span>
    </div>
    <div v-if="stale.length" class="changes-note"
      title="A reload or the story moved the game off what you set. It still counts here; Reapply sets it again.">
      {{ stale.length }} not in the game now
      <button class="changes-link" @click="report(reapplyDevChanges(stale))">Reapply</button>
    </div>
    <div v-if="others > 0" class="changes-note">
      {{ others }} more elsewhere
      <button class="changes-link" title="One action with every change this playtest, in every tab" @click="copy('all')">
        {{ copied === 'all' ? 'Copied' : 'Copy all' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.changes-box {
  --changes-ink: var(--editor-ink-amber);

  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.55rem 0.6rem;
  border: 1px dashed var(--changes-ink);
  border-radius: 6px;
  background: var(--editor-tint-warning);
  color: var(--editor-text);
  font-size: 0.875rem;
}

.changes-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.changes-link {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--editor-fg-success);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.changes-link:hover {
  text-decoration: underline;
}

/* A code block reads dark in both themes, like the editor's own. */
.changes-code {
  margin: 0;
  padding: 0.45rem 0.55rem;
  border-radius: 4px;
  background: #1e293b;
  color: #e2e8f0;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.85em;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  /* A ligature would draw "->" as an arrow that is not what gets copied. */
  font-variant-ligatures: none;
  user-select: text;
}

.changes-copy-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.6rem;
}

.changes-copy {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.7rem;
  border: none;
  border-radius: 5px;
  background: #10b981;
  color: #fff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.changes-copy:hover {
  background: #059669;
}

.changes-hint,
.changes-note {
  color: var(--editor-text-muted);
  font-size: 0.85em;
}

.changes-note {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.4rem;
}
</style>
