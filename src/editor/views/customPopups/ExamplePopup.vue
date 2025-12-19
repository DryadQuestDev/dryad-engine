<script setup lang="ts">
import { ref, watch } from 'vue';
import type { EditorCustomPopupProps } from '../../editor';

// Define props using the standard interface
const props = defineProps<EditorCustomPopupProps>();

// Define emits for two-way binding
const emit = defineEmits<{
  'update:item': [item: any];
}>();

// Local copy for editing (this is already a deep copy from the wrapper)
const localItem = ref(props.item);

// Watch for prop changes (in case item is updated externally)
watch(() => props.item, (newItem) => {
  localItem.value = newItem;
}, { deep: true });

// Emit changes back to parent
function updateItem() {
  emit('update:item', localItem.value);
}

// Example: Add a helper function to demonstrate custom logic
function exampleAction() {
  // Custom logic here - for example, validate data, transform values, etc.
  console.log('Example action triggered for item:', localItem.value);
  console.log('Current subtab:', props.subtabId);
  console.log('Schema:', props.schema);

  // Example: Add a timestamp
  if (localItem.value) {
    localItem.value.lastModified = new Date().toISOString();
    updateItem();
  }
}
</script>

<template>
  <div class="example-popup">
    <div class="popup-info">
      <p><strong>This is an example custom popup component.</strong></p>
      <p>You can create your own popup components following this template.</p>
      <p class="hint">Current subtab: <code>{{ subtabId }}</code></p>
    </div>

    <div class="item-preview">
      <h3>Item Data Preview</h3>
      <pre>{{ JSON.stringify(localItem, null, 2) }}</pre>
    </div>

    <div class="custom-actions">
      <h3>Custom Actions</h3>
      <button @click="exampleAction" class="action-button">
        Add Timestamp
      </button>
      <p class="hint">
        Add your own custom logic here - validation, bulk editing, transformations, etc.
      </p>
    </div>

    <div class="instructions">
      <h3>How to create your own popup:</h3>
      <ol>
        <li>Create a new .vue file in <code>src/editor/views/customPopups/</code></li>
        <li>Use <code>EditorCustomPopupProps</code> interface for props</li>
        <li>Emit <code>update:item</code> event with modified data</li>
        <li>Register it using <code>registerEditorComponent()</code></li>
        <li>Add its ID to <code>customPopups</code> array in the subtab config</li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.example-popup {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 0.5rem;
}

.popup-info {
  background-color: #e3f2fd;
  border-left: 4px solid #2196F3;
  padding: 1rem;
  border-radius: 4px;
}

.popup-info p {
  margin: 0.5rem 0;
}

.item-preview {
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 1rem;
}

.item-preview h3 {
  margin-top: 0;
  margin-bottom: 0.5rem;
  font-size: 1rem;
  color: #333;
}

.item-preview pre {
  background-color: #fff;
  padding: 0.75rem;
  border-radius: 4px;
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
  font-size: 0.85rem;
  margin: 0;
}

.custom-actions {
  background-color: #fff3e0;
  border-left: 4px solid #ff9800;
  padding: 1rem;
  border-radius: 4px;
}

.custom-actions h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1rem;
  color: #333;
}

.action-button {
  padding: 0.5rem 1rem;
  background-color: #ff9800;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s ease;
}

.action-button:hover {
  background-color: #f57c00;
}

.instructions {
  background-color: #f1f8e9;
  border-left: 4px solid #8bc34a;
  padding: 1rem;
  border-radius: 4px;
}

.instructions h3 {
  margin-top: 0;
  margin-bottom: 0.75rem;
  font-size: 1rem;
  color: #333;
}

.instructions ol {
  margin: 0;
  padding-left: 1.5rem;
}

.instructions li {
  margin: 0.5rem 0;
  line-height: 1.5;
}

.hint {
  font-size: 0.85rem;
  color: #666;
  font-style: italic;
  margin-top: 0.5rem;
}

code {
  background-color: rgba(0, 0, 0, 0.05);
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-family: var(--font-family-mono);
  font-size: 0.9em;
}
</style>
