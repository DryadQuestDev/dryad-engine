<script setup lang="ts">
import { ref } from 'vue';
import Select from 'primevue/select';
import { Editor } from '../../editor';

const editor = Editor.getInstance();

const props = defineProps<{
  // Optional external disable signal — combined (OR'd) with internal logic.
  // The dungeon content editor popup uses this to lock the dropdown while
  // it has unsaved local edits, so the user can't switch dungeons and lose
  // them.
  disabled?: boolean;
}>();

const emit = defineEmits<{
  // Fires AFTER `editor.setDungeon` has completed its async load. Listeners
  // can use this to refresh views that snapshot the dungeon at open time
  // (e.g. the visual content editor popup).
  change: [dungeonId: string];
}>();

// PrimeVue Select displays the user's clicked option before our async
// `setDungeon` confirm dialog resolves. On cancel, modelValue stays the
// same but the Select sticks on the new value. Bumping the key remounts
// the Select against the unchanged prop, snapping it back to the editor's
// current dungeon.
const selectKey = ref(0);

async function handleChange(event: { value: string }) {
  const target = event.value;
  await editor.setDungeon(target);
  if (editor.selectedDungeon !== target) {
    selectKey.value++;
    return;
  }
  emit('change', target);
}
</script>

<template>
  <Select :key="selectKey" :modelValue="editor.selectedDungeon" :options="editor.filteredDungeons.value"
    @change="handleChange" filter
    :resetFilterOnHide="true" placeholder="Choose Dungeon" filterPlaceholder="Find dungeon..."
    :disabled="props.disabled || !editor.selectedGame || !editor.selectedMod || !editor.filteredDungeons.value || editor.filteredDungeons.value.length === 0"
    emptyFilterMessage="No dungeons found" emptyMessage="Select game and mod first" scrollHeight="250px" />
</template>
