<script setup lang="ts">
import { ref, watch, computed, toRefs, onMounted, onUnmounted } from 'vue';
import { Global } from '../../../global/global';
import { Editor } from '../../editor';
import type { DungeonEncounterObject } from '../../../schemas/dungeonEncounterSchema';
import type { Subscription } from 'rxjs';
import AutoComplete from 'primevue/autocomplete';
import InputNumber from 'primevue/inputnumber';
import ProgressSpinner from 'primevue/progressspinner';
import Button from 'primevue/button';


interface Props {
  encounter: DungeonEncounterObject;
  isVisible: boolean;
}

const props = defineProps<Props>();
const { encounter, isVisible } = toRefs(props);

const emit = defineEmits<{
  (e: 'save', encounter: DungeonEncounterObject): void;
  (e: 'close'): void;
}>();

const editor = Editor.getInstance();
const global = Global.getInstance();

// Define a mutable version of the encounter type
type Mutable<T> = { -readonly [P in keyof T]: T[P] };
type MutableDungeonEncounter = Mutable<DungeonEncounterObject>;

const editableEncounter = ref<MutableDungeonEncounter | null>(null);

const filteredFiles = ref<string[]>([]);
const isSearchingFiles = ref(false); // From editor.isSearchingFiles signal
const searchTerm = ref('');

let filteredFilesSubscription: Subscription | null = null;

watch(encounter,
  (newEncounter) => {
    if (newEncounter) {
      editableEncounter.value = {
        ...newEncounter,
        x: newEncounter.x ?? 0,
        y: newEncounter.y ?? 0,
        z: newEncounter.z ?? 25,
        scale: newEncounter.scale ?? 1,
        rotation: newEncounter.rotation ?? 0,
        image: newEncounter.image ?? undefined,
      } as MutableDungeonEncounter;
      searchTerm.value = newEncounter.image || '';
      if (searchTerm.value) {
        triggerFileSearch(searchTerm.value);
      }
    } else {
      editableEncounter.value = null;
    }
  },
  { immediate: true, deep: true }
);

watch(() => editor.isSearchingFiles.value, (newValue) => {
  isSearchingFiles.value = newValue;
});

onMounted(() => {
  if (editor.filteredFileResults$) {
    filteredFilesSubscription = editor.filteredFileResults$.subscribe(
      (newFiles: string[]) => {
        filteredFiles.value = newFiles;
      }
    );
  }
});

onUnmounted(() => {
  if (filteredFilesSubscription) {
    filteredFilesSubscription.unsubscribe();
  }
});

// Trigger file search from the Editor service
async function triggerFileSearch(currentSearchTerm: string | null | undefined) {
  if (currentSearchTerm === null || currentSearchTerm === undefined) {
    searchTerm.value = '';
    filteredFiles.value = [];
    return;
  }
  searchTerm.value = currentSearchTerm;
  // Assuming editor.searchFiles updates editor.isSearchingFiles and editor.filteredFileResults reactively.
  // If searchFiles is async and returns results, handle it here:
  // isSearchingFiles.value = true;
  // filteredFiles.value = await editor.searchFiles(searchTerm.value, 'image'); 
  // isSearchingFiles.value = false;
  editor.searchFiles(searchTerm.value, 'image'); // Call the existing method
}

// Handle selection from autocomplete
function onFileSelected(event: any): void { // Type event based on PrimeVue AutoComplete event
  if (editableEncounter.value) {
    editableEncounter.value.image = event.value;
    searchTerm.value = event.value;
  }
}

function saveChanges(): void {
  if (editableEncounter.value && props.encounter) {
    const finalEncounter: DungeonEncounterObject = {
      uid: props.encounter.uid,
      id: props.encounter.id, // Keep original ID
      ...(editableEncounter.value.image && { image: editableEncounter.value.image }),
      ...(editableEncounter.value.polygon && !editableEncounter.value.image && { polygon: editableEncounter.value.polygon }),
      x: Number(editableEncounter.value.x) || 0,
      y: Number(editableEncounter.value.y) || 0,
      z: Number(editableEncounter.value.z) || 25,
      scale: Number(editableEncounter.value.scale) || 1,
      rotation: Number(editableEncounter.value.rotation) || 0,
    };
    emit('save', finalEncounter);
    closePopup();
  }
}

function closePopup(): void {
  emit('close');
}

function onPopupClick(event: MouseEvent): void {
  event.stopPropagation();
}

</script>

<template>
  <div class="popup-overlay" v-if="isVisible" @click="closePopup">
    <div class="popup-content" @click="onPopupClick">
      <h3 v-if="encounter" class="popup-title">Edit Encounter: {{ encounter.id }}</h3>

      <div class="form-grid" v-if="editableEncounter">
        <!-- Image Input with Autocomplete -->
        <div class="form-field form-field-full-width">
          <label for="enc-image">Image:</label>
          <!-- PrimeVue AutoComplete -->
          <AutoComplete v-model="searchTerm" :suggestions="filteredFiles" @complete="triggerFileSearch($event.query)"
            @item-select="onFileSelected" placeholder="Start typing to search image files..." input-id="enc-image"
            force-selection class="w-full">
            <template #option="slotProps">
              <div class="autocomplete-option">
                <img :src="slotProps.option" alt="Preview" class="autocomplete-preview">
                <span class="autocomplete-text">{{ slotProps.option }}</span>
              </div>
            </template>
            <template #empty>
              <div v-if="isSearchingFiles" class="p-p-2">
                <ProgressSpinner style="width:20px;height:20px" strokeWidth="4" animationDuration=".5s" /> Searching...
              </div>
              <div v-else-if="searchTerm && searchTerm.length >= 2 && !filteredFiles.length && !isSearchingFiles"
                class="p-p-2">
                No matching images found.
              </div>
            </template>
          </AutoComplete>

          <!-- Selected Image Preview -->
          <img v-if="editableEncounter.image" :src="editableEncounter.image" alt="Selected Image Preview"
            class="selected-image-preview">
        </div>

        <!-- Coordinates -->
        <div class="form-field">
          <label for="enc-x">X:</label>
          <InputNumber inputId="enc-x" v-model="editableEncounter.x" class="w-full" />
        </div>
        <div class="form-field">
          <label for="enc-y">Y:</label>
          <InputNumber inputId="enc-y" v-model="editableEncounter.y" class="w-full" />
        </div>
        <div class="form-field">
          <label for="enc-z">Z:</label>
          <InputNumber inputId="enc-z" v-model="editableEncounter.z" class="w-full" />
        </div>

        <!-- Transform -->
        <div class="form-field">
          <label for="enc-scale">Scale:</label>
          <InputNumber :minFractionDigits="1" :maxFractionDigits="3" inputId="enc-scale" :step="0.1"
            v-model="editableEncounter.scale" class="w-full" />
        </div>
        <div class="form-field">
          <label for="enc-rotation">Rotation:</label>
          <InputNumber inputId="enc-rotation" :step="1" v-model="editableEncounter.rotation" class="w-full" />
        </div>

      </div>

      <div class="popup-actions">
        <Button label="Cancel" @click="closePopup" class="p-button-secondary" />
        <Button label="Save" @click="saveChanges" class="p-button-primary" />
      </div>
    </div>
  </div>
</template>

<style scoped src="./encounter-edit-popup.component.css"></style>
