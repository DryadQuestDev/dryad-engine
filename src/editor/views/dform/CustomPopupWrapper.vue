<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { Editor } from '../../editor';
import type { Schema } from '../../../utility/schema';

const props = defineProps<{
  visible: boolean;
  componentId: string;
  item: any;
  schema?: Schema;
  subtabId: string;
  isNewItem?: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const editor = Editor.getInstance();

const localItem = ref<any>(props.visible && props.item ? JSON.parse(JSON.stringify(props.item)) : null);
const idError = ref<string | null>(null);

const customComponent = computed(() => {
  return editor.getCustomComponent(props.componentId);
});

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
    idError.value = null;
  }
}, { immediate: true });

const childRef = ref<any>(null);

function childHasLintIssues(): boolean {
  return childRef.value?.hasLintIssues?.() === true;
}

async function commitItem(): Promise<boolean> {
  if (!localItem.value) return false;
  const ao = editor.activeObject.value;

  if (props.isNewItem && !localItem.value.uid && editor.isArray.value && Array.isArray(ao)) {
    Object.assign(editor.newItem.value, localItem.value);
    const result = editor.addItem();
    if (!result.success) {
      idError.value = result.message ?? 'invalid_id';
      return false;
    }
    idError.value = null;
    localItem.value.uid = result.uid!;
  } else if (editor.isArray.value && Array.isArray(ao)) {
    const original = ao.find((it: any) => it.uid === localItem.value.uid);
    if (original) Object.assign(original, localItem.value);
  } else if (ao && !Array.isArray(ao)) {
    Object.assign(ao, localItem.value);
  }

  editor.hasUnsavedChanges.value = true;
  try {
    await editor.saveActiveObject();
  } catch (err) {
    console.warn('[CustomPopupWrapper] Save failed:', err);
  }
  // Optional hook for popup components that need to persist additional state
  // (e.g. a manifest field) on save. Not called on Cancel.
  try {
    await childRef.value?.commitExternal?.();
  } catch (err) {
    console.warn('[CustomPopupWrapper] commitExternal failed:', err);
  }
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
</script>

<template>
  <Dialog :visible="visible" @update:visible="(val) => !val && handleCancel()" modal class="custom-popup-dialog"
    :style="{ width: '80dvw', height: '100dvh' }">
    <div class="custom-popup-content">
      <div v-if="props.isNewItem && idError && localItem" class="popup-id-fix">
        <label for="popup-id-fix-input">ID</label>
        <InputText id="popup-id-fix-input" v-model="localItem.id" class="p-invalid" />
        <small class="p-error">{{ idError }}</small>
      </div>
      <component v-if="customComponent && localItem" :is="customComponent.component" ref="childRef"
        v-model:item="localItem" :coreItem="coreItem" :schema="schema" :subtabId="subtabId" />
      <div v-else class="error-message">
        Component not found: {{ componentId }}
      </div>
    </div>

    <!-- Footer with OK/Cancel buttons -->
    <template #footer>
      <div class="popup-footer">
        <Button label="Cancel" severity="secondary" @click="handleCancel" text />
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

.custom-popup-content>.popup-id-fix {
  flex: 0 0 auto;
}

.custom-popup-content>*:not(.popup-id-fix) {
  flex: 1;
  min-height: 0;
}

.popup-id-fix {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  margin-bottom: 0.75rem;
  background-color: rgba(244, 67, 54, 0.08);
  border: 1px solid rgba(244, 67, 54, 0.4);
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
  color: #f44336;
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
  max-height: 100% !important;
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
