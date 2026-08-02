<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';

const game = Game.getInstance();
const dungeonSystem = game.dungeonSystem;

const dungeonName = computed(() => {
  const dungeonId = game.getCurrentDungeonId();
  return dungeonId ? game.getDungeonName(dungeonId) : '';
});

// While the dungeon's art decodes the map is blank, so the name gives way to a spinner.
const isLoading = computed(() => !dungeonSystem.dungeonAssetsLoaded.value);
</script>

<template>
  <div class="toolbar-item dungeon-name">
    <div v-if="isLoading" class="dot-carousel" />
    <span v-else class="dungeon-name-text">{{ dungeonName }}</span>
  </div>
</template>

<style scoped>
/* Takes the space between the two icon groups, holding the name in the middle of the bar. */
.toolbar-item.dungeon-name {
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  cursor: default;
  flex: 1 1 auto;
  min-width: 40px;
  overflow: hidden;
}

.dungeon-name-text {
  color: #a15335;
  font-weight: bold;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

/* Three dots chasing each other – the loading indicator DQ9 showed in the name's place. */
.dot-carousel {
  position: relative;
  left: -9999px;
  width: 8px;
  height: 8px;
  border-radius: 4px;
  --dot-color: #a15335;
  background-color: var(--dot-color);
  color: var(--dot-color);
  box-shadow: 9987px 0 0 0 var(--dot-color), 9999px 0 0 0 var(--dot-color), 10011px 0 0 0 var(--dot-color);
  animation: dotCarousel 1.5s infinite linear;
}

@keyframes dotCarousel {
  0% {
    box-shadow: 9987px 0 0 -1px var(--dot-color), 9999px 0 0 1px var(--dot-color), 10011px 0 0 -1px var(--dot-color);
  }

  50% {
    box-shadow: 10011px 0 0 -1px var(--dot-color), 9987px 0 0 -1px var(--dot-color), 9999px 0 0 1px var(--dot-color);
  }

  100% {
    box-shadow: 9999px 0 0 1px var(--dot-color), 10011px 0 0 -1px var(--dot-color), 9987px 0 0 -1px var(--dot-color);
  }
}
</style>
