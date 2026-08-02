<script setup lang="ts">
import type { StyleValue } from 'vue';

defineProps<{
  displayContent: string;
  fullContent: string;
  selectable: boolean;
  characterName: string;
  showInlineName: boolean;
  contentStyle?: StyleValue;
  nameStyle?: StyleValue;
}>();
</script>

<template>
  <div class="dialogue-stack" :class="{ selecting: selectable }">
    <div class="dialogue-content event-content dialogue-ghost" :style="contentStyle" aria-hidden="true">
      <span v-if="showInlineName" class="inline-character-name" :style="nameStyle">{{ characterName }}: </span>
      <span v-script="{ html: fullContent, resolver: false }" style="display:inline"></span>
    </div>

    <div class="dialogue-live is-overlay">
      <div class="dialogue-content event-content" :style="contentStyle">
        <span v-if="showInlineName" class="inline-character-name" :style="nameStyle">{{ characterName }}: </span>
        <span v-script="{ html: displayContent, resolver: false, disabled: true }" style="display:inline"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialogue-stack {
  position: relative;
}

.dialogue-ghost {
  opacity: 0;
}

.dialogue-live.is-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.dialogue-live.is-overlay :deep(.lore-link) {
  pointer-events: none;
}

.selecting .dialogue-ghost {
  pointer-events: none;
}

.selecting .dialogue-live.is-overlay,
.selecting .dialogue-live.is-overlay :deep(.lore-link) {
  pointer-events: auto;
}

.dialogue-content {
  padding: 10px;
  line-height: 1.2em;
  font-family: var(--font-family-serif);
}

.text-dungeon-layout .dialogue-content {
  padding: 0px;
}

.inline-character-name {
  font-weight: bold;
}
</style>
