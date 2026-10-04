<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import { Editor } from '../../editor';
import { jumpToEntity } from '../../editorJump';
import { Global } from '../../../global/global';
import type { Schema } from '../../../utility/schema';

const props = defineProps<{
  visible: boolean;
  componentId: string;
  item: any;
  schema?: Schema;
  subtabId: string;
  isNewItem?: boolean;
  // The entries the tab's list shows right now, with Search ID and Filters applied.
  shownEntries: any[];
}>();

const emit = defineEmits<{
  close: [];
}>();

const editor = Editor.getInstance();

const localItem = ref<any>(props.visible && props.item ? JSON.parse(JSON.stringify(props.item)) : null);
const idError = ref<string | null>(null);

// The wrapper can move to another entry of the same tab (header select), so "is this a new
// item" is state, not the opening prop: it drops to false the moment an existing entry is loaded.
const isNewItem = ref(!!props.isNewItem);

// Remount key for the popup component: a switched or reset item must not keep a child's
// mounted state (a data-only preview hydrated from the old entry, a selected tab, a filter).
const childKey = ref(0);

const clone = (value: any) => JSON.parse(JSON.stringify(value));

// Make `target` hold exactly `source`'s keys. A plain Object.assign would keep every key the popup
// deleted (an emptied list, a cleared optional field), so the save would write the old value back.
function replaceContents(target: any, source: any) {
  for (const k of Object.keys(target)) {
    if (!(k in source)) delete target[k];
  }
  Object.assign(target, source);
}

// ── Entry navigation (array tabs only) ──
const allEntries = computed<any[]>(() => {
  const ao = editor.activeObject.value;
  return editor.isArray.value && Array.isArray(ao) ? ao : [];
});

const currentUid = computed<string | null>(() => localItem.value?.uid ?? null);

// Prev/next and the picker walk only what the tab's list shows. The open entry stays listed even
// when an edit sifts it out of the filter, so the header keeps its place until you move on.
const entries = computed<any[]>(() => {
  const shown = new Set(props.shownEntries.map((e: any) => e.uid));
  return allEntries.value.filter((e: any) => shown.has(e.uid) || e.uid === currentUid.value);
});

const entryOptions = computed(() => entries.value.map((e: any) => {
  const name = [e.name, e.meta?.name, e.traits?.name].find(value => typeof value === 'string' && value);
  return { label: name && name !== e.id ? `${e.id} (${name})` : (e.id || e.uid), value: e.uid };
}));

const currentIndex = computed(() => entries.value.findIndex((e: any) => e.uid === currentUid.value));

// The entry as the tab holds it right now — the wrapper's copy is reset to and diffed against it.
const liveEntry = computed<any>(() => {
  if (isNewItem.value) return editor.newItem.value;
  if (editor.isArray.value) return allEntries.value.find((e: any) => e.uid === currentUid.value) ?? null;
  return editor.activeObject.value;
});

// ── Dirty tracking ──
// A deep watch fires once per mutation flush, whether the child emitted update:item or wrote
// into the shared object directly; the stringify compare is what decides.
const isDirty = ref(false);
function recomputeDirty() {
  const live = liveEntry.value;
  isDirty.value = !!localItem.value && (!live || JSON.stringify(localItem.value) !== JSON.stringify(live));
}
watch(localItem, recomputeDirty, { deep: true });

const childRef = ref<any>(null);

// A popup may hold edits of its own beyond the item, such as the Balance Sheet's edits to other
// entries. It exposes `hasPendingChanges` (a boolean or ref) and a `commitEntries()` the wrapper
// calls before saving; Reset and every switch remount it, which drops them.
const childPending = computed(() => !!childRef.value?.hasPendingChanges);
const isBusy = computed(() => isDirty.value || childPending.value);

function loadEntry(uid: string) {
  if (isBusy.value) return;
  const entry = allEntries.value.find((e: any) => e.uid === uid);
  if (!entry) return;
  localItem.value = clone(entry);
  isNewItem.value = false;
  idError.value = null;
  childKey.value++;
  recomputeDirty();
}

function stepEntry(delta: number) {
  const next = entries.value[currentIndex.value + delta];
  if (next) loadEntry(next.uid);
}

function handleReset() {
  const live = liveEntry.value;
  if (!live) return;
  localItem.value = clone(live);
  idError.value = null;
  childKey.value++;
  recomputeDirty();
}

// The popup on screen. Starts as the one the button opened and can switch to any other popup
// the tab registers, as long as the copy is in sync with the tab.
const activeComponentId = ref(props.componentId);
watch(() => props.componentId, (id) => { activeComponentId.value = id; });

const customComponent = computed(() => {
  return editor.getCustomComponent(activeComponentId.value);
});

const popupComponents = computed(() =>
  (editor.customPopups.value ?? [])
    .map(id => editor.getCustomComponent(id))
    .filter((comp): comp is NonNullable<typeof comp> => comp !== undefined));

function switchPopup(id: string) {
  if (isBusy.value || id === activeComponentId.value) return;
  activeComponentId.value = id;
  idError.value = null;
  childKey.value++;
}

const coreItem = computed(() => {
  if (!editor.coreObject.value || editor.selectedMod === '_core' || !props.item) return null;

  if (Array.isArray(editor.coreObject.value)) {
    return editor.coreObject.value.find((item: any) => item.id === props.item.id);
  } else {
    return editor.coreObject.value;
  }
});

watch(() => props.visible, (newVisible) => {
  if (newVisible && props.item) {
    localItem.value = JSON.parse(JSON.stringify(props.item));
    isNewItem.value = !!props.isNewItem;
    activeComponentId.value = props.componentId;
    idError.value = null;
    recomputeDirty();
  }
}, { immediate: true });

function childHasLintIssues(): boolean {
  return childRef.value?.hasLintIssues?.() === true;
}

async function commitItem(): Promise<boolean> {
  if (!localItem.value) return false;
  const ao = editor.activeObject.value;

  // activeObject is null for the whole duration of a loadActiveObject (e.g.
  // an in-popup dungeon switch still reading files). Every assign branch
  // below would silently no-op and saveActiveObject would find nothing to
  // save — the popup would close having dropped the edits.
  if (!ao) {
    Global.getInstance().addNotificationId('save_wait_loading');
    return false;
  }

  if (isNewItem.value && !localItem.value.uid && editor.isArray.value && Array.isArray(ao)) {
    replaceContents(editor.newItem.value, localItem.value);
    const result = editor.addItem();
    if (!result.success) {
      idError.value = result.message ?? 'invalid_id';
      return false;
    }
    idError.value = null;
    localItem.value.uid = result.uid!;
    isNewItem.value = false;
  } else if (editor.isArray.value && Array.isArray(ao)) {
    const original = ao.find((it: any) => it.uid === localItem.value.uid);
    if (original) replaceContents(original, localItem.value);
  } else if (ao && !Array.isArray(ao)) {
    replaceContents(ao, localItem.value);
  }

  try {
    childRef.value?.commitEntries?.();
  } catch (err) {
    console.warn('[CustomPopupWrapper] commitEntries failed:', err);
  }

  editor.hasUnsavedChanges.value = true;
  let saved = false;
  try {
    saved = await editor.saveActiveObject();
  } catch (err) {
    console.warn('[CustomPopupWrapper] Save failed:', err);
  }
  // A plugin save hook (plugin.json `editor_hooks`) may have changed the entry as it was written:
  // take the written entry back in place (the child shares this object), so the popup shows it and
  // does not read as unsaved. Only after a write — a blocked save keeps the popup's edits as they are.
  const live = liveEntry.value;
  if (saved && live && localItem.value) {
    const li = localItem.value;
    for (const k of Object.keys(li)) delete li[k];
    Object.assign(li, clone(live));
  }
  // Optional hook for popup components that need to persist additional state
  // (e.g. a manifest field) on save. Not called on Cancel.
  try {
    await childRef.value?.commitExternal?.();
  } catch (err) {
    console.warn('[CustomPopupWrapper] commitExternal failed:', err);
  }
  recomputeDirty();
  return true;
}

async function handleSave() {
  if (!await commitItem()) return;
  childHasLintIssues();
}

function handleCancel() {
  emit('close');
}

async function handleApplyAndSave() {
  if (!await commitItem()) return;
  if (!childHasLintIssues()) {
    emit('close');
  }
}

// Generic save-and-jump: commit the popup's item first (navigating with a popup
// open would make commitItem target the wrong tab's activeObject), close, then
// navigate to the requested entity via the shared id-filter.
async function handleRequestSaveJump(payload: { mainTab: string; subTab: string; entityId: string }) {
  if (!await commitItem()) return;
  emit('close');
  await jumpToEntity(payload.mainTab, payload.subTab, payload.entityId);
}

// Open another entry of this same tab without closing: save first when the popup holds changes,
// then load the entry, optionally in another of the tab's popups.
async function handleRequestOpenEntry(payload: { entityId: string; componentId?: string }) {
  const target = allEntries.value.find((e: any) => e.id === payload.entityId);
  if (!target) return;
  if (isBusy.value && !await commitItem()) return;
  if (payload.componentId && popupComponents.value.some(comp => comp.id === payload.componentId)) {
    activeComponentId.value = payload.componentId;
  }
  loadEntry(target.uid);
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="(val) => !val && handleCancel()" modal class="custom-popup-dialog">
    <div class="custom-popup-content">
      <div v-if="(editor.isArray.value && entries.length > 0) || popupComponents.length > 1" class="popup-entry-header"
        v-tooltip.bottom="isBusy ? 'Save or reset the changes before switching entries or popups.' : undefined">
        <template v-if="editor.isArray.value && entries.length > 0">
          <Button icon="pi pi-chevron-left" text rounded size="small" :disabled="isBusy || currentIndex <= 0"
            v-tooltip.top="'Previous entry'" @click="stepEntry(-1)" />
          <Select :modelValue="currentUid" :options="entryOptions" optionLabel="label" optionValue="value" filter
            :disabled="isBusy" :placeholder="isNewItem ? `New ${editor.title.value}` : 'Pick an entry'"
            class="popup-entry-select" size="small" @update:modelValue="(uid) => uid && loadEntry(uid)" />
          <Button icon="pi pi-chevron-right" text rounded size="small"
            :disabled="isBusy || currentIndex < 0 || currentIndex >= entries.length - 1" v-tooltip.top="'Next entry'"
            @click="stepEntry(1)" />
          <span class="popup-entry-position">
            <template v-if="currentIndex >= 0">{{ currentIndex + 1 }} / {{ entries.length }}</template>
            <template v-else-if="isNewItem">new</template>
          </span>
        </template>
        <div v-if="popupComponents.length > 1" class="popup-switch">
          <Button v-for="comp in popupComponents" :key="comp.id" :label="comp.name" size="small" severity="info"
            :outlined="comp.id !== activeComponentId" :disabled="isBusy && comp.id !== activeComponentId"
            class="popup-switch-button" @click="switchPopup(comp.id)" />
        </div>
        <span v-if="isBusy" class="popup-entry-dirty">unsaved changes</span>
      </div>
      <div v-if="isNewItem && idError && localItem" class="popup-id-fix">
        <label for="popup-id-fix-input">ID</label>
        <InputText id="popup-id-fix-input" v-model="localItem.id" class="p-invalid" />
        <small class="p-error">{{ idError }}</small>
      </div>
      <component v-if="customComponent && localItem" :is="customComponent.component" ref="childRef" :key="childKey"
        v-model:item="localItem" :coreItem="coreItem" :schema="schema" :subtabId="subtabId"
        @request-save-jump="handleRequestSaveJump" @request-open-entry="handleRequestOpenEntry" />
      <div v-else class="error-message">
        Component not found: {{ componentId }}
      </div>
    </div>

    <!-- Footer with OK/Cancel buttons -->
    <template #footer>
      <div class="popup-footer">
        <Button label="Cancel" severity="secondary" @click="handleCancel" text />
        <Button label="Reset" icon="pi pi-undo" severity="secondary" :disabled="!isBusy" outlined
          v-tooltip.top="'Discard the popup\'s changes and reload the entry as the tab holds it'" @click="handleReset" />
        <Button label="Save" @click="handleSave" />
        <Button label="Save and Close" icon="pi pi-save" severity="success" @click="handleApplyAndSave" />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.custom-popup-content {
  padding: 10px 0;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.custom-popup-content>.popup-id-fix,
.custom-popup-content>.popup-entry-header {
  flex: 0 0 auto;
}

.custom-popup-content>*:not(.popup-id-fix):not(.popup-entry-header) {
  flex: 1;
  min-height: 0;
}

.popup-entry-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.5rem;
  margin-bottom: 0.6rem;
  background-color: var(--editor-surface-sunken);
  border: 1px solid var(--editor-border);
  border-radius: 4px;
}

.popup-entry-select {
  flex: 0 1 26rem;
  min-width: 12rem;
}

.popup-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-left: 0.5rem;
}

.popup-entry-position {
  font-size: 0.8rem;
  color: var(--editor-text-muted);
  white-space: nowrap;
}

.popup-entry-dirty {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--editor-fg-warning);
  font-style: italic;
}

.popup-id-fix {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
  background-color: var(--editor-tint-danger);
  border: 1px solid var(--editor-fg-danger);
  border-radius: 4px;
}

.popup-id-fix label {
  font-weight: bold;
  flex: 0 0 auto;
}

.popup-id-fix .p-inputtext {
  flex: 0 1 16rem;
}

.popup-id-fix .p-error {
  flex: 1 1 auto;
}

.error-message {
  color: var(--editor-fg-danger);
  padding: 1rem;
  text-align: center;
  font-weight: bold;
}

.popup-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>

<style>
/* Global styles for PrimeVue Dialog — teleported to body, scoped styles don't reach */
.custom-popup-dialog.p-dialog {
  display: flex !important;
  flex-direction: column !important;
  width: 80dvw;
  height: 100dvh;
  max-height: 100% !important;
}

/* Below 1200px the side margins cost more than they give: the popup takes the full width. */
@media (max-width: 1199.98px) {
  .custom-popup-dialog.p-dialog {
    width: 100dvw;
    max-width: 100dvw !important;
    margin: 0 !important;
    border-radius: 0;
  }
}

.custom-popup-dialog .p-dialog-header {
  display: none !important;
}

.custom-popup-dialog .p-dialog-content {
  flex: 1 !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
}
</style>
