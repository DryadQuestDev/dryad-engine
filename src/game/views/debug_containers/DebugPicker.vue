<script lang="ts">
/** One pickable entry: matched on its id and name, shown with its image when it has one. */
export type PickerOption = { id: string; name: string; image?: string };
</script>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  options: PickerOption[];
  placeholder?: string;
  autofocus?: boolean;
}>(), { placeholder: 'Search', autofocus: false });

const emit = defineEmits<{ pick: [id: string] }>();

const MAX_SUGGESTIONS = 8;

const query = ref('');
const open = ref(false);
const highlighted = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);

// Name prefix first, then id prefix, then anywhere: typing "rik" should surface "Riko's Boots"
// before "Brick".
const suggestions = computed<PickerOption[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return [];
  const ranked: { option: PickerOption; rank: number }[] = [];
  for (const option of props.options) {
    const name = option.name.toLowerCase();
    const id = option.id.toLowerCase();
    const rank = name.startsWith(q) ? 0 : id.startsWith(q) ? 1 : name.includes(q) || id.includes(q) ? 2 : -1;
    if (rank >= 0) ranked.push({ option, rank });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.option.name.localeCompare(b.option.name));
  return ranked.slice(0, MAX_SUGGESTIONS).map(r => r.option);
});

watch(query, () => { highlighted.value = 0; open.value = true; });

function move(step: number) {
  const count = suggestions.value.length;
  if (!count) return;
  highlighted.value = (highlighted.value + step + count) % count;
}

function pick(option: PickerOption | undefined) {
  if (!option) return;
  emit('pick', option.id);
  query.value = '';
}

// Escape is bound with .prevent: the game opens its menu on any Escape left unhandled.
function onEscape() {
  if (query.value) query.value = '';
  else inputEl.value?.blur();
}

// The autofocus attribute only acts on page load, not on an input mounted later.
onMounted(() => {
  if (props.autofocus) inputEl.value?.focus();
});
</script>

<template>
  <div class="debug-picker">
    <div class="picker-field">
      <i class="pi pi-search picker-icon"></i>
      <input ref="inputEl" v-model="query" class="picker-input" type="text" spellcheck="false"
        :placeholder="placeholder" @focus="open = true" @blur="open = false"
        @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="pick(suggestions[highlighted])" @keydown.esc.prevent="onEscape" />
    </div>
    <div v-if="open && query.trim()" class="picker-list">
      <!-- mousedown, not click: the input's blur would close the list before a click lands -->
      <div v-for="(option, i) in suggestions" :key="option.id" class="picker-row"
        :class="{ highlighted: i === highlighted }" @mousedown.prevent="pick(option)" @mouseenter="highlighted = i">
        <span class="picker-thumb">
          <img v-if="option.image" :src="option.image" alt="" />
        </span>
        <span class="picker-name">{{ option.name }}</span>
        <code class="picker-id">{{ option.id }}</code>
      </div>
      <div v-if="!suggestions.length" class="picker-empty">No matches</div>
    </div>
  </div>
</template>

<style scoped>
.debug-picker {
  display: flex;
  flex-direction: column;
}

.picker-field {
  position: relative;
  display: flex;
  align-items: center;
}

.picker-icon {
  position: absolute;
  left: 0.55rem;
  color: var(--editor-text-faint);
  font-size: 0.8em;
  pointer-events: none;
}

.picker-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.35rem 0.5rem 0.35rem 1.75rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-radius: 5px;
  background: var(--dp-control-hover, var(--editor-surface));
  color: var(--editor-text);
  font: inherit;
}

.picker-input:focus {
  outline: none;
  border-color: var(--editor-accent);
}

.picker-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-top: none;
  border-radius: 0 0 5px 5px;
  background: var(--dp-control-hover, var(--editor-surface));
  box-shadow: var(--editor-shadow);
  overflow: hidden;
}

.picker-row {
  display: grid;
  grid-template-columns: 1.6rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.45rem;
  padding: 0.25rem 0.5rem;
  cursor: pointer;
}

.picker-row.highlighted {
  background: var(--editor-tint-success);
}

.picker-thumb {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 3px;
  background: var(--editor-surface-sunken);
  overflow: hidden;
}

.picker-thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.picker-name {
  overflow-wrap: anywhere;
}

.picker-id {
  max-width: 7rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--editor-text-faint);
  font-size: 0.8em;
}

.picker-empty {
  padding: 0.35rem 0.5rem;
  color: var(--editor-text-faint);
  font-style: italic;
}
</style>
