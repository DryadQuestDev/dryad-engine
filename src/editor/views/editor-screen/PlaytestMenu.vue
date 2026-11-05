<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import Button from 'primevue/button';
import Popover from 'primevue/popover';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import { Editor } from '../../editor';
import { showConfirm } from '../../../services/dialogService';
import { listSnapshots, renameSnapshot, deleteSnapshot, getSnapshot, snapshotAge, snapshotPlace, type DevSnapshot } from '../../../services/devSnapshots';
import { editingScene, prefillFromConditions, rememberedSetup, type PlaySetup } from '../../playFrom';
import { startPlaytest, playFromTarget, playSnapshot } from './usePlaytest';

const editor = Editor.getInstance();

const menuRef = ref<InstanceType<typeof Popover> | null>(null);
const manageVisible = ref(false);
// Ages are read when the menu or the dialog opens.
const now = ref(Date.now());

const disabled = computed(() => !editor.selectedGame || editor.hasUnsavedChanges.value);
const snapshots = computed(() => listSnapshots(editor.selectedGame ?? ''));

const scene = computed(() => {
  const remembered = editingScene.value;
  return remembered && remembered.gameId === editor.selectedGame ? remembered.target : null;
});

const sceneSetup = computed(() => {
  const target = scene.value;
  if (!target) return null;
  const setup = rememberedSetup(editor.selectedGame ?? '', target);
  const snapshot = setup && setup.start !== 'new' ? getSnapshot(editor.selectedGame ?? '', setup.start) : null;
  return { setup, snapshot };
});

const sceneDetail = computed(() => {
  const target = scene.value;
  if (!target) return 'Open a scene in the Content tab';
  const where = target.id.replace(/\.1\.1\.1$/, '');
  const info = sceneSetup.value;
  const start = info?.snapshot ? `from ${info.snapshot.name}` : 'in a new game';
  const values = info?.setup?.rows.length ? ', with your values' : '';
  return `${where} · ${start}${values}`;
});

function toggleMenu(event: Event) {
  now.value = Date.now();
  menuRef.value?.toggle(event);
}

function fromStart() {
  menuRef.value?.hide();
  startPlaytest();
}

// The scene's remembered setup, or a new game with its own condition filled in.
async function fromScene() {
  const target = scene.value;
  if (!target) return;
  menuRef.value?.hide();
  const info = sceneSetup.value;
  let setup: PlaySetup | null = info?.setup ?? null;
  if (setup && setup.start !== 'new' && !info?.snapshot) setup = { ...setup, start: 'new' };
  if (!setup) {
    const properties = await editor.loadFullData('properties').catch(() => [] as any[]);
    const types = new Map<string, string>(properties.filter((p: any) => p?.id).map((p: any) => [String(p.id), p.type || 'number']));
    setup = { start: 'new', rows: prefillFromConditions(target.conditions, types).rows };
  }
  playFromTarget(target, setup);
}

function fromSnapshot(snapshot: DevSnapshot) {
  menuRef.value?.hide();
  manageVisible.value = false;
  playSnapshot(snapshot.id);
}

function openManage() {
  menuRef.value?.hide();
  now.value = Date.now();
  renamingId.value = null;
  manageVisible.value = true;
}

const renamingId = ref<string | null>(null);
const draftName = ref('');

function startRename(snapshot: DevSnapshot) {
  renamingId.value = snapshot.id;
  draftName.value = snapshot.name;
  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.snapshot-manage .snapshot-rename input, .snapshot-manage input.snapshot-rename');
    input?.focus();
    input?.select();
  });
}

function commitRename() {
  const id = renamingId.value;
  if (!id || !editor.selectedGame) return;
  renamingId.value = null;
  renameSnapshot(editor.selectedGame, id, draftName.value);
}

async function remove(snapshot: DevSnapshot) {
  if (!editor.selectedGame) return;
  const confirmed = await showConfirm({
    message: `Delete the snapshot "${snapshot.name}"?`,
    header: 'Delete snapshot',
    acceptLabel: 'Delete',
    rejectLabel: 'Keep',
  });
  if (confirmed) await deleteSnapshot(editor.selectedGame, snapshot.id);
}
</script>

<template>
  <div class="playtest-split">
    <Button class="playtest-button" icon="pi pi-play" label="Playtest" @click="startPlaytest" :disabled="disabled"
      v-tooltip.bottom="editor.hasUnsavedChanges.value ? 'You have unsaved changes' : 'Start playtesting with dev mode (Ctrl/Cmd+P)'" />
    <Button class="playtest-caret" icon="pi pi-chevron-down" :disabled="disabled" aria-label="More ways to playtest"
      v-tooltip.bottom="editor.hasUnsavedChanges.value ? 'You have unsaved changes' : 'From the scene you are editing, or from a snapshot'"
      @click="toggleMenu" />
  </div>

  <Popover ref="menuRef">
    <div class="playtest-menu">
      <button type="button" class="pt-item" @click="fromStart">
        <i class="pi pi-play pt-icon" />
        <span class="pt-text"><span class="pt-title">From the start</span></span>
        <kbd>Ctrl+P</kbd>
      </button>
      <button type="button" class="pt-item pt-item--scene" :disabled="!scene" @click="fromScene">
        <i class="pi pi-play pt-icon" />
        <span class="pt-text">
          <span class="pt-title">From the scene I'm editing</span>
          <span class="pt-detail">{{ sceneDetail }}</span>
        </span>
      </button>
      <div class="pt-sep" />
      <div class="pt-header">Snapshots</div>
      <button v-for="snap in snapshots" :key="snap.id" type="button" class="pt-item" @click="fromSnapshot(snap)">
        <i class="pi pi-camera pt-icon" />
        <span class="pt-text">
          <span class="pt-title">{{ snap.name }}</span>
          <span class="pt-detail">{{ snapshotPlace(snap) }} · {{ snapshotAge(snap.savedAt, now) }}</span>
        </span>
      </button>
      <div v-if="!snapshots.length" class="pt-empty">None yet. In a playtest, Shift+S saves one.</div>
      <div class="pt-sep" />
      <button type="button" class="pt-item" @click="openManage">
        <i class="pi pi-cog pt-icon pt-icon--muted" />
        <span class="pt-text"><span class="pt-title pt-title--plain">Manage snapshots…</span></span>
      </button>
    </div>
  </Popover>

  <Dialog v-model:visible="manageVisible" modal header="Snapshots" :style="{ width: '32rem' }">
    <div class="snapshot-manage">
      <div v-if="!snapshots.length" class="pt-empty">None yet. In a playtest, Shift+S saves one.</div>
      <div v-for="snap in snapshots" :key="snap.id" class="sm-row">
        <div class="sm-text">
          <InputText v-if="renamingId === snap.id" v-model="draftName" size="small" class="snapshot-rename"
            @keydown.enter.prevent="commitRename" @keydown.esc.prevent.stop="renamingId = null" @blur="commitRename" />
          <span v-else class="pt-title">{{ snap.name }}</span>
          <span class="pt-detail">{{ snapshotPlace(snap) }} · {{ snapshotAge(snap.savedAt, now) }}<template
              v-if="snap.summary"> · {{ snap.summary }}</template></span>
        </div>
        <Button icon="pi pi-play" size="small" text severity="success" v-tooltip.top="'Playtest from it'"
          aria-label="Playtest from it" @click="fromSnapshot(snap)" />
        <Button icon="pi pi-pencil" size="small" text severity="secondary" v-tooltip.top="'Rename'" aria-label="Rename"
          @click="startRename(snap)" />
        <Button icon="pi pi-trash" size="small" text severity="danger" v-tooltip.top="'Delete'" aria-label="Delete"
          @click="remove(snap)" />
      </div>
      <div class="sm-hint">Save snapshots in a playtest with Shift+S, or from the debug panel.</div>
    </div>
  </Dialog>
</template>

<style scoped>
.playtest-split {
  display: inline-flex;
  align-items: stretch;
}

.playtest-split .playtest-button {
  min-width: 90px;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.playtest-caret {
  width: 2rem;
  padding-left: 0;
  padding-right: 0;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  border-left: 1px solid rgba(0, 0, 0, 0.2);
}

.playtest-menu {
  display: flex;
  flex-direction: column;
  min-width: 19rem;
  max-width: 24rem;
  margin: -0.25rem;
}

.pt-item {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--editor-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.pt-item:hover:not(:disabled) {
  background: var(--editor-surface-hover);
}

.pt-item--scene:not(:disabled) {
  background: var(--editor-tint-success);
}

.pt-item--scene:hover:not(:disabled) {
  background: var(--editor-surface-hover);
}

.pt-item:disabled {
  cursor: default;
  color: var(--editor-text-faint);
}

.pt-icon {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  color: var(--editor-fg-success);
}

.pt-item:disabled .pt-icon,
.pt-icon--muted {
  color: var(--editor-text-muted);
}

.pt-text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.pt-title {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.pt-title--plain {
  font-weight: 400;
}

.pt-detail {
  font-size: 0.75rem;
  color: var(--editor-text-muted);
  overflow-wrap: anywhere;
}

.pt-item kbd {
  padding: 0 0.3rem;
  border: 1px solid var(--editor-border-strong);
  border-radius: 4px;
  font-family: inherit;
  font-size: 0.72rem;
  color: var(--editor-text-muted);
}

.pt-sep {
  height: 1px;
  margin: 0.3rem 0.4rem;
  background: var(--editor-border);
}

.pt-header {
  padding: 0.3rem 0.6rem 0.1rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--editor-text-muted);
}

.pt-empty {
  padding: 0.3rem 0.6rem 0.4rem;
  font-size: 0.8rem;
  color: var(--editor-text-faint);
}

.snapshot-manage {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.sm-row {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--editor-border);
  border-radius: 6px;
}

.sm-text {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.sm-hint {
  margin-top: 0.3rem;
  font-size: 0.78rem;
  color: var(--editor-text-muted);
}
</style>
