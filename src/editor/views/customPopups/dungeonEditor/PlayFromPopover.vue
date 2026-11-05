<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import Popover from 'primevue/popover';
import Button from 'primevue/button';
import RadioButton from 'primevue/radiobutton';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import { Editor } from '../../../editor';
import { listSnapshots, snapshotAge, snapshotPlace } from '../../../../services/devSnapshots';
import {
  SET_FIRST_KINDS, prefillFromConditions, rememberedSetup,
  type PlayTarget, type Prefill, type SetFirstKind, type SetFirstRow,
} from '../../../playFrom';
import { playFromTarget } from '../../editor-screen/usePlaytest';

const editor = Editor.getInstance();

const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
const target = ref<PlayTarget | null>(null);
const startKind = ref<'new' | 'snapshot'>('new');
const snapshotId = ref<string | null>(null);
const rows = ref<SetFirstRow[]>([]);
// Rows filled from the target's own condition, by object identity, for their highlight.
const filledRows = ref(new Set<SetFirstRow>());
const prefill = ref<Prefill | null>(null);
const fromMemory = ref(false);

const propertyTypes = ref(new Map<string, string>());
const suggestions = ref<Record<SetFirstKind, string[]>>({ property: [], flag: [], item: [], character: [] });

const snapshots = computed(() => listSnapshots(editor.selectedGame ?? ''));
const snapshotOptions = computed(() => snapshots.value.map(s => ({
  id: s.id, name: s.name, detail: `${snapshotPlace(s)} · ${snapshotAge(s.savedAt)}`,
})));

const isBranch = computed(() => target.value?.id.startsWith('~') ?? false);

// The game's own ids, for the key fields' suggestions and the property types the prefill needs.
let vocabularyFor: string | null = null;

async function loadVocabulary() {
  const [properties, items, characters] = await Promise.all([
    editor.loadFullData('properties').catch(() => [] as any[]),
    editor.loadFullData('item_templates').catch(() => [] as any[]),
    editor.loadFullData('character_templates').catch(() => [] as any[]),
  ]);
  const types = new Map<string, string>();
  for (const p of properties) if (p?.id && !p.is_constant) types.set(String(p.id), p.type || 'number');
  propertyTypes.value = types;
  suggestions.value = {
    property: [...types.keys()].sort(),
    flag: [],
    item: items.map((i: any) => i?.id).filter(Boolean).map(String).sort(),
    character: characters.map((c: any) => c?.id).filter(Boolean).map((id: string) => `${id}.attribute.`).sort(),
  };
}

function applyPrefill() {
  const t = target.value;
  if (!t) return;
  const result = prefillFromConditions(t.conditions, propertyTypes.value);
  prefill.value = result;
  rows.value = result.rows;
  filledRows.value = new Set(result.rows);
  fromMemory.value = false;
}

/** Open for `t`, anchored at the clicked button. */
async function open(event: Event, t: PlayTarget) {
  const anchor = event.currentTarget as HTMLElement | null;
  popoverRef.value?.hide();
  target.value = t;
  // First opening waits for the types; later ones refresh them behind the popover.
  if (vocabularyFor !== editor.selectedGame) {
    vocabularyFor = editor.selectedGame;
    await loadVocabulary();
  } else {
    loadVocabulary();
  }
  const memory = rememberedSetup(editor.selectedGame ?? '', t);
  const knownSnapshot = memory && memory.start !== 'new' && snapshots.value.some(s => s.id === memory.start);
  startKind.value = knownSnapshot ? 'snapshot' : 'new';
  snapshotId.value = knownSnapshot ? memory!.start : snapshots.value[0]?.id ?? null;
  if (memory) {
    rows.value = memory.rows.map(r => ({ ...r }));
    filledRows.value = new Set();
    prefill.value = prefillFromConditions(t.conditions, propertyTypes.value);
    fromMemory.value = true;
  } else {
    applyPrefill();
  }
  await nextTick();
  // The event is spent by now; the popover only needs its anchor, to tell clicks on it apart.
  if (anchor) popoverRef.value?.show({ currentTarget: anchor } as unknown as Event, anchor);
  // Focus inside, so Enter plays and Escape closes it here rather than opening the main menu.
  window.setTimeout(() => document.querySelector<HTMLElement>('.play-from .play-from-go')?.focus(), 50);
}

function closeOnEscape(event: KeyboardEvent) {
  event.preventDefault();
  popoverRef.value?.hide();
}

function addRow(kind: SetFirstKind) {
  rows.value = [...rows.value, { kind, key: '', value: kind === 'item' ? '1' : '' }];
  nextTick(() => {
    const inputs = document.querySelectorAll<HTMLInputElement>('.play-from .set-first-key');
    inputs[inputs.length - 1]?.focus();
  });
}

function removeRow(index: number) {
  rows.value = rows.value.filter((_, i) => i !== index);
}

function kindHint(kind: SetFirstKind) {
  return SET_FIRST_KINDS.find(k => k.kind === kind)!;
}

// Property and flag rows are one "variable" row that can switch between the two.
function toggleVariableKind(row: SetFirstRow) {
  if (row.kind === 'property') row.kind = 'flag';
  else if (row.kind === 'flag') row.kind = 'property';
}

// A lone `if` reads as its clauses; several groups keep their keys.
const conditionText = computed(() => {
  const c = target.value?.conditions ?? {};
  const keys = Object.keys(c) as (keyof typeof c)[];
  if (keys.length === 1 && keys[0] === 'if') return String(c.if);
  return (prefill.value?.read ?? []).join(' and ');
});

const subject = computed(() => isBranch.value ? 'This choice' : 'This scene');

const verb = computed(() => {
  const c = target.value?.conditions ?? {};
  const shows = c.if !== undefined || c.ifOr !== undefined;
  const picks = c.active !== undefined || c.activeOr !== undefined;
  if (!isBranch.value) return 'plays by itself only when';
  if (shows && picks) return 'shows and can be picked only when';
  return picks ? 'can be picked only when' : 'shows only when';
});

const canPlay = computed(() => !!target.value && (startKind.value === 'new' || !!snapshotId.value));

function play() {
  const t = target.value;
  if (!t || !canPlay.value) return;
  const start = startKind.value === 'new' ? 'new' : snapshotId.value!;
  popoverRef.value?.hide();
  playFromTarget(t, { start, rows: rows.value.filter(r => r.key.trim()).map(r => ({ ...r })) });
}

function onSnapshotPicked() {
  startKind.value = 'snapshot';
}

defineExpose({ open });
</script>

<template>
  <Popover ref="popoverRef">
    <div v-if="target" class="play-from" @keydown.esc="closeOnEscape">
      <div class="play-from-title">
        <i class="pi pi-play play-from-icon" />
        <span>Play from</span>
        <span class="play-from-name" :class="isBranch ? 'play-from-name--branch' : 'play-from-name--scene'">{{ target.title }}</span>
      </div>
      <div class="play-from-where"><code>{{ target.id }}</code> · {{ target.where }}<template v-if="target.dungeonId"> · {{ target.dungeonId }}</template></div>

      <div class="play-from-section">Start from</div>
      <label class="play-from-radio">
        <RadioButton v-model="startKind" value="new" input-id="play-from-new" />
        <span>A new game</span>
      </label>
      <div class="play-from-radio">
        <RadioButton v-model="startKind" value="snapshot" input-id="play-from-snapshot" :disabled="!snapshots.length" />
        <label for="play-from-snapshot" :class="{ 'play-from-disabled': !snapshots.length }">A snapshot</label>
        <Select v-model="snapshotId" :options="snapshotOptions" option-label="name" option-value="id" size="small"
          class="play-from-snapshot-select" :disabled="!snapshots.length"
          :placeholder="snapshots.length ? 'Pick one' : 'None yet'" @change="onSnapshotPicked">
          <template #option="{ option }">
            <div class="play-from-snapshot-option">
              <span>{{ option.name }}</span>
              <small>{{ option.detail }}</small>
            </div>
          </template>
        </Select>
      </div>

      <div class="play-from-section">Set first</div>
      <div v-if="!rows.length" class="play-from-empty">Nothing. The game plays it with the values it has.</div>
      <div v-for="(row, i) in rows" :key="i" class="set-first-row" :class="{ 'set-first-row--filled': filledRows.has(row) }">
        <button v-if="row.kind === 'property' || row.kind === 'flag'" type="button" class="set-first-kind"
          :class="`set-first-kind--${row.kind}`" v-tooltip.top="'Switch between a property and a flag'"
          @click="toggleVariableKind(row)">{{ row.kind }}</button>
        <span v-else class="set-first-kind" :class="`set-first-kind--${row.kind}`">{{ row.kind }}</span>
        <InputText v-model="row.key" size="small" class="set-first-key" :placeholder="kindHint(row.kind).keyHint"
          :list="`play-from-${row.kind}-ids`" spellcheck="false" />
        <span class="set-first-op">{{ row.kind === 'item' ? '×' : '=' }}</span>
        <InputText v-model="row.value" size="small" class="set-first-value" :placeholder="kindHint(row.kind).valueHint"
          spellcheck="false" @keydown.enter="play" />
        <button type="button" class="set-first-remove" title="Remove" @click="removeRow(i)"><i class="pi pi-times" /></button>
      </div>
      <datalist v-for="kind in (['property', 'item', 'character'] as const)" :id="`play-from-${kind}-ids`" :key="kind">
        <option v-for="id in suggestions[kind]" :key="id" :value="id" />
      </datalist>
      <div class="play-from-add">
        <button type="button" @click="addRow('property')">+ Variable</button>
        <button type="button" @click="addRow('item')">+ Item</button>
        <button type="button" @click="addRow('character')">+ Character change</button>
      </div>

      <div v-if="prefill && (prefill.filled.length || prefill.unfilled.length || fromMemory)" class="play-from-note">
        <i class="pi pi-info-circle" />
        <div>
          <template v-if="fromMemory">
            Set up as last time.
            <button v-if="prefill.read.length" type="button" class="play-from-link" @click="applyPrefill">Fill from its condition</button>
          </template>
          <template v-else>
            <div v-if="prefill.filled.length">
              {{ subject }} {{ verb }} <code>{{ conditionText }}</code>, so
              <template v-if="prefill.filled.length === 1"><b>{{ prefill.filled[0] }}</b> was filled in for you.</template>
              <template v-else>the values it needs were filled in for you.</template>
            </div>
            <div v-if="prefill.unfilled.length" class="play-from-unfilled">
              Can't fill
              <template v-for="(u, i) in prefill.unfilled" :key="u"><code>{{ u }}</code>{{ i < prefill.unfilled.length - 1 ? ', ' : '' }}</template>.
              Set it above, or start from a snapshot where it holds.
            </div>
          </template>
        </div>
      </div>

      <div class="play-from-footer">
        <Button icon="pi pi-play" label="Play" size="small" severity="success" class="play-from-go" :disabled="!canPlay"
          @click="play" />
        <span class="play-from-dev">dev only</span>
      </div>
    </div>
  </Popover>
</template>

<style scoped>
.play-from {
  width: 25rem;
  max-width: calc(100vw - 2rem);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--editor-text);
}

.play-from-title {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  font-size: 1rem;
  font-weight: 700;
}

.play-from-icon {
  font-size: 0.8rem;
  color: var(--editor-fg-success);
}

.play-from-name {
  overflow-wrap: anywhere;
}

.play-from-name--branch {
  color: var(--editor-ink-teal);
}

.play-from-name--scene {
  color: var(--editor-ink-blue);
}

.play-from-where {
  font-size: 0.75rem;
  color: var(--editor-text-muted);
  overflow-wrap: anywhere;
}

.play-from-section {
  margin-top: 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--editor-text-muted);
}

.play-from-radio {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.play-from-disabled {
  color: var(--editor-text-faint);
}

.play-from-snapshot-select {
  flex: 1 1 auto;
  min-width: 0;
}

.play-from-snapshot-option {
  display: flex;
  flex-direction: column;
}

.play-from-snapshot-option small {
  color: var(--editor-text-muted);
  font-family: var(--font-family-mono, monospace);
  font-size: 0.7rem;
}

.play-from-empty {
  font-size: 0.78rem;
  color: var(--editor-text-faint);
}

.set-first-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.35rem;
  border: 1px solid var(--editor-border);
  border-left: 3px solid var(--editor-border-strong);
  border-radius: 4px;
  background: var(--editor-surface-raised);
}

.set-first-row--filled {
  border-color: var(--editor-ink-amber);
  background: var(--editor-tint-warning);
}

.set-first-kind {
  flex: 0 0 auto;
  padding: 0.05rem 0.4rem;
  border: none;
  border-radius: 3px;
  font: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  background: var(--editor-tint-info);
  color: var(--editor-fg-info);
}

button.set-first-kind {
  cursor: pointer;
}

.set-first-kind--flag {
  background: var(--editor-tint-success);
  color: var(--editor-fg-success);
}

.set-first-kind--item {
  background: var(--editor-tint-warning);
  color: var(--editor-fg-warning);
}

.set-first-kind--character {
  background: var(--editor-tint-danger);
  color: var(--editor-fg-danger);
}

.set-first-key {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-family-mono, monospace);
}

.set-first-op {
  color: var(--editor-text-muted);
}

.set-first-value {
  flex: 0 0 4.5rem;
  width: 4.5rem;
}

.set-first-remove {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--editor-text-faint);
  cursor: pointer;
  padding: 0.2rem;
}

.set-first-remove:hover {
  color: var(--editor-fg-danger);
}

.play-from-add {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.play-from-add button,
.play-from-link {
  border: none;
  background: transparent;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: var(--editor-fg-success);
  cursor: pointer;
}

.play-from-add button:hover,
.play-from-link:hover {
  text-decoration: underline;
}

.play-from-note {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  padding: 0.45rem 0.6rem;
  border-radius: 5px;
  background: var(--editor-surface-sunken);
  font-size: 0.78rem;
  line-height: 1.4;
}

.play-from-note > .pi {
  margin-top: 0.15rem;
  color: var(--editor-fg-info);
}

.play-from-note code {
  overflow-wrap: anywhere;
}

.play-from-unfilled {
  color: var(--editor-fg-warning);
}

.play-from-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0.4rem;
}

.play-from-dev {
  font-size: 0.72rem;
  color: var(--editor-text-faint);
}
</style>
