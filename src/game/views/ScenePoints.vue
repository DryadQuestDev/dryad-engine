<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';
import { Game } from '../game';
import type { Choice } from '../core/content/choice';

// The markers of a scene point layout ({inspect}): one per visible choice bound to a point ({point}),
// drawn where the point sits on the picture. Clicking one runs its choice, like a menu row.
const game = Game.getInstance();
const sps = game.scenePointSystem;
const root = ref<HTMLElement | null>(null);

interface Marker { id: string; left: number; top: number; choice: Choice; visited: boolean; available: boolean; html: string }

const markers = computed<Marker[]>(() => {
  void sps.viewTick.value;
  const layout = sps.activeLayout.value;
  if (!sps.markersShown.value || !layout || !root.value) return [];
  const host = root.value.getBoundingClientRect();
  const visited = game.dungeonSystem.usedDungeonData.value.visitedChoices;
  return sps.pointChoices.value.flatMap((choice) => {
    const point = (layout.points || []).find((p) => p.id === choice.params.point);
    const at = point && sps.pointClient(layout, point);
    if (!point || !at) return [];
    return [{
      id: point.id,
      left: at.x - host.left,
      top: at.y - host.top,
      choice,
      visited: !!choice.id && visited.has(choice.id),
      available: !!choice.isAvailable,
      html: (choice.nameComputed as unknown as string) || choice.name || '',
    }];
  });
});

function pick(marker: Marker) {
  if (game.coreSystem.getState('disable_ui') || !marker.available) return;
  if (!game.trigger('scene_point_pick', sps.activeLayout.value?.id ?? '', marker.id, marker.choice)) return;
  marker.choice.do();
}

// Positions are read off the drawn picture, which isn't reactive: re-read on resize and while a picture
// that just showed is still loading its natural size.
let observer: ResizeObserver | null = null;
const bump = () => { sps.viewTick.value++; };
onMounted(() => {
  const view = document.querySelector('.game-body-content');
  if (view && 'ResizeObserver' in window) {
    observer = new ResizeObserver(bump);
    observer.observe(view);
  }
});
onBeforeUnmount(() => observer?.disconnect());
watch(() => sps.markersShown.value, async (shown) => {
  if (!shown) return;
  await nextTick();
  bump();
  setTimeout(bump, 150);
  setTimeout(bump, 600);
});
</script>

<template>
  <div ref="root" class="scene-points">
    <button v-for="m in markers" :key="m.id" type="button" class="scene-point" v-bind="{ 'data-point-id': m.id }"
      :class="{ visited: m.visited, unavailable: !m.available }" :style="{ left: m.left + 'px', top: m.top + 'px' }"
      @click.stop="pick(m)">
      <span class="scene-point-ring"></span>
      <span class="scene-point-label" v-script="{ html: m.html, resolver: false }"></span>
    </button>
  </div>
</template>

<style scoped>
.scene-points {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
}

/* The ring is centered on the point; the label hangs below it. */
.scene-point {
  position: absolute;
  width: 34px;
  height: 34px;
  transform: translate(-50%, -50%);
  padding: 0;
  border: 0;
  background: none;
  color: #fff;
  font: inherit;
  cursor: pointer;
  pointer-events: auto;
  animation: scene-point-in 0.25s ease-out;
}

.scene-point-ring {
  display: block;
  box-sizing: border-box;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 2px solid rgba(253, 230, 138, 0.9);
  box-shadow: 0 0 12px rgba(253, 230, 138, 0.7), inset 0 0 10px rgba(253, 230, 138, 0.45);
  animation: scene-point-pulse 1.8s infinite;
}

.scene-point-label {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 50%;
  transform: translateX(-50%);
  padding: 0.1rem 0.5rem;
  border-radius: 6px;
  background: rgba(10, 14, 22, 0.75);
  font-size: 0.8rem;
  white-space: nowrap;
}

.scene-point:hover .scene-point-ring {
  background: rgba(253, 230, 138, 0.25);
}

/* Already picked once: a grey ring that holds still. */
.scene-point.visited .scene-point-ring {
  border-color: rgba(200, 200, 205, 0.75);
  box-shadow: 0 0 8px rgba(190, 190, 200, 0.35), inset 0 0 6px rgba(190, 190, 200, 0.25);
  animation: none;
}

.scene-point.visited .scene-point-label {
  color: rgba(255, 255, 255, 0.6);
}

.scene-point.unavailable {
  cursor: default;
  opacity: 0.45;
}

.scene-point.unavailable .scene-point-ring {
  animation: none;
}

@keyframes scene-point-pulse {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.18); opacity: 1; }
}

@keyframes scene-point-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

:global(body.reduced-effects) .scene-point-ring {
  animation: none;
}
</style>

<style>
/* A layout with hide_actors fades the cast while its points are up and while the picture is zoomed in.
   The slot carries an inline opacity from its own enter animation, so fade the positioner inside it. */
.events-body .character-slot-positioner {
  transition: opacity 0.35s ease;
}

.events-body.scene-points-hide-actors .character-slot-positioner {
  opacity: 0;
}
</style>
