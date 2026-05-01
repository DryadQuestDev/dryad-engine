<script setup lang="ts">
import Select from 'primevue/select';
import { Editor } from '../../editor';

const editor = Editor.getInstance();

const emit = defineEmits<{
  // Fires AFTER `editor.setDungeon` has completed its async load. Listeners
  // can use this to refresh views that snapshot the dungeon at open time
  // (e.g. the visual content editor popup).
  change: [dungeonId: string];
}>();

async function handleChange(event: { value: string }) {
  await editor.setDungeon(event.value);
  emit('change', event.value);
}
</script>

<template>
  <Select :modelValue="editor.selectedDungeon" :options="editor.filteredDungeons.value" @change="handleChange" filter
    :resetFilterOnHide="true" placeholder="Choose Dungeon" filterPlaceholder="Find dungeon..."
    :disabled="!editor.selectedGame || !editor.selectedMod || !editor.filteredDungeons.value || editor.filteredDungeons.value.length === 0"
    emptyFilterMessage="No dungeons found" emptyMessage="Select game and mod first" scrollHeight="250px" />
</template>
