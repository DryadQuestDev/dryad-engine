<script setup lang="ts">
import { inject } from 'vue';
import Button from 'primevue/button';
import { Editor } from '../../editor';
import { SUBTAB_VIEW } from './subtabViewContext';

// The tab's Save and popup buttons, wherever a subtab view puts this in its own toolbar.
const ctx = inject(SUBTAB_VIEW, null);
const editor = Editor.getInstance();
</script>

<template>
  <template v-if="ctx">
    <Button label="Save" icon="pi pi-save" size="small" :text="!editor.hasUnsavedChanges.value"
      :severity="editor.hasUnsavedChanges.value ? 'warning' : 'secondary'" :disabled="!editor.hasUnsavedChanges.value"
      @click="ctx.save" />
    <Button v-for="comp in ctx.popupComponents.value" :key="comp.id" :label="comp.name" severity="info" size="small"
      @click="ctx.openPopup(comp.id)" />
  </template>
</template>
