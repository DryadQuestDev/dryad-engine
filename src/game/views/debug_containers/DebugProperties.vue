<script setup lang="ts">
import { Game } from '../../game';
import { computed, ref } from 'vue';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Checkbox from 'primevue/checkbox';
import Button from 'primevue/button';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import Textarea from 'primevue/textarea';
import { Global } from '../../../global/global';

const game = Game.getInstance();

// Object/Array editing state
const editingObjectId = ref<string | null>(null);
const editObjectValue = ref('');
const editingArrayId = ref<string | null>(null);
const editArrayValue = ref('');

const properties = computed(() => {
  return Array.from(game.coreSystem.properties.value.entries())
    .map(([id, property]) => ({ id, property }))
    .sort((a, b) => a.id.localeCompare(b.id));
});

function updateNumberValue(propertyId: string, value: number | null) {
  const property = game.coreSystem.properties.value.get(propertyId);
  if (property && value !== null) {
    property.currentValue = value;
  }
}

function updateStringValue(propertyId: string, value: string | undefined) {
  const property = game.coreSystem.properties.value.get(propertyId);
  if (property && value !== undefined) {
    property.currentValue = value;
  }
}

function updateBooleanValue(propertyId: string, value: boolean) {
  const property = game.coreSystem.properties.value.get(propertyId);
  if (property) {
    property.currentValue = value;
  }
}

function updateMinValue(propertyId: string, value: number | null) {
  const property = game.coreSystem.properties.value.get(propertyId);
  if (property) {
    property.setMinValue(value ?? undefined);
  }
}

function updateMaxValue(propertyId: string, value: number | null) {
  const property = game.coreSystem.properties.value.get(propertyId);
  if (property) {
    property.setMaxValue(value ?? undefined);
  }
}

function resetToDefault(propertyId: string) {
  const property = game.coreSystem.properties.value.get(propertyId);
  if (property && property.defaultValue !== undefined) {
    property.currentValue = property.defaultValue;
  }
}

function getTypeColor(type: string | undefined): string {
  switch (type) {
    case 'number': return '#4CAF50';
    case 'string': return '#2196F3';
    case 'boolean': return '#FF9800';
    case 'array': return '#9C27B0';
    case 'object': return '#E91E63';
    default: return '#757575';
  }
}

function startEditObject(propertyId: string, value: Record<string, any>) {
  editingObjectId.value = propertyId;
  editObjectValue.value = JSON.stringify(value, null, 2);
}

function saveObjectEdit() {
  if (!editingObjectId.value) return;

  try {
    const property = game.coreSystem.properties.value.get(editingObjectId.value);
    if (property) {
      const fixedJson = game.logicSystem.fixJson(editObjectValue.value);
      const parsedValue = JSON.parse(fixedJson);
      property.currentValue = parsedValue;
    }
    cancelObjectEdit();
  } catch (e) {
    Global.getInstance().addNotification('Invalid JSON: ' + (e as Error).message);
  }
}

function cancelObjectEdit() {
  editingObjectId.value = null;
  editObjectValue.value = '';
}

function isEditingObject(propertyId: string): boolean {
  return editingObjectId.value === propertyId;
}

function startEditArray(propertyId: string, value: any[]) {
  editingArrayId.value = propertyId;
  editArrayValue.value = JSON.stringify(value, null, 2);
}

function saveArrayEdit() {
  if (!editingArrayId.value) return;

  try {
    const property = game.coreSystem.properties.value.get(editingArrayId.value);
    if (property) {
      const fixedJson = game.logicSystem.fixJson(editArrayValue.value);
      const parsedValue = JSON.parse(fixedJson);
      if (!Array.isArray(parsedValue)) {
        throw new Error('Value must be an array');
      }
      property.currentValue = parsedValue;
    }
    cancelArrayEdit();
  } catch (e) {
    Global.getInstance().addNotification('Invalid JSON array: ' + (e as Error).message);
  }
}

function cancelArrayEdit() {
  editingArrayId.value = null;
  editArrayValue.value = '';
}

function isEditingArray(propertyId: string): boolean {
  return editingArrayId.value === propertyId;
}
</script>

<template>
  <div class="debug-properties">
    <h3>Game Properties ({{ properties.length }})</h3>

    <Accordion v-if="properties.length > 0" :multiple="true">
      <AccordionPanel v-for="{ id, property } in properties" :key="id" :value="id">
        <AccordionHeader>
          <div class="property-header">
            <strong>{{ id }}</strong>
            <span class="property-type" :style="{ backgroundColor: getTypeColor(property.type) }">
              {{ property.type }}
            </span>
            <span v-if="property.skipSave" class="property-const-tag">const</span>
            <span class="property-value-preview">
              = {{ property.currentValue }}
            </span>
          </div>
        </AccordionHeader>
        <AccordionContent>
          <div class="property-content">
            <!-- Number type -->
            <template v-if="property.type === 'number'">
              <div class="property-field">
                <label>Current Value</label>
                <InputNumber
                  :modelValue="property.currentValue as number"
                  @update:modelValue="updateNumberValue(id, $event)"
                  :min="property.canOverflow ? undefined : property.state.minValue"
                  :max="property.canOverflow ? undefined : property.state.maxValue"
                  :minFractionDigits="0"
                  :maxFractionDigits="property.precision ?? 2"
                  showButtons
                  class="w-full"
                  :disabled="property.skipSave"
                />
              </div>
              <div v-if="!property.skipSave" class="property-field-row">
                <div class="property-field">
                  <label>Min Value</label>
                  <InputNumber
                    :modelValue="property.state.minValue"
                    @update:modelValue="updateMinValue(id, $event)"
                    :maxFractionDigits="property.precision ?? 2"
                    class="w-full"
                  />
                </div>
                <div class="property-field">
                  <label>Max Value</label>
                  <InputNumber
                    :modelValue="property.state.maxValue"
                    @update:modelValue="updateMaxValue(id, $event)"
                    :maxFractionDigits="property.precision ?? 2"
                    class="w-full"
                  />
                </div>
              </div>
              <div class="property-info">
                <span v-if="property.precision !== undefined">Precision: {{ property.precision }}</span>
                <span v-if="property.canOverflow">Can Overflow</span>
                <span v-if="property.isNegative">Is Negative</span>
              </div>
            </template>

            <!-- String type -->
            <template v-else-if="property.type === 'string'">
              <div class="property-field">
                <label>Current Value</label>
                <InputText
                  :modelValue="property.currentValue as string"
                  @update:modelValue="updateStringValue(id, $event)"
                  class="w-full"
                  :disabled="property.skipSave"
                />
              </div>
            </template>

            <!-- Boolean type -->
            <template v-else-if="property.type === 'boolean'">
              <div class="property-field checkbox-field">
                <Checkbox
                  :modelValue="property.currentValue as boolean"
                  @update:modelValue="updateBooleanValue(id, $event)"
                  :binary="true"
                  :inputId="'prop-' + id"
                  :disabled="property.skipSave"
                />
                <label :for="'prop-' + id">{{ property.currentValue ? 'True' : 'False' }}</label>
              </div>
            </template>

            <!-- Array type -->
            <template v-else-if="property.type === 'array'">
              <div v-if="!isEditingArray(id)" class="property-field">
                <label>Current Value</label>
                <pre class="array-preview">{{ JSON.stringify(property.currentValue, null, 2) }}</pre>
                <Button
                  v-if="!property.skipSave"
                  label="Edit"
                  icon="pi pi-pencil"
                  size="small"
                  severity="secondary"
                  @click="startEditArray(id, property.currentValue as any[])"
                  class="edit-object-btn"
                />
              </div>
              <div v-else class="property-field">
                <label>Edit Value (JSON Array)</label>
                <Textarea
                  v-model="editArrayValue"
                  class="w-full"
                  rows="8"
                  autoResize
                />
                <div class="edit-actions">
                  <Button label="Save" icon="pi pi-check" size="small" @click="saveArrayEdit" />
                  <Button label="Cancel" icon="pi pi-times" size="small" severity="secondary" @click="cancelArrayEdit" />
                </div>
              </div>
            </template>

            <!-- Object type -->
            <template v-else-if="property.type === 'object'">
              <div v-if="!isEditingObject(id)" class="property-field">
                <label>Current Value</label>
                <pre class="array-preview">{{ JSON.stringify(property.currentValue, null, 2) }}</pre>
                <Button
                  v-if="!property.skipSave"
                  label="Edit"
                  icon="pi pi-pencil"
                  size="small"
                  severity="secondary"
                  @click="startEditObject(id, property.currentValue as Record<string, any>)"
                  class="edit-object-btn"
                />
              </div>
              <div v-else class="property-field">
                <label>Edit Value (JSON)</label>
                <Textarea
                  v-model="editObjectValue"
                  class="w-full"
                  rows="8"
                  autoResize
                />
                <div class="edit-actions">
                  <Button label="Save" icon="pi pi-check" size="small" @click="saveObjectEdit" />
                  <Button label="Cancel" icon="pi pi-times" size="small" severity="secondary" @click="cancelObjectEdit" />
                </div>
              </div>
            </template>

            <!-- Default value and reset -->
            <div class="property-footer">
              <span v-if="property.defaultValue !== undefined" class="default-value">
                Default: {{ property.defaultValue }}
              </span>
              <Button
                v-if="property.defaultValue !== undefined && !property.skipSave"
                label="Reset to Default"
                icon="pi pi-refresh"
                size="small"
                severity="secondary"
                @click="resetToDefault(id)"
              />
            </div>
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
    <p v-else class="no-properties">No properties defined</p>
  </div>
</template>

<style scoped>
.debug-properties {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.debug-properties h3 {
  margin: 0;
}

.property-header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  width: 100%;
}

.property-type {
  font-size: 0.75em;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  color: white;
  font-weight: 500;
}

.property-const-tag {
  font-size: 0.75em;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  background-color: #607D8B;
  color: white;
  font-weight: 500;
  font-style: italic;
}

.property-value-preview {
  color: var(--text-color-secondary);
  font-size: 0.9em;
  font-family: monospace;
}

.property-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.5rem 0;
}

.property-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.property-field label {
  font-size: 0.85em;
  color: var(--text-color-secondary);
}

.property-field-row {
  display: flex;
  gap: 1rem;
}

.property-field-row .property-field {
  flex: 1;
}

.checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}

.checkbox-field label {
  font-size: 1em;
  color: var(--text-color);
}

.property-info {
  display: flex;
  gap: 1rem;
  font-size: 0.85em;
  color: var(--text-color-secondary);
}

.property-info span {
  background: var(--surface-ground);
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.array-preview {
  background: var(--surface-ground);
  padding: 0.75rem;
  border-radius: 4px;
  margin: 0;
  font-size: 0.85em;
  overflow-x: auto;
}

.property-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 0.5rem;
  border-top: 1px solid var(--surface-border);
}

.default-value {
  font-size: 0.85em;
  color: var(--text-color-secondary);
}

.no-properties {
  color: var(--text-color-secondary);
  font-style: italic;
  text-align: center;
  padding: 2rem;
}

.edit-object-btn {
  margin-top: 0.5rem;
}

.edit-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}
</style>
