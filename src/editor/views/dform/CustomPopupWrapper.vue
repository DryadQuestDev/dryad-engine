<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { Editor } from '../../editor';
import type { Schema } from '../../../utility/schema';

const props = defineProps<{
  visible: boolean;
  componentId: string;
  item: any;
  schema?: Schema;
  subtabId: string;
}>();

const emit = defineEmits<{
  save: [item: any];
  close: [];
}>();

const editor = Editor.getInstance();

// Deep copy the item for editing (initialize immediately if visible)
const localItem = ref<any>(props.visible && props.item ? JSON.parse(JSON.stringify(props.item)) : null);

// Get the custom component configuration
const customComponent = computed(() => {
  return editor.getCustomComponent(props.componentId);
});

// Get core item for mod support
const coreItem = computed(() => {
  if (!editor.coreObject.value || editor.selectedMod === '_core' || !props.item) return null;

  if (Array.isArray(editor.coreObject.value)) {
    return editor.coreObject.value.find((item: any) => item.id === props.item.id);
  } else {
    return editor.coreObject.value;
  }
});

// Watch for when popup opens - deep copy the item
watch(() => props.visible, (newVisible) => {
  if (newVisible && props.item) {
    localItem.value = JSON.parse(JSON.stringify(props.item));
  }
}, { immediate: true });

function handleSave() {
  if (localItem.value) {
    emit('save', localItem.value);
  }
}

function handleCancel() {
  emit('close');
}
</script>

<template>
  <Dialog :visible="visible" @update:visible="(val) => !val && handleCancel()" modal
    :header="customComponent?.name || 'Custom Popup'" :style="{ width: '80vw', maxHeight: '95vh' }">
    <div class="custom-popup-content">
      <!-- Render the custom component -->
      <component v-if="customComponent && localItem" :is="customComponent.component" v-model:item="localItem"
        :coreItem="coreItem" :schema="schema" :subtabId="subtabId" />
      <div v-else class="error-message">
        Component not found: {{ componentId }}
      </div>
    </div>

    <!-- Footer with OK/Cancel buttons -->
    <template #footer>
      <div class="popup-footer">
        <Button label="Cancel" severity="secondary" @click="handleCancel" text />
        <Button label="OK" @click="handleSave" />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.custom-popup-content {
  padding: 1rem 0;
  min-height: 200px;
  max-height: calc(90vh - 150px);
  /* Account for dialog header and footer */
  /*overflow: hidden;*/
  display: flex;
  flex-direction: column;
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
