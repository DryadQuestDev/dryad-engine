<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { Editor } from '../../editor';
import type { EditorCustomPopupProps } from '../../editor';
import type { AssetObject } from '../../../schemas/assetSchema';
import type { ScenePointObject } from '../../../schemas/scenePointSchema';
import { assetRevisionUrl } from '../../../shared/utils/assetRevision';
import Select from 'primevue/select';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Button from 'primevue/button';

const props = defineProps<EditorCustomPopupProps>();
const emit = defineEmits<{ 'update:item': [item: any] }>();
const editor = Editor.getInstance();

type Point = NonNullable<ScenePointObject['points']>[number];

const localItem = ref<ScenePointObject>(props.item);
const assets = ref<AssetObject[]>([]);
const selected = ref<number>(-1);

const canvasRef = ref<HTMLElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);
/** Bumped when the picture loads or the canvas resizes: handle positions are read off the layout. */
const layoutTick = ref(0);

const pictureOptions = computed(() => assets.value
  .filter((a) => a.file_image)
  .map((a) => ({ label: a.id, value: a.id })));
const referenceId = computed({
  get: () => localItem.value.reference_asset || '',
  set: (id: string) => { localItem.value = { ...localItem.value, reference_asset: id }; },
});
const imageSrc = computed(() => {
  const asset = assets.value.find((a) => a.id === referenceId.value);
  return asset?.file_image ? assetRevisionUrl(String(asset.file_image)) : '';
});
const points = computed<Point[]>(() => (localItem.value.points || []) as Point[]);

let resizeObserver: ResizeObserver | null = null;
onMounted(async () => {
  if (canvasRef.value && 'ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(() => { layoutTick.value++; });
    resizeObserver.observe(canvasRef.value);
  }
  try {
    assets.value = (await editor.loadFullData('assets')) || [];
  } catch (error) {
    console.error('Failed to load assets:', error);
  }
});

watch(() => props.item, (item) => { localItem.value = item; }, { deep: true });
watch(localItem, (item) => emit('update:item', item), { deep: true });

/**
 * The rendered picture inside the canvas (object-fit: contain letterboxes it), in the canvas's own CSS px.
 * Layout sizes, never getBoundingClientRect: the dialog opens with a scale transform, and a box measured
 * mid-animation would place every handle short of its point.
 */
function imageBounds(): { left: number; top: number; width: number; height: number } | null {
  void layoutTick.value;
  const img = imageRef.value;
  const canvas = canvasRef.value;
  if (!img || !canvas || !img.naturalWidth || !canvas.clientWidth || !canvas.clientHeight) return null;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const width = imgAspect > w / h ? w : h * imgAspect;
  const height = width / imgAspect;
  return { left: (w - width) / 2, top: (h - height) / 2, width, height };
}

function clientToPercent(clientX: number, clientY: number): { x: number; y: number } | null {
  const b = imageBounds();
  const canvas = canvasRef.value;
  if (!b || !canvas) return null;
  // Mouse coordinates are on screen, after any transform; bring them back into the canvas's CSS px.
  const rect = canvas.getBoundingClientRect();
  const scale = rect.width / canvas.offsetWidth || 1;
  const localX = (clientX - rect.left) / scale - canvas.clientLeft;
  const localY = (clientY - rect.top) / scale - canvas.clientTop;
  const x = ((localX - b.left) / b.width) * 100;
  const y = ((localY - b.top) / b.height) * 100;
  const clamp = (v: number) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
  return { x: clamp(x), y: clamp(y) };
}

function handleStyle(p: Point): Record<string, string> {
  const b = imageBounds();
  if (!b) return { display: 'none' };
  return { left: `${b.left + ((p.x ?? 0) / 100) * b.width}px`, top: `${b.top + ((p.y ?? 0) / 100) * b.height}px` };
}

function setPoints(list: Point[]) {
  localItem.value = { ...localItem.value, points: list as any };
}

function nextId(): string {
  const taken = new Set(points.value.map((p) => p.id));
  let n = points.value.length + 1;
  while (taken.has(`point_${n}`)) n++;
  return `point_${n}`;
}

function addPoint(event: MouseEvent) {
  const at = clientToPercent(event.clientX, event.clientY);
  if (!at) return;
  setPoints([...points.value, { uid: editor.createUid(), id: nextId(), x: at.x, y: at.y } as Point]);
  selected.value = points.value.length - 1;
}

function updatePoint(index: number, patch: Partial<Point>) {
  setPoints(points.value.map((p, i) => (i === index ? { ...p, ...patch } : p)));
}

function removePoint(index: number) {
  setPoints(points.value.filter((_, i) => i !== index));
  selected.value = -1;
}

let dragIndex = -1;
function startDrag(index: number, event: MouseEvent) {
  event.stopPropagation();
  selected.value = index;
  dragIndex = index;
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
}
function onDrag(event: MouseEvent) {
  if (dragIndex < 0) return;
  const at = clientToPercent(event.clientX, event.clientY);
  if (at) updatePoint(dragIndex, at);
}
function stopDrag() {
  dragIndex = -1;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
}
onBeforeUnmount(() => {
  stopDrag();
  resizeObserver?.disconnect();
});
</script>

<template>
  <div class="scene-point-editor">
    <div class="toolbar">
      <label>Reference picture</label>
      <Select v-model="referenceId" :options="pictureOptions" optionLabel="label" optionValue="value" filter
        placeholder="Pick a picture" class="picture-select" />
      <span class="hint">Click the picture to add a point, drag to move, right-click to remove.</span>
    </div>

    <div class="body">
      <div class="canvas" ref="canvasRef">
        <img v-if="imageSrc" ref="imageRef" :src="imageSrc" class="picture" draggable="false" @load="layoutTick++" />
        <div v-else class="empty">Pick the picture these points sit on.</div>
        <div v-if="imageSrc" class="click-layer" @click="addPoint"></div>
        <div v-for="(p, i) in points" :key="p.uid || i" class="handle" :class="{ selected: selected === i }"
          :style="handleStyle(p)" @mousedown="startDrag(i, $event)" @contextmenu.prevent="removePoint(i)">
          <span class="dot"></span>
          <span class="label">{{ p.id }}</span>
        </div>
      </div>

      <div class="list">
        <div v-for="(p, i) in points" :key="p.uid || i" class="row" :class="{ selected: selected === i }"
          @click="selected = i">
          <InputText :modelValue="p.id" @update:modelValue="(v) => updatePoint(i, { id: String(v || '') })"
            class="row-id" placeholder="id" />
          <span class="coords">{{ p.x }}, {{ p.y }}</span>
          <InputNumber :modelValue="p.zoom ?? null" @update:modelValue="(v) => updatePoint(i, { zoom: v ?? undefined })"
            :minFractionDigits="0" :maxFractionDigits="1" :step="0.1" placeholder="zoom" class="row-zoom" />
          <Button icon="pi pi-trash" severity="secondary" text size="small" @click.stop="removePoint(i)" />
        </div>
        <div v-if="!points.length" class="empty-list">No points yet.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.scene-point-editor {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem;
  height: 100vh;
  min-height: 0;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-shrink: 0;
}

.picture-select {
  width: 280px;
}

.hint {
  color: var(--editor-text-muted);
  font-size: 0.85rem;
}

.body {
  display: flex;
  gap: 0.75rem;
  flex: 1 1 0;
  min-height: 0;
}

.canvas {
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  background: linear-gradient(45deg, #1a1a1a 25%, #2a2a2a 25%, #2a2a2a 50%, #1a1a1a 50%, #1a1a1a 75%, #2a2a2a 75%, #2a2a2a);
  background-size: 20px 20px;
  border: 1px solid #666;
  border-radius: 4px;
  overflow: hidden;
}

.picture {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
}

.click-layer {
  position: absolute;
  inset: 0;
  cursor: crosshair;
}

.empty,
.empty-list {
  color: var(--editor-text-faint);
  font-style: italic;
  padding: 1rem;
}

/* The dot is centered on the point; the label hangs below it. */
.handle {
  position: absolute;
  width: 18px;
  height: 18px;
  transform: translate(-50%, -50%);
  cursor: grab;
  z-index: 5;
}

/* sits on game art, not editor chrome: fixed colors in both themes */
.dot {
  display: block;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.85);
  border: 2px solid #e0a32a;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
}

.label {
  position: absolute;
  top: calc(100% + 2px);
  left: 50%;
  transform: translateX(-50%);
  padding: 0 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
}

.handle.selected .dot {
  border-color: #3fb3ff;
  transform: scale(1.2);
}

.list {
  width: 340px;
  flex-shrink: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  border-radius: 4px;
}

.row.selected {
  background: var(--editor-surface-sunken);
}

.row-id {
  width: 120px;
}

.coords {
  width: 80px;
  font-family: monospace;
  font-size: 0.8rem;
  color: var(--editor-text-muted);
}

.row-zoom :deep(input) {
  width: 76px;
}
</style>
