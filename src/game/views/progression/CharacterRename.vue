<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { Character } from '../../core/character/character';

const props = defineProps<{
  character: Character;
  maxLength?: number;
}>();

const emit = defineEmits<{
  rename: [oldName: string, newName: string];
}>();

// State management
const isEditing = ref(false);
const editValue = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const errorMessage = ref('');

// Computed properties
const characterName = computed(() => props.character?.getTrait('name') || 'Unnamed');

// Validation
const isValid = computed(() => {
  if (!editValue.value.trim()) {
    return false;
  }
  const maxLen = props.maxLength || 50;
  if (editValue.value.length > maxLen) {
    return false;
  }
  return true;
});

// Enter edit mode
async function startEdit() {
  editValue.value = characterName.value;
  errorMessage.value = '';
  isEditing.value = true;

  await nextTick();
  if (inputRef.value) {
    inputRef.value.focus();
    inputRef.value.select();
  }
}

// Save name
function saveName() {
  if (!isValid.value) {
    const maxLen = props.maxLength || 50;
    if (!editValue.value.trim()) {
      errorMessage.value = 'Name cannot be empty';
    } else if (editValue.value.length > maxLen) {
      errorMessage.value = `Name too long (max ${maxLen} characters)`;
    }
    return;
  }

  const trimmed = editValue.value.trim();
  if (trimmed !== characterName.value) {
    const oldName = characterName.value;
    props.character.setTrait('name', trimmed);
    emit('rename', oldName, trimmed);
  }

  isEditing.value = false;
  errorMessage.value = '';
}

// Cancel edit
function cancelEdit() {
  isEditing.value = false;
  errorMessage.value = '';
  editValue.value = '';
}

// Keyboard shortcuts
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveName();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelEdit();
  }
}
</script>

<template>
  <div class="character-rename">
    <!-- Display mode -->
    <div v-if="!isEditing" class="rename-display">
      <span class="character-name">{{ characterName }}</span>
      <button
        class="rename-edit-btn"
        @click="startEdit"
        title="Edit name"
        aria-label="Edit character name"
      >
        <i class="pi pi-pen-to-square"></i>
      </button>
    </div>

    <!-- Edit mode -->
    <div v-else class="rename-edit">
      <input
        ref="inputRef"
        v-model="editValue"
        type="text"
        class="rename-input"
        :class="{ 'error': errorMessage }"
        :maxlength="maxLength || 50"
        @keydown="handleKeydown"
        @blur="saveName"
      />
      <div class="rename-actions">
        <button
          class="rename-action-btn confirm"
          @click="saveName"
          :disabled="!isValid"
          title="Save"
          aria-label="Save name"
        >
          <i class="pi pi-check"></i>
        </button>
        <button
          class="rename-action-btn cancel"
          @click="cancelEdit"
          title="Cancel"
          aria-label="Cancel editing"
        >
          <i class="pi pi-times"></i>
        </button>
      </div>
    </div>

    <!-- Error message -->
    <div v-if="errorMessage" class="rename-error">
      {{ errorMessage }}
    </div>
  </div>
</template>

<style scoped>
.character-rename {
  display: inline-flex;
  flex-direction: column;
  gap: 0.25rem;
}

.rename-display {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
}

.character-name {
  font-size: 1rem;
  font-weight: 500;
}

.rename-edit-btn {
  padding: 0.25rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  transition: all 0.2s ease;
}

.rename-edit-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  border-color: rgba(255, 255, 255, 0.2);
}

.rename-edit {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.5rem;
}

.rename-input {
  flex: 1;
  padding: 0.375rem 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  color: #fff;
  font-size: 1rem;
  outline: none;
  transition: all 0.2s ease;
}

.rename-input:focus {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(74, 222, 128, 0.5);
}

.rename-input.error {
  border-color: rgba(239, 68, 68, 0.5);
}

.rename-actions {
  display: flex;
  gap: 0.25rem;
}

.rename-action-btn {
  padding: 0.375rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.rename-action-btn.confirm {
  color: rgba(74, 222, 128, 0.9);
}

.rename-action-btn.confirm:hover:not(:disabled) {
  background: rgba(74, 222, 128, 0.2);
  border-color: rgba(74, 222, 128, 0.3);
}

.rename-action-btn.confirm:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.rename-action-btn.cancel {
  color: rgba(239, 68, 68, 0.9);
}

.rename-action-btn.cancel:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.3);
}

.rename-error {
  font-size: 0.75rem;
  color: rgba(239, 68, 68, 0.9);
  margin-top: 0.125rem;
}
</style>
