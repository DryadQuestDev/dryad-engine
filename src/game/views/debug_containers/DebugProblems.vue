<script setup lang="ts">
import Button from 'primevue/button';
import { devProblems, clearDevProblems, type DevProblemKind } from '../../utils/devProblems';
import { backToEditor } from '../../utils/devPlaytest';

const KIND_LABEL: Record<DevProblemKind, string> = {
  speaker: 'Speaker',
  asset: 'Asset',
  action: 'Action',
  condition: 'Condition',
  quest: 'Quest',
};
</script>

<template>
  <div class="debug-problems">
    <div class="problems-header">
      <strong>{{ devProblems.length }} {{ devProblems.length === 1 ? 'problem' : 'problems' }}</strong>
      <Button v-if="devProblems.length" label="Clear" icon="pi pi-times" size="small" text severity="secondary"
        @click="clearDevProblems" />
    </div>
    <div v-if="!devProblems.length" class="problems-empty">No problems.</div>
    <div v-for="(p, i) in devProblems" :key="i" class="problem-row">
      <div class="problem-top">
        <span class="problem-kind" :class="`problem-kind--${p.kind}`">{{ KIND_LABEL[p.kind] }}</span>
        <span class="problem-message">{{ p.message }}</span>
        <span v-if="p.count > 1" class="problem-count">×{{ p.count }}</span>
      </div>
      <div class="problem-bottom">
        <code v-if="p.sceneId" class="problem-where">{{ p.sceneId }}</code>
        <code v-else-if="p.dungeonId" class="problem-where">{{ p.dungeonId }}</code>
        <Button v-if="p.dungeonId" label="Open in editor" icon="pi pi-pencil" size="small" text
          @click="backToEditor({ sceneId: p.sceneId, dungeonId: p.dungeonId })" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.debug-problems {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.problems-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.problems-empty {
  padding: 0.75rem 0;
  opacity: 0.7;
}

.problem-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 1px solid var(--dp-border);
  border-radius: 4px;
  background: var(--dp-control);
}

.problem-top {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.problem-kind {
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  color: #fff;
  background: #d9534f;
}

.problem-kind--speaker,
.problem-kind--asset,
.problem-kind--quest {
  background: #c98a00;
}

.problem-message {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.problem-count {
  font-size: 0.8rem;
  opacity: 0.7;
}

.problem-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.problem-where {
  font-size: 0.75rem;
  opacity: 0.8;
  overflow-wrap: anywhere;
}
</style>
