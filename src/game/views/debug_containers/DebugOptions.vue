<script setup lang="ts">
import { Game } from '../../game';
import Gform from '../../../global/views/forms/Gform.vue';
import { DebugSettings } from '../../data/debugSettings';

const game = Game.getInstance();
</script>

<template>
  <!--
  Selected Character System: {{ game.characterSystem.selectedCharacter.value?.id }} <br>
  Selected Character State: {{ game.getState('selected_character') }}
-->

  <div class="debug-options">
    <Gform :schema="DebugSettings" :values="game.coreSystem.debugSettings" />
  </div>
</template>

<style scoped>
.debug-options {
  padding: 1rem;
}
</style>
