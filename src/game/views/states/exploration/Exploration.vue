<script setup lang="ts">
import { ref, onMounted, watch, computed, type ComputedRef, nextTick, onUnmounted } from 'vue';
import { Game } from '../../../game';
import CustomComponentContainer from '../../CustomComponentContainer.vue';
import { Global } from '../../../../global/global';
import type { DungeonRoom } from '../../../core/dungeon/dungeonRoom';
import { gsap } from 'gsap';

import { GRADE_FILTER_ID } from '../../../systems/dungeonSystem';
import { DungeonData } from '../../../core/dungeon/dungeonData';
import type { DungeonEncounter } from '../../../core/dungeon/dungeonEncounter'; // Import DungeonEncounter type

// Props definition (example)
// const props = defineProps<{
//   exampleProp: string;
// }>();
const game = Game.getInstance();
const global = Global.getInstance();

const COMPONENT_ID = 'exploration-state';

const mainWrapperRef = ref<HTMLElement | null>(null); // Ref for the main-wrapper element
const mainWrapperObservedWidth = ref(0);
const mainWrapperObservedHeight = ref(0);

const dungeon = game.dungeonSystem.currentDungeon;

const dungeonData = game.dungeonSystem.usedDungeonData;
// Fallback function for encounter images
const getEncounterImage = (encounter: DungeonEncounter) => {
  if (!encounter.image) return 'assets/engine_assets/encounters/ph.png';
  return encounter.image;
};
const setMapContainer = (el: unknown) => {
  const prev = game.dungeonSystem.gameMapContainer.value;
  game.dungeonSystem.gameMapContainer.value = el as HTMLElement | null;
  // A freshly created container starts at scroll 0,0 — the v-if on isHideMap
  // rebuilds the element mid-scene when hide_map toggles off.
  if (el && el !== prev) {
    nextTick(() => game.dungeonSystem.centerToActive());
  }
};

const isDragging = ref(false);
const startX = ref(0);
const startY = ref(0);
const scrollLeftStart = ref(0);
const scrollTopStart = ref(0);

// Threshold-based capture: only claim the pointer after the user has moved past
// DRAG_THRESHOLD. Below that, events flow naturally so clicks on encounters and
// other child elements keep working.
const DRAG_THRESHOLD = 5;
const isActivelyDragging = ref(false);

const handlePointerDown = (event: PointerEvent) => {
  if (!game.dungeonSystem.gameMapContainer.value || dungeon.value?.dungeon_type === 'screen') return;
  isDragging.value = true;
  isActivelyDragging.value = false;
  startX.value = event.pageX - game.dungeonSystem.gameMapContainer.value.offsetLeft;
  startY.value = event.pageY - game.dungeonSystem.gameMapContainer.value.offsetTop;
  scrollLeftStart.value = game.dungeonSystem.gameMapContainer.value.scrollLeft;
  scrollTopStart.value = game.dungeonSystem.gameMapContainer.value.scrollTop;
};

const handlePointerMove = (event: PointerEvent) => {
  if (!isDragging.value || !game.dungeonSystem.gameMapContainer.value || dungeon.value?.dungeon_type === 'screen') return;
  const x = event.pageX - game.dungeonSystem.gameMapContainer.value.offsetLeft;
  const y = event.pageY - game.dungeonSystem.gameMapContainer.value.offsetTop;
  const dx = x - startX.value;
  const dy = y - startY.value;

  if (!isActivelyDragging.value) {
    if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    isActivelyDragging.value = true;
    game.dungeonSystem.gameMapContainer.value.style.cursor = 'grabbing';
    try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); } catch {}
  }

  const walkX = dx * 1.2; // Multiply by a factor for faster scrolling if needed
  const walkY = dy * 1.2;
  game.dungeonSystem.gameMapContainer.value.scrollLeft = scrollLeftStart.value - walkX;
  game.dungeonSystem.gameMapContainer.value.scrollTop = scrollTopStart.value - walkY;
};

const handlePointerUp = (event: PointerEvent) => {
  if (!game.dungeonSystem.gameMapContainer.value) return;
  isDragging.value = false;
  if (isActivelyDragging.value) {
    try { (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId); } catch {}
    isActivelyDragging.value = false;
  }
};

const handlePointerCancel = (event: PointerEvent) => {
  handlePointerUp(event);
};

const handleMouseWheel = (event: WheelEvent) => {
  if (!game.dungeonSystem.gameMapContainer.value) return;

  if (dungeon.value?.dungeon_type === 'screen') {
    return;
  }

  if (event.ctrlKey) {
    // Allow browser zoom when Ctrl key is pressed
    return;
  }

  //console.log(event.deltaY);
  event.preventDefault();
  const zoomSpeed = 0.1;
  let newZoomFactor = game.coreSystem.getState<number>('map_zoom_factor');

  if (event.deltaY < 0) {
    // Zoom in
    newZoomFactor += zoomSpeed;
  } else {
    // Zoom out
    newZoomFactor -= zoomSpeed;
  }

  game.dungeonSystem.setMapZoomFactor(newZoomFactor);
  //console.log(game.coreSystem.getState('map_zoom_factor'));
};

const handleMapClick = (event: MouseEvent) => {
  game.dungeonSystem.cancelPathMovement();
};

// Methods for encounters
const interact = (encounter: DungeonEncounter) => {

  if (!encounter.isHere(game.dungeonSystem.currentRoom.value)) {
    return;
  }

  // Props are not selectable
  if (encounter.isProp()) {
    return;
  }

  game.dungeonSystem.selectEncounter(encounter);
  game.dungeonSystem.toolbarMinimized.value = false;
};

const InteractionAnimationDone = (event: AnimationEvent, encounter: DungeonEncounter) => {
  // Stub: Implement logic for when interaction animation is done
  console.log('Animation done for:', encounter.id, event);
  // Example: if (event.toState === 'void' || !encounter.isVisible()) { game.interactionSystem.cleanupInteraction(encounter); }
};

// Animation hooks for image
const onImageEnter = (el: Element, done: () => void, encounter: DungeonEncounter) => {
  (el as HTMLElement).style.opacity = '0';
  requestAnimationFrame(() => {
    (el as HTMLElement).style.transition = `opacity ${encounter.fadeTime / 1000}s`;
    (el as HTMLElement).style.opacity = '1';
    setTimeout(done, encounter.fadeTime);
  });
};

const onImageLeave = (el: Element, done: () => void, encounter: DungeonEncounter) => {
  (el as HTMLElement).style.opacity = '1';
  requestAnimationFrame(() => {
    (el as HTMLElement).style.transition = `opacity ${encounter.fadeOutTime / 1000}s`;
    (el as HTMLElement).style.opacity = '0';
    setTimeout(done, encounter.fadeOutTime);
  });
};

// Animation hooks for polygon (similar to image, can be customized)
const onPolygonEnter = (el: Element, done: () => void, encounter: DungeonEncounter) => {
  (el as HTMLElement).style.opacity = '0'; // Or other initial state
  requestAnimationFrame(() => {
    (el as HTMLElement).style.transition = `opacity ${encounter.fadeTime / 1000}s`; // Or other properties
    (el as HTMLElement).style.opacity = '1';
    setTimeout(done, encounter.fadeTime);
  });
};

const onPolygonLeave = (el: Element, done: () => void, encounter: DungeonEncounter) => {
  (el as HTMLElement).style.opacity = '1';
  requestAnimationFrame(() => {
    (el as HTMLElement).style.transition = `opacity ${encounter.fadeOutTime / 1000}s`;
    (el as HTMLElement).style.opacity = '0';
    setTimeout(done, encounter.fadeOutTime);
  });
};

const clickRoom = (room: DungeonRoom) => {
  game.dungeonSystem.movePath(room)
}

// GSAP Fog reveal animations
const onFogMaskEnter = (el: Element, done: () => void) => {
  const isCircle = el.tagName.toLowerCase() === 'circle';

  if (isCircle) {
    // Circle: scale in effect
    gsap.set(el, {
      opacity: 0,
      scale: 0.3,
      transformOrigin: "center center"
    });

    gsap.to(el, {
      opacity: 1,
      scale: 1,
      duration: 0.6,
      ease: "power2.out",
      onComplete: done
    });
  } else {
    // Polygon: just fade in
    gsap.set(el, {
      opacity: 0
    });

    gsap.to(el, {
      opacity: 1,
      duration: 0.8,
      ease: "power2.out",
      onComplete: done
    });
  }
};


// GSAP Fog shadow mask animations (slightly different for variety)
const onFogShadowMaskEnter = (el: Element, done: () => void) => {
  const isCircle = el.tagName.toLowerCase() === 'circle';

  if (isCircle) {
    // Circle: scale in with slight rotation
    gsap.set(el, {
      opacity: 0,
      scale: 0.5,
      rotation: 5,
      transformOrigin: "center center"
    });

    gsap.to(el, {
      opacity: 1,
      scale: 1,
      rotation: 0,
      duration: 0.6,
      ease: "power2.out",
      onComplete: done
    });
  } else {
    // Polygon: just fade in
    gsap.set(el, {
      opacity: 0
    });

    gsap.to(el, {
      opacity: 1,
      duration: 0.8,
      ease: "power2.out",
      onComplete: done
    });
  }
};


let screenContentScale = ref(1);
let screenWidth = ref(dungeon.value?.widthBackground ?? 0);
let isScene = ref(dungeon.value?.dungeon_type == "screen");

watch(dungeon, (newDungeon) => {
  screenWidth.value = newDungeon?.widthBackground ?? 0;
  isScene.value = newDungeon?.dungeon_type === "screen";
  if (newDungeon?.dungeon_type === "screen") {
    // scroll to top left
    game.dungeonSystem.gameMapContainer.value?.scrollTo(0, 0);
  }
});

let resizeObserver: ResizeObserver | null = null;

const stopWatchingResize = () => {
  if (resizeObserver && mainWrapperRef.value) {
    resizeObserver.unobserve(mainWrapperRef.value);
    resizeObserver.disconnect();
    resizeObserver = null;
  }
};

const startWatchingResize = () => {
  if (mainWrapperRef.value && screenWidth.value > 0) {
    resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        const mwWidth = entry.contentRect.width;
        const mwHeight = entry.contentRect.height;
        mainWrapperObservedWidth.value = mwWidth;
        mainWrapperObservedHeight.value = mwHeight;

        const indent = (dungeon.value?.indent || 0) / 2;
        const contentSourceWidth = screenWidth.value; // This is dungeon.widthBackground
        const effectiveDisplayableContentWidth = contentSourceWidth - 2 * indent;

        if (contentSourceWidth > 0 && effectiveDisplayableContentWidth > 0) {
          screenContentScale.value = mwWidth / effectiveDisplayableContentWidth;
        } else {
          screenContentScale.value = 1; // Fallback scale
        }
      }
    });
    resizeObserver.observe(mainWrapperRef.value);
  }
};

watch(isScene, (newIsScene) => {
  if (newIsScene) {
    nextTick(() => { // Ensure mainWrapperRef is available
      startWatchingResize();
    });
  } else {
    stopWatchingResize();
  }
}, { immediate: true });


onMounted(() => {
  if (isScene.value) {
    startWatchingResize();
  }
});

onUnmounted(() => {
  stopWatchingResize();
});

const isHideMap = computed(() => {
  // 'text' dungeons never have a map; hide_map lets any dungeon hide its map
  // (map dungeons) or background screen image (screen dungeons) on demand.
  return dungeon.value?.dungeon_type === 'text' || !!game.getState('hide_map');
});

const subWrapperOffsets = computed(() => {
  const currentIsScene = isScene.value;
  const currentDungeon = dungeon.value;
  const currentScreenContentScale = screenContentScale.value;

  if (!currentIsScene || !currentDungeon || mainWrapperObservedHeight.value === 0) {
    // Return default if not scene, no dungeon, or observer hasn't reported height yet
    return { left: '0px', top: '0px' };
  }

  const d = currentDungeon;
  const scale = currentScreenContentScale;

  const indentEffect = (d.indent || 0) / 2;
  const padding = d.padding || 0;

  const contentSourceHeight = d.heightBackground ?? 0;
  const effectiveDisplayableContentHeight = contentSourceHeight - 2 * indentEffect;

  const scaledEffectiveDisplayableContentHeight = effectiveDisplayableContentHeight * scale;

  const verticalPaddingInMainWrapper = (mainWrapperObservedHeight.value - scaledEffectiveDisplayableContentHeight) / 2;

  const leftPixelOffset = -(padding + indentEffect) * scale;
  const topPixelOffset = verticalPaddingInMainWrapper - (padding + indentEffect) * scale;

  return {
    left: `${leftPixelOffset}px`,
    top: `${topPixelOffset}px`
  };
});

// Applied per art element rather than to a shared wrapper, so the map's UI — compass, room circles,
// debug room ids — is excluded by simply not carrying it. The fog and the polygon hit-outlines are
// left alone too.
const gradeFilter = computed(() =>
  game.dungeonSystem.gradeActive.value ? `url(#${GRADE_FILTER_ID})` : undefined
);

const isMapInteractive = computed(() => {
  return !game.dungeonSystem.currentSceneId.value && game.getState('overlay_state') === 'overlay-navigation';
});

</script>
<template>
  <!--
  <div class="visit" @click="dungeonData.addVisitedRoom('church')">Visit church</div>
      Dungeon: {{ dungeon.id }}
    <ul>
      <li v-for="room in dungeonData.visitedRooms" :key="room">
        {{ room }}
      </li>
    </ul>
-->


  <div :id="COMPONENT_ID" :ref="setMapContainer"
    class="game-map-container" :class="{
      'pan-enabled': dungeon?.dungeon_type !== 'screen',
      'assets-loading': !game.dungeonSystem.dungeonAssetsLoaded.value
    }" v-if="dungeon && !isHideMap"
    @pointerdown="handlePointerDown" @pointermove="handlePointerMove" @pointerup="handlePointerUp"
    @pointercancel="handlePointerCancel" @wheel="handleMouseWheel" @click="handleMapClick"
    :style="{ cursor: isDragging ? 'grabbing' : 'default' }">
    <div id="main-wrapper" ref="mainWrapperRef"
      :class="dungeon.dungeon_type === 'screen' ? 'screen-area' : 'map-wrapper-container'" :style="{
        '--map-zoom-factor': game.coreSystem.getState('map_zoom_factor')
      }">
      <div id="sub-wrapper" class="map-wrapper" :style="{
        width: dungeon.widthBackgroundWithPadding + 'px',
        height: dungeon.heightBackgroundWithPadding + 'px',
        padding: (dungeon.padding) + 'px',
        '--screen-content-scale': screenContentScale,
        left: subWrapperOffsets.left,
        top: subWrapperOffsets.top
      }">

        <div class="map">

          <img v-if="dungeon?.image" class="map-image" draggable="false" :src="dungeon.image"
            :style="{ transform: 'scale(' + (dungeon.image_scaling ?? 1) + ')', filter: gradeFilter }" />



          <!--compass-->
          <!-- keyed by room: moving cross-fades the old compass out and the new one in -->
          <transition name="compass-fade">
            <div v-if="dungeon.dungeon_type === 'map' && game.dungeonSystem.currentRoom.value" class="compass"
              :key="game.dungeonSystem.currentRoom.value.id"
              :style="{ left: game.dungeonSystem.currentRoom.value.xCompass + 'px', top: game.dungeonSystem.currentRoom.value.yCompass + 'px' }">
              <div class="compass-middle"></div>
              <template v-for="neighbor in game.dungeonSystem.currentRoom.value.neighborsWithDirection"
                :key="neighbor.angle">
                <transition name="compass-fade">
                  <div v-if="isMapInteractive" @click="game.dungeonSystem.enterRoom(neighbor.room.id)"
                    class="compass-arrow" :style="{ '--rotation': neighbor.angle + 'deg' }"></div>
                </transition>
              </template>
            </div>
          </transition>


          <!-- encounters -->
          <!-- The visibility v-if sits on each <transition>'s CHILD, never on the <transition>
               itself: gating the Transition component means it mounts/unmounts wholesale, and Vue
               skips `enter` on a Transition's own first render (no `appear`) and skips `leave`
               while it is unmounting — so the fade hooks would never fire. With the child gated,
               the Transition stays put and encounters fade as they show/hide. Encounters already
               visible when the map first renders still appear instantly, which is what we want. -->
          <template v-for="encounter in dungeon.encounters.values()" :key="encounter.id">
            <transition v-if="!encounter.polygon" @enter="(el, done) => onImageEnter(el, done, encounter)"
              @leave="(el, done) => onImageLeave(el, done, encounter)" :css="false">
              <!-- Grade on the wrapper, not the img: the img's filter is where the interactable /
                   clue drop-shadow glows land, and taking it over would kill them. -->
              <div v-if="encounter.isVisible" class="encounter-wrapper" :id="encounter.id" :style="{
                left: encounter.x + 'px',
                top: encounter.y + 'px',
                transform: 'scale(' + (encounter.scale ?? 1) + ')',
                zIndex: encounter.z,
                filter: gradeFilter
              }">
                <img :style="{
                  '--scale-shadow': 1 / encounter.scale,
                  filter: encounter.scaleShadow, // Assuming scaleShadow is a complete CSS filter string
                  transform: 'rotate(' + (encounter.rotation ?? 0) + 'deg)'
                }" :class="{
                  'item_icon': encounter.usesItemIcon,
                  'interactable': isMapInteractive && encounter.isHere(game.dungeonSystem.currentRoom.value) && !encounter.isProp(),
                  'clue': isMapInteractive && encounter.isClue(),
                  'active': isMapInteractive && encounter === game.dungeonSystem.selectedEncounter.value && !encounter.isProp()
                }" draggable="false" class="map_image" :src="getEncounterImage(encounter)"
                  @click="interact(encounter)"
                  @animationend="InteractionAnimationDone($event as AnimationEvent, encounter)" />
              </div>
            </transition>
            <transition v-else @enter="(el, done) => onPolygonEnter(el, done, encounter)"
              @leave="(el, done) => onPolygonLeave(el, done, encounter)" :css="false">
              <svg v-if="encounter.isVisible && encounter.isHere(game.dungeonSystem.currentRoom.value)"
                :width="dungeon.widthBackground" :height="dungeon.heightBackground" class="svg_contour"
                :style="{ zIndex: encounter.z }">
                <polygon :id="encounter.id" class="poly_encounter " @click="interact(encounter)" fill="none"
                  stroke-width="1" :points="encounter.polygon" :class="{
                    'interactable': isMapInteractive && !encounter.isProp(),
                    'clue': isMapInteractive && encounter.isClue(),
                    'active': isMapInteractive && encounter === game.dungeonSystem.selectedEncounter.value && !encounter.isProp()
                  }" @animationend="InteractionAnimationDone($event as AnimationEvent, encounter)" />
              </svg>
            </transition>
          </template>
        </div>
      </div>

      <!--Fog-->
      <template v-if="dungeon.fog_default && !game.coreSystem.getDebugSetting('disable_fog')">
        <svg v-if="dungeon" class='map_fog' :width="dungeon.widthBackgroundWithPadding"
          :height="dungeon.heightBackgroundWithPadding">
          <defs>


            <mask maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" id="mask1" x="0" y="0"
              :width="dungeon.widthBackgroundWithPadding" :height="dungeon.heightBackgroundWithPadding">
              <rect fill="#fff" x="0" y="0" width="100%" height="100%" />

              <transition-group @enter="onFogMaskEnter" :css="false" tag="g">
                <template v-for="room in dungeon.getVisitedRooms()" :key="room.id + '-mask1-item'">
                  <component :is="room.fogMaskMain.shape === 'circle' ? 'circle' : 'polygon'" fill="#000000"
                    :cx="room.fogMaskMain.shape === 'circle' ? room.fogMaskMain.center_x : undefined"
                    :cy="room.fogMaskMain.shape === 'circle' ? room.fogMaskMain.center_y : undefined"
                    :r="room.fogMaskMain.shape === 'circle' ? room.fogMaskMain.radius : undefined"
                    :points="room.fogMaskMain.shape === 'polygon' ? room.fogMaskMain.points : undefined" />
                </template>
              </transition-group>


            </mask>

            <mask maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" id="mask2" x="0" y="0"
              :width="dungeon.widthBackgroundWithPadding" :height="dungeon.heightBackgroundWithPadding">
              <rect fill="#fff" x="0" y="0" width="100%" height="100%" />


              <transition-group @enter="onFogShadowMaskEnter" :css="false" tag="g">
                <template v-for="room in dungeon.getVisibleRooms()" :key="room.id + '-mask2-item'">
                  <component
                    v-if="room.isVisited() || room.fogMaskShadow.shape === 'polygon' || room.fogMaskShadowNeighbor"
                    :is="room.fogMaskShadow.shape === 'circle' ? 'circle' : 'polygon'" fill="#000000"
                    :cx="room.fogMaskShadow.shape === 'circle' ? room.fogMaskShadow.center_x : undefined"
                    :cy="room.fogMaskShadow.shape === 'circle' ? room.fogMaskShadow.center_y : undefined"
                    :r="room.fogMaskShadow.shape === 'circle' ? room.fogMaskShadow.radius : undefined"
                    :points="room.fogMaskShadow.shape === 'polygon' ? room.fogMaskShadow.points : undefined" />
                </template>
              </transition-group>



            </mask>



            <pattern id="clouds" patternUnits="userSpaceOnUse" x="0" y="0" width="400" height="400">
              <image :href="dungeon.fog_image" x="0" y="0" width="400" height="400" />
            </pattern>

          </defs>


          <rect id="fog1" mask="url(#mask1)" fill="url(#clouds)" width="100%" height="100%" fill-opacity="0.6" />
          <rect id="fog2" mask="url(#mask2)" fill="url(#clouds)" width="100%" height="100%" fill-opacity="1" />


        </svg>
      </template>
      <!-- fog bottom -->
      <svg class='map_fog_bottom' :width="dungeon.widthBackgroundWithPadding"
        :height="dungeon.heightBackgroundWithPadding">
        <rect fill="url(#clouds)" width="105%" height="105%" fill-opacity="1" />
      </svg>


      <!--Fog End-->







      <!--rooms-->
      <template v-if="dungeon.dungeon_type === 'map'" v-for="room of dungeon.rooms.values()" :key="room.id">
        <!--circle-->
        <!-- v-if on the transition's child, same as the encounters above -->
        <transition name="circle-fade">
          <div
            v-if="isMapInteractive && room != game.dungeonSystem.currentRoom.value && room.isVisible() && game.dungeonSystem.showLocationCircles.value"
            :class="{ 'visited': room.isVisited() }" @click="clickRoom(room); $event.stopPropagation()"
            :style="{ left: room.xCircleWithPadding + 'px', top: room.yCircleWithPadding + 'px' }" class="circle"></div>
        </transition>

        <!--debug-->
        <div v-if="game.coreSystem.getDebugSetting('ids_on_map')" :style="{
          left: room.xCircleWithPadding + 65 + 'px',
          top: room.yCircleWithPadding + 'px'
        }" class="debug_location_id">{{ room.id }}</div>
      </template>

    </div>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" :context="{ dungeon, currentRoom: game.dungeonSystem.currentRoom.value }" />
  </div>
  <div v-else>
    no map found
  </div>

</template>

<style scoped src="./exploration.component.css"></style>
