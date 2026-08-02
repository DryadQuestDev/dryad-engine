<script setup lang="ts">
import { ref, watch } from 'vue';
import Select from 'primevue/select';
import InputNumber from 'primevue/inputnumber';
import Button from 'primevue/button';

interface ItemOption { label: string; value: string; }

interface Props {
  isVisible: boolean;
  roomId: string;
  items: ItemOption[];
}
const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'confirm', payload: { item: string; quantity: number; regrow: number }): void;
  (e: 'cancel'): void;
}>();

const item = ref<string | null>(null);
const quantity = ref<number>(1);
const regrow = ref<number>(0);
const error = ref<string>('');

// Reset the form each time the popup opens.
watch(() => props.isVisible, (visible) => {
  if (visible) {
    item.value = null;
    quantity.value = 1;
    regrow.value = 0;
    error.value = '';
  }
});

function confirm() {
  if (!item.value) {
    error.value = 'Pick an item.';
    return;
  }
  emit('confirm', { item: item.value, quantity: quantity.value || 1, regrow: regrow.value || 0 });
}
</script>

<template>
  <div class="collectable-popup-overlay" v-if="isVisible" @click="emit('cancel')">
    <div class="collectable-popup-content" @click.stop>
      <h3 class="collectable-popup-title">New Collectable in {{ roomId }}</h3>

      <div class="collectable-field">
        <label for="cp-item">Item</label>
        <!-- @vue-ignore -->
        <Select inputId="cp-item" v-model="item" :options="items" optionLabel="label" optionValue="value"
          filter placeholder="Select an item" class="w-full" />
      </div>

      <div class="collectable-field">
        <label for="cp-qty">Quantity</label>
        <InputNumber inputId="cp-qty" v-model="quantity" :min="1" showButtons class="w-full" />
      </div>

      <div class="collectable-field">
        <label for="cp-regrow">Regrow (turns, 0 = one-time)</label>
        <InputNumber inputId="cp-regrow" v-model="regrow" :min="0" showButtons class="w-full" />
      </div>

      <div v-if="error" class="collectable-error">{{ error }}</div>

      <div class="collectable-buttons">
        <Button type="button" label="Confirm" icon="pi pi-check" size="small" @click="confirm" />
        <Button type="button" label="Cancel" icon="pi pi-times" size="small" severity="secondary"
          @click="emit('cancel')" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.collectable-popup-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 600;
}

.collectable-popup-content {
  background-color: var(--background-color, #1b1f1d);
  color: var(--text-color, #e8e8e8);
  padding: 20px 24px;
  border-radius: 8px;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
  min-width: 320px;
  max-width: 90vw;
}

.collectable-popup-title {
  margin: 0 0 18px;
  font-size: 1.2em;
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  padding-bottom: 10px;
}

.collectable-field {
  display: flex;
  flex-direction: column;
  margin-bottom: 14px;
}

.collectable-field label {
  font-weight: bold;
  margin-bottom: 5px;
  font-size: 0.85em;
  color: var(--text-muted-color, #9ca3af);
}

.collectable-field .w-full {
  width: 100%;
}

.collectable-error {
  color: #e06c75;
  margin-bottom: 12px;
  font-size: 0.9em;
}

.collectable-buttons {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
</style>
