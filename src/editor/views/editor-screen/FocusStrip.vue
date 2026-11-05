<script setup lang="ts">
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import Listbox from 'primevue/listbox';
import { Editor } from '../../editor';
import { Global } from '../../../global/global';
import { FOCUS_KEY, toggleFocusMode } from '../../focusMode';
import PlaytestMenu from './PlaytestMenu.vue';
import { continuePlaytest } from './usePlaytest';

type Tab = { id: string; name?: string };

/** Focus mode's one-line header: where you are, each part a picker, and the playtest buttons. */
const props = defineProps<{
  /** The main tabs the full header shows. */
  mainTabs: Tab[];
  /** The open main tab's subtabs. */
  subtabs: Tab[];
}>();

const editor = Editor.getInstance();
const global = Global.getInstance();

type CrumbKind = 'game' | 'mod' | 'main' | 'dungeon' | 'sub';
type Option = { label: string; value: string };

const mainLabel = (tab: Tab) => tab.name ?? global.getString('tab.' + tab.id);
const subLabel = (tab: Tab) => tab.name ?? global.getString('tab.' + editor.mainTab + '.' + tab.id);

const crumbs = computed(() => {
  const out: { kind: CrumbKind; label: string }[] = [];
  if (editor.selectedGame) out.push({ kind: 'game', label: editor.selectedGame });
  if (editor.selectedMod && (editor.selectedMod !== '_core' || editor.filteredMods.value.length > 1)) {
    out.push({ kind: 'mod', label: editor.selectedMod });
  }
  const main = props.mainTabs.find(t => t.id === editor.mainTab);
  out.push({ kind: 'main', label: main ? mainLabel(main) : editor.mainTab });
  if (editor.mainTab === 'dungeons' && editor.selectedDungeon) out.push({ kind: 'dungeon', label: editor.selectedDungeon });
  const sub = props.subtabs.find(t => t.id === editor.secondaryTab);
  if (sub) out.push({ kind: 'sub', label: subLabel(sub) });
  return out;
});

const pickerRef = ref<InstanceType<typeof Popover> | null>(null);
const picking = ref<CrumbKind | null>(null);

const pickerOptions = computed<Option[]>(() => {
  const ids = (list: string[]) => list.map(id => ({ label: id, value: id }));
  switch (picking.value) {
    case 'game': return ids(editor.filteredGames.value);
    case 'mod': return ids(editor.filteredMods.value);
    case 'main': return props.mainTabs.map(t => ({ label: mainLabel(t), value: t.id }));
    case 'dungeon': return ids(editor.filteredDungeons.value);
    case 'sub': return props.subtabs.map(t => ({ label: subLabel(t), value: t.id }));
    default: return [];
  }
});

const pickerValue = computed(() => {
  switch (picking.value) {
    case 'game': return editor.selectedGame;
    case 'mod': return editor.selectedMod;
    case 'main': return editor.mainTab;
    case 'dungeon': return editor.selectedDungeon;
    case 'sub': return editor.secondaryTab;
    default: return null;
  }
});

function openPicker(kind: CrumbKind, event: Event) {
  picking.value = kind;
  pickerRef.value?.show(event);
}

async function pick(value: string | null) {
  const kind = picking.value;
  pickerRef.value?.hide();
  if (!value || value === pickerValue.value) return;
  if (kind === 'game') await editor.setGame(value);
  else if (kind === 'mod') await editor.setMod(value);
  else if (kind === 'main') await editor.setMainTab(value);
  else if (kind === 'dungeon') await editor.setDungeon(value);
  else if (kind === 'sub') await editor.setSecondaryTab(value);
}
</script>

<template>
  <div class="focus-strip">
    <Button icon="pi pi-window-minimize" text size="small" class="focus-exit" aria-label="Show the full header"
      v-tooltip.bottom="`Show the full header (${FOCUS_KEY})`" @click="toggleFocusMode" />

    <nav class="focus-crumbs">
      <template v-for="(crumb, i) in crumbs" :key="crumb.kind">
        <span v-if="i" class="focus-crumb-sep" aria-hidden="true">›</span>
        <button type="button" class="focus-crumb" :class="{ 'focus-crumb--last': i === crumbs.length - 1 }"
          @click="openPicker(crumb.kind, $event)">
          <span class="focus-crumb-label">{{ crumb.label }}</span>
          <i class="pi pi-chevron-down" />
        </button>
      </template>
    </nav>

    <div class="focus-actions">
      <PlaytestMenu />
      <Button icon="pi pi-replay" label="Continue" severity="success" size="small" @click="continuePlaytest"
        :disabled="!editor.selectedGame || editor.hasUnsavedChanges.value"
        v-tooltip.bottom="editor.hasUnsavedChanges.value ? 'You have unsaved changes' : 'Resume your last playtest: replays the paragraph you left on, with your latest saved changes.'" />
    </div>

    <Popover ref="pickerRef" @hide="picking = null">
      <Listbox :modelValue="pickerValue" :options="pickerOptions" optionLabel="label" optionValue="value"
        :filter="pickerOptions.length > 8" filterPlaceholder="Find…" class="focus-picker" listStyle="max-height: 300px"
        @update:modelValue="pick" />
    </Popover>
  </div>
</template>

<style scoped>
.focus-strip {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 3px 10px;
  min-height: 38px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--editor-border);
}

.focus-crumbs {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

.focus-crumb {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  min-width: 0;
  padding: 0.2rem 0.45rem;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--editor-text-muted);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}

.focus-crumb:hover {
  background: var(--editor-surface-hover);
  color: var(--editor-text);
}

.focus-crumb--last {
  color: var(--editor-text);
  font-weight: 600;
}

.focus-crumb-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.focus-crumb .pi {
  font-size: 0.6rem;
  opacity: 0.6;
}

.focus-crumb-sep {
  color: var(--editor-text-faint);
}

.focus-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
}

.focus-picker {
  min-width: 14rem;
  border: none;
}
</style>
