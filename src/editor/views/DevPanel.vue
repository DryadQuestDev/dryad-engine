<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Button from 'primevue/button';
import { Editor } from '../editor';
import { DevManager } from '../devManager';
import { validateVersionFormat } from '../../utility/version-checker';
import { Global } from '../../global/global';

// Get editor instance
const editor = Editor.getInstance();
const global = Global.getInstance();

// Create DevManager instance
const devManager = new DevManager(editor);

// Export state
const isExporting = ref(false);
const versionError = ref<string | null>(null);

// Check if export is available - directly access reactive refs
const canExport = computed(() => {
  return !!(editor.devSettings.value && editor.selectedGame);
});

// Get button label
const buttonLabel = computed(() => {
  if (isExporting.value) {
    return 'Creating Archive...';
  }

  const modId = editor.selectedMod || '_core';
  const isGame = modId === '_core';

  if (isGame) {
    return `Export ${editor.selectedGame} game as ZIP`;
  } else {
    return `Export ${modId} mod as ZIP`;
  }
});

// Check version validity
async function checkVersion() {
  versionError.value = null;

  if (!editor.selectedGame) {
    return;
  }

  try {
    const modId = editor.selectedMod || '_core';
    const manifestPath = `games_files/${editor.selectedGame}/${modId}/manifest.json`;
    const manifest = await global.readJson(manifestPath);

    if (manifest && manifest.version) {
      const validation = validateVersionFormat(manifest.version);
      if (!validation.isValid) {
        versionError.value = validation.error || 'Invalid version format';
      }
    } else {
      versionError.value = 'Version not found in manifest.json';
    }
  } catch (error) {
    // Silently fail - manifest might not exist yet
    versionError.value = null;
  }
}

// Watch for game/mod changes to re-validate version
watch([() => editor.selectedGame, () => editor.selectedMod], () => {
  checkVersion();
}, { immediate: true });

// Handle export button click
async function handleExport() {
  if (!canExport.value || isExporting.value || versionError.value) {
    return;
  }

  isExporting.value = true;

  try {
    await devManager.exportGameZip();
  } finally {
    isExporting.value = false;
  }
}
</script>

<template>
  <div v-if="editor.selectedGame" class="dev-panel">
    <div class="panel-header">
      <h3>Development Tools</h3>
    </div>

    <div class="panel-content">
      <div class="export-section">
        <Button :label="buttonLabel" icon="pi pi-download" @click="handleExport"
          :disabled="!canExport || isExporting || !!versionError"
          :loading="isExporting" class="export-button" />

        <div v-if="!canExport" class="warning-message">
          <i class="pi pi-exclamation-triangle"></i>
          <span>dev_settings.json not found.</span>
        </div>

        <div v-if="versionError" class="error-message">
          <i class="pi pi-times-circle"></i>
          <span>{{ versionError }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dev-panel {
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  margin: 1rem 0;
  background-color: #ffffff;
}

.panel-header {
  padding: 1rem;
  border-bottom: 1px solid #e0e0e0;
}

.panel-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #333333;
}

.panel-content {
  padding: 1.5rem;
}

.export-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.export-button {
  align-self: flex-start;
}

.warning-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 4px;
  font-size: 0.9rem;
  background-color: #fff3cd;
  border: 1px solid #ffc107;
  color: #856404;
}

.warning-message i {
  font-size: 1.2rem;
  color: #ffc107;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 4px;
  font-size: 0.9rem;
  background-color: #f8d7da;
  border: 1px solid #f44336;
  color: #721c24;
}

.error-message i {
  font-size: 1.2rem;
  color: #f44336;
}
</style>
