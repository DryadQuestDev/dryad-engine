<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useStorage } from '@vueuse/core';
import InputText from 'primevue/inputtext';
import { Game } from '../../game';
import {
  devLogGroups, devLogFlush, markDevLogReplay, devLogFilterDefaults, DEV_LOG_FILTERS_KEY,
  type DevLogGroup, type DevLogKind, type DevLogRow,
} from '../../utils/devLog';
import { backToEditor, replayCheckpoint } from '../../utils/devPlaytest';
import { checkpointSlot } from '../../../services/devCheckpoints';

type ViewGroup = { group: DevLogGroup; rows: DevLogRow[]; muted: boolean };

const KINDS: { id: DevLogKind; label: string }[] = [
  { id: 'para', label: 'Paragraphs' },
  { id: 'choice', label: 'Choices' },
  { id: 'var', label: 'Variables' },
  { id: 'action', label: 'Actions' },
  { id: 'problem', label: 'Problems' },
];

const PAGE = 80;
const SPEAKER_INKS = ['teal', 'amber', 'blue', 'purple', 'green', 'pink', 'orange'];

const game = Game.getInstance();
const ds = game.dungeonSystem;

const filters = useStorage(DEV_LOG_FILTERS_KEY, devLogFilterDefaults(), localStorage, { mergeDefaults: true });
const shown = ref(PAGE);

// Ages and item counts changed outside any action (the loot screen, a script) keep up while open.
const now = ref(Date.now());
let timer = 0;
onMounted(() => {
  devLogFlush();
  timer = window.setInterval(() => {
    now.value = Date.now();
    devLogFlush();
  }, 2000);
});
onBeforeUnmount(() => clearInterval(timer));

watch(() => [filters.value.search, filters.value.kinds.length], () => { shown.value = PAGE; });

function toggleKind(kind: DevLogKind) {
  const kinds = filters.value.kinds;
  const at = kinds.indexOf(kind);
  if (at === -1) kinds.push(kind);
  else kinds.splice(at, 1);
}

function rowKind(row: DevLogRow): DevLogKind {
  return row.t;
}

function rowText(row: DevLogRow): string {
  if (row.t === 'var') return `${row.kind} ${row.key} ${row.where ?? ''} ${row.old} ${row.new}`;
  if (row.t === 'action') return `${row.key} ${row.value}`;
  return `problem ${row.message}`;
}

function headerText(group: DevLogGroup): string {
  switch (group.t) {
    case 'para': return `${group.sceneId} ${group.dungeonId ?? ''} ${group.speaker ?? ''} ${group.text ?? ''}`;
    case 'choice': return `picked ${group.label} ${group.choiceId}`;
    case 'console': return `${group.source ?? 'console'} ${group.input}`;
    default: return `${group.note} ${group.place ?? ''} ${group.via ?? ''}`;
  }
}

function headerKind(group: DevLogGroup): DevLogKind | null {
  return group.t === 'para' ? 'para' : group.t === 'choice' ? 'choice' : null;
}

/**
 * Newest first. A search that hits a group's own line keeps all its rows; otherwise only the rows
 * it hits show, under their group's line for context. A group whose own kind is filtered out
 * shows only for rows that are still on.
 */
const visible = computed<ViewGroup[]>(() => {
  const groups = devLogGroups.value;
  const kinds = new Set(filters.value.kinds);
  const query = filters.value.search.trim().toLowerCase();
  const out: ViewGroup[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i];
    const kind = headerKind(group);
    const headerOn = kind ? kinds.has(kind) : true;
    const headerHit = !query || headerText(group).toLowerCase().includes(query);
    let rows = group.rows.filter(row => kinds.has(rowKind(row)));
    if (query && !(headerOn && headerHit)) rows = rows.filter(row => rowText(row).toLowerCase().includes(query));
    if (!(headerOn && headerHit) && !rows.length) continue;
    out.push({ group, rows, muted: !headerOn });
  }
  return out;
});

const page = computed(() => visible.value.slice(0, shown.value));

/** The paragraph on screen: the newest one played, while a scene is up. */
const currentId = computed(() => {
  if (!ds.currentSceneId.value) return null;
  const groups = devLogGroups.value;
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i].t === 'para') return groups[i].id;
  }
  return null;
});

const manyDungeons = computed(() => new Set(devLogGroups.value.filter(g => g.t === 'para').map(g => g.dungeonId)).size > 1);

function slotFor(group: DevLogGroup): string | null {
  if (group.cp === undefined || group.id === currentId.value) return null;
  return checkpointSlot(game.coreSystem.gameId, group.cp);
}

function backToHere(group: DevLogGroup) {
  const slot = slotFor(group);
  if (!slot) return;
  markDevLogReplay('Back to here');
  replayCheckpoint(slot);
}

function openInEditor(group: DevLogGroup) {
  backToEditor({ sceneId: group.sceneId ?? null, dungeonId: group.dungeonId ?? null });
}

function age(at: number): string {
  const seconds = Math.max(0, Math.round((now.value - at) / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function speakerInk(speaker: string): string {
  let hash = 0;
  for (const ch of speaker) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return `var(--editor-ink-${SPEAKER_INKS[Math.abs(hash) % SPEAKER_INKS.length]})`;
}

function systemLine(group: DevLogGroup): string {
  if (!group.place) return group.note ?? '';
  if (group.note === 'New game') return `New game · entered ${group.place}`;
  // A replay names its paragraph; a load, where it landed.
  return group.place.startsWith('#') ? `${group.note} ${group.place}` : `${group.note} · ${group.place}`;
}

function clearSearch() {
  filters.value.search = '';
}
</script>

<template>
  <div class="debug-log">
    <div class="filters">
      <div class="search">
        <InputText :modelValue="filters.search" @update:modelValue="filters.search = $event ?? ''"
          placeholder="Search the log" class="search-input" @keydown.esc.prevent="clearSearch" />
        <button v-if="filters.search" class="search-clear" title="Clear" @click="clearSearch">✕</button>
      </div>
      <div class="filter-chips">
        <button v-for="kind in KINDS" :key="kind.id" class="chip" :class="{ active: filters.kinds.includes(kind.id) }"
          @click="toggleKind(kind.id)">
          <span class="chip-dot" :class="`ink-${kind.id}`"></span>{{ kind.label }}
        </button>
      </div>
    </div>

    <div v-if="page.length" class="log-list">
      <template v-for="{ group, rows, muted } in page" :key="group.id">
        <div v-if="group.t === 'system'" class="system-line">
          <span>{{ systemLine(group) }}</span>
          <span v-if="group.via" class="system-via">{{ group.via }}</span>
          <span v-if="group.n && group.n > 1" class="count">×{{ group.n }}</span>
        </div>

        <div v-else class="log-group" :class="[`group-${group.t}`, { current: group.id === currentId, muted }]">
          <div class="group-top">
            <template v-if="group.t === 'para'">
              <code class="group-id" :title="`${group.dungeonId} › ${group.sceneId}`"><span v-if="manyDungeons"
                  class="group-dungeon">{{ group.dungeonId }} › </span>{{ group.sceneId }}</code>
            </template>
            <span v-else-if="group.t === 'choice'" class="group-title" :title="group.choiceId">Picked <strong>{{ group.label }}</strong></span>
            <span v-else class="group-title">{{ group.source ?? 'Console' }} <code class="console-input">{{ group.input }}</code></span>
            <span v-if="group.t !== 'choice'" class="age">{{ age(group.at) }}</span>
            <template v-if="group.t === 'para'">
              <button v-if="slotFor(group)" class="icon-button" v-tooltip.left="'Back to here: replay this paragraph on the state it had then'"
                @click="backToHere(group)"><i class="pi pi-replay"></i></button>
              <button v-if="group.dungeonId" class="icon-button" v-tooltip.left="'Open in editor'" @click="openInEditor(group)">
                <i class="pi pi-pencil"></i>
              </button>
            </template>
          </div>
          <div v-if="group.t === 'para' && !muted" class="group-text">
            <template v-if="group.text">
              <strong v-if="group.speaker" class="speaker" :style="{ color: speakerInk(group.speaker) }">{{ group.speaker }}:</strong>
              {{ group.text }}
            </template>
            <span v-else class="faint">(no text)</span>
          </div>

          <div v-for="(row, i) in rows" :key="i" class="log-row">
            <template v-if="row.t === 'var'">
              <span class="tag ink-var">{{ row.kind }}</span>
              <span class="row-body">
                {{ row.key }}
                <s class="old">{{ row.old }}</s> → <strong>{{ row.new }}</strong>
                <span v-if="row.where" class="faint where">· {{ row.where }}</span>
              </span>
            </template>
            <template v-else-if="row.t === 'action'">
              <span class="tag ink-action">{{ row.key }}</span>
              <span class="row-body">{{ row.value }} <span v-if="row.same" class="faint">(no change)</span></span>
            </template>
            <template v-else>
              <span class="tag ink-problem">problem</span>
              <span class="row-body">{{ row.message }}</span>
            </template>
            <span v-if="row.n > 1" class="count">×{{ row.n }}</span>
          </div>
          <div v-if="group.more && !muted" class="faint more">+{{ group.more }} more not kept</div>
        </div>
      </template>
      <button v-if="visible.length > shown" class="show-more" @click="shown += PAGE">
        Show {{ Math.min(PAGE, visible.length - shown) }} older
      </button>
    </div>
    <p v-else class="empty">{{ devLogGroups.length ? 'No matches.' : 'Nothing recorded yet.' }}</p>

    <p class="hint">
      <i class="pi pi-replay"></i> goes back to that paragraph (the last 10). Clicking a variable in Variables
      filters the log to the lines that changed it.
    </p>
  </div>
</template>

<style scoped>
/* Painted against the host debug panel (Debug.vue), which follows the editor's theme. */
.debug-log {
  --ink-para: var(--editor-text-faint);
  --ink-choice: var(--editor-ink-green);
  --ink-var: var(--editor-ink-blue);
  --ink-action: var(--editor-ink-purple);
  --ink-problem: var(--editor-ink-red);

  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  color: var(--editor-text);
  /* The game sets a large body font; the panel is narrow, so size from the root instead. */
  font-size: 0.875rem;
}

.filters {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.search {
  position: relative;
}

.search-input {
  width: 100%;
  padding-right: 2rem;
}

.search-clear {
  position: absolute;
  top: 50%;
  right: 0.4rem;
  transform: translateY(-50%);
  border: none;
  background: transparent;
  color: var(--editor-text-faint);
  cursor: pointer;
  padding: 0.2rem;
}

.search-clear:hover {
  color: var(--editor-text);
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  border-radius: 1rem;
  border: 1px solid var(--editor-border-strong);
  background: var(--editor-surface-sunken);
  color: var(--editor-text-muted);
  font-size: 0.85em;
  cursor: pointer;
}

.chip:hover {
  background: var(--editor-surface);
}

.chip.active {
  background: #42b983;
  border-color: var(--editor-ink-green);
  color: #fff;
}

.chip-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--ink);
}

.ink-para { --ink: var(--ink-para); }
.ink-choice { --ink: var(--ink-choice); }
.ink-var { --ink: var(--ink-var); }
.ink-action { --ink: var(--ink-action); }
.ink-problem { --ink: var(--ink-problem); }

.chip.active .chip-dot {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.7);
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.log-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-left: 4px solid var(--editor-border-strong);
  border-radius: 4px;
  background: var(--dp-control, var(--editor-surface-sunken));
  min-width: 0;
}

.log-group.current {
  border-left-color: var(--editor-ink-blue);
  background: color-mix(in srgb, var(--editor-ink-blue) 9%, var(--dp-control, var(--editor-surface-sunken)));
}

.log-group.group-choice {
  border: 1px solid var(--editor-ink-green);
  background: var(--editor-tint-success);
}

.log-group.group-console {
  border-left-color: var(--editor-ink-purple);
}

.log-group.muted .group-top {
  opacity: 0.6;
}

.group-top {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.group-id {
  flex: 1;
  min-width: 0;
  font-size: 0.85em;
  overflow-wrap: anywhere;
  color: var(--editor-text-muted);
}

.group-dungeon {
  color: var(--editor-text-faint);
}

.group-title {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.console-input {
  font-size: 0.85em;
  color: var(--editor-text-muted);
}

.age {
  flex-shrink: 0;
  font-size: 0.78em;
  color: var(--editor-text-faint);
  font-variant-numeric: tabular-nums;
}

.icon-button {
  flex-shrink: 0;
  padding: 0.15rem 0.3rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--editor-text-muted);
  font-size: 0.85em;
  cursor: pointer;
}

.icon-button:hover {
  background: var(--editor-surface-hover);
  color: var(--editor-text);
}

.group-text {
  overflow-wrap: anywhere;
}

.speaker {
  font-weight: 700;
}

.log-row {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding-left: 0.6rem;
  font-size: 0.92em;
  min-width: 0;
}

.tag {
  flex-shrink: 0;
  padding: 0 0.3rem;
  border-radius: 3px;
  background: color-mix(in srgb, var(--ink) 14%, transparent);
  color: var(--ink);
  font-family: monospace;
  font-size: 0.9em;
  font-weight: 700;
}

.row-body {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.old {
  color: var(--editor-text-faint);
}

.count {
  flex-shrink: 0;
  font-size: 0.8em;
  color: var(--editor-text-faint);
}

.faint {
  color: var(--editor-text-faint);
}

.where {
  margin-left: 0.3em;
}

.more {
  padding-left: 0.6rem;
  font-size: 0.85em;
}

.system-line {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.1rem 0.5rem;
  color: var(--editor-text-muted);
  font-size: 0.9em;
}

.system-line > span:first-child {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.system-via {
  flex-shrink: 0;
  padding: 0 0.3rem;
  border: 1px solid var(--editor-border-strong);
  border-radius: 3px;
  font-size: 0.85em;
}

.show-more {
  align-self: center;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-radius: 4px;
  background: var(--dp-control, var(--editor-surface-sunken));
  color: var(--editor-text);
  cursor: pointer;
}

.show-more:hover {
  border-color: var(--dp-border-hover, var(--editor-border-strong));
}

.empty {
  margin: 0;
  padding: 1rem 0;
  color: var(--editor-text-faint);
  font-style: italic;
  text-align: center;
}

.hint {
  margin: 0;
  font-size: 0.85em;
  color: var(--editor-text-muted);
}

.hint .pi {
  font-size: 0.85em;
}
</style>
