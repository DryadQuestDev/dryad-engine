<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Select from 'primevue/select';
import Button from 'primevue/button';
import type { Inventory } from '../../core/character/inventory';

const game = Game.getInstance();
const global = Global.getInstance();

// Search query
const searchQuery = ref<string>('');

// All inventories
const inventories = ref<Inventory[]>([]);

// Form state for each inventory (using inventory id as key)
const selectedItemTemplates = ref<Record<string, string>>({});
const itemQuantities = ref<Record<string, number>>({});

// Filtered inventories based on search query
const filteredInventories = computed(() => {
  if (!searchQuery.value) return inventories.value;
  const query = searchQuery.value.toLowerCase();
  return inventories.value.filter(inv =>
    inv.id.toLowerCase().includes(query) ||
    inv.name.toLowerCase().includes(query)
  );
});

// Get all item templates as options
const itemTemplateOptions = computed(() => {
  return Array.from(game.itemSystem.itemTemplatesMap.entries()).map(([id, template]) => {
    const name = (template.traits as any)?.name;
    const label = name ? `${id} (${name})` : id;
    return {
      value: id,
      label: label
    };
  }).sort((a, b) => a.label.localeCompare(b.label));
});

// Add item to inventory
const addItemToInventory = (inventoryId: string) => {
  const inventory = game.itemSystem.getInventory(inventoryId);
  if (!inventory) {
    global.addNotification('Inventory not found');
    return;
  }

  const templateId = selectedItemTemplates.value[inventoryId];
  const quantity = itemQuantities.value[inventoryId] || 1;

  if (!templateId) {
    global.addNotification('Please select an item template');
    return;
  }

  try {
    const item = game.itemSystem.createItemFromTemplate(templateId);
    inventory.addItem(item, quantity);

    // Success notification
    const itemName = item.getName();
    global.addNotification(`Added ${quantity}x ${itemName} to ${inventory.name || inventory.id}`);

    // Reset form
    itemQuantities.value[inventoryId] = 1;
  } catch (error) {
    console.error('Failed to add item:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    global.addNotification(`Failed to add item: ${errorMessage}`);
  }
};

onMounted(() => {
  // Collect all inventories
  inventories.value = Array.from(game.itemSystem.inventories.value.values());

  // Sort by id
  inventories.value.sort((a, b) => a.id.localeCompare(b.id));

  // Initialize form state for each inventory
  inventories.value.forEach(inv => {
    itemQuantities.value[inv.id] = 1;
  });
});
</script>

<template>
  <div class="debug-inventories">
    <!-- Search Toolbar -->
    <div class="search-toolbar">
      <InputText v-model="searchQuery" class="search-input" />
      <span v-if="searchQuery" class="search-clear" @click="searchQuery = ''">✕</span>
    </div>

    <!-- Inventory Count -->
    <div class="inventory-count">
      {{ filteredInventories.length }} {{ filteredInventories.length === 1 ? 'Inventory' : 'Inventories' }}
      {{ searchQuery ? ` (filtered from ${inventories.length})` : '' }}
    </div>

    <!-- Inventories Accordion -->
    <Accordion multiple>
      <AccordionPanel v-for="inventory in filteredInventories" :key="inventory.id" :value="inventory.id">
        <AccordionHeader>
          <div class="inventory-header">
            <span class="inventory-id">{{ inventory.id }}</span>
            <span v-if="inventory.name && inventory.name !== inventory.id" class="inventory-name">
              ({{ inventory.name }})
            </span>
            <span class="item-count-badge">{{ inventory.items.length }} items</span>
          </div>
        </AccordionHeader>
        <AccordionContent>
          <!-- Add Item Form -->
          <div class="add-item-form">
            <h4 class="form-title">Add Item</h4>
            <div class="form-fields">
              <div class="form-field">
                <label class="field-label">Item Template</label>
                <Select v-model="selectedItemTemplates[inventory.id]" :options="itemTemplateOptions" optionLabel="label"
                  optionValue="value" placeholder="Select item..." class="field-select" filter />
              </div>
              <div class="form-field">
                <label class="field-label">Quantity</label>
                <InputNumber v-model="itemQuantities[inventory.id]" :min="1" :max="9999" class="field-input" />
              </div>
              <Button label="Add Item" @click="addItemToInventory(inventory.id)" class="add-button" size="small" />
            </div>
          </div>

          <!-- Inventory Info -->
          <div class="inventory-info">
            <div class="info-row">
              <span class="info-label">ID:</span>
              <span class="info-value">{{ inventory.id }}</span>
            </div>
            <div v-if="inventory.name" class="info-row">
              <span class="info-label">Name:</span>
              <span class="info-value">{{ inventory.name }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Max Size:</span>
              <span class="info-value">{{ inventory.maxSize === 0 ? 'Unlimited' : inventory.maxSize }}</span>
            </div>
            <div v-if="inventory.interactive" class="info-row">
              <span class="info-label">Interactive:</span>
              <span class="info-value">{{ inventory.interactive }}</span>
            </div>
            <div v-if="inventory.recipes.size > 0" class="info-row">
              <span class="info-label">Recipes:</span>
              <span class="info-value">{{ Array.from(inventory.recipes).join(', ') }}</span>
            </div>
          </div>

          <!-- Items List -->
          <div v-if="inventory.items.length > 0" class="items-section">
            <h4 class="section-title">Items ({{ inventory.items.length }})</h4>
            <div class="items-list">
              <div v-for="item in inventory.items" :key="item.uid" class="item-card">
                <!-- Item Header -->
                <div class="item-header">
                  <div class="item-main-info">
                    <img v-if="item.getImage()" :src="item.getImage()" class="item-icon" :alt="item.getName()" />
                    <div class="item-title-group">
                      <span class="item-name">{{ item.getName() }}</span>
                      <span class="item-id">({{ item.id }})</span>
                    </div>
                  </div>
                  <span v-if="item.quantity > 1" class="item-stack-count">
                    x{{ item.quantity }}
                  </span>
                </div>

                <!-- Item Details -->
                <div class="item-details">
                  <div class="detail-row">
                    <span class="detail-label">UID:</span>
                    <span class="detail-value">{{ item.uid }}</span>
                  </div>

                  <!-- Properties -->
                  <div v-if="Object.keys(item.properties).length > 0" class="detail-row">
                    <span class="detail-label">Properties:</span>
                    <div class="properties-grid">
                      <div v-for="(prop, propId) in item.properties" :key="propId" class="property-item">
                        <span class="property-name">{{ propId }}:</span>
                        <span class="property-value">{{ prop.currentValue }}/{{ prop.getMaxValue() }}</span>
                      </div>
                    </div>
                  </div>

                  <!-- Attributes -->
                  <div v-if="Object.keys(item.attributes).length > 0" class="detail-row">
                    <span class="detail-label">Attributes:</span>
                    <div class="attributes-list">
                      <span v-for="(value, key) in item.attributes" :key="key" class="attribute-tag">
                        {{ key }}: {{ value }}
                      </span>
                    </div>
                  </div>

                  <!-- Tags -->
                  <div v-if="item.tags.length > 0" class="detail-row">
                    <span class="detail-label">Tags:</span>
                    <div class="tags-list">
                      <span v-for="tag in item.tags" :key="tag" class="tag">{{ tag }}</span>
                    </div>
                  </div>

                  <!-- Currency -->
                  <div v-if="item.is_currency" class="detail-row">
                    <span class="currency-badge">Currency</span>
                  </div>

                  <!-- Price -->
                  <div v-if="Object.keys(item.price).length > 0" class="detail-row">
                    <span class="detail-label">Price:</span>
                    <div class="price-list">
                      <span v-for="(amount, currency) in item.price" :key="currency" class="price-item">
                        {{ currency }}: {{ amount }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else class="empty-inventory">
            <p>This inventory is empty</p>
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>

    <!-- No Results -->
    <div v-if="filteredInventories.length === 0" class="no-results">
      <p v-if="searchQuery">No inventories match your search</p>
      <p v-else>No inventories found</p>
    </div>
  </div>
</template>

<style scoped>
.debug-inventories {
  padding: 1rem;
  overflow-y: auto;
  /*max-height: calc(100vh - 200px);*/
}

/* Search Toolbar */
.search-toolbar {
  position: relative;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
}

.search-input {
  width: 100%;
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.375rem;
}

.search-input:focus {
  outline: none;
  border-color: #2b6cb0;
  box-shadow: 0 0 0 3px rgba(43, 108, 176, 0.1);
}

.search-clear {
  position: absolute;
  right: 0.75rem;
  cursor: pointer;
  color: #718096;
  font-size: 1.125rem;
  padding: 0.25rem;
  line-height: 1;
  user-select: none;
}

.search-clear:hover {
  color: #2d3748;
}

/* Inventory Count */
.inventory-count {
  font-size: 0.875rem;
  color: #4a5568;
  margin-bottom: 1rem;
  padding: 0.5rem 0.75rem;
  background: #f7fafc;
  border-radius: 0.375rem;
  font-weight: 500;
}

/* Inventory Header */
.inventory-header {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
}

.inventory-id {
  font-family: var(--font-family-mono);
  font-weight: 600;
  color: #2b6cb0;
  font-size: 1rem;
}

.inventory-name {
  color: #4a5568;
  font-style: italic;
  font-size: 0.875rem;
  padding-left: 0.5rem;
}

.item-count-badge {
  background: #e6fffa;
  color: #234e52;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  align-self: flex-start;
}

/* Add Item Form */
.add-item-form {
  background: #f0f9ff;
  padding: 1rem;
  border-radius: 0.375rem;
  margin-bottom: 1rem;
  border: 1px solid #bae6fd;
}

.form-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: #0c4a6e;
  margin: 0 0 0.75rem 0;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.field-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.field-select {
  width: 100%;
}

.field-input {
  width: 100%;
}

.add-button {
  width: 100%;
}

/* Inventory Info */
.inventory-info {
  background: #f7fafc;
  padding: 1rem;
  border-radius: 0.375rem;
  margin-bottom: 1rem;
}

.info-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
}

.info-row:last-child {
  margin-bottom: 0;
}

.info-label {
  font-weight: 600;
  color: #4a5568;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.info-value {
  font-family: var(--font-family-mono);
  color: #2d3748;
  word-break: break-all;
  padding-left: 0.5rem;
  border-left: 2px solid #e2e8f0;
}

/* Items Section */
.items-section {
  margin-top: 1rem;
}

.section-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #2d3748;
  margin: 0 0 0.75rem 0;
  padding-left: 0.5rem;
  border-left: 3px solid #4299e1;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Item Card */
.item-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.375rem;
  padding: 0.75rem;
  transition: box-shadow 0.2s;
}

.item-card:hover {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.item-main-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.item-icon {
  width: 48px;
  height: 48px;
  object-fit: contain;
  border-radius: 0.25rem;
  background: #f7fafc;
  padding: 0.25rem;
}

.item-title-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.item-name {
  font-weight: 600;
  color: #2d3748;
  font-size: 0.95rem;
}

.item-id {
  font-family: var(--font-family-mono);
  font-size: 0.75rem;
  color: #718096;
}

.item-stack-count {
  background: #edf2f7;
  color: #2d3748;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-weight: 600;
  font-size: 0.875rem;
}

/* Item Details */
.item-details {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.875rem;
}

.detail-label {
  font-weight: 600;
  color: #4a5568;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

.detail-value {
  font-family: var(--font-family-mono);
  color: #718096;
  font-size: 0.8rem;
}

/* Properties Grid */
.properties-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.property-item {
  background: #f7fafc;
  padding: 0.375rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.8rem;
  display: flex;
  justify-content: space-between;
}

.property-name {
  font-weight: 500;
  color: #4a5568;
}

.property-value {
  font-family: var(--font-family-mono);
  color: #2f855a;
  font-weight: 600;
}

/* Attributes List */
.attributes-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.attribute-tag {
  background: #fef5e7;
  color: #975a16;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

/* Tags List */
.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.tag {
  background: #e6f7ff;
  color: #0958d9;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

/* Currency Badge */
.currency-badge {
  display: inline-block;
  background: #d1fae5;
  color: #065f46;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.025em;
}

/* Price List */
.price-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.price-item {
  background: #f3f4f6;
  color: #374151;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

/* Empty States */
.empty-inventory {
  padding: 2rem;
  text-align: center;
  color: #718096;
  font-style: italic;
}

.no-results {
  padding: 2rem;
  text-align: center;
  color: #718096;
  font-style: italic;
}

/* Scrollbar styling */
.debug-inventories::-webkit-scrollbar {
  width: 8px;
}

.debug-inventories::-webkit-scrollbar-track {
  background: #f7fafc;
  border-radius: 4px;
}

.debug-inventories::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 4px;
}

.debug-inventories::-webkit-scrollbar-thumb:hover {
  background: #a0aec0;
}
</style>
