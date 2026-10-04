<script setup lang="ts">
import { computed } from 'vue';
import {
  readMeta, writeMeta, isMetaStatus,
  META_STATUSES, META_STATUS_ICON, META_STATUS_LABEL,
  type MetaStatus,
} from '../../../../utility/dungeonEditor/meta';

/**
 * Author-set status for one block, as a 2x2 grid of toggles carried in the
 * block's own `{…}` params as `__meta` and stripped before the runtime sees it.
 *
 * Deliberately distinct from the lint badge beside it: lint says the script is
 * malformed, this says the author considers the content unfinished.
 */
const props = defineProps<{ paramsRaw?: string; disabled?: boolean }>();
const emit = defineEmits<{ 'update:paramsRaw': [value: string | undefined] }>();

const status = computed<MetaStatus | null>(() => {
  const s = readMeta(props.paramsRaw)?.status;
  return isMetaStatus(s) ? s : null;
});

// Clicking the active status clears it, so the same cell both sets and unsets.
// Existing meta is spread through rather than replaced, so a future key added
// to the blob is not dropped by a status click.
function setStatus(s: MetaStatus) {
  const next = status.value === s ? undefined : s;
  emit('update:paramsRaw', writeMeta(props.paramsRaw, { ...(readMeta(props.paramsRaw) ?? {}), status: next }));
}
</script>

<template>
  <div class="meta-grid">
    <button v-for="s in META_STATUSES" :key="s" type="button" class="meta-cell"
      :class="[`meta-cell--${s}`, { 'meta-cell--active': status === s }]" :disabled="disabled"
      v-tooltip.top="META_STATUS_LABEL[s]" :aria-pressed="status === s" @click="setStatus(s)">
      <i :class="META_STATUS_ICON[s]" />
    </button>
  </div>
</template>

<style scoped>
/* META_STATUSES is ordered todo, wip, done, broken — so the grid reads
   todo / wip on the top row, done / broken on the bottom. */
.meta-grid {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  padding: 1px;
  border-radius: 4px;
  background: var(--editor-surface-hover);
}

.meta-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 0.95rem;
  height: 0.95rem;
  padding: 0;
  border: none;
  border-radius: 2px;
  background: transparent;
  cursor: pointer;
  font-size: 0.55rem;
  line-height: 1;
  /* Unset reads as a faint affordance, so an unannotated document stays quiet. */
  opacity: 0.28;
  transition: opacity 0.12s, background 0.12s, box-shadow 0.12s;
}

.meta-cell:hover:not(:disabled) {
  opacity: 0.95;
  background: var(--editor-surface-hover);
}

.meta-cell:disabled { cursor: default; }

.meta-cell--active {
  opacity: 1;
  background: var(--editor-surface-hover);
  box-shadow: inset 0 0 0 1px currentColor;
}

.meta-cell--todo { color: #d8a657; }
.meta-cell--wip { color: #7daea3; }
.meta-cell--done { color: #89b482; }
/* Distinct from the lint badge's red — an author judgement, not a parse error. */
.meta-cell--broken { color: #d3869b; }
</style>
