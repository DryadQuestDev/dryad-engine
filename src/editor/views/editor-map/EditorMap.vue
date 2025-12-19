<script setup lang="ts">
import { ref, onMounted, onUnmounted, watchEffect, computed, nextTick, shallowRef, watch } from 'vue';
import { Editor } from '../../editor';
import { Global } from '../../../global/global';
import type { DungeonRoomObject } from '../../../schemas/dungeonRoomSchema';
import type { DungeonEncounterObject } from '../../../schemas/dungeonEncounterSchema';
import EncounterEditPopup from '../encounter-edit-popup/EncounterEditPopup.vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import { computePosition, flip, shift, offset } from '@floating-ui/vue';

const editor = Editor.getInstance();
const global = Global.getInstance();

// Fallback function for encounter images
const getEncounterImage = (encounter: DungeonEncounterObject) => {
  if (!encounter.image) return 'assets/engine_assets/encounters/ph.png';
  return encounter.image;
};

// --- Point Type ---
interface Point {
  x: number;
  y: number;
}
// --- End Point Type ---

// --- Interface for StateHandler ---
interface StateHandler {
  id: string;
  icon?: string;
  onMouseDown?: (event: MouseEvent, payload?: any) => void;
  onMouseUp?: (event: MouseEvent, payload?: any) => void;
  onMouseMove?: (event: MouseEvent, payload?: any) => void;
  onWheel?: (event: WheelEvent, payload?: any) => void;
  onMouseLeave?: (payload?: any) => void;
}
// --- End Interface ---

// --- Interface for Popup Configuration ---
interface PopupConfig {
  title: string;
  label: string;
  initialValue?: string;
  context?: any; // To store related data like coordinates
  position: { top: number, left: number };
  onConfirm: (value: string, context?: any) => { isValid: boolean, error?: string }; // Returns validation result
  onCancel?: () => void;
}
// --- End Interface ---

const mapContainer = ref<HTMLDivElement | null>(null);
const mapContent = ref<HTMLDivElement | null>(null);
const mouseX = ref(0);
const mouseY = ref(0);
const isPanning = ref(false); // For map panning
const startX = ref(0); // Note: original logic for this.startX in panning might need review
// const scrollLeft = ref(0); // Note: original logic for this.scrollLeft in panning

// Properties for room dragging
const draggedRoom = ref<DungeonRoomObject | null>(null);
const dragOffsetX = ref(0);
const dragOffsetY = ref(0);

// --- Encounter Drag State ---
const draggedEncounter = ref<DungeonEncounterObject | null>(null);
const encounterDragOffsetX = ref(0);
const encounterDragOffsetY = ref(0);
// --- End Encounter Drag State ---

// --- State for Room Connection ---
const selectedRoomForConnection = ref<{ room: DungeonRoomObject; modName: string } | null>(null);
// --- End State for Room Connection ---

// --- Generic Popup State ---
const isPopupVisible = ref(false);
const popupStyle = ref<{ [key: string]: string }>({});
const popupInputValue = ref('');
const popupError = ref<string | null>(null);
const popupConfig = ref<PopupConfig | null>(null); // Holds the current popup configuration
// --- End Generic Popup State ---

// --- Encounter Edit Popup State ---
const isEncounterPopupVisible = ref(false);
const selectedEncounterForEdit = ref<DungeonEncounterObject | null>(null);
// --- End Encounter Edit Popup State ---

// --- State for Polygon Editing ---
const selectedEncounterForPolygon = ref<DungeonEncounterObject | null>(null);
const polygonPoints = ref<Point[]>([]);
const draggingPointIndex = ref(-1); // Index of the point being dragged, -1 if none
const hoveredPointIndex = ref(-1); // Index of the point being hovered, -1 if none
const POINT_INTERACTION_THRESHOLD = 10; // Click/hover radius in screen pixels
// --- End State for Polygon Editing ---

// --- State for Fog Polygon Editing (Rooms) ---
const selectedRoomForFogPolygon = ref<DungeonRoomObject | null>(null);
const fogPolygonPoints = ref<Point[]>([]);
const fogDraggingPointIndex = ref(-1); // Index of the fog point being dragged
const fogHoveredPointIndex = ref(-1); // Index of the fog point being hovered
// --- End State for Fog Polygon Editing (Rooms) ---

// --- Tooltip State ---
const tooltipVisible = ref(false);
const tooltipContent = ref('');
const tooltipX = ref(0);
const tooltipY = ref(0);
const tooltipReference = ref<HTMLElement | SVGElement | null>(null);
const tooltipFloating = ref<HTMLElement | null>(null);
// --- End Tooltip State ---

let scrollListener: (() => void) | null = null;

const stateHandlers: StateHandler[] = [
  {
    id: 'map',
    onMouseDown: (event: MouseEvent) => {
      if (event.button === 1) { // Middle Mouse Button
        isPanning.value = true;
        draggedRoom.value = null;
        if (mapContainer.value) {
          // Start position logic for panning - original might be inaccurate with scrolling/zoom
          startX.value = event.pageX - mapContainer.value.offsetLeft;
          mapContainer.value.style.cursor = 'grabbing';
        }
        event.preventDefault();
      }
    },
    onMouseMove: (event: MouseEvent) => {
      if (!mapContainer.value || !mapContent.value) return;
      const rect = mapContainer.value.getBoundingClientRect();
      const currentZoom = editor.map.zoomFactor.value;

      const contentRect = mapContent.value.getBoundingClientRect();
      const mapContentMouseX = (event.clientX - contentRect.left) / currentZoom;
      const mapContentMouseY = (event.clientY - contentRect.top) / currentZoom;
      mouseX.value = Math.round(mapContentMouseX);
      mouseY.value = Math.round(mapContentMouseY);

      if (isPanning.value) {
        const walkX = event.movementX;
        const walkY = event.movementY;
        mapContainer.value.scrollLeft -= walkX;
        mapContainer.value.scrollTop -= walkY;
      }
    },
    onMouseUp: (event: MouseEvent) => {
      if (event.button === 1 && isPanning.value) {
        isPanning.value = false;
        if (mapContainer.value) {
          mapContainer.value.style.cursor = 'default';
        }
      }
    },
    onMouseLeave: () => {
      if (isPanning.value) {
        isPanning.value = false;
        if (mapContainer.value) {
          mapContainer.value.style.cursor = 'default';
        }
      }
    },
    onWheel: (event: WheelEvent) => {
      if (editor.map) {
        editor.map.handleZoom(event);
      }
    }
  },
  {
    id: 'rooms.drag',
    icon: 'pi-arrows-alt',
    onMouseDown: (event: MouseEvent, payload: { room: DungeonRoomObject, modName: string }) => {
      if (!payload || !editor.map) return;
      const { room, modName } = payload;
      if (modName !== editor.selectedMod) return;

      if (event.button === 0) { // Left mouse button
        event.stopPropagation();
        draggedRoom.value = room;
        isPanning.value = false;

        if (!mapContent.value) return;
        const contentElem = mapContent.value;
        const contentRect = contentElem.getBoundingClientRect();
        const currentZoom = editor.map.zoomFactor.value;
        const mouseXRelativeToContent = (event.clientX - contentRect.left) / currentZoom;
        const mouseYRelativeToContent = (event.clientY - contentRect.top) / currentZoom;

        dragOffsetX.value = mouseXRelativeToContent - (room.x ?? 0);
        dragOffsetY.value = mouseYRelativeToContent - (room.y ?? 0);
      }
    },
    onMouseMove: () => {
      if (isPanning.value) return;
      if (draggedRoom.value) {
        const newRoomX = mouseX.value - dragOffsetX.value;
        const newRoomY = mouseY.value - dragOffsetY.value;
        (draggedRoom.value as any).x = newRoomX;
        (draggedRoom.value as any).y = newRoomY;
      }
    },
    onMouseUp: (event: MouseEvent) => {
      if (event.button === 0 && draggedRoom.value) {
        const activeRooms = editor.activeObject.value;
        if (Array.isArray(activeRooms)) {
          const roomInArray = activeRooms.find(r => r.id === draggedRoom.value?.id);
          if (roomInArray) {
            roomInArray.x = draggedRoom.value.x;
            roomInArray.y = draggedRoom.value.y;
            //editor.notifyActiveObjectMutated()();
          } else {
            console.warn(`[MapComponent] Dragged room with ID ${draggedRoom.value.id} not found in activeObject.`);
          }
        } else {
          console.warn("[MapComponent] activeObject is not an array, cannot update room position.");
        }
        if (editor.map) {
          editor.map.buildDoors();
        }
        draggedRoom.value = null;
      }
    },
    onMouseLeave: () => {
      if (draggedRoom.value) {
        draggedRoom.value = null;
      }
    }
  },
  {
    id: 'rooms.add',
    icon: 'pi-plus',
    onMouseDown: (event: MouseEvent) => {
      if (event.button === 0 && editor.map) {
        event.stopPropagation();
        console.log("Adding new room");
        const clickCoords = { x: mouseX.value, y: mouseY.value };
        showPopup({
          title: 'Add New Room',
          label: 'Room ID:',
          context: { coords: clickCoords },
          position: { top: event.clientY + 5, left: event.clientX + 5 },
          onConfirm: (id, context) => {
            if (!id) return { isValid: false, error: "Room ID cannot be empty." };
            const validation = editor.validateItemId(id);
            if (!validation.isValid) return { isValid: false, error: validation.message || "Invalid Room ID." };

            const activeRooms = editor.activeObject.value;
            if (!Array.isArray(activeRooms)) return { isValid: false, error: "Cannot add room: Room list not selected." };

            const modRoomsData = editor.map?.editorObject?.rooms.find((mod: { mod: string, val: DungeonRoomObject[] }) => mod.mod === editor.selectedMod);
            if (modRoomsData && modRoomsData.val.some((room: DungeonRoomObject) => room.id === id)) {
              return { isValid: false, error: `Room ID "${id}" already exists in mod "${editor.selectedMod}".` };
            }
            if (activeRooms !== modRoomsData?.val) {
              console.warn("[MapComponent] Attempted to add room, but activeObject is not the selected mod's room array.");
              return { isValid: false, error: "Cannot add room: Incorrect object selected." };
            }

            const newRoom: DungeonRoomObject = {
              id: id,
              uid: editor.createUid(),
              x: context.coords.x - editor.map.room_size_halfed,
              y: context.coords.y - editor.map.room_size_halfed,
            };
            activeRooms.push(newRoom);
            //editor.notifyActiveObjectMutated()();
            if (editor.map) editor.map.buildDoors();
            return { isValid: true };
          },
        });
      }
    },
    onMouseMove: () => { },
    onMouseUp: () => { },
    onMouseLeave: () => { }
  },
  {
    id: 'rooms.connect',
    icon: 'pi-link',
    onMouseDown: (event: MouseEvent, payload?: { room: DungeonRoomObject; modName: string }) => {
      if (event.button !== 0 || !payload || !editor.map) { return; }
      const { room: clickedRoomProto, modName: clickedModName } = payload;
      if (clickedModName !== editor.selectedMod) { return; }
      event.stopPropagation();

      const activeRooms = editor.activeObject.value;
      if (!Array.isArray(activeRooms)) {
        console.error("Active object is not an array, cannot connect/disconnect rooms.");
        return;
      }

      if (event.shiftKey) { // Select/deselect first room for connection
        if (selectedRoomForConnection.value?.room.id === clickedRoomProto.id) {
          selectedRoomForConnection.value = null;
        } else {
          selectedRoomForConnection.value = { room: clickedRoomProto, modName: clickedModName };
        }
      } else if (event.altKey && selectedRoomForConnection.value) { // Alt-click to remove connection
        const firstRoomProto = selectedRoomForConnection.value.room;
        if (firstRoomProto.id === clickedRoomProto.id) {
          // Alt-clicking the same selected room does nothing for removal
          return;
        }

        const firstRoom = activeRooms.find(r => r.id === firstRoomProto.id);
        const clickedRoom = activeRooms.find(r => r.id === clickedRoomProto.id);

        if (!firstRoom || !clickedRoom) {
          console.error("Could not find one or both rooms for disconnection.");
          // Keep selectedRoomForConnection.value as is, so the user can continue
          return;
        }

        let changed = false;
        if (firstRoom.doors && firstRoom.doors.includes(clickedRoom.id)) {
          firstRoom.doors = firstRoom.doors.filter((doorId: string) => doorId !== clickedRoom.id);
          changed = true;
        }
        if (clickedRoom.doors && clickedRoom.doors.includes(firstRoom.id)) {
          clickedRoom.doors = clickedRoom.doors.filter((doorId: string) => doorId !== firstRoom.id);
          changed = true;
        }

        if (changed) {
          //editor.notifyActiveObjectMutated()();
          if (editor.map) editor.map.buildDoors();
          console.log(`Connection between ${firstRoom.id} and ${clickedRoom.id} removed.`);
        }
        // selectedRoomForConnection.value = null; // Deselect after operation -- REMOVED THIS LINE

      } else { // Normal click to create connection
        if (!selectedRoomForConnection.value) {
          console.warn("Click requires a room to be selected first (Shift+Click) or use Alt+Click to remove a connection.");
          return;
        }
        const firstRoomProto = selectedRoomForConnection.value.room;
        if (firstRoomProto.id === clickedRoomProto.id) {
          selectedRoomForConnection.value = null;
          console.log("Deselected room.");
          return;
        }
        const firstRoom = activeRooms.find(r => r.id === firstRoomProto.id);
        const clickedRoom = activeRooms.find(r => r.id === clickedRoomProto.id);

        if (!firstRoom || !clickedRoom) {
          console.error("Could not find one or both rooms for connection.");
          selectedRoomForConnection.value = null;
          return;
        }
        firstRoom.doors = firstRoom.doors || [];
        clickedRoom.doors = clickedRoom.doors || [];
        let changed = false;
        if (!firstRoom.doors.includes(clickedRoom.id)) {
          firstRoom.doors.push(clickedRoom.id);
          changed = true;
        }
        if (!clickedRoom.doors.includes(firstRoom.id)) {
          clickedRoom.doors.push(firstRoom.id);
          changed = true;
        }
        if (changed) {
          //editor.notifyActiveObjectMutated()();
          if (editor.map) editor.map.buildDoors();
        }
      }
    },
    onMouseMove: () => { },
    onMouseUp: () => { },
    onMouseLeave: () => { }
  },
  {
    id: 'rooms.delete',
    icon: 'pi-trash',
    onMouseDown: (event: MouseEvent, payload?: { room: DungeonRoomObject; modName: string }) => {
      if (event.button !== 0 || !payload || !editor.map) return;
      const { room: roomToDeleteProto, modName: deleteModName } = payload;
      if (deleteModName !== editor.selectedMod) return;
      event.stopPropagation();

      const activeRooms = editor.activeObject.value;
      if (!Array.isArray(activeRooms)) return;

      const modRoomsData = editor.map?.editorObject?.rooms.find((mod: { mod: string, val: DungeonRoomObject[] }) => mod.mod === editor.selectedMod);
      if (activeRooms !== modRoomsData?.val) {
        console.error("[MapComponent] Delete room: activeObject mismatch.");
        return;
      }
      const roomIndex = activeRooms.findIndex(r => r.id === roomToDeleteProto.id);
      if (roomIndex === -1) return;

      const deletedRoomId = activeRooms[roomIndex].id;
      activeRooms.splice(roomIndex, 1);
      let connectionsRemoved = false;
      activeRooms.forEach(room => {
        if (room.doors && room.doors.includes(deletedRoomId)) {
          room.doors = room.doors.filter((doorId: string) => doorId !== deletedRoomId);
          connectionsRemoved = true;
        }
      });
      //editor.notifyActiveObjectMutated()();
      if (editor.map && (connectionsRemoved || true)) editor.map.buildDoors();
    },
    onMouseMove: () => { },
    onMouseUp: () => { },
    onMouseLeave: () => { }
  },
  {
    id: 'encounters.drag',
    icon: 'pi-arrows-alt',
    onMouseDown: (event: MouseEvent, payload: { encounter: DungeonEncounterObject, modName: string }) => {
      if (!payload || !editor.map || !payload.encounter) return;
      const { encounter, modName } = payload;
      if (modName !== editor.selectedMod) return;

      if (event.button === 0) {
        event.stopPropagation();
        draggedEncounter.value = encounter;
        isPanning.value = false;

        if (!mapContent.value) return;
        const contentElem = mapContent.value;
        const contentRect = contentElem.getBoundingClientRect();
        const currentZoom = editor.map.zoomFactor.value;
        const mouseXRelativeToContent = (event.clientX - contentRect.left) / currentZoom;
        const mouseYRelativeToContent = (event.clientY - contentRect.top) / currentZoom;

        encounterDragOffsetX.value = mouseXRelativeToContent - (encounter.x ?? 0);
        encounterDragOffsetY.value = mouseYRelativeToContent - (encounter.y ?? 0);
      }
    },
    onMouseMove: () => {
      if (isPanning.value) return;
      if (draggedEncounter.value) {
        const newEncounterX = mouseX.value - encounterDragOffsetX.value;
        const newEncounterY = mouseY.value - encounterDragOffsetY.value;
        (draggedEncounter.value as any).x = newEncounterX;
        (draggedEncounter.value as any).y = newEncounterY;
      }
    },
    onMouseUp: (event: MouseEvent) => {
      if (event.button === 0 && draggedEncounter.value) {
        const activeEncounters = editor.activeObject.value;
        if (Array.isArray(activeEncounters)) {
          const encounterInArray = activeEncounters.find(e => e.id === draggedEncounter.value?.id);
          if (encounterInArray) {
            encounterInArray.x = draggedEncounter.value.x;
            encounterInArray.y = draggedEncounter.value.y;
            //editor.notifyActiveObjectMutated()();
          }
        }
        draggedEncounter.value = null;
      }
    },
    onMouseLeave: () => {
      if (draggedEncounter.value) {
        console.warn("[MapComponent] Mouse left while dragging encounter. Drag cancelled.");
        draggedEncounter.value = null;
      }
    }
  },
  {
    id: 'encounters.add',
    icon: 'pi-plus',
    onMouseDown: (event: MouseEvent) => {
      if (event.button === 0 && editor.map) {
        event.stopPropagation();
        const clickCoords = { x: mouseX.value, y: mouseY.value };
        showPopup({
          title: 'Add New Encounter',
          label: 'Encounter ID:',
          context: { coords: clickCoords },
          position: { top: event.clientY + 5, left: event.clientX + 5 },
          onConfirm: (id, context) => {
            if (!id) return { isValid: false, error: "Encounter ID cannot be empty." };
            const validation = editor.validateItemId(id);
            if (!validation.isValid) return { isValid: false, error: validation.message || "Invalid ID." };

            const activeEncounters = editor.activeObject.value;
            if (!Array.isArray(activeEncounters)) return { isValid: false, error: "Encounter list not selected." };

            const modEncData = editor.map?.editorObject?.encounters.find((mod: { mod: string, val: DungeonEncounterObject[] }) => mod.mod === editor.selectedMod);
            if (modEncData && modEncData.val.some((enc: DungeonEncounterObject) => enc.id === id)) {
              return { isValid: false, error: `ID "${id}" already exists.` };
            }
            if (activeEncounters !== modEncData?.val) return { isValid: false, error: "Incorrect object selected." };

            const newEncounter: DungeonEncounterObject = {
              id: id, uid: editor.createUid(), x: context.coords.x, y: context.coords.y,
            };
            activeEncounters.push(newEncounter);
            //editor.notifyActiveObjectMutated()();
            return { isValid: true };
          },
        });
      }
    },
    onMouseMove: () => { }, onMouseUp: () => { }, onMouseLeave: () => { }
  },
  {
    id: 'encounters.set_image',
    icon: 'pi-image',
    onMouseDown: (event: MouseEvent, payload?: { encounter: DungeonEncounterObject; modName: string }) => {
      if (event.button !== 0 || !payload || !editor.map) return;
      const { encounter: clickedEncounter, modName } = payload;
      if (modName !== editor.selectedMod) return;

      const activeEncounters = editor.activeObject.value;
      const modEncData = editor.map?.editorObject?.encounters.find((mod: { mod: string, val: DungeonEncounterObject[] }) => mod.mod === editor.selectedMod);
      if (!Array.isArray(activeEncounters) || activeEncounters !== modEncData?.val) return;
      event.stopPropagation();
      const encounterToEdit = activeEncounters.find(e => e.id === clickedEncounter.id);
      if (encounterToEdit) showEncounterEditPopup(encounterToEdit);
    },
    onMouseMove: () => { }, onMouseUp: () => { }, onMouseLeave: () => { }
  },
  {
    id: 'encounters.set_polygon',
    icon: 'pi-pencil',
    onMouseDown: (event: MouseEvent, payload?: { encounter: DungeonEncounterObject; modName: string }) => {
      if (event.button !== 0 || !editor.map) return;
      const currentZoom = editor.map.zoomFactor.value;
      const clickX = mouseX.value;
      const clickY = mouseY.value;
      const mapThreshold = POINT_INTERACTION_THRESHOLD / currentZoom;

      if (event.shiftKey && payload) {
        const { encounter: clickedProto, modName } = payload;
        if (modName !== editor.selectedMod) { deselectEncounterForPolygon(); return; }

        const activeEnc = editor.activeObject.value;
        const modEncData = editor.map?.editorObject?.encounters.find((mod: { mod: string, val: DungeonEncounterObject[] }) => mod.mod === editor.selectedMod);
        if (!Array.isArray(activeEnc) || activeEnc !== modEncData?.val) { deselectEncounterForPolygon(); return; }
        const encToSelect = activeEnc.find(e => e.id === clickedProto.id);
        if (!encToSelect) { deselectEncounterForPolygon(); return; }

        if (selectedEncounterForPolygon.value?.id === encToSelect.id) {
          deselectEncounterForPolygon();
        } else {
          selectedEncounterForPolygon.value = encToSelect;
          polygonPoints.value = parsePolygonString(encToSelect.polygon);
          draggingPointIndex.value = -1;
          hoveredPointIndex.value = -1;
        }
        event.stopPropagation(); return;
      }

      if (!selectedEncounterForPolygon.value) return;

      if (event.altKey) {
        const pointIdx = findNearestPoint(clickX, clickY, mapThreshold);
        if (pointIdx !== -1) {
          polygonPoints.value.splice(pointIdx, 1);
          updateSelectedEncounterPolygon();
        }
        return;
      }

      const pointToDrag = findNearestPoint(clickX, clickY, mapThreshold);
      if (event.ctrlKey || (!event.altKey && !event.shiftKey && pointToDrag !== -1)) { // Allow drag also with simple click on point
        if (pointToDrag !== -1) {
          draggingPointIndex.value = pointToDrag;
          return;
        }
      }


      if (!event.shiftKey && !event.altKey && !event.ctrlKey && pointToDrag === -1) {
        polygonPoints.value.push({ x: Math.round(clickX), y: Math.round(clickY) });
        updateSelectedEncounterPolygon();
      }
    },
    onMouseMove: () => {
      if (!selectedEncounterForPolygon.value || !editor.map) return;
      const currentZoom = editor.map.zoomFactor.value;
      const mapThreshold = POINT_INTERACTION_THRESHOLD / currentZoom;

      if (draggingPointIndex.value !== -1) {
        polygonPoints.value[draggingPointIndex.value] = { x: Math.round(mouseX.value), y: Math.round(mouseY.value) };
        updateSelectedEncounterPolygon();
      } else {
        const nearestIdx = findNearestPoint(mouseX.value, mouseY.value, mapThreshold);
        if (nearestIdx !== hoveredPointIndex.value) {
          hoveredPointIndex.value = nearestIdx;
        }
      }
    },
    onMouseUp: (event: MouseEvent) => {
      if (event.button !== 0 || !selectedEncounterForPolygon.value) return;
      if (draggingPointIndex.value !== -1) {
        draggingPointIndex.value = -1;
      }
    },
    onMouseLeave: () => {
      if (draggingPointIndex.value !== -1) draggingPointIndex.value = -1;
      if (hoveredPointIndex.value !== -1) hoveredPointIndex.value = -1;
    }
  },
  {
    id: 'rooms.fog_polygon',
    icon: 'pi-eye-slash',
    onMouseDown: (event: MouseEvent, payload?: { room: DungeonRoomObject; modName: string }) => {
      if (event.button !== 0 || !editor.map) return;
      const currentZoom = editor.map.zoomFactor.value;
      const clickX = mouseX.value;
      const clickY = mouseY.value;
      const mapThreshold = POINT_INTERACTION_THRESHOLD / currentZoom;

      if (event.shiftKey && payload) {
        const { room: clickedRoomProto, modName } = payload;
        if (modName !== editor.selectedMod) { deselectRoomForFogPolygon(); return; }

        const activeRooms = editor.activeObject.value;
        const modRoomsData = editor.map?.editorObject?.rooms.find((mod: { mod: string, val: DungeonRoomObject[] }) => mod.mod === editor.selectedMod);
        if (!Array.isArray(activeRooms) || activeRooms !== modRoomsData?.val) { deselectRoomForFogPolygon(); return; }
        const roomToSelect = activeRooms.find(r => r.id === clickedRoomProto.id);
        if (!roomToSelect) { deselectRoomForFogPolygon(); return; }

        if (selectedRoomForFogPolygon.value?.id === roomToSelect.id) {
          deselectRoomForFogPolygon();
        } else {
          selectedRoomForFogPolygon.value = roomToSelect;
          fogPolygonPoints.value = parsePolygonString(roomToSelect.fog?.shape === 'polygon' ? roomToSelect.fog.points : undefined);
          fogDraggingPointIndex.value = -1;
          fogHoveredPointIndex.value = -1;
        }
        event.stopPropagation(); return;
      }

      if (!selectedRoomForFogPolygon.value) return;

      if (event.altKey) {
        const pointIndexToDelete = findNearestFogPoint(clickX, clickY, mapThreshold);
        if (pointIndexToDelete !== -1) {
          event.stopPropagation();
          fogPolygonPoints.value.splice(pointIndexToDelete, 1);
          updateSelectedRoomFogPolygon();
        }
        return;
      }

      const pointToDrag = findNearestFogPoint(clickX, clickY, mapThreshold);
      if (event.ctrlKey || (!event.altKey && !event.shiftKey && pointToDrag !== -1)) { // Allow drag also with simple click on point
        if (pointToDrag !== -1) {
          event.stopPropagation();
          fogDraggingPointIndex.value = pointToDrag;
          return;
        }
      }

      if (!event.shiftKey && !event.altKey && !event.ctrlKey && pointToDrag === -1) {
        const nearbyPointIndex = findNearestFogPoint(clickX, clickY, mapThreshold);
        if (nearbyPointIndex === -1) {
          event.stopPropagation();
          fogPolygonPoints.value.push({ x: Math.round(clickX), y: Math.round(clickY) });
          updateSelectedRoomFogPolygon();
        } else {
          event.stopPropagation(); // Prevent map pan if clicking near point
        }
      }
    },
    onMouseMove: () => {
      if (!selectedRoomForFogPolygon.value || !editor.map) return;
      const currentZoom = editor.map.zoomFactor.value;
      const mapThreshold = POINT_INTERACTION_THRESHOLD / currentZoom;

      if (fogDraggingPointIndex.value !== -1) {
        fogPolygonPoints.value[fogDraggingPointIndex.value] = { x: Math.round(mouseX.value), y: Math.round(mouseY.value) };
        updateSelectedRoomFogPolygon();
      } else {
        const nearestPointIndex = findNearestFogPoint(mouseX.value, mouseY.value, mapThreshold);
        if (nearestPointIndex !== fogHoveredPointIndex.value) {
          fogHoveredPointIndex.value = nearestPointIndex;
        }
      }
    },
    onMouseUp: (event: MouseEvent) => {
      if (event.button !== 0 || !selectedRoomForFogPolygon.value) return;
      if (fogDraggingPointIndex.value !== -1) {
        fogDraggingPointIndex.value = -1;
      }
    },
    onMouseLeave: () => {
      if (fogDraggingPointIndex.value !== -1) fogDraggingPointIndex.value = -1;
      if (fogHoveredPointIndex.value !== -1) fogHoveredPointIndex.value = -1;
    }
  },
  {
    id: 'encounters.delete',
    icon: 'pi-trash',
    onMouseDown: (event: MouseEvent, payload?: { encounter: DungeonEncounterObject; modName: string }) => {
      if (event.button !== 0 || !payload || !editor.map) return;
      const { encounter: encounterToDeleteProto, modName: deleteModName } = payload;
      if (deleteModName !== editor.selectedMod) return;
      event.stopPropagation();

      const activeEncounters = editor.activeObject.value;
      if (!Array.isArray(activeEncounters)) return;

      const modEncData = editor.map?.editorObject?.encounters.find((mod: { mod: string, val: DungeonEncounterObject[] }) => mod.mod === editor.selectedMod);
      if (activeEncounters !== modEncData?.val) return;

      const encounterIndex = activeEncounters.findIndex(e => e.id === encounterToDeleteProto.id);
      if (encounterIndex === -1) return;

      activeEncounters.splice(encounterIndex, 1);
      //editor.notifyActiveObjectMutated()();
    },
    onMouseMove: () => { }, onMouseUp: () => { }, onMouseLeave: () => { }
  }
];

const mapHandler = stateHandlers.find(h => h.id === 'map')!;
const activeHandler = ref<StateHandler | undefined>();


const setActiveHandlerVue = () => { // Renamed from setActiveHandler to avoid conflict if imported
  // console.log("[activeHandler]Setting...");
  const newActiveStateId = editor.map.activeState.value;

  if (activeHandler.value?.id === 'rooms.connect' && newActiveStateId !== 'rooms.connect') {
    selectedRoomForConnection.value = null;
  }
  if (activeHandler.value?.id === 'encounters.set_polygon' && newActiveStateId !== 'encounters.set_polygon') {
    deselectEncounterForPolygon();
  }
  if (activeHandler.value?.id === 'rooms.fog_polygon' && newActiveStateId !== 'rooms.fog_polygon') {
    deselectRoomForFogPolygon();
  }

  const statesThatShowGenericPopup = ['rooms.add', 'encounters.add'];
  if (isPopupVisible.value && !statesThatShowGenericPopup.includes(newActiveStateId)) {
    hidePopup();
  }
  activeHandler.value = stateHandlers.find(h => h.id === newActiveStateId);
};

watchEffect(() => {
  setActiveHandlerVue();
  // editor.mapRef was ChangeDetectorRef, not needed directly in Vue in most cases.
  // If editor needs to trigger updates, it should use Vue's reactivity system.
});


onMounted(() => {
  // Initial map setup can be triggered here if editor.map.init() is called from elsewhere
  // and eventually sets editor.map.isLoaded.value = true
  // The DOM-dependent part will be handled by the watch below.
});

watch([() => editor.map?.isLoaded.value, mapContainer], ([isLoaded, containerEl], [oldIsLoaded, oldContainerEl]) => {
  if (isLoaded && containerEl) {
    // Ensure this setup runs only once when conditions are met
    if (scrollListener) {
      // Potentially remove old listener if map re-initializes, though unmounted should handle final cleanup
      containerEl.removeEventListener('scroll', scrollListener);
    }

    const container = containerEl;
    // Initial sync if needed, though init() in EditorMap might do this already
    if (editor.map) {
      // editor.map.scrollX = container.scrollLeft; // This was for initial save, not restore
      // editor.map.scrollY = container.scrollTop;

      // Restore scroll position
      // Use nextTick to ensure the browser has had a chance to apply dimensions and make scrolling possible
      nextTick(() => {
        if (editor.map) { // Double check editor.map still exists
          container.scrollLeft = editor.map.scrollX;
          container.scrollTop = editor.map.scrollY;
          console.log(`[MapComponent] Restored scroll to X: ${editor.map.scrollX}, Y: ${editor.map.scrollY}`);
        }
      });
    }

    scrollListener = () => {
      if (editor.map) {
        // Condition from original code, kept for consistency
        if (container.scrollLeft === 0 && container.scrollTop === 0 && (editor.map.scrollX !== 0 || editor.map.scrollY !== 0)) {
          // This might be specific logic for your application
        }
        editor.map.scrollX = container.scrollLeft;
        editor.map.scrollY = container.scrollTop;
      }
    };
    container.addEventListener('scroll', scrollListener);
    console.log("[MapComponent] Map container and scroll listener initialized after map loaded.");
  } else if (!isLoaded && scrollListener && containerEl) {
    // If map becomes unloaded, clean up listener from the current container if it exists
    containerEl.removeEventListener('scroll', scrollListener);
    scrollListener = null;
    console.log("[MapComponent] Scroll listener removed as map is no longer loaded.");
  }
}, { immediate: false }); // immediate: false, we want to wait for isLoaded to become true


onUnmounted(() => {
  if (mapContainer.value && scrollListener) {
    mapContainer.value.removeEventListener('scroll', scrollListener);
    scrollListener = null; // Clear the reference
    console.log("[MapComponent] Scroll listener cleaned up on unmount.");
  }
});

function onMouseMoveHandler(event: MouseEvent, payload?: any) {
  if (!mapContent.value || !mapContainer.value) return;
  mapHandler.onMouseMove?.(event, payload);
  if (activeHandler.value && activeHandler.value.onMouseMove) {
    activeHandler.value.onMouseMove(event, payload);
  }
}

function onMouseDownHandler(event: MouseEvent, payload?: any) {
  if (!mapContent.value || !mapContainer.value) return;

  if (isPopupVisible.value) {
    const popupElement = document.getElementById('generic-popup');
    if (popupElement && !popupElement.contains(event.target as Node)) {
      hidePopup();
    } else if (popupElement && popupElement.contains(event.target as Node)) {
      return; // Click inside popup
    }
  }

  mapHandler.onMouseDown?.(event, payload);
  activeHandler.value?.onMouseDown?.(event, payload);
}

function onMouseUpHandler(event: MouseEvent, payload?: any) {
  if (!mapContent.value || !mapContainer.value) return;
  mapHandler.onMouseUp?.(event);
  activeHandler.value?.onMouseUp?.(event, payload);
}

function onMouseLeaveHandler(payload?: any) {
  if (!mapContent.value || !mapContainer.value) return;
  mapHandler.onMouseLeave?.();
  activeHandler.value?.onMouseLeave?.(payload);
}

function onWheelHandler(event: WheelEvent, payload?: any) {
  event.preventDefault();
  if (!mapContent.value || !mapContainer.value) return;
  mapHandler.onWheel?.(event);
  activeHandler.value?.onWheel?.(event, payload);
}

// --- Generic Popup Methods ---
function showPopup(config: PopupConfig) {
  popupConfig.value = config;
  popupInputValue.value = config.initialValue || '';
  popupError.value = null;

  const estimatedPopupWidth = 220;
  const estimatedPopupHeight = 160;
  const margin = 10;
  let finalPopupLeft = config.position.left;
  let finalPopupTop = config.position.top;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  if (finalPopupLeft + estimatedPopupWidth + margin > windowWidth) {
    finalPopupLeft = windowWidth - estimatedPopupWidth - margin;
  }
  if (finalPopupLeft < margin) finalPopupLeft = margin;
  if (finalPopupTop + estimatedPopupHeight + margin > windowHeight) {
    finalPopupTop = windowHeight - estimatedPopupHeight - margin;
  }
  if (finalPopupTop < margin) finalPopupTop = margin;

  popupStyle.value = {
    position: 'fixed',
    top: `${finalPopupTop}px`,
    left: `${finalPopupLeft}px`,
  };
  isPopupVisible.value = true;
  // nextTick might be needed if focusing input, etc.
}

function hidePopup() {
  if (popupConfig.value?.onCancel) {
    popupConfig.value.onCancel();
  }
  isPopupVisible.value = false;
  popupConfig.value = null;
  popupInputValue.value = '';
  popupError.value = null;
  popupStyle.value = {};
}

function confirmPopupAction() {
  if (!popupConfig.value) return;
  const result = popupConfig.value.onConfirm(popupInputValue.value, popupConfig.value.context);
  if (result.isValid) {
    hidePopup();
  } else {
    popupError.value = result.error || "An unknown error occurred.";
  }
}
// --- End Generic Popup Methods ---

function isRoomSelectedForConnection(room: DungeonRoomObject): boolean {
  return selectedRoomForConnection.value?.room.id === room.id;
}

// --- Encounter Edit Popup Methods ---
function showEncounterEditPopup(encounter: DungeonEncounterObject): void {
  selectedEncounterForEdit.value = encounter;
  isEncounterPopupVisible.value = true;
}

function hideEncounterEditPopup(): void {
  isEncounterPopupVisible.value = false;
  selectedEncounterForEdit.value = null;
}

function handleEncounterSave(updatedEncounter: DungeonEncounterObject): void {
  const activeEncounters = editor.activeObject.value;
  if (!Array.isArray(activeEncounters)) {
    console.error("[MapComponent] Cannot save encounter: activeObject is not an array.");
    hideEncounterEditPopup();
    return;
  }
  const modEncountersData = editor.map?.editorObject?.encounters.find((mod: { mod: string, val: DungeonEncounterObject[] }) => mod.mod === editor.selectedMod);
  if (activeEncounters !== modEncountersData?.val) {
    console.error("[MapComponent] Cannot save encounter: activeObject is not the selected mod's encounter array.");
    hideEncounterEditPopup();
    return;
  }
  const index = activeEncounters.findIndex(e => e.id === updatedEncounter.id);
  if (index === -1) {
    console.error(`[MapComponent] Cannot save: Encounter with ID ${updatedEncounter.id} not found.`);
    hideEncounterEditPopup();
    return;
  }
  activeEncounters[index] = updatedEncounter;
  //editor.notifyActiveObjectMutated()();
  hideEncounterEditPopup();
}
// --- End Encounter Edit Popup Methods ---

function parsePolygonString(polygonString: string | undefined): Point[] {
  if (!polygonString) return [];
  const points = polygonString.trim().split(/\s+/);
  return points.map(p => {
    const [x, y] = p.split(',').map(Number);
    return { x, y };
  }).filter(p => !isNaN(p.x) && !isNaN(p.y));
}

function stringifyPolygonPoints(points: Point[]): string {
  return points.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
}

function findNearestPoint(targetX: number, targetY: number, threshold: number): number {
  let nearestIndex = -1;
  let minDistSq = threshold * threshold;
  polygonPoints.value.forEach((point, index) => {
    const dx = targetX - point.x;
    const dy = targetY - point.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < minDistSq) {
      minDistSq = distSq;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function updateSelectedEncounterPolygon() {
  if (selectedEncounterForPolygon.value) {
    const newPolygonString = stringifyPolygonPoints(polygonPoints.value);
    const activeEncounters = editor.activeObject.value;
    if (Array.isArray(activeEncounters)) {
      const encounterInArray = activeEncounters.find(e => e.id === selectedEncounterForPolygon.value!.id);
      if (encounterInArray) {
        encounterInArray.polygon = newPolygonString;
        //editor.notifyActiveObjectMutated()();
      } else {
        deselectEncounterForPolygon();
      }
    } else {
      deselectEncounterForPolygon();
    }
  }
}

function deselectEncounterForPolygon() {
  selectedEncounterForPolygon.value = null;
  polygonPoints.value = [];
  draggingPointIndex.value = -1;
  hoveredPointIndex.value = -1;
}

function findNearestFogPoint(targetX: number, targetY: number, threshold: number): number {
  let nearestIndex = -1;
  let minDistSq = threshold * threshold;
  fogPolygonPoints.value.forEach((point, index) => {
    const dx = targetX - point.x;
    const dy = targetY - point.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < minDistSq) {
      minDistSq = distSq;
      nearestIndex = index;
    }
  });
  return nearestIndex;
}

function updateSelectedRoomFogPolygon() {
  if (selectedRoomForFogPolygon.value) {
    const newPolygonString = stringifyPolygonPoints(fogPolygonPoints.value);
    const activeRooms = editor.activeObject.value;
    if (Array.isArray(activeRooms)) {
      const roomInArray = activeRooms.find(r => r.id === selectedRoomForFogPolygon.value!.id);
      if (roomInArray) {
        if (!roomInArray.fog) {
          roomInArray.fog = { shape: 'polygon', points: '' };
        } else if (roomInArray.fog.shape !== 'polygon') {
          roomInArray.fog = { shape: 'polygon', points: '' };
        }
        roomInArray.fog.points = newPolygonString;
        //editor.notifyActiveObjectMutated()();
      } else {
        deselectRoomForFogPolygon();
      }
    } else {
      deselectRoomForFogPolygon();
    }
  }
}

function deselectRoomForFogPolygon() {
  selectedRoomForFogPolygon.value = null;
  fogPolygonPoints.value = [];
  fogDraggingPointIndex.value = -1;
  fogHoveredPointIndex.value = -1;
}

// For template number formatting.
const formatNumber = (num: number | undefined, digits: number = 0) => {
  if (num === undefined) return '';
  return num.toFixed(digits);
};

// --- Tooltip Helper Functions ---
const showTooltip = async (event: MouseEvent, content: string) => {
  if (draggedEncounter.value) return;

  const target = event.currentTarget as HTMLElement | SVGElement;
  tooltipReference.value = target;
  tooltipContent.value = content;
  tooltipVisible.value = true;

  await nextTick();

  if (!tooltipFloating.value || !tooltipReference.value) return;

  const { x, y } = await computePosition(tooltipReference.value, tooltipFloating.value, {
    placement: 'top',
    middleware: [offset(8), flip(), shift({ padding: 5 })]
  });

  tooltipX.value = x;
  tooltipY.value = y;
};

const hideTooltip = () => {
  tooltipVisible.value = false;
  tooltipContent.value = '';
  tooltipReference.value = null;
};
// --- End Tooltip Helper Functions ---



</script>

<template>
  <div class="empty-map" v-if="!editor.map.isLoaded.value && !editor.map.loadFailed.value">
    <p>Loading map...</p>
  </div>

  <div v-else-if="editor.map.loadFailed.value" class="error-message">
    <p>Map is not set up. Make sure to set dungeon type and the map's image in Config.</p>
  </div>

  <div v-else class="editor-content">
    <div class="coordinates">
      <span>X: {{ mouseX }}</span> <span> Y: {{ mouseY }}</span>
    </div>

    <!-- Generic Input Popup -->
    <div v-if="isPopupVisible && popupConfig" id="generic-popup" class="generic-popup" :style="popupStyle"
      @mousedown.stop @mouseup.stop @mousemove.stop>
      <h5>{{ popupConfig.title }}</h5>
      <div class="p-field">
        <!-- Assuming pInputText is globally registered or import InputText from 'primevue/inputtext' -->
        <label :for="'popupInput'">{{ popupConfig.label }}</label>
        <!-- @vue-ignore -->
        <InputText inputId="popupInput" type="text" v-model="popupInputValue" @keydown.enter="confirmPopupAction" />
      </div>
      <div v-if="popupError" class="p-error">
        {{ popupError }}
      </div>
      <div class="popup-buttons">
        <!-- Assuming Button is globally registered or import Button from 'primevue/button' -->
        <Button type="button" label="Confirm" icon="pi pi-check" @click="confirmPopupAction" class="p-button-sm" />
        <Button type="button" label="Cancel" icon="pi pi-times" @click="hidePopup"
          class="p-button-sm p-button-secondary" />
      </div>
    </div>
    <!-- End Generic Input Popup -->

    <div ref="mapContainer" class="editor-map-container" @mousemove="onMouseMoveHandler($event)"
      @mousedown="onMouseDownHandler($event)" @mouseup="onMouseUpHandler($event)" @mouseleave="onMouseLeaveHandler()"
      @wheel="onWheelHandler($event)" :class="{ panning: isPanning }">

      <div v-if="editor?.map?.editorObject?.config" class="map-wrapper" :style="{
        transform: 'scale(' + editor.map.zoomFactor.value + ')',
        width: editor.map.width + 'px',
        height: editor.map.height + 'px',
        padding: editor.map.padding + 'px',
        '--map-padding': editor.map.padding,
        willChange: 'transform'
      }">
        <div ref="mapContent" class="map">

          <!-- map image -->
          <img v-if="editor.map.editorObject.config?.dungeon_type !== 'text'" class="map-image" draggable="false"
            :src="editor.map.editorObject.config?.image"
            :style="{ transform: 'scale(' + (editor.map.editorObject.config?.image_scaling ?? 1) + ')' }" />

          <!-- encounters -->
          <template v-for="modEncounters in editor.map.editorObject?.encounters" :key="modEncounters.mod">
            <template v-for="encounter in modEncounters.val" :key="encounter.id">
              <!-- Outer wrapper for positioning and scaling -->
              <!-- @vue-ignore -->
              <div v-if="!encounter.polygon" class="encounter-wrapper"
                :class="{ 'active': modEncounters.mod === editor.selectedMod, 'selected': selectedEncounterForPolygon?.id === encounter.id && editor.map.activeState.value === 'encounters.set_polygon' }"
                :style="{
                  left: encounter.x + 'px',
                  top: encounter.y + 'px',
                  transform: 'scale(' + (encounter.scale ?? 1) + ')',
                  zIndex: encounter.z
                }" @mouseenter="showTooltip($event, encounter.id)" @mouseleave="hideTooltip()"
                @mousedown="onMouseDownHandler($event, { encounter: encounter, modName: modEncounters.mod })">
                <!-- Inner image for rotation -->
                <img draggable="false" v-if="!encounter.polygon" :id="'map_' + encounter.id" class="encounter"
                  :style="{ transform: 'rotate(' + (encounter.rotation ?? 0) + 'deg)' }"
                  :src="getEncounterImage(encounter)" />
              </div>
              <svg v-if="encounter.polygon" :width="editor.map.width" :height="editor.map.height" class="svg_contour"
                :style="{ zIndex: encounter.z }">
                <g :transform="`translate(${editor.map.padding}, ${editor.map.padding})`">
                  <!-- @vue-ignore -->
                  <polygon :class="{
                    'active': modEncounters.mod === editor.selectedMod,
                    'selected': selectedEncounterForPolygon?.id === encounter.id && editor.map.activeState.value === 'encounters.set_polygon'
                  }" @mouseenter="showTooltip($event, encounter.id)" @mouseleave="hideTooltip()"
                    @mousedown="onMouseDownHandler($event, { encounter: encounter, modName: modEncounters.mod })"
                    :id="'map_' + encounter.id" class="poly_encounter" fill="none" stroke-width="1"
                    :points="encounter.polygon" />

                  <!-- Polygon Editing Points -->
                  <g
                    v-if="selectedEncounterForPolygon?.id === encounter.id && editor.map.activeState.value === 'encounters.set_polygon'">
                    <circle v-for="(point, i) in polygonPoints" :key="i" :cx="point.x" :cy="point.y"
                      :r="POINT_INTERACTION_THRESHOLD / editor.map.zoomFactor.value / 2" class="polygon-point"
                      :class="{ hover: i === hoveredPointIndex, dragging: i === draggingPointIndex }">
                      <title>{{ `Point ${i}: (${formatNumber(point.x)}, ${formatNumber(point.y)})` }}</title>
                    </circle>
                    <polyline v-if="polygonPoints.length > 1" :points="stringifyPolygonPoints(polygonPoints)"
                      class="polygon-edit-lines" fill="none" stroke-dasharray="3,3" />
                  </g>
                </g>
              </svg>
            </template>
          </template>

          <!-- svg for rooms and doors -->
          <svg class="map-svg" :width="editor.map.width" :height="editor.map.height">
            <!-- Fog Masks - must be defined before being used -->
            <template v-if="editor.map.isFogVisible.value || editor.map.activeState.value === 'rooms.fog_polygon'">
              <defs>
                <mask id="mask1" x="0" y="0" :width="editor.map.widthBackground" :height="editor.map.heightBackground"
                  maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
                  <rect fill="#fff" x="0" y="0" width="100%" height="100%" />
                  <template v-for="(modRooms, i) in editor.map.editorObject.rooms" :key="modRooms.mod + '-' + i">
                    <template v-for="room in modRooms.val" :key="room.id">
                      <template v-if="!selectedRoomForFogPolygon || selectedRoomForFogPolygon?.id === room.id">
                        <!-- default fog masks -->
                        <template v-if="editor.map.editorObject.config?.fog_default && !room.fog">
                          <circle fill="#000000" :cx="(room.x ?? 0) + editor.map.room_size_halfed"
                            :cy="(room.y ?? 0) + editor.map.room_size_halfed"
                            :r="editor.map.editorObject.config?.fog_default" />
                        </template>
                        <template v-if="room.fog">
                          <circle v-if="room.fog.shape === 'circle'" fill="#000000"
                            :cx="room.fog.center_x ?? ((room.x ?? 0) + editor.map.room_size_halfed)"
                            :cy="room.fog.center_y ?? ((room.y ?? 0) + editor.map.room_size_halfed)"
                            :r="room.fog.radius" />
                          <polygon v-else-if="room.fog.shape === 'polygon'" fill="#000000" :points="room.fog.points" />
                          <!-- <path v-else-if="room.fog.shape === 'sector'" fill="#000000" stroke="none" fill-rule="evenodd" :d="n.getArc()" /> -->
                        </template>
                      </template>
                    </template>
                  </template>
                </mask>
              </defs>
            </template>

            <g :transform="`translate(${editor.map.padding}, ${editor.map.padding})`">
              <template v-for="modRooms in editor.map.editorObject.rooms" :key="modRooms.mod">
                <g v-for="room in modRooms.val" :key="room.id">
                  <rect :x="room.x ?? 0" :y="room.y ?? 0" :width="editor.map.room_size" :height="editor.map.room_size"
                    class="room-rect" :class="{
                      'active': modRooms.mod === editor.selectedMod,
                      'selected-for-connection': isRoomSelectedForConnection(room),
                      'selected-for-fog': selectedRoomForFogPolygon?.id === room.id && editor.map.activeState.value === 'rooms.fog_polygon'
                    }" @mousedown="onMouseDownHandler($event, { room: room, modName: modRooms.mod })" />
                  <text class="room-id-text" :x="(room.x ?? 0) + editor.map.room_size_halfed"
                    :y="(room.y ?? 0) + editor.map.room_size_halfed">
                    {{ room.id }}
                  </text>
                </g>
              </template>

              <!-- Draw Door Connections -->
              <template v-for="modDoors in editor.map.editorObject.doors" :key="modDoors.mod">
                <g class="door-connections">
                  <line v-for="(door, index) in modDoors.val" :key="index" class="door" :x1="door.x1" :y1="door.y1"
                    :x2="door.x2" :y2="door.y2" :class="{ 'active': modDoors.mod === editor.selectedMod }"
                    stroke-width="2" />
                </g>
              </template>

              <!-- Fog Polygon Editing Points -->
              <g v-if="selectedRoomForFogPolygon && editor.map.activeState.value === 'rooms.fog_polygon'"
                class="fog-polygon-editor">
                <circle v-for="(point, i) in fogPolygonPoints" :key="i" :cx="point.x" :cy="point.y"
                  :r="POINT_INTERACTION_THRESHOLD / editor.map.zoomFactor.value / 2" class="fog-polygon-point"
                  :class="{ hover: i === fogHoveredPointIndex, dragging: i === fogDraggingPointIndex }">
                  <title>{{ `Point ${i}: (${formatNumber(point.x)}, ${formatNumber(point.y)})` }}</title>
                </circle>
                <polyline v-if="fogPolygonPoints.length > 1" :points="stringifyPolygonPoints(fogPolygonPoints)"
                  class="fog-polygon-edit-lines" fill="none" stroke-dasharray="3,3" />
              </g>
            </g>

            <!-- Fog Layer Rectangle - outside transform -->
            <g v-if="editor.map.isFogVisible.value || editor.map.activeState.value === 'rooms.fog_polygon'"
              :transform="`translate(${editor.map.padding}, ${editor.map.padding})`" style="pointer-events: none;">
              <rect ref="fog1" id="fog1" class="fog_layer" mask="url(#mask1)" fill="grey" width="100%" height="100%"
                fill-opacity="0.7" style="pointer-events: none;" />
            </g>
          </svg>

          <!-- screen area-->
          <div v-if="editor.map.editorObject.config?.dungeon_type === 'screen'" class="screen-area" :style="{
            width: editor.map.screen_width + 'px',
            left: editor.map.indent / 2 + 'px',
            top: editor.map.indentYvalue + 'px',
          }">
          </div>


        </div>
      </div>
    </div>
  </div>

  <!-- Encounter Edit Popup -->
  <EncounterEditPopup v-if="isEncounterPopupVisible && selectedEncounterForEdit" :encounter="selectedEncounterForEdit!"
    :isVisible="isEncounterPopupVisible" @save="handleEncounterSave" @close="hideEncounterEditPopup" />

  <!-- Floating Tooltip -->
  <div v-if="tooltipVisible" ref="tooltipFloating" class="floating-tooltip" :style="{
    position: 'fixed',
    top: `${tooltipY}px`,
    left: `${tooltipX}px`,
    zIndex: 9999
  }">
    {{ tooltipContent }}
  </div>
</template>

<style scoped src="./editor-map.component.css"></style>
