<script setup lang="ts">
import { ref, watch, toRefs } from 'vue';
import type { DungeonEncounterObject } from '../../../schemas/dungeonEncounterSchema';
import InputNumber from 'primevue/inputnumber';
import Button from 'primevue/button';
import FileInput from '../dform/FileInput.vue';


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

// Define a mutable version of the encounter type
type Mutable<T> = { -readonly [P in keyof T]: T[P] };
type MutableDungeonEncounter = Mutable<DungeonEncounterObject>;

const editableEncounter = ref<MutableDungeonEncounter | null>(null);

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
    } else {
      editableEncounter.value = null;
    }
  },
  { immediate: true, deep: true }
);

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
        <!-- Image Input -->
        <div class="form-field form-field-full-width">
          <FileInput
            v-model="editableEncounter.image"
            file-type="image"
            label="Image"
            field-id="enc-image"
          />
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
