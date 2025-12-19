<script setup lang="ts">
import { ref, computed } from 'vue';
import { Editor } from '../../../editor/editor';
import ToggleSwitch from 'primevue/toggleswitch';
import Select from 'primevue/select';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';

const editor = Editor.getInstance();

// Backup confirmation dialog
const showBackupInfo = ref(false);
const pendingBackupValue = ref(true);

// Quality options
const qualityOptions = [
  { label: 'Lossless (100)', value: 'lossless' },
  { label: 'High (95)', value: 95 },
  { label: 'Medium (85)', value: 85 },
  { label: 'Low (75)', value: 75 }
];

const selectedQuality = ref<string | number>(
  editor.webpLossless.value ? 'lossless' : editor.webpQuality.value
);

// Handle quality change
function onQualityChange(value: string | number) {
  if (value === 'lossless') {
    editor.webpLossless.value = true;
    editor.webpQuality.value = 100;
  } else {
    editor.webpLossless.value = false;
    editor.webpQuality.value = value as number;
  }
}

// Handle backup toggle - show info dialog when disabling
function onBackupToggle(value: boolean) {
  if (!value) {
    // User wants to DISABLE backup (keep original in place)
    pendingBackupValue.value = false;
    showBackupInfo.value = true;
  } else {
    // User enabling backup - no dialog needed
    editor.webpBackupOriginal.value = true;
  }
}

// Confirm disabling backup
function confirmNoBackup() {
  editor.webpBackupOriginal.value = false;
  showBackupInfo.value = false;
}

// Cancel - keep backup enabled
function cancelNoBackup() {
  pendingBackupValue.value = true;
  showBackupInfo.value = false;
  // Keep toggle on
}

// Tooltip text for auto-convert
const autoConvertTooltip = "Automatically converts selected PNG and JPG/JPEG files to WebP format for better compression. WebP files are typically 50-70% smaller than their originals while maintaining quality.";
</script>

<template>
  <div class="webp-settings-header">
    <!-- Settings controls -->
    <div class="settings-controls">
      <!-- Auto-convert toggle with tooltip -->
      <div class="setting-item">
        <ToggleSwitch
          v-model="editor.webpAutoConvert.value"
          inputId="webp-auto-convert"
          v-tooltip.top="autoConvertTooltip"
        />
        <label for="webp-auto-convert">Auto-convert PNG/JPG to WebP</label>
      </div>

      <!-- Quality selector and Backup toggle inline (only show when auto-convert is on) -->
      <div v-if="editor.webpAutoConvert.value" class="setting-item-row">
        <label for="webp-quality">Quality:</label>
        <Select
          v-model="selectedQuality"
          :options="qualityOptions"
          optionLabel="label"
          optionValue="value"
          @update:modelValue="onQualityChange"
          inputId="webp-quality"
          class="quality-select"
        />

        <!-- Backup original toggle inline -->
        <ToggleSwitch
          :modelValue="editor.webpBackupOriginal.value"
          @update:modelValue="onBackupToggle"
          inputId="webp-backup-original"
        />
        <label for="webp-backup-original">
          <i class="pi pi-save"></i>
          Backup original
        </label>
      </div>
    </div>

    <!-- Backup info dialog -->
    <Dialog
      v-model:visible="showBackupInfo"
      header="Keep Original Image Files in Place?"
      :modal="true"
      :closable="false"
      :style="{ width: '500px' }"
      class="backup-info-dialog"
    >
      <p class="info-message">
        If you disable this option, original image files will remain in their current location
        after conversion to WebP.
      </p>
      <p class="info-message">
        Both original and WebP files will coexist in the same folder.
      </p>
      <p class="info-message recommendation">
        <i class="pi pi-info-circle"></i>
        <span>
          <strong>Recommendation:</strong> Keep backup enabled to keep your asset folder organized
          and avoid having duplicate files (original + WebP versions).
        </span>
      </p>

      <template #footer>
        <Button label="Keep Backup Enabled" @click="cancelNoBackup" severity="secondary" />
        <Button label="Keep Both Files" @click="confirmNoBackup" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.webp-settings-header {
  padding: 0.75rem;
  background-color: var(--p-surface-50);
  border-bottom: 1px solid var(--p-surface-200);
  user-select: none;
}

.settings-controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.setting-item label {
  font-size: 0.9rem;
  cursor: pointer;
}

.setting-item-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.setting-item-row label {
  font-size: 0.9rem;
  cursor: pointer;
}

.setting-item-row .pi-save {
  margin-right: 0.25rem;
  color: var(--p-green-600);
}

.quality-select {
  width: 150px;
}

.backup-info-dialog .info-message {
  margin-bottom: 1rem;
  line-height: 1.6;
  color: var(--p-text-color);
}

.backup-info-dialog .recommendation {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  background-color: var(--p-blue-50);
  border-left: 3px solid var(--p-blue-500);
  border-radius: var(--p-border-radius);
  margin-top: 1.5rem;
}

.backup-info-dialog .recommendation .pi-info-circle {
  color: var(--p-blue-600);
  flex-shrink: 0;
  margin-top: 0.2rem;
}

.backup-info-dialog .recommendation strong {
  color: var(--p-blue-700);
}
</style>
