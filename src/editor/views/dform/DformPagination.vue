<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import Select from 'primevue/select';

// Props
const props = defineProps<{
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
}>();

// Emits
const emit = defineEmits<{
  (e: 'update:currentPage', page: number): void;
  (e: 'update:itemsPerPage', value: number): void;
}>();

// Items per page options
const itemsPerPageOptions = [
  { label: '5 per page', value: 5 },
  { label: '10 per page', value: 10 },
  { label: '20 per page', value: 20 },
  { label: '30 per page', value: 30 },
  { label: '40 per page', value: 40 },
  { label: '50 per page', value: 50 },
];

// Computed properties
const startItem = computed(() => {
  if (props.totalItems === 0) return 0;
  return (props.currentPage - 1) * props.itemsPerPage + 1;
});

const endItem = computed(() => {
  const end = props.currentPage * props.itemsPerPage;
  return Math.min(end, props.totalItems);
});

const isFirstPage = computed(() => props.currentPage === 1);
const isLastPage = computed(() => props.currentPage === props.totalPages);

// Methods
function goToPage(page: number) {
  if (page >= 1 && page <= props.totalPages) {
    emit('update:currentPage', page);
  }
}

function goToFirstPage() {
  goToPage(1);
}

function goToPreviousPage() {
  goToPage(props.currentPage - 1);
}

function goToNextPage() {
  goToPage(props.currentPage + 1);
}

function goToLastPage() {
  goToPage(props.totalPages);
}

function onItemsPerPageChange(value: number) {
  emit('update:itemsPerPage', value);
}
</script>

<template>
  <div class="dform-pagination">
    <div class="pagination-controls">
      <!-- Left: Items per page selector -->
      <div class="items-per-page-selector">
        <Select
          :modelValue="itemsPerPage"
          :options="itemsPerPageOptions"
          optionLabel="label"
          optionValue="value"
          @update:modelValue="onItemsPerPageChange"
          :pt="{
            root: { style: 'min-width: 140px' }
          }"
        />
      </div>

      <!-- Center: Page navigation -->
      <div class="page-navigation">
        <Button
          icon="pi pi-angle-double-left"
          @click="goToFirstPage"
          :disabled="isFirstPage"
          text
          rounded
          size="small"
          aria-label="First page"
          title="First page"
        />
        <Button
          icon="pi pi-angle-left"
          @click="goToPreviousPage"
          :disabled="isFirstPage"
          text
          rounded
          size="small"
          aria-label="Previous page"
          title="Previous page"
        />

        <span class="page-indicator">
          Page {{ currentPage }} of {{ totalPages }}
        </span>

        <Button
          icon="pi pi-angle-right"
          @click="goToNextPage"
          :disabled="isLastPage"
          text
          rounded
          size="small"
          aria-label="Next page"
          title="Next page"
        />
        <Button
          icon="pi pi-angle-double-right"
          @click="goToLastPage"
          :disabled="isLastPage"
          text
          rounded
          size="small"
          aria-label="Last page"
          title="Last page"
        />
      </div>

      <!-- Right: Item count -->
      <div class="item-count">
        Showing {{ startItem }}-{{ endItem }} of {{ totalItems }} items
      </div>
    </div>
  </div>
</template>

<style scoped>
.dform-pagination {
  margin-bottom: 1.5rem;
  padding: 0.75rem;
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
}

.pagination-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.items-per-page-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.page-navigation {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.page-indicator {
  padding: 0 1rem;
  font-weight: 500;
  white-space: nowrap;
  min-width: 120px;
  text-align: center;
}

.item-count {
  font-size: 0.9rem;
  color: #6c757d;
  white-space: nowrap;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .pagination-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .items-per-page-selector,
  .page-navigation,
  .item-count {
    justify-content: center;
  }

  .page-indicator {
    min-width: auto;
  }
}
</style>
