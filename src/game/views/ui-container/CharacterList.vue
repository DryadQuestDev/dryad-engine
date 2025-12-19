<script setup lang="ts">
import { Game } from '../../game';
import { Character } from '../../core/character/character';
import CharacterFace from '../CharacterFace.vue';
import gsap from 'gsap';

const game = Game.getInstance();

function toggleCharacterList() {
  game.setState('show_character_list', !game.getState<boolean>('show_character_list'));
}

function clickCharacter(character: Character) {
  game.setState('selected_character', character.id);
  // Sticky state is now managed by useItemPopup composable and will reset when character changes
  game.setState('progression_state', 'character');
}

// GSAP Animation hooks for character list items
function onBeforeEnter(el: Element) {
  const element = el as HTMLElement;
  gsap.set(element, {
    opacity: 0,
    scale: 0.3,
    y: -50,
    rotationY: 90
  });
}

function onEnter(el: Element, done: () => void) {
  const element = el as HTMLElement;
  gsap.to(element, {
    opacity: 1,
    scale: 1,
    y: 0,
    rotationY: 0,
    duration: 1.2,
    ease: 'back.out(1.7)',
    onComplete: done
  });
}

function onLeave(el: Element, done: () => void) {
  const element = el as HTMLElement;
  gsap.to(element, {
    opacity: 0,
    scale: 0.3,
    y: 50,
    rotationX: -90,
    duration: 1,
    ease: 'back.in(1.7)',
    onComplete: done
  });
}
</script>

<template>
  <span @click="toggleCharacterList" class="ui-icon characters-icon pi pi-users"
    :class="{ 'active': game.coreSystem.getState('show_character_list') }"></span>

  <div class="character-list" v-if="game.coreSystem.getState('show_character_list')">
    <TransitionGroup @before-enter="onBeforeEnter" @enter="onEnter" @leave="onLeave" :css="false">
      <div :class="{ 'selected': game.characterSystem.selectedCharacter.value === character }"
        class="character-list-item" v-for="character of game.characterSystem.party.value" :key="character!.id"
        @click="clickCharacter(character!)">
        <CharacterFace class="character-list-image" :character="character" />
        <div class="character-list-name">{{ character!.getTrait('name') }}</div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.ui-icon.characters-icon {
  margin-right: 5px;
  font-size: 2.2rem;
  cursor: pointer;
  transition: opacity 0.3s ease-in-out, filter 0.3s ease-in-out;
}

.ui-icon.characters-icon:not(.active) {
  opacity: 0.4;
  filter: grayscale(100%);
}

.character-list {
  padding: 10px 10px 20px 10px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.character-list-item {
  position: relative;
  width: 100px;
  height: 110px;
  cursor: pointer;
}

.character-list-item.selected .character-list-image {
  outline: 2px solid rgb(0, 222, 37);
}

.character-list-item.selected .character-list-name {
  outline: 2px solid rgb(0, 222, 37);
}

.character-list-image {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  pointer-events: none;
}

.character-list-name {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%) translateY(50%);
  background: rgba(0, 0, 0, 1);
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  text-overflow: clip;
  overflow: hidden;
  max-width: 120px;
  outline: 2px solid rgba(255, 255, 255, 0.3);
}
</style>
