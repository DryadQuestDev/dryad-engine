<script setup lang="ts">
import { Game } from '../../game';
import { ref, computed } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import FloatLabel from 'primevue/floatlabel';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import Textarea from 'primevue/textarea';
import { useConfirm } from 'primevue/useconfirm';
import { Global } from '../../../global/global';

const game = Game.getInstance();
const confirmService = useConfirm();

// New store creation
const newStoreId = ref('');

// Store value editing state
const editingKey = ref<{ storeId: string; key: string } | null>(null);
const editValue = ref('');

// New entry state
const newEntryStoreId = ref<string | null>(null);
const newEntryKey = ref('');
const newEntryValue = ref('');

const stores = computed(() => {
  return Array.from(game.coreSystem.store.value.entries()).map(([id, storeMap]) => ({
    id,
    entries: Array.from(storeMap.entries()).map(([key, value]) => ({ key, value }))
  }));
});

function createStore() {
  if (newStoreId.value) {
    game.coreSystem.createStore(newStoreId.value);
    newStoreId.value = '';
  }
}

function deleteStore(storeId: string) {
  confirmService.require({
    message: `Are you sure you want to delete store "${storeId}"? This will remove all entries in this store.`,
    header: 'Confirm Delete Store',
    icon: 'pi pi-exclamation-triangle',
    accept: () => {
      game.coreSystem.deleteStore(storeId);
    }
  });
}

function deleteEntry(storeId: string, key: string) {
  const store = game.coreSystem.getStore(storeId);
  store.delete(key);
  /*
  confirmService.require({
    message: `Are you sure you want to delete entry "${key}" from store "${storeId}"?`,
    header: 'Confirm Delete Entry',
    icon: 'pi pi-exclamation-triangle',
    accept: () => {
      const store = game.coreSystem.getStore(storeId);
      store.delete(key);
    }
  });
  */
}

function startEdit(storeId: string, key: string, value: any) {
  editingKey.value = { storeId, key };
  editValue.value = JSON.stringify(value, null, 2);
}

function saveEdit() {
  if (!editingKey.value || !editValue.value) return;

  try {
    const store = game.coreSystem.getStore(editingKey.value.storeId);
    const fixedJson = game.logicSystem.fixJson(editValue.value ?? '');
    const parsedValue = JSON.parse(fixedJson);
    store.set(editingKey.value.key, parsedValue);
    cancelEdit();
  } catch (e) {
    Global.getInstance().addNotification('Invalid JavaScript object: ' + (e as Error).message);
  }
}

function cancelEdit() {
  editingKey.value = null;
  editValue.value = '';
}

function startNewEntry(storeId: string) {
  newEntryStoreId.value = storeId;
  newEntryKey.value = '';
  newEntryValue.value = '';
}

function saveNewEntry() {
  if (!newEntryStoreId.value || !newEntryKey.value || !newEntryValue.value) return;

  try {
    const store = game.coreSystem.getStore(newEntryStoreId.value);
    const fixedJson = game.logicSystem.fixJson(newEntryValue.value ?? '');
    const parsedValue = JSON.parse(fixedJson);
    store.set(newEntryKey.value, parsedValue);
    cancelNewEntry();
  } catch (e) {
    Global.getInstance().addNotification('Invalid JavaScript object: ' + (e as Error).message);
  }
}

function cancelNewEntry() {
  newEntryStoreId.value = null;
  newEntryKey.value = '';
  newEntryValue.value = '';
}

function isEditing(storeId: string, key: string): boolean {
  return editingKey.value?.storeId === storeId && editingKey.value?.key === key;
}

function isAddingEntry(storeId: string): boolean {
  return newEntryStoreId.value === storeId;
}

function formatValue(value: any): string {
  return JSON.stringify(value, null, 2);
}
</script>

<template>
  <div class="debug-stores">
    <div class="create-store-section">
      <h3>Create New Store</h3>
      <div class="create-store-form">
        <FloatLabel variant="on">
          <InputText v-model="newStoreId" class="w-full md:w-56" @keyup.enter="createStore" />
          <label for="new-store-id">Store ID</label>
        </FloatLabel>
        <Button label="Create Store" @click="createStore" :disabled="!newStoreId" />
      </div>
    </div>

    <div class="stores-list">
      <h3>All Stores ({{ stores.length }})</h3>
      <Accordion v-if="stores.length > 0">
        <AccordionPanel v-for="store in stores" :key="store.id" :value="store.id">
          <AccordionHeader>
            <div class="store-header">
              <strong>{{ store.id }}</strong>
              <span class="entry-count">({{ store.entries.length }} entries)</span>
            </div>
          </AccordionHeader>
          <AccordionContent>
            <div class="store-content">
              <div class="store-actions">
                <Button label="Add Entry" icon="pi pi-plus" size="small" @click="startNewEntry(store.id)"
                  :disabled="isAddingEntry(store.id)" />
                <Button label="Delete Store" icon="pi pi-trash" size="small" severity="danger"
                  @click="deleteStore(store.id)" />
              </div>

              <!-- New entry form -->
              <div v-if="isAddingEntry(store.id)" class="entry-edit-form">
                <h4>New Entry</h4>
                <FloatLabel variant="on">
                  <InputText v-model="newEntryKey" class="w-full" />
                  <label>Key</label>
                </FloatLabel>
                <FloatLabel variant="on">
                  <Textarea v-model="newEntryValue" class="w-full" rows="5"
                    placeholder='{example: "value", count: 10}' />
                  <label>Value (JS Object)</label>
                </FloatLabel>
                <div class="form-actions">
                  <Button label="Save" icon="pi pi-check" size="small" @click="saveNewEntry" />
                  <Button label="Cancel" icon="pi pi-times" size="small" severity="secondary" @click="cancelNewEntry" />
                </div>
              </div>

              <!-- Store entries -->
              <div v-if="store.entries.length > 0" class="entries-list">
                <div v-for="entry in store.entries" :key="entry.key" class="entry-item">
                  <div v-if="!isEditing(store.id, entry.key)" class="entry-view">
                    <div class="entry-header">
                      <strong class="entry-key">{{ entry.key }}</strong>
                      <div class="entry-actions">
                        <Button icon="pi pi-pencil" size="small" text
                          @click="startEdit(store.id, entry.key, entry.value)" />
                        <Button icon="pi pi-trash" size="small" text severity="danger"
                          @click="deleteEntry(store.id, entry.key)" />
                      </div>
                    </div>
                    <pre class="entry-value">{{ formatValue(entry.value) }}</pre>
                  </div>
                  <div v-else class="entry-edit-form">
                    <h4>Edit: {{ entry.key }}</h4>
                    <FloatLabel variant="on">
                      <Textarea v-model="editValue" class="w-full" rows="10" />
                      <label>Value (JS Object)</label>
                    </FloatLabel>
                    <div class="form-actions">
                      <Button label="Save" icon="pi pi-check" size="small" @click="saveEdit" />
                      <Button label="Cancel" icon="pi pi-times" size="small" severity="secondary" @click="cancelEdit" />
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="no-entries">No entries in this store</p>
            </div>
          </AccordionContent>
        </AccordionPanel>
      </Accordion>
      <p v-else class="no-stores">No stores found</p>
    </div>
  </div>
</template>

<style scoped>
.debug-stores {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.create-store-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--surface-border);
}

.create-store-section h3 {
  margin: 0;
}

.create-store-form {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.stores-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.stores-list h3 {
  margin: 0;
}

.store-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.entry-count {
  color: var(--text-color-secondary);
  font-size: 0.9em;
}

.store-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.store-actions {
  display: flex;
  gap: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--surface-border);
}

.entries-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.entry-item {
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  padding: 1rem;
  background-color: var(--surface-card);
}

.entry-view {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.entry-key {
  color: var(--primary-color);
  font-size: 0.95em;
}

.entry-actions {
  display: flex;
  gap: 0.25rem;
}

.entry-value {
  background-color: var(--surface-ground);
  padding: 0.75rem;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0;
  font-size: 0.85em;
  line-height: 1.5;
}

.entry-edit-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.entry-edit-form h4 {
  margin: 0;
  color: var(--text-color);
}

.form-actions {
  display: flex;
  gap: 0.5rem;
}

.no-entries,
.no-stores {
  color: var(--text-color-secondary);
  font-style: italic;
  text-align: center;
  padding: 1rem;
}
</style>
