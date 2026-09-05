<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, watch } from 'vue';
import { Game } from '../../game';
import { Character } from '../../core/character/character';
import CharacterFace from '../CharacterFace.vue';
import CharacterViewerPopup from '../progression/CharacterViewerPopup.vue';
import gsap from 'gsap';

const game = Game.getInstance();

// The scene's cast minus anyone already on the party rail to the left. getActors() keeps mid-exit
// slots on purpose — the actor is still on stage playing its exit, so a row that vanished early
// would leave the panel out of step with what the player can see — and lists `panel_actor` entries
// after the staged cast, so the rail's order matches what the player sees. Numbered bodies off one
// template (matango1/2/3) are genuinely separate characters with their own portraits, so they get
// their own rows.
const actors = computed<Character[]>(() =>
  game.getActors().filter(character => !game.isCharacterInParty(character)));

// Two separate gates, deliberately named apart. `hide_actor_list` is the content-side suppress and
// takes the whole panel down, toggle included — a scene wanting the corner clear for a beat.
// `actor_list_expanded` is the player's own collapse, folding the faces away but leaving the eye
// there to bring them back. The panel only exists while something is staged, so neither leaves a
// dead control sitting in the corner of a map screen.
const suppressed = computed(() => game.coreSystem.getState('hide_events')
  || game.coreSystem.getState('hide_actor_list'));
const hasActors = computed(() => actors.value.length > 0 && !suppressed.value);
const visible = computed(() => hasActors.value && game.coreSystem.getState('actor_list_expanded'));
// The rows TransitionGroup actually renders. Collapsing empties the list rather than unmounting its
// container: a `v-if` on the container removes the children instantly, so no leave animation ever
// gets to run. The container is hidden by `.actor-list:empty` once the last leave finishes.
const shownActors = computed<Character[]>(() => visible.value ? actors.value : []);

// Folding the rail is a UI action, not a scene beat — it should snap. The enter/leave tweens exist
// to show a character arriving on or leaving the stage, so the hooks below skip for the one patch
// the fold causes and resume immediately after. Driven off the STATE rather than the click handler
// so every path is covered — the icon, a content action, the debug panel. `flush: 'pre'` puts the
// flag up before the patch that reads it. Plain boolean, not a ref: nothing renders off it.
let suppressAnimation = false;
watch(() => game.coreSystem.getState('actor_list_expanded'), () => {
  suppressAnimation = true;
  nextTick(() => { suppressAnimation = false; });
});

function toggleActorList() {
  game.setState('actor_list_expanded', !game.getState<boolean>('actor_list_expanded'));
}

// Snapshotted at open, never the live computed: the viewer pages by index, and a scene that stages
// or drops an actor while the popup is up would slide the selection to a different character.
const viewerCharacters = shallowRef<Character[]>([]);
const viewerIndex = ref<number | null>(null);

function openViewer(index: number) {
  viewerCharacters.value = actors.value;
  viewerIndex.value = index;
}

function closeViewer() {
  viewerIndex.value = null;
}

// Mirror of the party rail's entrance, flipped so rows swing in from the right edge.
function onBeforeEnter(el: Element) {
  // Skipped while suppressed, or the row would be parked at opacity 0 waiting for a tween that
  // onEnter is about to decline to start.
  if (suppressAnimation) return;
  gsap.set(el as HTMLElement, { opacity: 0, scale: 0.3, y: -50, rotationY: -90 });
}

function onEnter(el: Element, done: () => void) {
  if (suppressAnimation) {
    gsap.set(el as HTMLElement, { opacity: 1, scale: 1, y: 0, rotationY: 0 });
    done();
    return;
  }
  gsap.to(el as HTMLElement, {
    opacity: 1, scale: 1, y: 0, rotationY: 0,
    duration: 1.2, ease: 'back.out(1.7)', onComplete: done,
  });
}

function onLeave(el: Element, done: () => void) {
  if (suppressAnimation) { done(); return; }
  gsap.to(el as HTMLElement, {
    opacity: 0, scale: 0.3, y: 50, rotationY: -90,
    duration: 1, ease: 'back.in(1.7)', onComplete: done,
  });
}
</script>

<template>
  <!-- Anchored to the top corner, mirroring the party rail on the left. The toggle sits first so
       it stays pinned at the edge while the faces hang below it. -->
  <div class="actor-panel" v-if="hasActors">
    <span @click="toggleActorList" class="ui-icon actors-icon pi pi-eye"
      :class="{ 'active': game.coreSystem.getState('actor_list_expanded') }"></span>

    <div class="actor-list">
      <!-- `appear` so the faces animate on the panel's first render too, not just on later
           add/remove — a TransitionGroup skips its initial mount without it. -->
      <TransitionGroup appear @before-enter="onBeforeEnter" @enter="onEnter" @leave="onLeave" :css="false">
        <div class="actor-list-item" v-for="(character, index) of shownActors" :key="character.id"
          @click="openViewer(index)">
          <!-- staticFaceForce: a scene already renders every one of these bodies as a live spine doll.
               Repeating them in the rail would double the per-frame render passes for no gain. -->
          <CharacterFace class="actor-list-image" :character="character" :showName="true" nameStyle="badge"
            staticFaceForce overlaySlot="actor-list-item" />
        </div>
      </TransitionGroup>
    </div>
  </div>

  <CharacterViewerPopup v-if="viewerIndex !== null" :characters="viewerCharacters" :initialIndex="viewerIndex"
    @close="closeViewer" />
</template>

<style scoped>
/* Base .ui-icon sizing lives in src/style.css, but its white comes from `.ui-container`'s deep
   rule — and this icon lives on the panel, not in that tray, so it sets its own colour. Setting it
   explicitly is also what makes the collapsed fade below read correctly: it dims a known white
   rather than whatever the page happened to be inheriting. */
.ui-icon.actors-icon {
  color: #fff;
  /* .ui-icon's right margin would pull it 5px off the faces' right edge. */
  margin-right: 0 !important;
  transition: opacity 0.3s ease-in-out, filter 0.3s ease-in-out;
}

.ui-icon.actors-icon:not(.active) {
  opacity: 0.4;
  filter: grayscale(100%);
}

/* Top-right corner, opposite the party rail. Top-anchored so the faces hang below the toggle and
   the toggle keeps its position as actors come and go. The bottom corner is too crowded here — the
   dialogue box and achievement toasts both reach into it. */
.actor-panel {
  position: absolute;
  top: 0;
  right: 0;
  padding: 5px;
  display: flex;
  flex-direction: column;
  /* Right-aligned, not centred: the panel's width tracks its widest child, so centring would slide
     the toggle sideways every time the faces collapse or the list empties. Anchoring to the right
     edge keeps it at a fixed x whatever the panel currently holds. */
  align-items: flex-end;
  gap: 5px;
  max-height: 95vh;
  max-height: 95dvh;
  pointer-events: auto;
}

.actor-list {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  /* No overflow on either axis. CSS computes a `visible` axis to `auto` as soon as its partner is
     scrollable, so an `overflow-y` here silently clips the X axis too — and the enter/leave tween
     swings each face out on `rotationY`, so it was shaving the sides off mid-animation. A stage
     crowded enough to run past the bottom edge is the cheaper problem: six faces fit at this size
     and the busiest authored scene stages four. */
}

/* Collapsed, the container lingers only as long as the leave animations need it. Once the last row
   is gone it stops occupying a flex slot, so the toggle sits flush in the corner again. */
.actor-list:empty {
  display: none;
}

.actor-list-item {
  position: relative;
    width: 105px;
    height: 115px;
    cursor: pointer;
    margin-top: 3px;
}

.actor-list-image {
  pointer-events: none;
}
</style>
