<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';
import type { Candidate } from '../../../../utility/dungeonEditor/assist';
import type { ContentAssist } from './useContentAssist';
import { editorTheme, EDITOR_DARK_CLASS } from '../../../editorTheme';

/** The completion list and the hover card of one editable (see useContentAssist). */
const props = defineProps<{ state: ContentAssist }>();

const listRef = ref<HTMLElement | null>(null);
const listAnchor = computed(() => {
  const r = props.state.anchor.value;
  return r && props.state.list.value ? { getBoundingClientRect: () => r } : null;
});
const { floatingStyles: listStyles } = useFloating(listAnchor, listRef, {
  placement: 'bottom-start',
  middleware: [offset(4), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
});

const cardRef = ref<HTMLElement | null>(null);
const cardAnchor = computed(() => {
  const h = props.state.hover.value;
  return h ? { getBoundingClientRect: () => new DOMRect(h.x, h.y, 0, 16) } : null;
});
const { floatingStyles: cardStyles } = useFloating(cardAnchor, cardRef, {
  placement: 'bottom-start',
  middleware: [offset(10), flip(), shift({ padding: 8 })],
});

/** The rows, with a group header wherever the group changes. */
const rows = computed(() => {
  const c = props.state.list.value;
  if (!c) return [];
  const out: Array<{ header: string } | { item: Candidate; index: number }> = [];
  // One group only: the title already names it.
  const single = new Set(c.items.map((i) => i.group)).size < 2;
  let group: string | undefined;
  c.items.forEach((item, index) => {
    if (!single && item.group && item.group !== group) {
      group = item.group;
      out.push({ header: group });
    }
    out.push({ item, index });
  });
  return out;
});

const activeItem = computed(() => props.state.list.value?.items[props.state.active.value]);
/** The label with the typed prefix in bold. */
function parts(label: string): [string, string] {
  const token = props.state.token.value;
  return token && label.toLowerCase().startsWith(token.toLowerCase()) ? [label.slice(0, token.length), label.slice(token.length)] : ['', label];
}

// Teleported out of whatever themes the editable: the game's debug panel themes only itself.
const theme = computed(() => ({ [EDITOR_DARK_CLASS]: editorTheme.value === 'dark' }));

// Keep the active row in view while arrowing through a long list.
watch(() => props.state.active.value, () => nextTick(() => {
  listRef.value?.querySelector('.assist-row--active')?.scrollIntoView({ block: 'nearest' });
}));
</script>

<template>
  <Teleport to="body">
    <div v-if="state.list.value" ref="listRef" class="assist-list" :class="theme" :style="listStyles">
      <div class="assist-main">
        <div class="assist-title">{{ state.list.value.title }}</div>
        <div class="assist-rows">
          <template v-for="(row, i) in rows" :key="i">
            <div v-if="'header' in row" class="assist-group">{{ row.header }}</div>
            <div v-else class="assist-row" :class="{ 'assist-row--active': row.index === state.active.value }"
              @mousedown.prevent="state.accept(row.item)" @mouseenter="state.active.value = row.index">
              <img v-if="row.item.image" :src="row.item.image" class="assist-thumb" alt="" loading="lazy" />
              <span class="assist-label"><b>{{ parts(row.item.label)[0] }}</b>{{ parts(row.item.label)[1] }}</span>
              <span v-if="row.item.detail" class="assist-detail">{{ row.item.detail }}</span>
            </div>
          </template>
        </div>
        <div class="assist-foot">↑↓ choose · Tab insert · Esc close</div>
      </div>
      <div v-if="activeItem?.help || activeItem?.examples" class="assist-help">
        <div class="assist-help-name">{{ activeItem.label }}</div>
        <div v-if="activeItem.help" class="assist-help-text">{{ activeItem.help }}</div>
        <pre v-if="activeItem.examples" class="assist-examples">{{ activeItem.examples.join('\n') }}</pre>
        <div v-if="activeItem.group" class="assist-help-source">{{ activeItem.group }}</div>
      </div>
    </div>

    <div v-if="state.hover.value" ref="cardRef" class="assist-card" :class="theme" :style="cardStyles">
      <img v-if="state.hover.value.info.image" :src="state.hover.value.info.image" class="assist-card-image" alt="" />
      <div class="assist-card-body">
        <div class="assist-card-head">
          <code class="assist-card-id">{{ state.hover.value.info.id }}</code>
          <span v-if="state.hover.value.info.name" class="assist-card-name">{{ state.hover.value.info.name }}</span>
        </div>
        <div class="assist-card-kind">{{ state.hover.value.info.kind }}</div>
        <div v-for="(line, i) in state.hover.value.info.lines" :key="i" class="assist-card-line">{{ line }}</div>
        <pre v-if="state.hover.value.info.examples" class="assist-examples">{{ state.hover.value.info.examples.slice(0, 3).join('\n') }}</pre>
        <div v-if="state.hover.value.info.jump" class="assist-card-hint">Ctrl+click to open</div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.assist-list {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  z-index: 10000;
  pointer-events: auto;
  font-size: 0.82rem;
}

.assist-main,
.assist-help,
.assist-card {
  background: var(--editor-surface-raised);
  color: var(--editor-text);
  border: 1px solid var(--editor-border);
  border-radius: 6px;
  box-shadow: 0 6px 20px var(--editor-shadow-strong, rgba(0, 0, 0, 0.25));
}

.assist-main {
  width: 24rem;
  max-width: 90vw;
  display: flex;
  flex-direction: column;
}

.assist-title,
.assist-group {
  padding: 0.3rem 0.65rem 0.15rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--editor-text-muted);
}

.assist-rows {
  max-height: 16rem;
  overflow-y: auto;
}

.assist-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.22rem 0.65rem;
  cursor: pointer;
  min-height: 1.6rem;
}

.assist-row--active {
  background: var(--editor-surface-selected);
}

.assist-thumb {
  width: 2.4rem;
  height: 1.5rem;
  object-fit: cover;
  border-radius: 3px;
  flex: 0 0 auto;
}

.assist-label {
  font-family: var(--font-family-mono, monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.assist-label b {
  color: var(--editor-accent);
}

.assist-detail {
  margin-left: auto;
  padding-left: 0.5rem;
  color: var(--editor-text-muted);
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 55%;
}

.assist-foot {
  padding: 0.25rem 0.65rem;
  border-top: 1px solid var(--editor-border);
  font-size: 0.7rem;
  color: var(--editor-text-faint, var(--editor-text-muted));
}

.assist-help {
  width: 18rem;
  padding: 0.55rem 0.7rem;
}

.assist-help-name {
  font-family: var(--font-family-mono, monospace);
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.assist-help-text {
  line-height: 1.4;
}

.assist-examples {
  margin: 0.45rem 0 0;
  padding: 0.35rem 0.5rem;
  border-radius: 4px;
  background: var(--editor-surface-sunken);
  color: var(--editor-ink-purple);
  font-family: var(--font-family-mono, monospace);
  font-size: 0.74rem;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.assist-help-source {
  margin-top: 0.4rem;
  font-size: 0.72rem;
  color: var(--editor-text-muted);
}

.assist-card {
  display: flex;
  gap: 0.6rem;
  padding: 0.55rem 0.7rem;
  max-width: 22rem;
  z-index: 10000;
  pointer-events: none;
  font-size: 0.8rem;
}

.assist-card-image {
  width: 3.6rem;
  height: 3.6rem;
  object-fit: cover;
  border-radius: 4px;
  flex: 0 0 auto;
}

.assist-card-head {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.assist-card-id {
  font-size: 0.76rem;
  padding: 0 0.3rem;
  border-radius: 3px;
  background: var(--editor-surface-sunken);
  color: var(--editor-ink-purple);
}

.assist-card-name {
  font-weight: 700;
}

.assist-card-kind {
  color: var(--editor-text-muted);
  font-size: 0.72rem;
  margin: 0.1rem 0 0.2rem;
}

.assist-card-line {
  line-height: 1.35;
}

.assist-card-hint {
  margin-top: 0.3rem;
  font-size: 0.72rem;
  color: var(--editor-text-muted);
}
</style>
