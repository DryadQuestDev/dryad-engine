<script setup lang="ts">
import { Game } from '../game';
import CustomComponentContainer from './CustomComponentContainer.vue';
import { Global } from '../../global/global';

const game = Game.getInstance();
const global = Global.getInstance();

function openMenu() {
  global.toggleMenu();
}

function toggleProgression() {
  // In replay mode, always toggle gallery with scenes tab
  if (game.getState('replay_mode')) {
    if (game.coreSystem.getState('progression_state') === 'gallery' && game.getState('gallery_tab') === 'scenes') {
      game.setState('progression_state', '');
    } else {
      game.setState('gallery_tab', 'scenes');
      game.setState('progression_state', 'gallery');
    }
    return;
  }

  if (game.coreSystem.getState('progression_state')) {
    game.setState('progression_state', '');
  } else {
    let firstTab = game.coreSystem.getComponentsBySlot('progression-tabs')[0].id;
    game.setState('progression_state', firstTab);
  }
}

</script>

<template>


  <div class="ui-container">

    <span @click="openMenu" class="ui-icon menu-icon pi pi-cog" :class="{ 'active': global.isMenuOpen.value }"></span>

    <span @click="toggleProgression" class="ui-icon quests-icon pi" :class="{
      'active': game.coreSystem.getState('progression_state'),
      'pi-history': game.getState('replay_mode'),
      'pi-book': !game.getState('replay_mode')
    }"></span>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="'ui-container'" />
  </div>

</template>

<style scoped>
/* Base .ui-icon styling (size, margin, cursor, mobile scale-up) lives in
   src/style.css so the same rules apply to icons rendered by plugin / sibling
   components that use the shared class. */
.ui-icon {
  transition: transform 0.3s ease-in-out;
}

.ui-icon.active {
  transform: rotate(90deg);
}

.ui-container:deep() {
  pointer-events: auto;
  /*background: rgba(0, 0, 0, 0.5);*/
  width: fit-content;
  color: white;
}

/* Lift the tray off the viewport edge on touch devices so iOS home indicator
   and Android gesture bar don't eat the hit area. */
@media (pointer: coarse) {
  .ui-container:deep() {
    margin-bottom: 12px;
    padding: 4px 6px;
  }
}
</style>
