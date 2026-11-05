<script setup lang="ts">
import type { ConditionClause, ConditionGroup } from '../../systems/logicSystem';

/** A condition read clause by clause (logicSystem.explainCondition): the Scene tab and the Console. */
defineProps<{ groups: ConditionGroup[] }>();

function formatValue(value: unknown): string {
  if (value === undefined) return 'unset';
  if (value === '') return '""';
  if (value !== null && typeof value === 'object') {
    const json = JSON.stringify(value);
    return json.length > 40 ? json.slice(0, 39) + '…' : json;
  }
  return String(value);
}

function clauseTip(clause: ConditionClause): string | undefined {
  return clause.skipped ? 'Not reached: an earlier clause decides' : undefined;
}
</script>

<template>
  <div class="clause-list">
    <div v-for="group in groups" :key="group.key" class="clause-group">
      <template v-for="(clause, i) in group.clauses" :key="i">
        <div class="clause" :class="{ 'clause-pass': clause.pass, 'clause-fail': !clause.pass, 'clause-skipped': clause.skipped }"
          v-tooltip.left="clauseTip(clause)">
          <span class="clause-key">{{ i === 0 ? group.key : '' }}</span>
          <code class="clause-text">{{ clause.text || '(empty)' }}</code>
          <span class="clause-value">{{ clause.error ? '' : formatValue(clause.value) }}</span>
          <span class="clause-mark">{{ clause.pass ? '✓' : '✗' }}</span>
        </div>
        <div v-if="clause.error" class="clause-error" :class="{ 'clause-skipped': clause.skipped }">{{ clause.error }}</div>
      </template>
      <div v-if="!group.clauses.length" class="clause clause-fail">
        <span class="clause-key">{{ group.key }}</span>
        <code class="clause-text">(empty)</code>
        <span class="clause-value"></span>
        <span class="clause-mark">{{ group.pass ? '✓' : '✗' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clause-list {
  --clause-fail: #d9534f;
  --clause-pass: #3c9a5f;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.clause-group {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.clause {
  display: grid;
  grid-template-columns: 3.4rem minmax(0, 1fr) auto 0.9rem;
  align-items: baseline;
  gap: 0.35rem;
  font-size: 0.8rem;
}

.clause-key {
  font-size: 0.7rem;
  opacity: 0.7;
}

.clause-text {
  overflow-wrap: anywhere;
}

.clause-value {
  font-family: monospace;
  font-weight: 700;
  max-width: 8rem;
  overflow-wrap: anywhere;
  text-align: right;
}

.clause-mark {
  font-weight: 700;
  text-align: center;
}

.clause-pass .clause-mark {
  color: var(--clause-pass);
}

.clause-fail .clause-mark,
.clause-fail .clause-value {
  color: var(--clause-fail);
}

.clause-skipped {
  opacity: 0.45;
}

.clause-error {
  margin-left: 3.75rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--clause-fail);
  overflow-wrap: anywhere;
}
</style>
