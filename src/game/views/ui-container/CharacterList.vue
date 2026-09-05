<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import Sortable from 'sortablejs';
import { Game } from '../../game';
import { Character } from '../../core/character/character';
import CharacterFace from '../CharacterFace.vue';
import gsap from 'gsap';

const game = Game.getInstance();

// The rows TransitionGroup actually renders. Toggling empties the list rather than unmounting its
// container: a `v-if` on the container tears the children out instantly, so no leave animation ever
// gets to run. `.character-list:empty` hides it once the last leave finishes.
const shownParty = computed(() => game.coreSystem.getState('show_character_list')
  ? game.characterSystem.party.value
  : []);

// Toggling the rail is a UI action, not a party change — it should snap. The tweens are for a
// member actually joining or leaving. Driven off the STATE so every path is covered (this handler,
// coreSystem.toggleCharacterList, content actions). Plain boolean: nothing renders off it.
let suppressAnimation = false;
watch(() => game.coreSystem.getState('show_character_list'), () => {
  suppressAnimation = true;
  nextTick(() => { suppressAnimation = false; });
});

function toggleCharacterList() {
  game.setState('show_character_list', !game.getState<boolean>('show_character_list'));
}

// Drag-to-reorder: the container is always mounted (its rows come and go instead, so they can play
// leave animations), so Sortable binds once when the element first mounts.
// The new order is read from the DOM's data-char-id attributes (filtered to current members) —
// never from indices, which go stale while a leave animation keeps a removed member's element
// in the DOM. Sortable's own move is then reverted so Vue's keyed patch owns the reorder and
// state (partyIds insertion order) stays the single source of truth.
const listEl = ref<HTMLElement | null>(null);
watch(listEl, (el, _prev, onCleanup) => {
  if (!el) return;
  const sortable = Sortable.create(el, {
    animation: 150,
    onEnd: (evt) => {
      const { item, from, oldIndex, newIndex } = evt;
      if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;
      const members = new Set(game.characterSystem.party.value.map(c => c.id));
      const seen = new Set<string>();
      const order: string[] = [];
      for (const child of Array.from(from.children)) {
        const id = (child as HTMLElement).dataset.charId;
        if (id && members.has(id) && !seen.has(id)) { seen.add(id); order.push(id); }
      }
      from.removeChild(item);
      from.insertBefore(item, from.children[oldIndex] ?? null);
      if (order.length === members.size) game.reorderParty(order);
    },
  });
  onCleanup(() => sortable.destroy());
});

function clickCharacter(character: Character) {
  game.setState('selected_character', character.id);
  // Sticky state is now managed by useItemPopup composable and will reset when character changes
  if (!game.getState<boolean>('suppress_character_progression')) {
    game.setState('progression_state', 'character');
  }
}

// GSAP Animation hooks for character list items
function onBeforeEnter(el: Element) {
  // Skipped while suppressed, or the row would sit at opacity 0 waiting for a tween onEnter is
  // about to decline to start.
  if (suppressAnimation) return;
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
  if (suppressAnimation) {
    gsap.set(element, { opacity: 1, scale: 1, y: 0, rotationY: 0 });
    done();
    return;
  }
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
  if (suppressAnimation) { done(); return; }
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

  <div class="character-list" ref="listEl">
    <!-- `appear` so the faces animate on first render too — a TransitionGroup skips its initial
         mount without it. -->
    <TransitionGroup appear @before-enter="onBeforeEnter" @enter="onEnter" @leave="onLeave" :css="false">
      <div :class="{ 'selected': game.characterSystem.selectedCharacter.value === character }"
        class="character-list-item" v-for="character of shownParty" :key="character!.id"
        v-bind="{ 'data-char-id': character!.id }" @click="clickCharacter(character!)">
        <CharacterFace class="character-list-image" :character="character" :showName="true" nameStyle="badge" overlaySlot="character-list-item" />
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/* Base .ui-icon styling (size, margin, cursor, mobile scale-up) lives in
   src/style.css. Only the characters-icon–specific active/inactive fade stays
   here. */
.ui-icon.characters-icon {
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
  align-items: center;
  gap: 16px;
  max-height: 95vh;
  max-height: 95dvh;
  overflow: auto;
}

/* Toggled off, the container lingers only as long as the leave animations need it, then stops
   taking space in the tray. */
.character-list:empty {
  display: none;
}

.character-list-item {
  position: relative;
  width: 100px;
  height: 110px;
  cursor: pointer;
}

.character-list-item.selected .character-list-image :deep(.character-face) {
  outline: 2px solid rgb(0, 222, 37);
}

.character-list-item.selected .character-list-image :deep(.character-face-name) {
  outline: 2px solid rgb(0, 222, 37);
}

.character-list-image {
  pointer-events: none;
}
</style>
