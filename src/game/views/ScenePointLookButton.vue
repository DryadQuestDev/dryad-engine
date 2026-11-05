<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../game';
import { Global } from '../../global/global';

// Look around: a scene point layout with look_button keeps its markers hidden until the player presses
// this. Pressed again, it stops looking.
const game = Game.getInstance();
const global = Global.getInstance();
const sps = game.scenePointSystem;

const shown = computed(() => sps.lookButtonShown.value && !game.coreSystem.getState('progression_state'));
const looking = computed(() => !!sps.state?.looking);
const label = computed(() => {
  const key = looking.value ? 'scene_points.stop_looking' : 'scene_points.look_around';
  return global.getStringOr(key, global.getString(key));
});

function toggle() {
  if (game.coreSystem.getState('disable_ui')) return;
  sps.setLooking(!looking.value);
}
</script>

<template>
  <button v-if="shown" type="button" class="scene-look-button" :class="{ looking }" @click="toggle">
    <span class="pi" :class="looking ? 'pi-eye-slash' : 'pi-eye'"></span>
    <span class="scene-look-label">{{ label }}</span>
  </button>
</template>

<style scoped>
.scene-look-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(253, 230, 138, 0.55);
  background: rgba(10, 14, 22, 0.72);
  box-shadow: 0 0 12px rgba(253, 230, 138, 0.25);
  backdrop-filter: blur(4px);
  color: #fdf3d0;
  font: inherit;
  font-size: 0.9rem;
  white-space: nowrap;
  cursor: pointer;
  animation: scene-look-in 0.25s ease-out;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.scene-look-button:hover {
  background: rgba(30, 34, 44, 0.85);
  border-color: rgba(253, 230, 138, 0.9);
}

.scene-look-button.looking {
  border-color: rgba(200, 200, 205, 0.6);
  box-shadow: none;
  color: rgba(255, 255, 255, 0.85);
}

@keyframes scene-look-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

:global(body.reduced-effects) .scene-look-button {
  animation: none;
}
</style>
