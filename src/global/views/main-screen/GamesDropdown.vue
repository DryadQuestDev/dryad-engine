<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { ManifestObject } from '../../../schemas/manifestSchema';

const props = defineProps<{
  games: ManifestObject[];
  selectedGame: ManifestObject | null;
}>();

const emit = defineEmits<{
  (e: 'select-game', game: ManifestObject): void;
}>();

const open = ref(false);
const rootRef = ref<HTMLElement | null>(null);

const triggerLabel = computed(() => {
  if (!props.selectedGame) return 'Choose game';
  return props.selectedGame.name || props.selectedGame.id || 'Untitled';
});

function pickGame(game: ManifestObject) {
  emit('select-game', game);
  open.value = false;
}

function onDocClick(e: MouseEvent) {
  if (!rootRef.value) return;
  if (!rootRef.value.contains(e.target as Node)) open.value = false;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false;
}

onMounted(() => {
  document.addEventListener('mousedown', onDocClick);
  document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocClick);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div ref="rootRef" class="games-dropdown" :class="{ open }">
    <button class="games-dropdown-trigger" @click="open = !open" type="button">
      <i class="pi pi-th-large"></i>
      <span class="games-dropdown-trigger-label">{{ triggerLabel }}</span>
      <i class="pi pi-chevron-down games-dropdown-chevron"></i>
    </button>

    <div v-if="open" class="games-dropdown-panel">
      <div v-if="games.length === 0" class="games-dropdown-empty">
        No games installed.
      </div>
      <div v-else class="games-dropdown-games">
        <button
          v-for="game in games"
          :key="game.id || game.uid"
          type="button"
          class="games-dropdown-game"
          :class="{ selected: game.id === selectedGame?.id }"
          @click="pickGame(game)"
        >
          <div class="games-dropdown-game-info">
            <span class="games-dropdown-game-name">{{ game.name }}</span>
            <span v-if="game.version" class="games-dropdown-game-version">v{{ game.version }}</span>
          </div>
          <i v-if="game.id === selectedGame?.id" class="pi pi-check games-dropdown-game-check"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.games-dropdown {
  position: relative;
  display: inline-block;
}

.games-dropdown-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-family: inherit;
  font-size: 13px;
  color: rgba(216, 221, 228, 0.92);
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 8px;
  cursor: pointer;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: background 0.15s ease, color 0.15s ease;
}

.games-dropdown-trigger:hover,
.games-dropdown.open .games-dropdown-trigger {
  background: var(--glass-bg-strong);
  color: #fff;
}

.games-dropdown-trigger-label {
  font-weight: 500;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.games-dropdown-mod-chip {
  color: var(--glass-tint);
  font-size: 12px;
}

.games-dropdown-chevron {
  font-size: 10px;
  opacity: 0.7;
  transition: transform 0.15s ease;
}

.games-dropdown.open .games-dropdown-chevron {
  transform: rotate(180deg);
}

@media (pointer: coarse), (max-width: 600px) {
  .games-dropdown-trigger {
    padding: 12px 16px;
    font-size: 14px;
    min-height: 48px;
  }
  .games-dropdown-trigger > i {
    font-size: 18px;
  }
  .games-dropdown-game {
    padding: 14px 14px;
    font-size: 14px;
  }
}

.games-dropdown-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 280px;
  max-width: 360px;
  max-height: 70vh;
  overflow-y: auto;
  padding: 8px;
  background: var(--glass-bg-strong);
  border: var(--glass-border);
  border-radius: 12px;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-shadow);
  z-index: 200;
}

.games-dropdown-empty {
  padding: 16px;
  font-size: 13px;
  text-align: center;
  color: rgba(216, 221, 228, 0.6);
  font-style: italic;
}

.games-dropdown-games {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.games-dropdown-game {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  color: rgba(216, 221, 228, 0.9);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.games-dropdown-game:hover {
  background: rgba(255, 255, 255, 0.06);
}

.games-dropdown-game.selected {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--glass-tint);
  color: #fff;
}

.games-dropdown-game-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.games-dropdown-game-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.games-dropdown-game-version {
  font-size: 11px;
  color: rgba(216, 221, 228, 0.5);
}

.games-dropdown-game-check {
  font-size: 12px;
  color: var(--glass-tint);
  flex-shrink: 0;
}

.games-dropdown-mods {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.games-dropdown-mods-title {
  padding: 4px 12px 8px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(216, 221, 228, 0.5);
}

.games-dropdown-mod {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  font-size: 13px;
  color: rgba(216, 221, 228, 0.9);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.games-dropdown-mod:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.06);
}

.games-dropdown-mod.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.games-dropdown-mod input {
  accent-color: var(--glass-tint);
  cursor: pointer;
  flex-shrink: 0;
}

.games-dropdown-mod.disabled input {
  cursor: not-allowed;
}

.games-dropdown-mod-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.games-dropdown-mod-incompatible {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-weight: bold;
  color: #fff;
  background: #c0392b;
  border-radius: 50%;
  font-size: 11px;
  flex-shrink: 0;
}
</style>
