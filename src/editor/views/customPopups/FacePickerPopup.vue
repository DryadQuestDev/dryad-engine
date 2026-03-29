<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { Editor } from '../../editor';
import type { EditorCustomPopupProps } from '../../editor';
import { loadCharacterImages } from '../../../shared/utils/characterImageLoader';
import { SpinePlayer } from '@esotericsoftware/spine-player';
import '@esotericsoftware/spine-player/dist/spine-player.css';
import Slider from 'primevue/slider';
import Select from 'primevue/select';

const props = defineProps<EditorCustomPopupProps>();
const emit = defineEmits<{ 'update:item': [item: any] }>();

const editor = Editor.getInstance();

// Local copy for editing (deep clone to avoid reactivity loops)
const localItem = ref(JSON.parse(JSON.stringify(props.item)));

// Core item reference (from parent)
const coreItem = ref(props.coreItem);

// Flag to prevent re-initialization loops
const isInitialized = ref(false);

// Configuration for face picker
const RECT_SIZE = 100; // 100x100px on actual image

// State
const containerRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const dragStartX = ref(0);
const dragStartY = ref(0);
const isArtDragging = ref(false);
const artDragStartX = ref(0);
const artDragStartY = ref(0);

// Image dimensions
const actualImageWidth = ref(0);
const actualImageHeight = ref(0);
const renderedImageHeight = ref(0);

// Loaded skin layers
const skinLayersData = ref<Record<string, any>[]>([]);

// View selector
const DEFAULT_VIEW = '__default__';
const selectedView = ref(DEFAULT_VIEW);
const characterViews = ref<{ id: string; name: string }[]>([]);
const viewOptions = computed(() => [
  { id: DEFAULT_VIEW, name: 'Default' },
  ...characterViews.value.map(v => ({ id: v.id, name: v.name || v.id }))
]);
const isDefaultView = computed(() => selectedView.value === DEFAULT_VIEW);

// Local position state (percentage 0-100)
const localX = ref(50);
const localY = ref(50);
const localScale = ref(1);

const localArtDx = ref(0);
const localArtDy = ref(0);
const localArtScale = ref(1);

// Effective preview height: use rendered image height for static, spine container height for spine
const effectivePreviewHeight = computed(() => {
  if (renderedImageHeight.value > 0) return renderedImageHeight.value;
  if (spineContainerRef.value) return spineContainerRef.value.offsetHeight;
  return 0;
});

// Margin left scaled to preview height (game has 120px padding at ~1000px image height)
const dollMarginLeft = computed(() => {
  if (effectivePreviewHeight.value === 0) return '0px';
  return (effectivePreviewHeight.value * 0.12) + 'px';
});

// Character-sheet start position (game: 120px padding + 50vh doll wrapper ≈ 62% of image height)
const sheetStartLeft = computed(() => {
  if (effectivePreviewHeight.value === 0) return '0px';
  return (effectivePreviewHeight.value * 0.7) + 'px';
});

// Compute the scale factor between actual and rendered image
const imageScaleFactor = computed(() => {
  if (actualImageHeight.value === 0 || renderedImageHeight.value === 0) return 1;
  return renderedImageHeight.value / actualImageHeight.value;
});

// Compute the scaled rectangle size for visual display
// The rectangle represents a 100x100px crop on the ACTUAL full-size image
// We need to convert that to the preview's scale
// Then divide by face_shift_scale (when scale increases, the visible area decreases)
const scaledRectSize = computed(() => {
  return (RECT_SIZE * imageScaleFactor.value) / localScale.value;
});

// Convert percentage to pixel position in preview coordinates
const percentageToPreviewPixels = (percent: number, dimension: number): number => {
  return (percent / 100) * dimension * imageScaleFactor.value;
};

// Convert preview pixel position to percentage
const previewPixelsToPercentage = (pixels: number, dimension: number): number => {
  return (pixels / (dimension * imageScaleFactor.value)) * 100;
};

// Rectangle position style - convert percentages to preview pixels
const rectStyle = computed(() => ({
  left: `${percentageToPreviewPixels(localX.value, actualImageWidth.value)}px`,
  top: `${percentageToPreviewPixels(localY.value, actualImageHeight.value)}px`,
  width: `${scaledRectSize.value}px`,
  height: `${scaledRectSize.value}px`,
}));

// Get character image layers from skin_layers (filtered by selected view)
const imageLayers = computed(() => {
  const view = isDefaultView.value ? undefined : selectedView.value;
  return loadCharacterImages(localItem.value, skinLayersData.value as any, view);
});

// Initialize local values from item.traits
onMounted(() => {
  initializeLocalValues();
  loadCharacterSkinLayers();
  loadCharacterViews();
});

function initializeLocalValues() {
  // Skip if already initialized to prevent infinite loops
  if (isInitialized.value) return;

  // Merge skin_layers: combine core and mod layers
  if (coreItem.value?.skin_layers) {
    const coreLayers = coreItem.value.skin_layers || [];
    const modLayers = localItem.value.skin_layers || [];

    // Use Set to merge unique layers, preserving mod order first, then adding missing core layers
    const mergedLayers = [...new Set([...modLayers, ...coreLayers])];
    localItem.value.skin_layers = mergedLayers;
  } else if (!localItem.value.skin_layers) {
    localItem.value.skin_layers = [];
  }

  // Merge attributes: core attributes as defaults, mod attributes override
  if (coreItem.value?.attributes || localItem.value.attributes) {
    localItem.value.attributes = {
      ...(coreItem.value?.attributes || {}),
      ...(localItem.value.attributes || {})
    };
  } else if (!localItem.value.attributes) {
    localItem.value.attributes = {};
  }

  // Ensure traits object exists
  if (!localItem.value.traits) {
    localItem.value.traits = {};
  }

  localX.value = localItem.value.traits?.face_shift_x ?? coreItem.value?.traits?.face_shift_x ?? 50;
  localY.value = localItem.value.traits?.face_shift_y ?? coreItem.value?.traits?.face_shift_y ?? 50;
  localScale.value = localItem.value.traits?.face_shift_scale ?? coreItem.value?.traits?.face_shift_scale ?? 1;

  localArtDx.value = localItem.value.traits?.art_dx ?? coreItem.value?.traits?.art_dx ?? 0;
  localArtDy.value = localItem.value.traits?.art_dy ?? coreItem.value?.traits?.art_dy ?? 0;
  localArtScale.value = localItem.value.traits?.art_scale ?? coreItem.value?.traits?.art_scale ?? 1;

  initializeSpineRefs();

  isInitialized.value = true;
}

// Watch for prop changes (deep clone to avoid reactivity loops)
watch(() => props.item, (newItem) => {
  isInitialized.value = false;
  localItem.value = JSON.parse(JSON.stringify(newItem));
  initializeLocalValues();
}, { deep: true });

// Watch for local changes and emit updates
watch([localX, localY, localScale, localArtDx, localArtDy, localArtScale], () => {
  updateItemTraits();
});

function updateItemTraits() {
  // Ensure traits object exists
  if (!localItem.value.traits) {
    localItem.value.traits = {};
  }

  localItem.value.traits.face_shift_x = localX.value;
  localItem.value.traits.face_shift_y = localY.value;
  localItem.value.traits.face_shift_scale = localScale.value;
  localItem.value.traits.art_dx = localArtDx.value;
  localItem.value.traits.art_dy = localArtDy.value;
  localItem.value.traits.art_scale = localArtScale.value;

  emit('update:item', localItem.value);
}

// Load character skin layers
async function loadCharacterSkinLayers() {
  try {
    // Load skin layers data using loadFullData for proper mod support
    const mergedData = await editor.loadFullData('character_skin_layers');
    if (mergedData && Array.isArray(mergedData)) {
      skinLayersData.value = mergedData;
    }
  } catch (error) {
    console.error('Failed to load character_skin_layers.json:', error);
  }
}

// Load character views for view selector
async function loadCharacterViews() {
  try {
    const data = await editor.loadFullData('character_views');
    if (data && Array.isArray(data)) {
      characterViews.value = data;
    }
  } catch (error) {
    console.error('Failed to load character_views:', error);
  }
}

// Load image dimensions (static images only — spine sets its own dimensions)
function loadImageDimensions() {
  if (isSpineCharacter.value) return;
  if (imageLayers.value.length === 0) return;

  const img = new Image();
  img.onload = () => {
    actualImageWidth.value = img.naturalWidth;
    actualImageHeight.value = img.naturalHeight;
  };
  img.src = imageLayers.value[0];
}

// Watch for image layers changes to load dimensions (static only)
watch(imageLayers, () => {
  if (isSpineCharacter.value) return;
  if (imageLayers.value.length > 0) {
    loadImageDimensions();
    // Wait for images to render then get rendered size
    nextTick(() => {
      setTimeout(() => {
        updateRenderedHeight();
      }, 100);
    });
  }
});

// Track rendered image height when container is available
onMounted(() => {
  nextTick(() => {
    updateRenderedHeight();
  });
});

function updateRenderedHeight() {
  if (!containerRef.value) return;
  const img = containerRef.value.querySelector('.character-doll-image') as HTMLImageElement;
  if (img) {
    renderedImageHeight.value = img.offsetHeight;
  }
}

// Mouse event handlers
function handleMouseDown(event: MouseEvent) {
  isDragging.value = true;
  if (!containerRef.value) return;

  const rect = containerRef.value.getBoundingClientRect();
  // Convert percentage to preview pixels for drag calculation
  const currentPreviewX = percentageToPreviewPixels(localX.value, actualImageWidth.value);
  const currentPreviewY = percentageToPreviewPixels(localY.value, actualImageHeight.value);

  dragStartX.value = event.clientX - rect.left - currentPreviewX;
  dragStartY.value = event.clientY - rect.top - currentPreviewY;
  event.preventDefault();
}

function handleMouseMove(event: MouseEvent) {
  if (isDragging.value && containerRef.value) {
    const rect = containerRef.value.getBoundingClientRect();
    const previewX = event.clientX - rect.left - dragStartX.value;
    const previewY = event.clientY - rect.top - dragStartY.value;

    // Convert from preview pixel coordinates to percentages
    localX.value = previewPixelsToPercentage(previewX, actualImageWidth.value);
    localY.value = previewPixelsToPercentage(previewY, actualImageHeight.value);
  }

  if (isArtDragging.value) {
    const dx = event.clientX - artDragStartX.value;
    const dy = event.clientY - artDragStartY.value;
    artDragStartX.value = event.clientX;
    artDragStartY.value = event.clientY;

    // For spine characters, use the spine container dimensions
    // For static characters, use the rendered image dimensions
    let refWidth: number;
    let refHeight: number;

    if (isSpineCharacter.value && spineContainerRef.value) {
      refWidth = spineContainerRef.value.offsetWidth;
      refHeight = spineContainerRef.value.offsetHeight;
    } else {
      refWidth = actualImageWidth.value * imageScaleFactor.value;
      refHeight = renderedImageHeight.value;
    }

    if (refWidth > 0 && refHeight > 0) {
      // Convert pixel delta to percentage of rendered dimensions
      // Divide by artScale because game uses scale(s) translate(dx%, dy%) — translation is magnified by scale
      const s = localArtScale.value || 1;
      localArtDx.value += (dx / (refWidth * s)) * 100;
      localArtDy.value += (dy / (refHeight * s)) * 100;
    }
  }
}

function handleMouseUp() {
  isDragging.value = false;
  isArtDragging.value = false;
}

// Art drag: mousedown on the character doll wrapper
function handleArtMouseDown(event: MouseEvent) {
  if (!isDefaultView.value) return;
  isArtDragging.value = true;
  artDragStartX.value = event.clientX;
  artDragStartY.value = event.clientY;
  event.preventDefault();
}

function handleScaleChange(value: number | number[] | undefined) {
  if (value === undefined) return;
  const scaleValue = Array.isArray(value) ? value[0] : value;
  localScale.value = scaleValue;
}

// ============================================
// Spine Character Support
// ============================================

// Stable refs — set once during init, not reactive to localItem trait mutations
const spineAtlasRef = ref<string | null>(null);
const spineSkeletonRef = ref<string | null>(null);
const spineAnimationRef = ref<string | null>(null);

const isSpineCharacter = computed(() => {
  return !!(spineAtlasRef.value && spineSkeletonRef.value);
});

function findSpineForView(spineArray: any, view?: string | null): { atlas?: string, skeleton?: string, default_animation?: string } | null {
  if (!Array.isArray(spineArray)) return null;
  if (view) return spineArray.find((s: any) => s.view === view) || null;
  return spineArray.find((s: any) => !s.view) || null;
}

function initializeSpineRefs(view?: string | null) {
  const localSpine = findSpineForView(localItem.value.spine, view);
  const coreSpine = findSpineForView(coreItem.value?.spine, view);
  // Only fall back to default spine when no specific view is requested.
  // If a view is requested but has no spine entry, return null so static layers render instead.
  const localDefault = !view ? findSpineForView(localItem.value.spine) : null;
  const coreDefault = !view ? findSpineForView(coreItem.value?.spine) : null;
  spineAtlasRef.value = localSpine?.atlas || coreSpine?.atlas || localDefault?.atlas || coreDefault?.atlas || null;
  spineSkeletonRef.value = localSpine?.skeleton || coreSpine?.skeleton || localDefault?.skeleton || coreDefault?.skeleton || null;
  spineAnimationRef.value = localSpine?.default_animation || coreSpine?.default_animation || localDefault?.default_animation || coreDefault?.default_animation || null;
}

const spineContainerRef = ref<HTMLDivElement | null>(null);
let spinePlayer: SpinePlayer | null = null;

function initSpinePlayer() {
  if (!spineContainerRef.value || !spineAtlasRef.value || !spineSkeletonRef.value) return;
  // Prevent double init — dispose first if already created
  disposeSpinePlayer();

  try {
    spinePlayer = new SpinePlayer(spineContainerRef.value, {
      jsonUrl: spineSkeletonRef.value,
      atlasUrl: spineAtlasRef.value,
      animation: spineAnimationRef.value || undefined,
      skin: 'default',
      backgroundColor: '#00000000',
      alpha: true,
      preserveDrawingBuffer: false,
      premultipliedAlpha: true,
      showControls: false,
      success: (player: SpinePlayer) => {
        if (!player.skeleton) return;

        // Apply skins from attributes (convention-based: attribute values = Spine skin names)
        const attributes = localItem.value.attributes || {};
        const skeletonData = player.skeleton.data;
        const skins = Object.values(attributes).filter(
          (v): v is string => typeof v === 'string' && !!skeletonData.skins.find((s: any) => s.name === v)
        );

        if (skins.length > 0) {
          if (skins.length === 1) {
            player.skeleton.setSkinByName(skins[0]);
          } else {
            const firstSkinData = skeletonData.skins[0];
            if (firstSkinData) {
              const SkinConstructor = firstSkinData.constructor as any;
              const combinedSkin = new SkinConstructor('combined-skin');
              skins.forEach(name => {
                const skin = skeletonData.skins.find((s: any) => s.name === name);
                if (skin) combinedSkin.addSkin(skin);
              });
              player.skeleton.setSkin(combinedSkin);
            }
          }
          player.skeleton.setSlotsToSetupPose();
        }

        // Set image dimensions from spine container so face rect positioning works
        if (spineContainerRef.value) {
          actualImageWidth.value = spineContainerRef.value.offsetWidth;
          actualImageHeight.value = spineContainerRef.value.offsetHeight;
          renderedImageHeight.value = spineContainerRef.value.offsetHeight;
        }
      },
      error: (_player: SpinePlayer, error: string) => {
        console.error('Spine preview error:', error);
      }
    });
  } catch (error) {
    console.error('Failed to initialize Spine preview:', error);
  }
}

function disposeSpinePlayer() {
  if (spinePlayer) {
    spinePlayer.dispose();
    spinePlayer = null;
  }
}

// Reinitialize spine when view changes
watch(selectedView, (newView) => {
  if (isSpineCharacter.value) {
    initializeSpineRefs(newView === DEFAULT_VIEW ? null : newView);
    nextTick(() => initSpinePlayer());
  }
});

// Init spine when container appears (v-if)
watch(spineContainerRef, (newRef) => {
  if (newRef && isSpineCharacter.value) {
    nextTick(() => initSpinePlayer());
  }
});

onBeforeUnmount(() => {
  disposeSpinePlayer();
});

// Add global mouse event listeners
onMounted(() => {
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <div class="face-picker-popup">
    <div class="picker-header">
      <h3>Art Manager</h3>
      <p class="hint">Drag the rectangle to position the face indicator</p>
    </div>

    <div class="picker-content">
      <!-- Controls -->
      <div class="controls">
        <div v-if="characterViews.length > 0" class="control-group">
          <label>View</label>
          <Select v-model="selectedView" :options="viewOptions" optionLabel="name" optionValue="id"
            class="control-select" />
        </div>

        <template v-if="isDefaultView">
          <div class="section-divider">Face Picker</div>

          <div class="control-group">
            <div class="control-label-row">
              <label>X Position: {{ localX.toFixed(1) }}%</label>
              <span v-if="coreItem && coreItem.traits && localItem.traits?.face_shift_x === undefined"
                class="core-value-indicator">
                (core: {{ (coreItem.traits.face_shift_x ?? 50).toFixed(1) }}%)
              </span>
            </div>
            <Slider :modelValue="localX" @update:modelValue="(v) => localX = Array.isArray(v) ? v[0] : v" :min="0"
              :max="100" :step="0.1" class="control-slider" />
          </div>

          <div class="control-group">
            <div class="control-label-row">
              <label>Y Position: {{ localY.toFixed(1) }}%</label>
              <span v-if="coreItem && coreItem.traits && localItem.traits?.face_shift_y === undefined"
                class="core-value-indicator">
                (core: {{ (coreItem.traits.face_shift_y ?? 50).toFixed(1) }}%)
              </span>
            </div>
            <Slider :modelValue="localY" @update:modelValue="(v) => localY = Array.isArray(v) ? v[0] : v" :min="0"
              :max="100" :step="0.1" class="control-slider" />
          </div>

          <div class="control-group">
            <div class="control-label-row">
              <label>Scale: {{ localScale.toFixed(2) }}</label>
              <span v-if="coreItem && coreItem.traits && localItem.traits?.face_shift_scale === undefined"
                class="core-value-indicator">
                (core: {{ (coreItem.traits.face_shift_scale ?? 1).toFixed(2) }})
              </span>
            </div>
            <Slider :modelValue="localScale" @update:modelValue="handleScaleChange" :min="0.1" :max="3" :step="0.01"
              class="control-slider" />
          </div>

          <div class="section-divider">Art Offset</div>

          <div class="control-group">
            <div class="control-label-row">
              <label>Art X Offset: {{ localArtDx.toFixed(1) }}%</label>
              <span v-if="coreItem && coreItem.traits && localItem.traits?.art_dx === undefined"
                class="core-value-indicator">
                (core: {{ (coreItem.traits.art_dx ?? 0).toFixed(1) }}%)
              </span>
            </div>
            <Slider :modelValue="localArtDx" @update:modelValue="(v) => localArtDx = Array.isArray(v) ? v[0] : v"
              :min="-100" :max="100" :step="0.1" class="control-slider" />
          </div>

          <div class="control-group">
            <div class="control-label-row">
              <label>Art Y Offset: {{ localArtDy.toFixed(1) }}%</label>
              <span v-if="coreItem && coreItem.traits && localItem.traits?.art_dy === undefined"
                class="core-value-indicator">
                (core: {{ (coreItem.traits.art_dy ?? 0).toFixed(1) }}%)
              </span>
            </div>
            <Slider :modelValue="localArtDy" @update:modelValue="(v) => localArtDy = Array.isArray(v) ? v[0] : v"
              :min="-100" :max="100" :step="0.1" class="control-slider" />
          </div>

          <div class="control-group">
            <div class="control-label-row">
              <label>Art Scale: {{ localArtScale.toFixed(2) }}</label>
              <span v-if="coreItem && coreItem.traits && localItem.traits?.art_scale === undefined"
                class="core-value-indicator">
                (core: {{ (coreItem.traits.art_scale ?? 1).toFixed(2) }})
              </span>
            </div>
            <Slider :modelValue="localArtScale" @update:modelValue="(v) => localArtScale = Array.isArray(v) ? v[0] : v"
              :min="0.1" :max="3" :step="0.01" class="control-slider" />
          </div>
        </template>

      </div>

      <!-- Preview container -->
      <div class="preview-container" ref="containerRef">
        <!-- No Layers / No Spine Message -->
        <div v-if="!isSpineCharacter && imageLayers.length === 0" class="no-layers-message">
          <p class="warning-text">⚠️ Select Character Image Layers in the <strong>skin_layers</strong> field, or
            configure
            <strong>spine</strong> files.
          </p>
          <p class="info-text">Note: All image layer pictures should have the same size dimensions.</p>
        </div>

        <!-- Game padding zone (default view only — relative to character sheet positioning) -->
        <div v-if="isDefaultView && (isSpineCharacter || imageLayers.length > 0)" class="game-padding-zone"
          :style="{ width: dollMarginLeft }">
        </div>

        <!-- Character-sheet start boundary (default view only) -->
        <div v-if="isDefaultView && (isSpineCharacter || imageLayers.length > 0)" class="sheet-boundary"
          :style="{ left: sheetStartLeft }">
        </div>

        <!-- Spine Character Preview -->
        <template v-if="isSpineCharacter">
          <div class="character-doll-wrapper" :class="{ 'art-draggable': isDefaultView }"
            @mousedown="handleArtMouseDown">
            <div class="character-doll"
              :style="{ transform: isDefaultView ? `scale(${localArtScale}) translate(${localArtDx}%, ${localArtDy}%)` : 'none', transformOrigin: 'center center' }">
              <div ref="spineContainerRef" class="spine-preview-container" />

              <!-- Draggable Purple Rectangle -->
              <div v-if="isDefaultView" class="face-selector-rect" :style="rectStyle" @mousedown.stop="handleMouseDown">
                <div class="rect-label">FACE</div>
              </div>
            </div>
          </div>
        </template>

        <!-- Static Image Character Preview -->
        <template v-else-if="imageLayers.length > 0">
          <div class="character-doll-wrapper" :class="{ 'art-draggable': isDefaultView }"
            @mousedown="handleArtMouseDown">
            <div class="character-doll"
              :style="{ transform: isDefaultView ? `scale(${localArtScale}) translate(${localArtDx}%, ${localArtDy}%)` : 'none', transformOrigin: 'center center' }">
              <img v-for="(image, index) in imageLayers" :key="index" :src="image" class="character-doll-image"
                @error="($event.target as HTMLImageElement).style.display = 'none'"
                @load="index === 0 ? updateRenderedHeight() : null" />

              <!-- Draggable Purple Rectangle (inside character-doll so it tracks art transform) -->
              <div v-if="isDefaultView" class="face-selector-rect" :style="rectStyle" @mousedown.stop="handleMouseDown">
                <div class="rect-label">FACE</div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.face-picker-popup {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
}

.picker-header {
  padding: 0.5rem;
  background-color: #f5f5f5;
  border-radius: 4px;
}

.picker-header h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
  color: #333;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: #666;
  font-style: italic;
}

.picker-content {
  display: flex;
  gap: 1.5rem;
  flex: 1;
  overflow: hidden;
}

.controls {
  width: 250px;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 1rem;
  background-color: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow-y: auto;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-divider {
  font-size: 0.85rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-top: 1px solid #ddd;
  padding-top: 0.75rem;
}

.section-divider:first-child {
  border-top: none;
  padding-top: 0;
}

.control-group label {
  font-size: 0.9rem;
  font-weight: 500;
  color: #333;
}

.control-slider {
  width: 100%;
}

.control-select {
  width: 100%;
}

.control-info {
  margin-top: auto;
  padding: 1rem;
  background-color: #e3f2fd;
  border-left: 4px solid #2196F3;
  border-radius: 4px;
}

.control-info p {
  margin: 0.25rem 0;
  font-size: 0.85rem;
  font-family: var(--font-family-mono);
}

.control-info strong {
  font-size: 0.9rem;
}

.preview-container {
  flex: 1;
  overflow: auto;
  background-color: #fafafa;
  border: 1px solid #ddd;
  border-radius: 4px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  position: relative;
}

.no-layers-message {
  text-align: center;
  padding: 2rem;
}

.warning-text {
  color: #f44336;
  margin-bottom: 1rem;
  font-weight: 500;
}

.info-text {
  font-size: 0.875rem;
  color: #666;
}

.sheet-boundary {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 2px dashed rgba(0, 0, 0, 0.15);
  pointer-events: none;
  z-index: 1;
}

.game-padding-zone {
  height: 100%;
  background-color: rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}

.character-doll-wrapper {
  position: relative;
  display: inline-block;
}

.character-doll-wrapper.art-draggable {
  cursor: grab;
}

.character-doll-wrapper.art-draggable:active {
  cursor: grabbing;
}

.character-doll {
  position: relative;
  display: inline-block;
  border: 1px solid rgb(255, 183, 0)
}

.character-doll-image {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  width: auto;
  height: auto;
}

.character-doll-image:not(:first-child) {
  position: absolute;
  top: 0;
  left: 0;
}

.face-selector-rect {
  position: absolute;
  border: 3px solid #9C27B0;
  background-color: rgba(156, 39, 176, 0.1);
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto;
  user-select: none;
}

.face-selector-rect:active {
  cursor: grabbing;
}

.rect-label {
  color: #9C27B0;
  font-weight: bold;
  font-size: 0.75rem;
  text-shadow: 0 0 2px white;
  pointer-events: none;
}

/* Core value indicators for mod support */
.core-value-indicator {
  color: var(--p-surface-500, #6b7280);
  font-size: 0.8rem;
  font-style: italic;
  margin-left: 0.5rem;
}

.control-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Spine preview */
.spine-preview-container {
  width: 500px;
  height: 700px;
}

.spine-preview-container :deep(.spine-player-controls) {
  display: none !important;
}
</style>
