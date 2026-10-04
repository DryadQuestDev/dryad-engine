<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';
import type { Schema, Schemable } from '../../../../utility/schema';
import { hintDefault, type ResolvedLayout } from '../../../editorLayouts';
import FieldValueInput from './FieldValueInput.vue';
import { isNumberMap, isSimpleField, plainText } from './fieldHelpers';
import { buildPalette, companionLabel, emptyCompanionIndex, type CompanionIndex } from './fieldGroups';

/**
 * A definition-driven object (ability meta, item traits, item scripts) as floating-label fields in
 * the editor layout's groups. Pinned fields always show; the rest appear once set and are added
 * from a grouped menu. A companion field (a flag its owner's template references) sits inside its
 * owner's cell.
 */
const props = defineProps<{
  values: Record<string, any> | undefined;
  fields: Schema;
  defsById: Map<string, any>;
  companions?: CompanionIndex;
  layout: ResolvedLayout;
  labelsFor: (key: string) => Map<string, string> | undefined;
  usage: Map<string, number>;
  /** Show pinned fields while empty. Off on modifiers, which carry no meta of their own by design. */
  showPinned: boolean;
  /** Placeholder of the add menu. */
  addLabel?: string;
}>();

const companionIndex = computed(() => props.companions ?? emptyCompanionIndex());

const emit = defineEmits<{
  set: [key: string, value: any];
  remove: [key: string];
}>();

const root = ref<HTMLElement | null>(null);
const current = computed<Record<string, any>>(() => props.values ?? {});

function isPinned(key: string): boolean {
  return props.showPinned && !!props.layout.hints.get(key)?.pinned;
}

// A key counts as present from the moment it is added, even while its input is empty, so a
// cleared field keeps its cell until it is removed.
function isPresent(key: string): boolean {
  return key in current.value;
}

const ownerKeys = computed(() => Object.keys(props.fields).filter(key => isPresent(key) || isPinned(key)));

/** Companions render inside a visible owner's cell. */
const inlineCompanions = computed(() => {
  const inline = new Set<string>();
  for (const key of ownerKeys.value) {
    for (const companion of companionIndex.value.companionsOf.get(key) ?? []) {
      if (props.fields[companion]) inline.add(companion);
    }
  }
  return inline;
});

const cellKeys = computed(() => ownerKeys.value.filter(key => !inlineCompanions.value.has(key)));

// Present keys with no field in the schema: shown raw so they can be removed.
const unknownKeys = computed(() => Object.keys(current.value).filter(key => !props.fields[key]));

interface CellGroup { id: string; name: string; color: string | null; keys: string[] }

const groups = computed<CellGroup[]>(() => {
  const byDefOrder = (a: string, b: string) => (props.defsById.get(a)?.order ?? 0) - (props.defsById.get(b)?.order ?? 0) || a.localeCompare(b);
  const remaining = new Set(cellKeys.value);
  const out: CellGroup[] = [];
  for (const group of props.layout.groups) {
    const keys = group.members.filter(member => remaining.has(member));
    for (const key of keys) remaining.delete(key);
    if (keys.length) out.push({ id: group.id, name: group.name, color: group.color, keys });
  }
  if (remaining.size) {
    out.push({ id: '__other', name: out.length ? 'Other' : 'Fields', color: null, keys: [...remaining].sort(byDefOrder) });
  }
  return out;
});

const collapsed = ref(new Set<string>(props.layout.groups.filter(group => group.collapsed).map(group => group.id)));

function toggleGroup(id: string) {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  collapsed.value = next;
}

// Rich text, files, lists and maps get a full row; a file path is long, and its box needs the room.
function isWide(field: Schemable | undefined): boolean {
  if (!field) return false;
  if (isNumberMap(field)) return true;
  return field.type === 'textarea' || !isSimpleField(field);
}

function description(key: string): string {
  return plainText(props.defsById.get(key)?.description);
}

const palette = computed(() => {
  const addable = Object.keys(props.fields).filter(key =>
    !isPresent(key) && !isPinned(key) && !companionIndex.value.ownersOf.has(key));
  return buildPalette(addable, props.layout, props.defsById, props.usage, 6);
});

function add(key: string | null) {
  if (!key) return;
  const parsed = hintDefault(props.layout.hints.get(key), props.fields[key]);
  let value: any = null;
  if (parsed.found) value = parsed.value;
  else if (props.fields[key]?.type === 'boolean') value = true;
  emit('set', key, value);
  nextTick(() => {
    const input = root.value?.querySelector<HTMLElement>(`[data-cell="${key}"] input`);
    input?.focus();
  });
}

function setCompanion(key: string, value: any) {
  if (value === false || value === null || value === undefined || value === '') emit('remove', key);
  else emit('set', key, value);
}
</script>

<template>
  <div ref="root" class="meta-panel">
    <section v-for="group in groups" :key="group.id" class="mp-group"
      :style="group.color ? { '--group-color': group.color } : undefined">
      <button type="button" class="mp-group-head" @click="toggleGroup(group.id)">
        <span class="pi" :class="collapsed.has(group.id) ? 'pi-chevron-right' : 'pi-chevron-down'" />
        <span class="mp-group-name">{{ group.name }}</span>
        <span class="mp-group-count">{{ group.keys.length }}</span>
      </button>
      <div v-show="!collapsed.has(group.id)" class="mp-grid">
        <div v-for="key in group.keys" :key="key" class="mp-cell" :class="{ wide: isWide(fields[key]) }"
          v-bind="{ 'data-cell': key }">
          <FieldValueInput :field="fields[key]" :field-key="key" :modelValue="current[key]"
            @update:modelValue="(v: any) => emit('set', key, v)" :hint="layout.hints.get(key)" :label="key"
            :labels="labelsFor(key)" :holder="current" :holder-schema="fields" />
          <span v-for="companion in (companionIndex.companionsOf.get(key) ?? []).filter(c => fields[c])" :key="companion"
            class="mp-companion">
            <button v-if="fields[companion].type === 'boolean'" type="button" class="mp-chip"
              :class="{ on: current[companion] === true }" v-tooltip.top="companion"
              @click="setCompanion(companion, current[companion] === true ? false : true)">
              {{ companionLabel(companion, key) }}
            </button>
            <FieldValueInput v-else :field="fields[companion]" :field-key="companion" :modelValue="current[companion]"
              @update:modelValue="(v: any) => setCompanion(companion, v)" :hint="layout.hints.get(companion)"
              :placeholder="companionLabel(companion, key)" :labels="labelsFor(companion)" :holder="current"
              :holder-schema="fields" />
          </span>
          <span class="mp-cell-tools">
            <span v-if="description(key)" class="pi pi-info-circle mp-info" v-tooltip.top="description(key)" />
            <Button v-if="!isPinned(key)" icon="pi pi-times" text rounded size="small" severity="danger"
              v-tooltip.top="'Remove field'" @click="emit('remove', key)" />
          </span>
        </div>
      </div>
    </section>

    <div v-if="unknownKeys.length" class="mp-unknown">
      <span v-for="key in unknownKeys" :key="key" class="mp-unknown-chip">
        <code>{{ key }}</code>
        <Button icon="pi pi-times" text rounded size="small" severity="danger" v-tooltip.top="'Remove this key'"
          @click="emit('remove', key)" />
      </span>
    </div>

    <Select v-if="palette.length" :modelValue="null" @update:modelValue="add" :options="palette" optionLabel="label"
      optionValue="value" optionGroupLabel="label" optionGroupChildren="items" :filterFields="['label', 'desc']"
      filter :placeholder="addLabel ?? '+ Add field'" size="small" appendTo="body" class="mp-add">
      <template #option="{ option }">
        <div class="pal-option">
          <code>{{ option.label }}</code>
          <span v-if="option.desc" class="pal-desc">{{ option.desc }}</span>
        </div>
      </template>
    </Select>
  </div>
</template>

<style scoped>
.meta-panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.mp-group {
  border-left: 3px solid var(--group-color, var(--editor-border-strong));
  padding-left: 0.6rem;
}

.mp-group-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: none;
  border: none;
  padding: 0.1rem 0;
  margin-bottom: 0.45rem;
  cursor: pointer;
  color: var(--editor-text-muted);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.mp-group-head .pi {
  font-size: 0.65rem;
}

.mp-group-count {
  font-weight: normal;
  text-transform: none;
}

.mp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
  gap: 0.75rem 0.9rem;
}

.mp-cell {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.mp-cell > :first-child {
  flex: 1;
  min-width: 0;
}

.mp-cell.wide {
  grid-column: 1 / -1;
}

.mp-companion {
  flex: 0 0 auto;
}

.mp-chip {
  font: inherit;
  font-size: 0.78rem;
  padding: 0.05rem 0.5rem;
  border-radius: 999px;
  border: 1px dashed var(--editor-border-strong);
  background: transparent;
  color: var(--editor-text-faint);
  cursor: pointer;
  white-space: nowrap;
}

.mp-chip.on {
  border-style: solid;
  border-color: var(--editor-accent);
  color: var(--editor-accent);
  background: var(--editor-surface-selected);
}

.mp-cell-tools {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  opacity: 0.4;
  transition: opacity 0.15s ease;
}

.mp-cell:hover .mp-cell-tools,
.mp-cell:focus-within .mp-cell-tools {
  opacity: 1;
}

.mp-info {
  font-size: 0.8rem;
  color: var(--editor-text-muted);
  padding: 0 0.2rem;
}

.mp-unknown {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.mp-unknown-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  padding-left: 0.4rem;
  border: 1px solid var(--editor-fg-danger);
  border-radius: 4px;
}

.mp-add {
  align-self: flex-start;
  min-width: 14rem;
}

.pal-option {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  max-width: 28rem;
}

.pal-desc {
  font-size: 0.75rem;
  color: var(--editor-text-muted);
  white-space: normal;
}
</style>
