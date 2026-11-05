<script setup lang="ts">
import { computed, provide, ref, shallowRef, watch } from 'vue';
import { useConfirm } from 'primevue/useconfirm';
import { Editor } from '../../editor';
import { jumpToEntity } from '../../editorJump';
import CustomPopupWrapper from '../dform/CustomPopupWrapper.vue';
import { confirmLintErrors } from '../dform/confirmLintErrors';
import { SUBTAB_VIEW } from './subtabViewContext';

// The subtab's `view` in place of the form. It gets the popup props, with `item` being the tab's
// own object: the view edits it in place, and the tab's Save, unsaved prompt and dungeon select
// work on it as they do on the form. The view places the Save and popup buttons in its own
// toolbar with SubtabActions.

const editor = Editor.getInstance();
const confirm = useConfirm();

// A reload (a dungeon switch) empties activeObject before the new object lands. The view
// keeps the last one meanwhile and stays mounted, so its own async steps (a jump into another
// dungeon) carry on against the new object instead of an unmounted component.
const item = shallowRef<any>(null);
watch(() => editor.activeObject.value, (ao) => {
  if (ao && typeof ao === 'object' && !Array.isArray(ao)) item.value = ao;
}, { immediate: true });

const viewComponent = computed(() => editor.view.value ? editor.getCustomComponent(editor.view.value) : undefined);
const coreItem = computed(() => editor.selectedMod !== '_core' ? editor.coreObject.value : null);
const viewRef = ref<any>(null);

async function save() {
  if (!await confirmLintErrors(confirm, viewRef.value)) return;
  await editor.saveActiveObject();
}

// Ctrl+click on an id in the view: save first, then open the entity's tab.
async function onSaveJump(payload: { mainTab: string; subTab: string; entityId: string }) {
  if (editor.hasUnsavedChanges.value && !await editor.saveActiveObject()) return;
  await jumpToEntity(payload.mainTab, payload.subTab, payload.entityId);
}

// The subtab's popups, plugin ones included (plugin.json `editor_popups` naming this subtab).
const popupComponents = computed(() =>
  (editor.customPopups.value ?? [])
    .map(id => editor.getCustomComponent(id))
    .filter((comp): comp is NonNullable<typeof comp> => comp !== undefined));

const activePopup = ref<{ id: string; item: any } | null>(null);

function openPopup(id: string) {
  if (!item.value) return;
  activePopup.value = { id, item: JSON.parse(JSON.stringify(item.value)) };
}

provide(SUBTAB_VIEW, { save, popupComponents, openPopup });
</script>

<template>
  <div class="subtab-view">
    <component v-if="viewComponent && item" :is="viewComponent.component" ref="viewRef" class="subtab-view-body"
      :item="item" :coreItem="coreItem" :schema="editor.schema.value ?? undefined" :subtabId="editor.secondaryTab ?? ''"
      @request-save-jump="onSaveJump" />
    <div v-else-if="!viewComponent" class="subtab-view-body subtab-view-missing">
      Component not found: {{ editor.view.value }}
    </div>
    <div v-else class="subtab-view-body"></div>

    <CustomPopupWrapper v-if="activePopup" :visible="true" :componentId="activePopup.id" :item="activePopup.item"
      :schema="editor.schema.value ?? undefined" :subtabId="editor.secondaryTab ?? ''" :shown-entries="[]"
      @close="activePopup = null" />
  </div>
</template>

<style scoped>
.subtab-view {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.subtab-view-body {
  flex: 1 1 auto;
  min-height: 0;
}

.subtab-view-missing {
  padding: 1rem;
  color: var(--editor-fg-danger);
}
</style>
