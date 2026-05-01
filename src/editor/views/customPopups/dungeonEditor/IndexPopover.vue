<script setup lang="ts">
import { computed, ref } from 'vue';
import Popover from 'primevue/popover';
import InputText from 'primevue/inputtext';
import type { IndexEntry } from '../../../../utility/dungeonEditor/index';
import { Global } from '../../../../global/global';

const global = Global.getInstance();

const props = defineProps<{
  entries: IndexEntry[];
  label: string;
  selectedName?: string | null;
}>();

const emit = defineEmits<{
  select: [name: string];
}>();

const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
const filterText = ref('');

function toggle(event: Event) {
  popoverRef.value?.toggle(event);
}

function onShow() {
  filterText.value = '';
}

const filteredEntries = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  if (!q) return props.entries;
  return props.entries.filter((e) => e.name.toLowerCase().includes(q));
});

function onSelect(name: string) {
  emit('select', name);
  popoverRef.value?.hide();
}

const labelLower = computed(() => props.label.toLowerCase());
const filterPlaceholder = computed(() =>
  global.getString('dungeon_editor.index.filter_placeholder', { label: labelLower.value }),
);
const emptyText = computed(() =>
  global.getString('dungeon_editor.index.empty', { label: labelLower.value }),
);
const noMatchesText = computed(() =>
  global.getString('dungeon_editor.index.no_matches', { query: filterText.value }),
);
function entryTooltip(entry: IndexEntry): string {
  return global.getString('dungeon_editor.index.usage_tooltip', {
    count: entry.count,
    blocks: entry.blockIndices.size,
  });
}

defineExpose({ toggle });
</script>

<template>
  <Popover ref="popoverRef" @show="onShow" :pt="{ root: { class: 'index-popover-root' } }">
    <div class="index-popover">
      <div class="index-popover-header">
        <span class="index-popover-title">{{ label }}</span>
        <span class="index-popover-count">{{ entries.length }}</span>
      </div>
      <InputText
        v-model="filterText"
        :placeholder="filterPlaceholder"
        class="index-popover-filter"
        autofocus
      />
      <div v-if="entries.length === 0" class="index-popover-empty">
        {{ emptyText }}
      </div>
      <div v-else-if="filteredEntries.length === 0" class="index-popover-empty">
        {{ noMatchesText }}
      </div>
      <div v-else class="index-popover-list">
        <button
          v-for="entry in filteredEntries"
          :key="entry.name"
          type="button"
          class="index-popover-item"
          :class="{ 'index-popover-item--active': selectedName === entry.name }"
          @click="onSelect(entry.name)"
          :title="entryTooltip(entry)"
        >
          <span class="index-popover-item-name">{{ entry.name }}</span>
          <span class="index-popover-item-count">{{ entry.count }}</span>
        </button>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.index-popover {
  width: 22rem;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.index-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}

.index-popover-title {
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.78rem;
  letter-spacing: 0.05em;
  color: #555;
}

.index-popover-count {
  font-size: 0.75rem;
  color: #888;
  background: rgba(0, 0, 0, 0.06);
  padding: 0.05rem 0.45rem;
  border-radius: 10px;
  font-family: var(--font-family-mono, monospace);
}

.index-popover-filter {
  width: 100%;
}

.index-popover-empty {
  color: #888;
  font-style: italic;
  padding: 0.4rem 0.2rem;
  font-size: 0.85rem;
}

.index-popover-list {
  max-height: 22rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-top: 0.1rem;
}

.index-popover-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.35rem 0.55rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
  text-align: left;
  color: inherit;
  transition: background 0.1s ease, border-color 0.1s ease;
}

.index-popover-item:hover {
  background: rgba(25, 118, 210, 0.08);
  border-color: rgba(25, 118, 210, 0.25);
}

.index-popover-item--active {
  background: rgba(25, 118, 210, 0.16);
  border-color: rgba(25, 118, 210, 0.55);
}

.index-popover-item-name {
  font-family: var(--font-family-mono, monospace);
  flex: 1 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.index-popover-item-count {
  flex: 0 0 auto;
  color: #777;
  font-size: 0.78rem;
  font-family: var(--font-family-mono, monospace);
  background: rgba(0, 0, 0, 0.05);
  padding: 0.05rem 0.4rem;
  border-radius: 10px;
}
</style>

<style>
/* Unscoped: PrimeVue Popover is teleported to <body>, so scoped styles don't
   reach it. The editor popup uses a PrimeVue Dialog (z-index ~1100); bump the
   popover above it so it's not occluded. */
.p-popover.index-popover-root {
  z-index: 12000 !important;
}
</style>
