<script setup lang="ts">
import { Character } from '../../core/character/character';
import CharacterViewer from './CharacterViewer.vue';

defineProps<{
  characters: Character | Character[];
  initialIndex?: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <teleport to="body">
    <div class="char-viewer-overlay" @click.self="emit('close')">
      <div class="char-viewer-popup">
        <button class="char-viewer-close" @click="emit('close')">&times;</button>
        <CharacterViewer :characters="characters" :initialIndex="initialIndex ?? 0" />
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.char-viewer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.char-viewer-popup {
  position: relative;
  background: rgba(30, 30, 35, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  width: 90%;
  max-width: 1400px;
  height: 95%;
  padding: 1.5rem;
  overflow: hidden;
}

.char-viewer-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  cursor: pointer;
  font-size: 1rem;
  z-index: 10;
}

.char-viewer-close:hover {
  background: rgba(255, 100, 100, 0.3);
}
</style>
