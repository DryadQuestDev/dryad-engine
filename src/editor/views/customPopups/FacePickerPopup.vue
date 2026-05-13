<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useStorage } from '@vueuse/core';
import { Editor } from '../../editor';
import type { EditorCustomPopupProps } from '../../editor';
import { loadCharacterImages } from '../../../shared/utils/characterImageLoader';
import { spineRenderer, type SpineStats } from '../../../game/utils/spineRenderer';
import { buildEditorTrackMap, applyTrackMap } from '../../../game/utils/spineAnimationGroups';
import { getSpineCharacterScale, CHARACTER_VIEWPORT_ASPECT_RATIO, SPINE_REFERENCE_HEIGHT, SPINE_REFERENCE_WIDTH } from '../../../game/utils/characterReference';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import Slider from 'primevue/slider';
import Select from 'primevue/select';
import SpineStatsPanel from './SpineStatsPanel.vue';

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
const dragStartLocalX = ref(0);
const dragStartLocalY = ref(0);
const isArtDragging = ref(false);
const artDragStartX = ref(0);
const artDragStartY = ref(0);

// Image dimensions
const actualImageWidth = ref(0);
const actualImageHeight = ref(0);
const renderedImageHeight = ref(0);

// Loaded skin layers
const skinLayersData = ref<Record<string, any>[]>([]);

// View selector. _default and '' both mean the default view; we use '_default' canonically here.
// Persisted globally so the dev returns to the same view across characters/sessions.
const DEFAULT_VIEW = '_default';
const selectedView = useStorage<string>('facepicker_selectedView', DEFAULT_VIEW);
const characterViews = ref<{ id: string; name: string }[]>([]);
const viewOptions = computed(() =>
  characterViews.value.map(v => ({ id: v.id, name: v.name || v.id }))
);
const isDefaultView = computed(() => selectedView.value === DEFAULT_VIEW);
// Helper: spine entry view '' and '_default' are equivalent; treat the latter canonically.
function viewMatches(entryView: any, target: string): boolean {
  const a = !entryView || entryView === '_default' ? '_default' : entryView;
  const b = !target || target === '_default' ? '_default' : target;
  return a === b;
}

// Local position state (percentage 0-100)
const localX = ref(50);
const localY = ref(50);
const localScale = ref(1);

const localArtDx = ref(0);
const localArtDy = ref(0);
const localArtScale = ref(1);

// Per-view per-game spine scale (manifest field). Lives on the manifest, not
// on the character. Initialized from the active merged manifest, persisted
// to the manifest file on Save / Save and Close (see commitExternal below).
const initialSpineGameScale = ref(getSpineCharacterScale(selectedView.value, editor.getMergedManifest()));
const localSpineGameScale = ref(initialSpineGameScale.value);

// Reload baseline when the user switches the view selector — so the slider reflects
// that view's saved value, not whatever was previously displayed.
watch(selectedView, (newView) => {
  initialSpineGameScale.value = getSpineCharacterScale(newView, editor.getMergedManifest());
  localSpineGameScale.value = initialSpineGameScale.value;
});


// face_shift_x/y are now percentages of the 1:1 doll (matching CharacterFace's coordinate
// system, where the doll is sized to SPINE_REFERENCE_HEIGHT × SPINE_REFERENCE_HEIGHT and
// translated by face_shift%). Since the popup's `.character-doll` is also 1:1 with
// `aspect-ratio: 1/1`, doll width = doll height = renderedImageHeight (px).
const dollSize = computed(() => renderedImageHeight.value);

// The face crop rect represents the visible face region (RECT_SIZE px in CharacterFace's
// face container, where the doll is sized to SPINE_REFERENCE_HEIGHT). As a fraction of
// the doll, that's RECT_SIZE / SPINE_REFERENCE_HEIGHT (e.g., 100/700 ≈ 14.3%).
// Divide by localScale because face_shift_scale enlarges the doll → visible region shrinks.
const FACE_FRACTION = RECT_SIZE / SPINE_REFERENCE_HEIGHT;
const scaledRectSize = computed(() => {
  return (FACE_FRACTION * dollSize.value) / localScale.value;
});

// Rectangle position style — percentages directly map to doll pixels, no letterbox math.
const rectStyle = computed(() => ({
  left: `${(localX.value / 100) * dollSize.value}px`,
  top: `${(localY.value / 100) * dollSize.value}px`,
  width: `${scaledRectSize.value}px`,
  height: `${scaledRectSize.value}px`,
}));

// Get character image layers from skin_layers (filtered by selected view).
// The loader normalizes _default ↔ '' equivalence internally.
const imageLayers = computed(() => {
  return loadCharacterImages(localItem.value, skinLayersData.value as any, selectedView.value);
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

  loadArtOffsetForView();

  initializeSpineRefs();

  isInitialized.value = true;
}

// ──────────────────────────────────────────────────────────────────────────
// Spine ↔ Static preview toggle (visible only when both exist for the view)
// ──────────────────────────────────────────────────────────────────────────

// Persisted globally so the dev's preference carries across characters/sessions.
const storedPreviewMode = useStorage<'spine' | 'static'>('facepicker_previewMode', 'spine');

const hasSpineForActiveView = computed(() =>
  !!findSpineEntry(localItem.value.spine, selectedView.value)
  || !!findSpineEntry(coreItem.value?.spine, selectedView.value)
);
const hasStaticForActiveView = computed(() => imageLayers.value.length > 0);

// Falls back to whichever mode is actually available — the toggle never points
// at a missing asset.
const effectivePreviewMode = computed<'spine' | 'static'>(() => {
  if (storedPreviewMode.value === 'spine' && hasSpineForActiveView.value) return 'spine';
  if (storedPreviewMode.value === 'static' && hasStaticForActiveView.value) return 'static';
  return hasSpineForActiveView.value ? 'spine' : 'static';
});

const showPreviewToggle = computed(() =>
  hasSpineForActiveView.value && hasStaticForActiveView.value
);

// Display-time offsets — each asset always renders at its own stored offset, regardless
// of which one the sliders are editing. So toggling Spine ↔ Static doesn't shift the ghost.
// When a layer IS the active editing target, its offset reflects the live slider values.
const spineDisplayOffset = computed(() => {
  if (effectivePreviewMode.value === 'spine') {
    return { dx: localArtDx.value, dy: localArtDy.value, scale: localArtScale.value };
  }
  const entry = findSpineEntry(localItem.value.spine, selectedView.value)
    || findSpineEntry(coreItem.value?.spine, selectedView.value);
  return {
    dx: typeof entry?.art_dx === 'number' ? entry.art_dx : 0,
    dy: typeof entry?.art_dy === 'number' ? entry.art_dy : 0,
    scale: typeof entry?.art_scale === 'number' ? entry.art_scale : 1,
  };
});

const staticDisplayOffset = computed(() => {
  if (effectivePreviewMode.value === 'static') {
    return { dx: localArtDx.value, dy: localArtDy.value, scale: localArtScale.value };
  }
  return {
    dx: localItem.value.traits?.art_dx ?? coreItem.value?.traits?.art_dx ?? 0,
    dy: localItem.value.traits?.art_dy ?? coreItem.value?.traits?.art_dy ?? 0,
    scale: localItem.value.traits?.art_scale ?? coreItem.value?.traits?.art_scale ?? 1,
  };
});

// Read art offset from the source matching the effective mode:
//   'spine' → matching spine entry's art_dx/art_dy/art_scale (no fallback)
//   'static' → character traits (the static fallback for any unset layer)
function loadArtOffsetForView() {
  if (effectivePreviewMode.value === 'spine') {
    const entry = findSpineEntry(localItem.value.spine, selectedView.value)
      || findSpineEntry(coreItem.value?.spine, selectedView.value);
    localArtDx.value = typeof entry?.art_dx === 'number' ? entry.art_dx : 0;
    localArtDy.value = typeof entry?.art_dy === 'number' ? entry.art_dy : 0;
    localArtScale.value = typeof entry?.art_scale === 'number' ? entry.art_scale : 1;
  } else {
    localArtDx.value = localItem.value.traits?.art_dx ?? coreItem.value?.traits?.art_dx ?? 0;
    localArtDy.value = localItem.value.traits?.art_dy ?? coreItem.value?.traits?.art_dy ?? 0;
    localArtScale.value = localItem.value.traits?.art_scale ?? coreItem.value?.traits?.art_scale ?? 1;
  }
}

function findSpineEntry(spineArray: any, view: string): any {
  if (!Array.isArray(spineArray)) return null;
  return spineArray.find((s: any) => viewMatches(s.view, view)) || null;
}

// Switching views or toggling spine ↔ static reloads the baseline values.
watch(selectedView, () => {
  if (isInitialized.value) loadArtOffsetForView();
});

watch(effectivePreviewMode, () => {
  if (isInitialized.value) loadArtOffsetForView();
});

// True when the next prop update is just our own emit echoing back. Prevents the
// prop watcher from re-cloning + re-initializing (which clobbers selectedView's
// spine refs to the default view, breaking view switching mid-edit).
let suppressNextPropSync = false;

// Watch for prop changes (deep clone to avoid reactivity loops)
watch(() => props.item, (newItem) => {
  if (suppressNextPropSync) {
    suppressNextPropSync = false;
    return;
  }
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

  // Face crop fields are character-trait-level — they target the character sheet only.
  localItem.value.traits.face_shift_x = localX.value;
  localItem.value.traits.face_shift_y = localY.value;
  localItem.value.traits.face_shift_scale = localScale.value;

  // Art offset target follows the effective preview mode: spine entry for the
  // active view, or character traits when tuning the static fallback.
  if (effectivePreviewMode.value === 'spine') {
    if (!Array.isArray(localItem.value.spine)) localItem.value.spine = [];
    let entry = (localItem.value.spine as any[]).find((s: any) => viewMatches(s.view, selectedView.value));
    if (!entry) {
      entry = { view: selectedView.value === DEFAULT_VIEW ? '_default' : selectedView.value };
      (localItem.value.spine as any[]).push(entry);
    }
    entry.art_dx = localArtDx.value;
    entry.art_dy = localArtDy.value;
    entry.art_scale = localArtScale.value;
  } else {
    localItem.value.traits.art_dx = localArtDx.value;
    localItem.value.traits.art_dy = localArtDy.value;
    localItem.value.traits.art_scale = localArtScale.value;
  }

  suppressNextPropSync = true;
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

// Load character views for view selector. If the persisted selectedView no longer exists
// in the loaded options, fall back to _default so we don't end up in a stale state.
async function loadCharacterViews() {
  try {
    const data = await editor.loadFullData('character_views');
    if (data && Array.isArray(data)) {
      characterViews.value = data;
      const ids = new Set(data.map((v: any) => v.id));
      if (!ids.has(selectedView.value)) {
        selectedView.value = DEFAULT_VIEW;
      }
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
  dragStartX.value = event.clientX;
  dragStartY.value = event.clientY;
  dragStartLocalX.value = localX.value;
  dragStartLocalY.value = localY.value;
  event.preventDefault();
}

function handleMouseMove(event: MouseEvent) {
  if (isDragging.value && dollSize.value > 0) {
    // Face rect drag: convert mouse pixel delta to % of the 1:1 doll directly,
    // since face_shift_x/y are doll-relative percentages.
    const s = localArtScale.value || 1;
    const dxLayout = (event.clientX - dragStartX.value) / s;
    const dyLayout = (event.clientY - dragStartY.value) / s;
    localX.value = dragStartLocalX.value + (dxLayout / dollSize.value) * 100;
    localY.value = dragStartLocalY.value + (dyLayout / dollSize.value) * 100;
  }

  if (isArtDragging.value) {
    const dx = event.clientX - artDragStartX.value;
    const dy = event.clientY - artDragStartY.value;
    artDragStartX.value = event.clientX;
    artDragStartY.value = event.clientY;

    // Both spine and static use the 1:1 doll dimensions as the reference.
    let refWidth: number;
    let refHeight: number;

    if (isSpineCharacter.value && spineContainerRef.value) {
      refWidth = spineContainerRef.value.offsetWidth;
      refHeight = spineContainerRef.value.offsetHeight;
    } else {
      refWidth = dollSize.value;
      refHeight = dollSize.value;
    }

    if (refWidth > 0 && refHeight > 0) {
      // Convert pixel delta to percentage of rendered dimensions.
      // Renderer (spine) and CSS wrapper (static) both compose as `translate(t) scale(s)`,
      // so the on-screen pixel shift equals `t` directly — no `* s` magnification.
      localArtDx.value += (dx / refWidth) * 100;
      localArtDy.value += (dy / refHeight) * 100;
    }
  }
}

function handleMouseUp() {
  isDragging.value = false;
  isArtDragging.value = false;
}

// Art drag: mousedown on the character doll wrapper. Works for any view since each spine
// entry / character traits has its own art offset.
function handleArtMouseDown(event: MouseEvent) {
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

const isSpineCharacter = computed(() => {
  return !!(spineAtlasRef.value && spineSkeletonRef.value);
});

function findSpineForView(spineArray: any, view: string): { atlas?: string, skeleton?: string } | null {
  if (!Array.isArray(spineArray)) return null;
  return spineArray.find((s: any) => viewMatches(s.view, view)) || null;
}

function initializeSpineRefs(view: string = selectedView.value) {
  const localSpine = findSpineForView(localItem.value.spine, view);
  const coreSpine = findSpineForView(coreItem.value?.spine, view);
  spineAtlasRef.value = localSpine?.atlas || coreSpine?.atlas || null;
  spineSkeletonRef.value = localSpine?.skeleton || coreSpine?.skeleton || null;
}

const spineContainerRef = ref<HTMLDivElement | null>(null);
const spineStats = ref<SpineStats | null>(null);
let spineInstance: Spine | null = null;
let spineSlotId = '';

async function initSpinePlayer() {
  if (!spineContainerRef.value || !spineAtlasRef.value || !spineSkeletonRef.value) return;
  // Prevent double init — dispose first if already created
  disposeSpinePlayer();

  try {
    spineSlotId = `face_picker_${Date.now()}`;
    const attributes = localItem.value.attributes || {};

    // Don't pass artDx/artDy here — in the popup the offset is applied as a CSS
    // transform on the orange `.character-doll` wrapper instead, so the orange
    // bounds visually follow the character. The renderer's canvas stays centered.
    const spine = await spineRenderer.register(spineSlotId, spineContainerRef.value, {
      skeletonUrl: spineSkeletonRef.value,
      atlasUrl: spineAtlasRef.value,
      artScale: spineDisplayOffset.value.scale,
      gameScale: getSpineCharacterScale(selectedView.value, editor.getMergedManifest()),
    });

    if (!spine) return;
    spineInstance = spine;
    spineStats.value = spineRenderer.getStats(spine);

    // Apply skins from attributes (convention-based: attribute values = Spine skin names)
    const skeletonData = spine.skeleton.data;
    const skins = Object.values(attributes).filter(
      (v): v is string => typeof v === 'string' && !!skeletonData.skins.find((s: any) => s.name === v)
    );
    if (skins.length > 0) {
      spineRenderer.applySkins(spine, skins);
    }

    const animNames = spine.skeleton.data.animations.map((a: any) => a.name);
    applyTrackMap(spine, buildEditorTrackMap(animNames, attributes));

    // Set image dimensions for face rect positioning
    // actualImage uses the game's reference size (500×700) since CharacterFace.vue
    // crops spine at that fixed size. renderedImageHeight uses the actual display size
    // so imageScaleFactor correctly maps between reference and preview coordinates.
    if (spineContainerRef.value) {
      actualImageWidth.value = SPINE_REFERENCE_WIDTH;
      actualImageHeight.value = SPINE_REFERENCE_HEIGHT;
      renderedImageHeight.value = spineContainerRef.value.offsetHeight;
    }
  } catch (error) {
    console.error('Failed to initialize Spine preview:', error);
  }
}

function disposeSpinePlayer() {
  if (spineSlotId) {
    spineRenderer.unregister(spineSlotId);
    spineSlotId = '';
  }
  spineInstance = null;
  spineStats.value = null;
}

// Reinitialize spine when view changes. ALWAYS update refs first (don't gate on
// the old isSpineCharacter state — that's stale before refs are re-resolved).
// Then either init (if the new view has a spine) or dispose (if it doesn't),
// so a switch from a no-spine view back to a view-with-spine actually re-renders.
watch(selectedView, async (newView) => {
  initializeSpineRefs(newView);
  if (!spineAtlasRef.value || !spineSkeletonRef.value) {
    disposeSpinePlayer();
    return;
  }
  // Wait for the v-if to mount the spine container in the DOM. Without an explicit
  // await on nextTick, init can fire before spineContainerRef is bound — especially
  // when transitioning back from a no-spine view where the container was removed.
  await nextTick();
  // After the await, the v-if should have re-rendered. If the container still
  // isn't bound (race with reactivity), wait one more tick.
  if (!spineContainerRef.value) await nextTick();
  if (spineContainerRef.value) initSpinePlayer();
});

// Init spine when container appears (v-if). Belt-and-suspenders for the transition
// when the view watch and the v-if mount happen on different reactive flushes.
watch(spineContainerRef, (newRef) => {
  if (newRef && isSpineCharacter.value) {
    nextTick(() => initSpinePlayer());
  }
});

// Re-apply track map when attributes change without full reinit.
watch(() => localItem.value.attributes, (attributes) => {
  if (!spineInstance) return;
  const animNames = spineInstance.skeleton.data.animations.map((a: any) => a.name);
  applyTrackMap(spineInstance, buildEditorTrackMap(animNames, attributes || {}));
}, { deep: true });

// Live-update the spine renderer's scale when the user edits the spine entry. dx/dy are
// applied as a CSS transform on the orange wrapper (see template), not here, so the orange
// bounds move with the character.
watch(spineDisplayOffset, (offset) => {
  if (!spineSlotId) return;
  spineRenderer.updateArtScale(spineSlotId, offset.scale);
}, { deep: true });

// CSS transform string for the orange `.character-doll` wrapper around the spine preview.
const spineWrapperTransform = computed(() => {
  const { dx, dy } = spineDisplayOffset.value;
  if (dx === 0 && dy === 0) return 'none';
  return `translate(${dx}cqh, ${dy}cqh)`;
});

// Live-update game-wide spine scale when the Spine Scale slider moves.
watch(localSpineGameScale, (value) => {
  if (spineSlotId) spineRenderer.updateGameScale(spineSlotId, value || 1);
});

// Called by CustomPopupWrapper on Save / Save and Close (not on Cancel).
// Persists the per-view spine scale to the active manifest if the user changed it.
async function commitExternal() {
  if (localSpineGameScale.value === initialSpineGameScale.value) return;
  const manifest = editor.getMergedManifest() as any;
  const map: Record<string, number> = { ...(manifest?.spine_character_scale || {}) };
  map[selectedView.value] = localSpineGameScale.value;
  await editor.setActiveManifestField('spine_character_scale', map);
  initialSpineGameScale.value = localSpineGameScale.value;
}

defineExpose({ commitExternal });

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
      <p class="hint">The orange middle line marks the column's center – align the body to it. On the default
        view, the outer dashed lines also show the boundaries in the character-sheet column where the doll appears
        in-game. Drag the rectangle to position the face indicator.</p>
    </div>

    <div class="picker-content">
      <!-- Controls -->
      <div class="controls">
        <SpineStatsPanel v-if="isSpineCharacter" :stats="spineStats"
          :character-attributes="localItem.attributes || {}" />

        <div v-if="characterViews.length > 0" class="control-group">
          <label>View</label>
          <Select v-model="selectedView" :options="viewOptions" optionLabel="name" optionValue="id"
            class="control-select" />
        </div>

        <div v-if="isSpineCharacter" class="control-group">
          <div class="control-label-row">
            <label>Spine Scale (game-wide): {{ localSpineGameScale.toFixed(2) }}</label>
            <span v-if="localSpineGameScale !== initialSpineGameScale" class="core-value-indicator">
              (saved: {{ initialSpineGameScale.toFixed(2) }})
            </span>
          </div>
          <Slider :modelValue="localSpineGameScale"
            @update:modelValue="(v) => localSpineGameScale = Array.isArray(v) ? v[0] : v" :min="0.1" :max="3"
            :step="0.01" class="control-slider" />
          <p class="hint" style="margin: 0; font-size: 0.7rem;">
            Persists to manifest's <code>spine_character_scale</code> on Save.
          </p>
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
        </template>

        <div v-if="showPreviewToggle" class="spine-static-toggle">
          <button type="button" :class="{ active: effectivePreviewMode === 'spine' }"
            @click="storedPreviewMode = 'spine'">Spine</button>
          <button type="button" :class="{ active: effectivePreviewMode === 'static' }"
            @click="storedPreviewMode = 'static'">Static</button>
        </div>

        <div class="section-divider">
          Art Offset
          <span class="hint" style="font-weight: normal; text-transform: none;">
            <template v-if="effectivePreviewMode === 'spine'">(spine entry: <code>{{ selectedView }}</code>)</template>
            <template v-else>(character traits)</template>
          </span>
        </div>

        <div class="control-group">
          <div class="control-label-row">
            <label>Art X Offset: {{ localArtDx.toFixed(1) }}%</label>
          </div>
          <Slider :modelValue="localArtDx" @update:modelValue="(v) => localArtDx = Array.isArray(v) ? v[0] : v"
            :min="-100" :max="100" :step="0.1" class="control-slider" />
        </div>

        <div class="control-group">
          <div class="control-label-row">
            <label>Art Y Offset: {{ localArtDy.toFixed(1) }}%</label>
          </div>
          <Slider :modelValue="localArtDy" @update:modelValue="(v) => localArtDy = Array.isArray(v) ? v[0] : v"
            :min="-100" :max="100" :step="0.1" class="control-slider" />
        </div>

        <div class="control-group">
          <div class="control-label-row">
            <label>Art Scale: {{ localArtScale.toFixed(2) }}</label>
          </div>
          <Slider :modelValue="localArtScale" @update:modelValue="(v) => localArtScale = Array.isArray(v) ? v[0] : v"
            :min="0.1" :max="3" :step="0.01" class="control-slider" />
        </div>

      </div>

      <!-- Preview container -->
      <div class="preview-container" ref="containerRef">
        <!-- No Layers / No Spine Message -->
        <div v-if="!hasSpineForActiveView && !hasStaticForActiveView" class="no-layers-message">
          <p class="warning-text">⚠️ Select Character Image Layers in the <strong>skin_layers</strong> field, or
            configure
            <strong>spine</strong> files.
          </p>
          <p class="info-text">Note: All image layer pictures should have the same size dimensions.</p>
        </div>


        <!-- Outer left/right boundaries mark the Progression character-sheet column edges,
             so they're only meaningful for the default view (the only view rendered there).
             The middle line is a generic centering reference and stays for every view. -->
        <template v-if="hasSpineForActiveView || hasStaticForActiveView">
          <template v-if="isDefaultView">
            <div class="sheet-boundary left"></div>
            <div class="sheet-boundary right"></div>
          </template>
          <div class="sheet-boundary middle"></div>
        </template>

        <!-- Spine layer. Visible when a spine exists for this view. Z-order/opacity flips
             with the toggle. art_dx/dy applied as CSS transform on .character-doll so the
             orange bounds visually follow the character. art_scale routes through the renderer. -->
        <div v-if="hasSpineForActiveView" class="character-doll-wrapper art-draggable"
          :class="{ ghost: showPreviewToggle && effectivePreviewMode !== 'spine' }"
          :style="{ zIndex: effectivePreviewMode === 'spine' ? 2 : 1 }"
          @mousedown="effectivePreviewMode === 'spine' ? handleArtMouseDown($event) : null">
          <div class="character-doll" :style="{ transform: spineWrapperTransform }">
            <div ref="spineContainerRef" class="spine-preview-container" />

            <!-- Face crop selector only sits on the active asset and only on default view -->
            <div v-if="isDefaultView && effectivePreviewMode === 'spine'" class="face-selector-rect" :style="rectStyle"
              @mousedown.stop="handleMouseDown">
              <div class="rect-label">FACE</div>
            </div>
          </div>
        </div>

        <!-- Static layer. Visible when image layers exist for this view. Always renders at its
             own stored offset so toggling Spine/Static doesn't shift the ghost. -->
        <div v-if="hasStaticForActiveView" class="character-doll-wrapper art-draggable"
          :class="{ ghost: showPreviewToggle && effectivePreviewMode !== 'static' }" :style="{
            zIndex: effectivePreviewMode === 'static' ? 2 : 1,
            transform: `translate(${staticDisplayOffset.dx}cqh, ${staticDisplayOffset.dy}cqh) scale(${staticDisplayOffset.scale})`,
          }" @mousedown="effectivePreviewMode === 'static' ? handleArtMouseDown($event) : null">
          <div class="character-doll">
            <img v-for="(image, index) in imageLayers" :key="index" :src="image" class="character-doll-image"
              @error="($event.target as HTMLImageElement).style.display = 'none'"
              @load="index === 0 ? updateRenderedHeight() : null" />

            <div v-if="isDefaultView && effectivePreviewMode === 'static'" class="face-selector-rect" :style="rectStyle"
              @mousedown.stop="handleMouseDown">
              <div class="rect-label">FACE</div>
            </div>
          </div>
        </div>
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
  overflow: hidden;
  background-color: #fafafa;
  border: 1px solid #ddd;
  border-radius: 4px;
  position: relative;
  container-type: size;
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


/* Matches game's CharacterTab's column: 50cqh wide, doll centered (so the body lands
   in the column center when art_dx = 0). The doll overflows symmetrically by 25cqh
   on each side. The wrapper itself is centered in the preview-container so both
   the column boundaries and the doll's full extent stay visible (in-game the
   column sits at the page's left edge, but in the editor we want the dev to see
   the entire doll while tuning). */
.character-doll-wrapper {
  position: absolute;
  top: 0;
  left: calc(50% - 25cqh);
  width: 50cqh;
  height: 100%;
  transform-origin: 50% 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.character-doll-wrapper.art-draggable {
  cursor: grab;
}

.character-doll-wrapper.art-draggable:active {
  cursor: grabbing;
}

/* Three dashed lines mark the in-game character-sheet column: outer two are the
   left/right edges of the 50cqh column; the middle line is the column's center
   (where the body should land for art_dx = 0). The middle uses a brighter accent
   so it reads as a different reference (centering aid) from the outer bounds. */
.sheet-boundary {
  position: absolute;
  top: 0;
  height: 100%;
  border-left: 2px dashed rgba(0, 0, 0, 0.15);
  pointer-events: none;
  z-index: 1;
}

.sheet-boundary.left {
  left: calc(50% - 25cqh);
}

.sheet-boundary.middle {
  left: 50%;
  border-left-style: dashed;
  border-left-color: rgba(255, 120, 0, 0.95);
  border-left-width: 3px;
}

.sheet-boundary.right {
  left: calc(50% + 25cqh);
}

/* Match game's CharacterDollStatic: 1:1 box + object-fit: contain so non-square
   images letterbox inside a 1:1 frame. Without this, the editor renders the doll at
   the image's natural aspect (e.g. 2:3) and the in-game render (1:1 letterboxed)
   appears shifted relative to the editor preview. */
.character-doll {
  position: relative;
  display: inline-block;
  height: 100cqh;
  aspect-ratio: 1 / 1;
  border: 1px solid rgb(255, 183, 0);
}

.character-doll-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
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
  height: 100cqh;
  aspect-ratio: v-bind("CHARACTER_VIEWPORT_ASPECT_RATIO");
}

/* Custom 2-button segmented toggle for Spine/Static preview mode */
.spine-static-toggle {
  display: flex;
  gap: 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  overflow: hidden;
}

.spine-static-toggle button {
  flex: 1;
  padding: 0.4rem 0.75rem;
  background: #fff;
  color: #555;
  border: none;
  border-right: 1px solid #ccc;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.spine-static-toggle button:last-child {
  border-right: none;
}

.spine-static-toggle button:hover:not(.active) {
  background: #f3f3f3;
}

.spine-static-toggle button.active {
  background: #2196F3;
  color: #fff;
  cursor: default;
}

/* Ghosted (inactive) layer when both spine and static render together */
.character-doll-wrapper.ghost {
  opacity: 0.3;
  pointer-events: none;
}
</style>
