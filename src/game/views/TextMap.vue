<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { Game } from '../game';
import type { DungeonRoom } from '../core/dungeon/dungeonRoom';
import { ROOM_SIZE } from '../../editor/editorMap';

const props = defineProps<{
  mode: 'mini' | 'full';
}>();

const emit = defineEmits<{
  (e: 'openFullMap'): void;
  (e: 'closeFullMap'): void;
}>();

const game = Game.getInstance();

const ROOM_DISPLAY_SIZE = 30;
const ROOM_HALF_SIZE = ROOM_DISPLAY_SIZE / 2;

// Dragging state
const mapContainerRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const startX = ref(0);
const startY = ref(0);
const scrollLeftStart = ref(0);
const scrollTopStart = ref(0);

// Get current dungeon
const dungeon = computed(() => game.dungeonSystem.currentDungeon.value);

// Get visible rooms only
const visibleRooms = computed(() => {
  if (!dungeon.value) return [];
  const rooms: DungeonRoom[] = [];
  for (const room of dungeon.value.rooms.values()) {
    if (room.isVisible()) {
      rooms.push(room);
    }
  }
  return rooms;
});

// Calculate map bounds based on visible rooms
const mapBounds = computed(() => {
  const rooms = visibleRooms.value;
  if (rooms.length === 0) {
    return { minX: 0, minY: 0, maxX: 400, maxY: 300, width: 400, height: 300 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const room of rooms) {
    minX = Math.min(minX, room.x);
    minY = Math.min(minY, room.y);
    maxX = Math.max(maxX, room.x + ROOM_SIZE);
    maxY = Math.max(maxY, room.y + ROOM_SIZE);
  }

  const padding = 40;
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2
  };
});

// Build door connections between visible rooms
const doorConnections = computed(() => {
  const rooms = visibleRooms.value;
  const roomMap = new Map<string, DungeonRoom>();
  for (const room of rooms) {
    roomMap.set(room.id, room);
  }

  const connections: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const processedPairs = new Set<string>();

  for (const room of rooms) {
    for (const neighbor of room.neighbors) {
      // Only process if neighbor is also visible
      if (!roomMap.has(neighbor.id)) continue;

      // Avoid duplicate connections
      const pairKey = [room.id, neighbor.id].sort().join('-');
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      connections.push({
        x1: room.xCenter - mapBounds.value.minX,
        y1: room.yCenter - mapBounds.value.minY,
        x2: neighbor.xCenter - mapBounds.value.minX,
        y2: neighbor.yCenter - mapBounds.value.minY
      });
    }
  }

  return connections;
});

// Handle room click - navigate to room
function handleRoomClick(room: DungeonRoom, event: MouseEvent) {
  event.stopPropagation();
  if (game.coreSystem.getState('disable_ui')) return;

  const currentRoom = game.dungeonSystem.currentRoom.value;
  if (currentRoom && room.id !== currentRoom.id) {
    game.dungeonSystem.movePath(room);
  }
}

// Handle map background click - cancel movement
function handleMapClick() {
  game.dungeonSystem.cancelPathMovement();
}

// Dragging handlers
function handleMouseDown(event: MouseEvent) {
  if (!mapContainerRef.value) return;
  isDragging.value = true;
  startX.value = event.pageX - mapContainerRef.value.offsetLeft;
  startY.value = event.pageY - mapContainerRef.value.offsetTop;
  scrollLeftStart.value = mapContainerRef.value.scrollLeft;
  scrollTopStart.value = mapContainerRef.value.scrollTop;
  mapContainerRef.value.style.cursor = 'grabbing';
}

function handleMouseMove(event: MouseEvent) {
  if (!isDragging.value || !mapContainerRef.value) return;
  event.preventDefault();
  const x = event.pageX - mapContainerRef.value.offsetLeft;
  const y = event.pageY - mapContainerRef.value.offsetTop;
  const walkX = (x - startX.value) * 1.2;
  const walkY = (y - startY.value) * 1.2;
  mapContainerRef.value.scrollLeft = scrollLeftStart.value - walkX;
  mapContainerRef.value.scrollTop = scrollTopStart.value - walkY;
}

function handleMouseUp() {
  isDragging.value = false;
  if (mapContainerRef.value) {
    mapContainerRef.value.style.cursor = 'grab';
  }
}

function handleMouseLeave() {
  if (isDragging.value) {
    isDragging.value = false;
    if (mapContainerRef.value) {
      mapContainerRef.value.style.cursor = 'grab';
    }
  }
}

// Check if map is interactive
const isMapInteractive = computed(() => {
  return !game.dungeonSystem.currentSceneId.value;
});

// Mini map viewBox - show all rooms scaled to fit
const miniMapViewBox = computed(() => {
  return `0 0 ${mapBounds.value.width} ${mapBounds.value.height}`;
});
</script>

<template>
  <div class="text-map-wrapper" :class="mode">
    <div class="map-header">
      <span class="map-title">Map</span>
      <button v-if="mode === 'mini'" class="expand-btn" @click="emit('openFullMap')" title="Open full map">
        <i class="pi pi-expand"></i>
      </button>
      <button v-else class="close-btn" @click="emit('closeFullMap')" title="Close map">
        <i class="pi pi-times"></i>
      </button>
    </div>

    <div ref="mapContainerRef" class="map-container" :class="{ 'draggable': mode === 'full' }"
      @mousedown="mode === 'full' && handleMouseDown($event)" @mousemove="mode === 'full' && handleMouseMove($event)"
      @mouseup="mode === 'full' && handleMouseUp()" @mouseleave="mode === 'full' && handleMouseLeave()"
      :style="mode === 'full' ? { cursor: isDragging ? 'grabbing' : 'grab' } : {}">
      <!-- Mini map: shows all rooms scaled to fit -->
      <svg v-if="mode === 'mini'" class="map-svg" :viewBox="miniMapViewBox" preserveAspectRatio="xMidYMid meet"
        @click="handleMapClick">
        <!-- Connection lines -->
        <g class="connections">
          <line v-for="(conn, index) in doorConnections" :key="'conn-' + index" :x1="conn.x1" :y1="conn.y1"
            :x2="conn.x2" :y2="conn.y2" stroke="#576574" stroke-width="3" />
        </g>

        <!-- Room squares -->
        <g class="rooms">
          <g v-for="room in visibleRooms" :key="room.id" class="room-group" :class="{
            'current': game.dungeonSystem.currentRoom.value?.id === room.id,
            'visited': room.isVisited(),
            'clickable': isMapInteractive && room.id !== game.dungeonSystem.currentRoom.value?.id
          }" @click="handleRoomClick(room, $event)">
            <rect :x="room.xCenter - mapBounds.minX - ROOM_HALF_SIZE"
              :y="room.yCenter - mapBounds.minY - ROOM_HALF_SIZE" :width="ROOM_DISPLAY_SIZE"
              :height="ROOM_DISPLAY_SIZE" stroke-width="2" rx="4" ry="4" />
          </g>
        </g>
      </svg>

      <!-- Full map: scrollable with original bounds -->
      <svg v-else class="map-svg" :width="mapBounds.width" :height="mapBounds.height"
        :viewBox="`0 0 ${mapBounds.width} ${mapBounds.height}`" @click="handleMapClick">
        <!-- Connection lines -->
        <g class="connections">
          <line v-for="(conn, index) in doorConnections" :key="'conn-' + index" :x1="conn.x1" :y1="conn.y1"
            :x2="conn.x2" :y2="conn.y2" stroke="#576574" stroke-width="3" />
        </g>

        <!-- Room squares -->
        <g class="rooms">
          <g v-for="room in visibleRooms" :key="room.id" class="room-group" :class="{
            'current': game.dungeonSystem.currentRoom.value?.id === room.id,
            'visited': room.isVisited(),
            'clickable': isMapInteractive && room.id !== game.dungeonSystem.currentRoom.value?.id
          }" @click="handleRoomClick(room, $event)">
            <rect :x="room.xCenter - mapBounds.minX - ROOM_HALF_SIZE"
              :y="room.yCenter - mapBounds.minY - ROOM_HALF_SIZE" :width="ROOM_DISPLAY_SIZE" :height="ROOM_DISPLAY_SIZE"
              stroke-width="2" rx="4" ry="4" />
            <!-- Room label (optional, can be toggled) -->
            <!--
            <text
              :x="room.xCenter - mapBounds.minX"
              :y="room.yCenter - mapBounds.minY + 4"
              text-anchor="middle"
              fill="white"
              font-size="10"
            >{{ room.id.slice(0, 3) }}</text>
            -->
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>

<style scoped>
.text-map-wrapper {
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  overflow: hidden;
}

.text-map-wrapper.mini {
  width: 200px;
  height: 200px;
}

.text-map-wrapper.full {
  width: 90vw;
  height: 90vh;
  max-width: 1200px;
  max-height: 800px;
}

.map-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: rgba(0, 0, 0, 0.5);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.map-title {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.expand-btn,
.close-btn {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.expand-btn:hover,
.close-btn:hover {
  color: rgba(255, 255, 255, 1);
}

.map-container {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.map-container.draggable {
  overflow: auto;
  cursor: grab;
}

.map-svg {
  display: block;
}

.mini .map-svg {
  width: 100%;
  height: 100%;
}

.full .map-svg {
  min-width: 100%;
  min-height: 100%;
}

.room-group {
  transition: transform 0.1s ease;
}

/* Room colors based on state */
.room-group rect {
  fill: #7f8c8d;
  stroke: #576574;
}

.room-group.visited rect {
  fill: #9b59b6;
  stroke: #8e44ad;
}

.room-group.current rect {
  fill: #2ecc71;
  stroke: #27ae60;
  filter: drop-shadow(0 0 8px #2ecc71);
}

.room-group.clickable {
  cursor: pointer;
}

.room-group.clickable:hover rect {
  filter: brightness(1.2);
}

/* Scrollbar styles for full map */
.map-container.draggable::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.map-container.draggable::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.3);
}

.map-container.draggable::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.map-container.draggable::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}
</style>
