<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue';
import { useStorage } from '@vueuse/core';
import { Editor } from '../../editor';
import type { EditorCustomPopupProps } from '../../editor';
import { loadCharacterImages } from '../../../shared/utils/characterImageLoader';
import { spineRenderer, type SpineStats } from '../../../game/utils/spineRenderer';
import { applyTrackMap, buildEditorSpineTrackMapFromLayers, buildEditorSpineSkinsFromLayers } from '../../../game/utils/spineAnimationGroups';
import { getSpineCharacterScale, CHARACTER_VIEWPORT_ASPECT_RATIO, SPINE_REFERENCE_HEIGHT, SPINE_REFERENCE_WIDTH, SPINE_VIEWPORT_PAD_Y } from '../../../game/utils/characterReference';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import type { EntityAttributeObject } from '../../../schemas/entityAttributeSchema';
import Slider from 'primevue/slider';
import Select from 'primevue/select';
import SelectButton from 'primevue/selectbutton';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import ToggleSwitch from 'primevue/toggleswitch';
import FileInput from '../dform/FileInput.vue';
import SpineStatsPanel from './SpineStatsPanel.vue';

/** One per-view entry of a `spine` or `static_art` array. */
interface ViewArtEntry {
  uid?: string;
  id?: string;
  view?: string;
  atlas?: string;
  skeleton?: string;
  art_dx?: number;
  art_dy?: number;
  art_scale?: number;
}

/** The fields of a character_skin_layers entry the manager reads. */
interface SkinLayerRecord {
  id: string;
  type?: 'static' | 'spine';
  view?: string;
  z_index?: number;
  attributes?: string[];
  images?: Record<string, string>;
  spine_animations?: Record<string, string>;
  spine_skins?: Record<string, string>;
  tags?: string[];
}

/** A skin layer as listed in the Layers tab, resolved against the current attributes. */
interface LayerRow {
  id: string;
  type: 'static' | 'spine';
  view: string;
  zIndex: number;
  attributes: string[];
  tags: string[];
  selected: boolean;
  /** Listed by the core game while a mod is edited – mods can only add layers, never remove. */
  locked: boolean;
  /** Listed by the preview character – rendered, but not part of this entry. */
  hosted: boolean;
  inView: boolean;
  /** Combo key the layer resolves to with the current attribute values. */
  key: string;
  resolved: boolean;
  missingAttrs: string[];
  keyCount: number;
}

/** A character attribute as listed in the Attributes tab. */
interface AttributeRow {
  id: string;
  values: string[];
  value: string | undefined;
  coreValue: string | undefined;
  /** Watched by at least one of the selected skin layers. */
  used: boolean;
  /** The current value is not one of the attribute's declared values. */
  stale: boolean;
  /** The preview character's template value. */
  hostValue: string | undefined;
  /** The character's own value in the preview – the template's, or a preview-only change of it. */
  previewValue: string | undefined;
  /** previewValue is a preview-only change, not the template's value. */
  previewed: boolean;
}

type ArtTab = 'layers' | 'attributes' | 'spine' | 'face' | 'offset';

const props = defineProps<EditorCustomPopupProps>();
const emit = defineEmits<{
  'update:item': [item: any];
  'request-save-jump': [payload: { mainTab: string; subTab: string; entityId: string }];
}>();

const editor = Editor.getInstance();

// Local copy for editing (deep clone to avoid reactivity loops)
const localItem = ref(JSON.parse(JSON.stringify(props.item)));

// Core item reference (from parent)
const coreItem = ref(props.coreItem);

// Subtabs where the character-appearance override is nested under `.status`
// (applied-status shape) rather than at the entity top level.
const NESTED_ART_ROOT_SUBTABS = ['item_templates', 'skill_slots'];
const artRootNested = NESTED_ART_ROOT_SUBTABS.includes(props.subtabId);
const isCharacterTemplate = props.subtabId === 'character_templates';

// Art root: the entity itself, or its `.status` for items/skill slots. `create` only on a
// write — opening the popup must leave the item untouched, or the popup wrapper reads the
// added `status: {}` as an unsaved edit. Reads of a missing block get a detached empty object.
function ensureArtRoot(base: any, create = false): any {
  if (!base) return base;
  if (!artRootNested) return base;
  if (!base.status && create) base.status = {};
  return base.status ?? {};
}

function writableArtRoot(): any {
  return ensureArtRoot(localItem.value, true);
}

// Reactive views: everything that reads/writes the override fields (traits,
// spine, skin_layers, attributes) goes through these instead of localItem/coreItem
// directly, so items/skill-slots edit `.status.*` while characters/statuses edit top level.
const artLocal = computed(() => ensureArtRoot(localItem.value));
const artCore = computed(() => coreItem.value ? (artRootNested ? coreItem.value.status : coreItem.value) : undefined);

// Preview character: statuses, items and skill slots only resolve their art once applied over a
// character, so the preview can merge the entry onto a chosen template. Preview-only – kept in this
// browser, one pick shared by every non-character entry, never written to the entry.
const previewHostId = useStorage<string | null>('facepicker_previewCharacter', null);
const characterTemplates = ref<any[]>([]);
const previewHost = computed<any | null>(() => {
  if (isCharacterTemplate || !previewHostId.value) return null;
  return characterTemplates.value.find((template) => template.id === previewHostId.value) ?? null;
});

// The character's own attribute values as setAttribute() would change them at runtime. Popup-session only.
const previewAttributes = ref<Record<string, string>>({});
const hostAttributes = computed<Record<string, any>>(() =>
  previewHost.value ? { ...(previewHost.value.attributes || {}), ...previewAttributes.value } : {});

// What the preview renders. Mirrors Character.reevaluate(): the template is the core status and the
// entry is applied over it – layers accumulate, the entry's attributes win.
const renderArt = computed<any>(() => {
  const own = artLocal.value || {};
  const host = previewHost.value;
  if (!host) return own;
  return {
    skin_layers: [...new Set([...(host.skin_layers || []), ...(own.skin_layers || [])])],
    attributes: { ...hostAttributes.value, ...(own.attributes || {}) },
  };
});
const renderAttributes = computed<Record<string, any>>(() => renderArt.value?.attributes || {});

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

// Loaded editor data (merged core + mod + plugin data)
const skinLayersData = ref<SkinLayerRecord[]>([]);
const attributesData = ref<EntityAttributeObject[]>([]);

// Active control tab. Persisted so the dev lands on the tab they were using last time.
const tabOptions: { label: string; value: ArtTab }[] = [
  { label: 'Layers', value: 'layers' },
  { label: 'Attributes', value: 'attributes' },
  { label: 'Spine', value: 'spine' },
  { label: 'Face', value: 'face' },
  { label: 'Offset', value: 'offset' },
];
const activeTab = useStorage<ArtTab>('facepicker_activeTab', 'layers');
// A stale or hand-edited stored value must not leave the panel empty.
if (!tabOptions.some((tab) => tab.value === activeTab.value)) activeTab.value = 'layers';

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
function normalizeView(view: any): string {
  return !view || view === '_default' ? DEFAULT_VIEW : String(view);
}
function viewMatches(entryView: any, target: string): boolean {
  return normalizeView(entryView) === normalizeView(target);
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
  return loadCharacterImages(renderArt.value, skinLayersData.value as any, selectedView.value);
});

// Layer-driven spine track map. Single source of truth for which animations
// play — recomputes whenever skin_layers / skinLayersData / attributes / view
// change. On reopen the spine atlas can resolve faster than `skinLayersData`
// loads, so the watcher below is what catches that case (init may apply an
// empty map first; this re-applies once data lands).
const spineTrackMap = computed(() => buildEditorSpineTrackMapFromLayers(
  renderArt.value?.skin_layers,
  skinLayersData.value,
  renderAttributes.value,
  selectedView.value,
));

// Layer-driven spine skins — same reopen-race protection via the watcher
// below; layers from spine-type entries with spine_skins contribute names.
const spineSkins = computed(() => buildEditorSpineSkinsFromLayers(
  renderArt.value?.skin_layers,
  skinLayersData.value,
  renderAttributes.value,
  selectedView.value,
));

// Dev-forced preview overrides, toggled by clicking chips in SpineStatsPanel.
// Popup-session only. Forced animations are folded into the applied track map
// on high track indices, so applyTrackMap's clearing loop fades them out on
// release — no manual track bookkeeping.
const forcedAnimations = ref<Set<string>>(new Set());
const forcedSkins = ref<Set<string>>(new Set());
const FORCED_TRACK_BASE = 100;

const activeAnimationNames = computed(() => [...spineTrackMap.value.values()]);

const effectiveTrackMap = computed(() => {
  const map = new Map(spineTrackMap.value);
  let i = 0;
  for (const name of forcedAnimations.value) {
    map.set(FORCED_TRACK_BASE + i++, name);
  }
  return map;
});

const effectiveSkins = computed(() => [...new Set([...spineSkins.value, ...forcedSkins.value])]);

function toggleForcedAnimation(name: string) {
  if (forcedAnimations.value.has(name)) forcedAnimations.value.delete(name);
  else forcedAnimations.value.add(name);
}

function toggleForcedSkin(name: string) {
  if (forcedSkins.value.has(name)) forcedSkins.value.delete(name);
  else forcedSkins.value.add(name);
}

// Initialize local values from item.traits
onMounted(() => {
  initializeLocalValues();
  loadCharacterSkinLayers();
  loadCharacterAttributes();
  loadCharacterViews();
  if (!isCharacterTemplate) loadCharacterTemplates();
});

function initializeLocalValues() {
  // Skip if already initialized to prevent infinite loops
  if (isInitialized.value) return;
  holdSliderWrites();

  // Only the mod-over-core merge below writes, and only on a mod entry whose core counterpart
  // carries layers or attributes: the Layers and Attributes tabs edit the whole list, and a mod
  // entry replaces its core entry's list rather than adding to it.
  const local = !!(artCore.value?.skin_layers || artCore.value?.attributes) ? writableArtRoot() : ensureArtRoot(localItem.value);
  const core = artCore.value;

  // Merge skin_layers: combine core and mod layers
  if (core?.skin_layers) {
    const coreLayers = core.skin_layers || [];
    const modLayers = local.skin_layers || [];

    // Use Set to merge unique layers, preserving mod order first, then adding missing core layers
    const mergedLayers = [...new Set([...modLayers, ...coreLayers])];
    local.skin_layers = mergedLayers;
  }

  // Merge attributes: core attributes as defaults, mod attributes override
  if (core?.attributes) {
    local.attributes = {
      ...core.attributes,
      ...(local.attributes || {})
    };
  }

  loadFaceValues();
  loadArtOffsetForView();

  initializeSpineRefs();

  isInitialized.value = true;
}

// ──────────────────────────────────────────────────────────────────────────
// Spine ↔ Static preview toggle (visible only when both exist for the view)
// ──────────────────────────────────────────────────────────────────────────

// Persisted globally so the dev's preference carries across characters/sessions.
const storedPreviewMode = useStorage<'spine' | 'static'>('facepicker_previewMode', 'spine');

const hasOwnSpineForActiveView = computed(() =>
  !!findViewEntry(artLocal.value.spine, selectedView.value)?.skeleton
  || !!findViewEntry(artCore.value?.spine, selectedView.value)?.skeleton
);
const hasSpineForActiveView = computed(() =>
  hasOwnSpineForActiveView.value || !!findViewEntry(previewHost.value?.spine, selectedView.value)?.skeleton
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
  return resolveViewOffset('spine', selectedView.value);
});

const staticDisplayOffset = computed(() => {
  if (effectivePreviewMode.value === 'static') {
    return { dx: localArtDx.value, dy: localArtDy.value, scale: localArtScale.value };
  }
  return resolveViewOffset('static_art', selectedView.value);
});

type ArtArrayKey = 'spine' | 'static_art';

function ownViewEntry(arrKey: ArtArrayKey, view: string): ViewArtEntry | null {
  return findViewEntry(artLocal.value?.[arrKey], view) || findViewEntry(artCore.value?.[arrKey], view);
}

// The entry's own view entry wins field by field over the preview character's, like the runtime's
// per-view partial override. No cross-view fallback – a view nobody sets is neutral (0/0/1).
function resolveViewOffset(arrKey: ArtArrayKey, view: string, own: ViewArtEntry | null = ownViewEntry(arrKey, view)) {
  const host = findViewEntry(previewHost.value?.[arrKey], view);
  const pick = (field: 'art_dx' | 'art_dy' | 'art_scale', fallback: number): number => {
    const ownValue = own?.[field];
    if (typeof ownValue === 'number') return ownValue;
    const hostValue = host?.[field];
    return typeof hostValue === 'number' ? hostValue : fallback;
  };
  return { dx: pick('art_dx', 0), dy: pick('art_dy', 0), scale: pick('art_scale', 1) };
}

// A status only registers a spine entry that carries atlas + skeleton (Status.setValues), so it
// cannot offset a spine it borrows from the character – the offset belongs to the template.
const offsetLocked = computed(() => effectivePreviewMode.value === 'spine' && !hasOwnSpineForActiveView.value);

// Read art offset for the effective mode ('spine' → the spine entry, 'static' → the static_art
// entry) and selected view, falling back to the preview character's.
// Loading values INTO the sliders (open, view switch, spine/static toggle, a prop sync) fires
// their watcher like a drag would. Without this hold it writes face-crop defaults and an empty
// static_art array into an item the dev only looked at.
let sliderWritesHeld = false;
function holdSliderWrites() {
  sliderWritesHeld = true;
  nextTick(() => { sliderWritesHeld = false; });
}

function loadArtOffsetForView() {
  holdSliderWrites();
  const offset = resolveViewOffset(effectivePreviewMode.value === 'spine' ? 'spine' : 'static_art', selectedView.value);
  localArtDx.value = offset.dx;
  localArtDy.value = offset.dy;
  localArtScale.value = offset.scale;
}

function loadFaceValues() {
  holdSliderWrites();
  const own = artLocal.value?.traits;
  const core = artCore.value?.traits;
  const host = previewHost.value?.traits;
  localX.value = own?.face_shift_x ?? core?.face_shift_x ?? host?.face_shift_x ?? 50;
  localY.value = own?.face_shift_y ?? core?.face_shift_y ?? host?.face_shift_y ?? 50;
  localScale.value = own?.face_shift_scale ?? core?.face_shift_scale ?? host?.face_shift_scale ?? 1;
}

function findViewEntry(viewArray: any, view: string): ViewArtEntry | null {
  if (!Array.isArray(viewArray)) return null;
  return viewArray.find((s: ViewArtEntry) => viewMatches(s.view, view)) || null;
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

// Hands the wrapper a snapshot, never localItem itself: if the wrapper held our own
// object, every later local mutation would re-enter the deep prop watcher above
// un-suppressed and re-clone the item mid-edit.
function commit() {
  suppressNextPropSync = true;
  emit('update:item', JSON.parse(JSON.stringify(localItem.value)));
}

// A character template writes its face crop with every slider change: the runtime reads a missing
// face_shift as 0, not the 50 the sliders start at. Any other entry writes it only when a face
// slider moves – a copied crop would pin the character's own while the entry is applied.
watch([localX, localY, localScale], () => {
  if (sliderWritesHeld) return;
  writeFaceTraits();
  commit();
});

watch([localArtDx, localArtDy, localArtScale], () => {
  if (sliderWritesHeld) return;
  if (isCharacterTemplate) writeFaceTraits();
  writeArtOffset();
  commit();
});

function writeFaceTraits() {
  const traits = ensureTraits();
  traits.face_shift_x = localX.value;
  traits.face_shift_y = localY.value;
  traits.face_shift_scale = localScale.value;
}

// Art offset target follows the effective preview mode: the spine entry or
// the static_art entry for the active view — find-or-create either way.
function writeArtOffset() {
  if (offsetLocked.value) return;
  const arrKey: ArtArrayKey = effectivePreviewMode.value === 'spine' ? 'spine' : 'static_art';
  let entry = findViewEntry(artLocal.value?.[arrKey], selectedView.value);
  if (!entry) {
    // Merely looking at a view reloads the sliders with what it inherits (neutral, the core game's
    // or the preview character's offset) – that must not leave a copy behind in this entry.
    const inherited = resolveViewOffset(arrKey, selectedView.value, findViewEntry(artCore.value?.[arrKey], selectedView.value));
    const unchanged = localArtDx.value === inherited.dx && localArtDy.value === inherited.dy
      && localArtScale.value === inherited.scale;
    if (arrKey === 'static_art' && unchanged) return;
    const root = writableArtRoot();
    entry = { uid: editor.createUid(), view: selectedView.value === DEFAULT_VIEW ? '_default' : selectedView.value };
    if (!Array.isArray(root[arrKey])) root[arrKey] = [];
    (root[arrKey] as ViewArtEntry[]).push(entry);
  }
  entry.art_dx = localArtDx.value;
  entry.art_dy = localArtDy.value;
  entry.art_scale = localArtScale.value;
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

// Attribute definitions drive the Attributes tab's dropdowns. Sorted the way the
// Attributes editor tab sorts them (order asc, then id) so both screens agree.
async function loadCharacterAttributes() {
  try {
    const data = await editor.loadFullData('character_attributes');
    if (data && Array.isArray(data)) {
      attributesData.value = [...data].sort((a, b) =>
        ((a.order ?? 0) - (b.order ?? 0)) || String(a.id).localeCompare(String(b.id)));
    }
  } catch (error) {
    console.error('Failed to load character_attributes:', error);
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

// Preview character options. A stored id whose template is gone falls back to none.
async function loadCharacterTemplates() {
  try {
    const data = await editor.loadFullData('character_templates');
    if (data && Array.isArray(data)) {
      characterTemplates.value = [...data].sort((a, b) => String(a.id).localeCompare(String(b.id)));
      if (previewHostId.value && !characterTemplates.value.some((template) => template.id === previewHostId.value)) {
        previewHostId.value = null;
      }
    }
  } catch (error) {
    console.error('Failed to load character_templates:', error);
  }
}

const hostOptions = computed(() => characterTemplates.value.map((template) => ({ id: template.id })));

// Picking (or loading) a preview character changes what every inherited slider and the spine resolve to.
watch(previewHost, () => {
  if (!isInitialized.value) return;
  loadFaceValues();
  loadArtOffsetForView();
  refreshSpine();
});

// ──────────────────────────────────────────────────────────────────────────
// Layers tab
// ──────────────────────────────────────────────────────────────────────────

const layerSearch = ref('');
const layerPrefs = useStorage('facepicker_layerPrefs', { selectedOnly: false, allViews: false });

// Mirrors loadCharacterImages: an unset attribute contributes no key segment.
function staticKeyFor(layer: SkinLayerRecord, attributes: Record<string, any>): string {
  const parts = [layer.id];
  for (const attr of layer.attributes || []) {
    const value = attributes[attr];
    if (value) parts.push(value);
  }
  return parts.join('_');
}

// Mirrors buildEditorSpineTrackMapFromLayers: an unset attribute leaves an empty segment.
function spineKeyFor(layer: SkinLayerRecord, attributes: Record<string, any>): string {
  let key = layer.id;
  for (const attr of layer.attributes || []) key += '_' + (attributes[attr] ?? '');
  return key;
}

const layerRows = computed<LayerRow[]>(() => {
  const selected = new Set<string>(artLocal.value?.skin_layers || []);
  const locked = new Set<string>(artCore.value?.skin_layers || []);
  const hosted = new Set<string>(previewHost.value?.skin_layers || []);
  const attributes = renderAttributes.value;
  const target = normalizeView(selectedView.value);
  const rows = skinLayersData.value.map((layer): LayerRow => {
    const isSpine = layer.type === 'spine';
    const table: Record<string, string> = isSpine
      ? { ...(layer.spine_animations || {}), ...(layer.spine_skins || {}) }
      : (layer.images || {});
    const key = isSpine ? spineKeyFor(layer, attributes) : staticKeyFor(layer, attributes);
    const attrs = Array.isArray(layer.attributes) ? layer.attributes : [];
    const view = normalizeView(layer.view);
    return {
      id: layer.id,
      type: isSpine ? 'spine' : 'static',
      view,
      zIndex: layer.z_index ?? 0,
      attributes: attrs,
      tags: Array.isArray(layer.tags) ? layer.tags : [],
      selected: selected.has(layer.id),
      locked: locked.has(layer.id),
      hosted: hosted.has(layer.id),
      inView: view === target,
      key,
      resolved: !!table[key],
      missingAttrs: attrs.filter((attr) => !attributes[attr]),
      keyCount: Object.keys(table).length,
    };
  });
  return rows.sort((a, b) => (a.zIndex - b.zIndex) || a.id.localeCompare(b.id));
});

const visibleLayerRows = computed(() => {
  const query = layerSearch.value.trim().toLowerCase();
  return layerRows.value.filter((row) => {
    if (!layerPrefs.value.allViews && !row.inView) return false;
    if (layerPrefs.value.selectedOnly && !row.selected && !row.hosted) return false;
    if (query && !row.id.toLowerCase().includes(query) && !row.tags.some((tag) => tag.toLowerCase().includes(query))) return false;
    return true;
  });
});

// The entry's own layers come first so they are never buried under every other character's
// layers, then the preview character's; every group keeps render (z) order.
const layerGroups = computed(() => [
  { key: 'on', label: isCharacterTemplate ? 'On this character' : 'On this entry',
    rows: visibleLayerRows.value.filter((row) => row.selected) },
  { key: 'host', label: `From ${previewHost.value?.id} (preview)`,
    rows: visibleLayerRows.value.filter((row) => !row.selected && row.hosted) },
  { key: 'off', label: 'Other layers',
    rows: visibleLayerRows.value.filter((row) => !row.selected && !row.hosted) },
].filter((group) => group.rows.length > 0));

const selectedLayerCount = computed(() => layerRows.value.filter((row) => row.selected).length);
const hostedOnlyLayerCount = computed(() => layerRows.value.filter((row) => row.hosted && !row.selected).length);
// The entry's own layers only: the preview character's are not fixable from here, and several resolve
// to nothing by design (an empty weapon slot).
const unresolvedSelectedCount = computed(() => layerRows.value.filter((row) => row.selected && !row.resolved).length);

// Ids the character lists that no skin layer defines (deleted or renamed layer).
const unknownLayerIds = computed<string[]>(() => {
  if (skinLayersData.value.length === 0) return [];
  const known = new Set(skinLayersData.value.map((layer) => layer.id));
  return ((artLocal.value?.skin_layers || []) as string[]).filter((id) => !known.has(id));
});

function layerStatusTitle(row: LayerRow): string {
  const source = row.type === 'spine' ? 'spine_animations / spine_skins' : 'images';
  if (row.resolved) return `Resolves to ${source}["${row.key}"].`;
  if (row.missingAttrs.length) {
    const who = isCharacterTemplate ? 'the character has' : previewHost.value ? 'neither this entry nor the preview character has' : 'this entry has';
    return `No ${source} entry for "${row.key}" – ${who} no value for: ${row.missingAttrs.join(', ')}. Set it in the Attributes tab.`;
  }
  return `No ${source} entry for "${row.key}" (${row.keyCount} keys defined). Open the layer to add it, or change the attribute value.`;
}

function toggleLayer(row: LayerRow) {
  if (row.locked) return;
  const root = writableArtRoot();
  if (!Array.isArray(root.skin_layers)) root.skin_layers = [];
  const list = root.skin_layers as string[];
  const idx = list.indexOf(row.id);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(row.id);
  commit();
}

function removeLayerId(id: string) {
  const list = artLocal.value?.skin_layers;
  if (!Array.isArray(list)) return;
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
  commit();
}

// Save the popup and open the layer in the Skin Layers tab (CustomPopupWrapper handles both).
function jumpToLayer(id: string) {
  emit('request-save-jump', { mainTab: 'characters', subTab: 'character_skin_layers', entityId: id });
}

// ──────────────────────────────────────────────────────────────────────────
// Attributes tab
// ──────────────────────────────────────────────────────────────────────────

const attrPrefs = useStorage('facepicker_attrPrefs', { showUnused: false });

// Attributes watched by any selected layer, across every view — the dropdowns a
// dev actually needs for this character.
const usedAttributeIds = computed(() => {
  const selected = new Set<string>(renderArt.value?.skin_layers || []);
  const used = new Set<string>();
  for (const layer of skinLayersData.value) {
    if (!selected.has(layer.id)) continue;
    for (const attr of layer.attributes || []) used.add(attr);
  }
  return used;
});

const attributeRows = computed<AttributeRow[]>(() => {
  const local: Record<string, any> = artLocal.value?.attributes || {};
  const core: Record<string, any> = artCore.value?.attributes || {};
  const host: Record<string, any> = previewHost.value?.attributes || {};
  const rows = attributesData.value.map((attr): AttributeRow => {
    const values = Array.isArray(attr.values) ? attr.values : [];
    const value = local[attr.id];
    return {
      id: attr.id,
      values,
      value,
      coreValue: core[attr.id],
      used: usedAttributeIds.value.has(attr.id),
      stale: value !== undefined && value !== null && !values.includes(value),
      hostValue: host[attr.id],
      previewValue: hostAttributes.value[attr.id],
      previewed: attr.id in previewAttributes.value,
    };
  });
  // Stable sort keeps the order/id ordering inside each group.
  return rows.sort((a, b) => Number(b.used) - Number(a.used));
});

const visibleAttributeRows = computed(() =>
  attrPrefs.value.showUnused ? attributeRows.value : attributeRows.value.filter((row) => row.used));

const unusedAttributeCount = computed(() => attributeRows.value.filter((row) => !row.used).length);

// Attribute keys set on the character that no attribute definition declares.
const unknownAttributeIds = computed<string[]>(() => {
  if (attributesData.value.length === 0) return [];
  const known = new Set(attributesData.value.map((attr) => attr.id));
  return Object.keys(artLocal.value?.attributes || {}).filter((id) => !known.has(id));
});

function attributeOptions(row: AttributeRow): { label: string; value: string }[] {
  const options = row.values.map((value) => ({ label: value, value }));
  // Keep a stale value selectable so the dropdown shows what is actually stored.
  if (row.stale && row.value !== undefined) options.unshift({ label: `${row.value} (not in values)`, value: row.value });
  return options;
}

function setAttribute(id: string, value: string | null | undefined) {
  const root = writableArtRoot();
  if (!root.attributes) root.attributes = {};
  if (value === null || value === undefined || value === '') delete root.attributes[id];
  else root.attributes[id] = value;
  commit();
}

function isPinned(row: AttributeRow): boolean {
  return row.value !== undefined && row.value !== null;
}

function pinTitle(row: AttributeRow): string {
  return `This entry sets ${row.id}, so it replaces the character's own value while applied – `
    + `setAttribute('${row.id}') on the character changes nothing you can see until the entry is removed.`;
}

// Clearing (or picking the template's value again) drops the preview change.
function setPreviewAttribute(id: string, value: string | null | undefined) {
  const next = { ...previewAttributes.value };
  if (value === null || value === undefined || value === '' || value === previewHost.value?.attributes?.[id]) delete next[id];
  else next[id] = value;
  previewAttributes.value = next;
}

function previewAttributeOptions(row: AttributeRow): { label: string; value: string }[] {
  const options = row.values.map((value) => ({ label: value, value }));
  if (row.previewValue !== undefined && !row.values.includes(row.previewValue)) {
    options.unshift({ label: `${row.previewValue} (not in values)`, value: row.previewValue });
  }
  return options;
}

// ──────────────────────────────────────────────────────────────────────────
// Spine tab
// ──────────────────────────────────────────────────────────────────────────

const localSpineEntry = computed<ViewArtEntry | null>(() => findViewEntry(artLocal.value?.spine, selectedView.value));
const coreSpineEntry = computed<ViewArtEntry | null>(() => findViewEntry(artCore.value?.spine, selectedView.value));

function addSpineEntry() {
  const root = writableArtRoot();
  if (!Array.isArray(root.spine)) root.spine = [];
  const base = coreSpineEntry.value;
  const entry: ViewArtEntry = {
    uid: editor.createUid(),
    id: base?.id || (isDefaultView.value ? 'default' : selectedView.value),
    view: selectedView.value,
    atlas: base?.atlas || '',
    skeleton: base?.skeleton || '',
    art_dx: base?.art_dx ?? 0,
    art_dy: base?.art_dy ?? 0,
    art_scale: base?.art_scale ?? 1,
  };
  (root.spine as ViewArtEntry[]).push(entry);
  commit();
  refreshSpine();
}

function removeSpineEntry() {
  const arr = artLocal.value?.spine;
  if (!Array.isArray(arr)) return;
  const idx = arr.findIndex((s: ViewArtEntry) => viewMatches(s.view, selectedView.value));
  if (idx >= 0) arr.splice(idx, 1);
  commit();
  refreshSpine();
}

function setSpineId(value: string | undefined) {
  const entry = localSpineEntry.value;
  if (!entry) return;
  entry.id = value ?? '';
  commit();
}

function setSpineFile(field: 'atlas' | 'skeleton', value: string | string[] | null | undefined) {
  const entry = localSpineEntry.value;
  if (!entry) return;
  entry[field] = typeof value === 'string' ? value : '';
  commit();
  refreshSpine();
}

// Re-resolve the atlas/skeleton for the active view and rebuild (or drop) the
// preview player. The container is v-if'd on hasSpineForActiveView, so a freshly
// completed entry needs a tick before the ref is bound.
async function refreshSpine() {
  forcedAnimations.value.clear();
  forcedSkins.value.clear();
  initializeSpineRefs();
  if (!spineAtlasRef.value || !spineSkeletonRef.value) {
    disposeSpinePlayer();
    return;
  }
  await nextTick();
  if (!spineContainerRef.value) await nextTick();
  if (spineContainerRef.value) initSpinePlayer();
}

// ──────────────────────────────────────────────────────────────────────────
// Face tab
// ──────────────────────────────────────────────────────────────────────────

const faceStaticValue = computed<string | null>(() =>
  artLocal.value?.traits?.face_static ?? artCore.value?.traits?.face_static ?? null);
const faceStaticPrecedence = computed<boolean>(() =>
  (artLocal.value?.traits?.face_static_precedence ?? artCore.value?.traits?.face_static_precedence) === true);

function ensureTraits(): Record<string, any> {
  const root = writableArtRoot();
  if (!root.traits) root.traits = {};
  return root.traits;
}

function setFaceStatic(value: string | string[] | null | undefined) {
  const traits = ensureTraits();
  if (typeof value === 'string' && value) traits.face_static = value;
  else delete traits.face_static;
  commit();
}

function setFaceStaticPrecedence(value: boolean) {
  ensureTraits().face_static_precedence = value;
  commit();
}

// In-game face preview. Mirrors CharacterFace: a 100px circle, the doll pinned at the
// reference size and translated by -face_shift% × scale. Static art only – the spine
// canvas cannot be duplicated, so spine characters rely on the purple FACE box.
const usesStaticFace = computed(() => !!faceStaticValue.value && faceStaticPrecedence.value);
const showFacePreview = computed(() =>
  isDefaultView.value && (usesStaticFace.value || (effectivePreviewMode.value === 'static' && hasStaticForActiveView.value)));
const facePreviewDollStyle = computed(() => ({
  width: `${SPINE_REFERENCE_WIDTH}px`,
  height: `${SPINE_REFERENCE_HEIGHT}px`,
  transform: `translate(${-localX.value * localScale.value}%, ${-localY.value * localScale.value}%) scale(${localScale.value})`,
}));

// ──────────────────────────────────────────────────────────────────────────
// Offset tab
// ──────────────────────────────────────────────────────────────────────────

function resetArtOffset() {
  localArtDx.value = 0;
  localArtDy.value = 0;
  localArtScale.value = 1;
}

const ART_SCALE_MIN = 0.1;
const ART_SCALE_MAX = 3;
const ART_SCALE_WHEEL_STEP = 0.02;

// Scroll over the active doll to scale it (the docs promise "drag to move, scroll to scale").
function handleArtWheel(event: WheelEvent) {
  if (offsetLocked.value) return;
  const direction = event.deltaY > 0 ? -1 : 1;
  const next = localArtScale.value + direction * ART_SCALE_WHEEL_STEP;
  localArtScale.value = Math.round(Math.min(ART_SCALE_MAX, Math.max(ART_SCALE_MIN, next)) * 100) / 100;
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
// / static_art entry has its own per-view art offset.
function handleArtMouseDown(event: MouseEvent) {
  if (offsetLocked.value) return;
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

function initializeSpineRefs(view: string = selectedView.value) {
  const localSpine = findViewEntry(artLocal.value.spine, view);
  const coreSpine = findViewEntry(artCore.value?.spine, view);
  const hostSpine = findViewEntry(previewHost.value?.spine, view);
  spineAtlasRef.value = localSpine?.atlas || coreSpine?.atlas || hostSpine?.atlas || null;
  spineSkeletonRef.value = localSpine?.skeleton || coreSpine?.skeleton || hostSpine?.skeleton || null;
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

    // Don't pass artDx/artDy here — in the popup the offset is applied as a CSS
    // transform on the orange `.character-doll` wrapper instead, so the orange
    // bounds visually follow the character. The renderer's canvas stays centered.
    const spine = await spineRenderer.register(spineSlotId, spineContainerRef.value, {
      skeletonUrl: spineSkeletonRef.value,
      atlasUrl: spineAtlasRef.value,
      artScale: spineDisplayOffset.value.scale,
      gameScale: getSpineCharacterScale(selectedView.value, editor.getMergedManifest()),
      padY: SPINE_VIEWPORT_PAD_Y,
    });

    if (!spine) return;
    spineInstance = spine;
    spineStats.value = spineRenderer.getStats(spine);

    // Apply skins (layer-driven + forced; mirrors Character.getSpineSkinsForView).
    if (effectiveSkins.value.length > 0) {
      spineRenderer.applySkins(spine, effectiveSkins.value);
    }

    applyTrackMap(spine, effectiveTrackMap.value);

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
  forcedAnimations.value.clear();
  forcedSkins.value.clear();
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

// Re-apply track map whenever its inputs change — covers attribute changes,
// forced-chip toggles, AND the reopen race where init runs before
// skinLayersData has finished loading from disk (init applies an empty map;
// this catches up once data lands).
watch(effectiveTrackMap, (map) => {
  if (spineInstance) applyTrackMap(spineInstance, map);
});

// Re-apply skins on the same race-safe pattern. applySkins() no-ops on an
// empty list, so releasing the last forced skin clears the skeleton explicitly.
watch(effectiveSkins, (skins) => {
  if (!spineInstance) return;
  if (skins.length > 0) {
    spineRenderer.applySkins(spineInstance, skins);
  } else {
    spineInstance.skeleton.setSkin(null);
    spineInstance.skeleton.setSlotsToSetupPose();
  }
});

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
  if (!isCharacterTemplate) return;
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

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <div class="face-picker-popup">
    <div class="picker-header">
      <h3>Art Manager</h3>
      <p class="hint">Layers, attributes, spine files, the face and the art offset for the selected view – all
        edited here, previewed live. Drag the doll to move it, scroll over it to scale it; the orange middle line
        marks the column's center. Drag the purple FACE box to position the face crop.</p>
    </div>

    <div class="picker-content">
      <!-- Controls -->
      <div class="controls">
        <div class="controls-top">
          <div class="control-row">
            <div v-if="characterViews.length > 0" class="control-group grow">
              <label>View</label>
              <Select v-model="selectedView" :options="viewOptions" optionLabel="name" optionValue="id"
                class="control-select" size="small" />
            </div>
            <div v-if="showPreviewToggle" class="control-group">
              <label>Preview</label>
              <div class="spine-static-toggle">
                <button type="button" :class="{ active: effectivePreviewMode === 'spine' }"
                  @click="storedPreviewMode = 'spine'">Spine</button>
                <button type="button" :class="{ active: effectivePreviewMode === 'static' }"
                  @click="storedPreviewMode = 'static'">Static</button>
              </div>
            </div>
          </div>
          <div v-if="!isCharacterTemplate" class="control-group">
            <label title="The entry is previewed applied over this character template, as it is in the game. Preview only – remembered in this browser for every status, item and skill slot.">
              Preview on character</label>
            <Select v-model="previewHostId" :options="hostOptions" optionLabel="id" optionValue="id" showClear
              :filter="hostOptions.length > 8" placeholder="none – this entry alone" size="small"
              class="control-select" appendTo="body" />
          </div>

          <SelectButton :modelValue="activeTab" @update:modelValue="(v: ArtTab | null) => { if (v) activeTab = v; }"
            :options="tabOptions" optionLabel="label" optionValue="value" :allowEmpty="false" size="small"
            class="tab-strip" />
        </div>

        <!-- ── Layers ── -->
        <section v-if="activeTab === 'layers'" class="tab-pane layers-pane">
          <div class="pane-toolbar">
            <InputText v-model="layerSearch" placeholder="Search id or tag…" size="small" class="grow" />
            <span class="pane-count" :class="{ warn: unresolvedSelectedCount > 0 }"
              :title="unresolvedSelectedCount > 0 ? `${unresolvedSelectedCount} selected layer(s) resolve to no image or animation for the current attributes` : ''">
              {{ selectedLayerCount }} selected<template v-if="hostedOnlyLayerCount > 0"> + {{ hostedOnlyLayerCount }} from
                {{ previewHost?.id }}</template><template v-if="unresolvedSelectedCount > 0"> · {{ unresolvedSelectedCount }} unresolved</template>
            </span>
          </div>
          <div class="pane-toggles">
            <label class="toggle-label"><Checkbox v-model="layerPrefs.selectedOnly" binary /> Selected only</label>
            <label class="toggle-label"><Checkbox v-model="layerPrefs.allViews" binary /> All views</label>
          </div>

          <div v-if="unknownLayerIds.length" class="pane-warning">
            <div>Listed but not defined in Skin Layers:</div>
            <div v-for="id in unknownLayerIds" :key="id" class="pane-warning-row">
              <code>{{ id }}</code>
              <button type="button" class="tool-btn" title="Remove from this character" @click="removeLayerId(id)">✕</button>
            </div>
          </div>

          <div class="row-list">
            <template v-for="group in layerGroups" :key="group.key">
              <div v-if="layerGroups.length > 1" class="row-group-label">
                {{ group.label }} ({{ group.rows.length }})</div>
              <div v-for="row in group.rows" :key="row.id" class="layer-row"
                :class="{ selected: row.selected, hosted: row.hosted && !row.selected, locked: row.locked, unresolved: (row.selected || row.hosted) && !row.resolved }"
                @click="toggleLayer(row)">
                <span class="row-check" @click.stop>
                  <Checkbox :modelValue="row.selected" binary :disabled="row.locked"
                    @update:modelValue="toggleLayer(row)" />
                </span>
                <div class="row-main">
                  <div class="row-title">
                    <span class="row-id">{{ row.id }}</span>
                    <span class="badge" :class="row.type">{{ row.type }}</span>
                    <span v-if="row.view !== DEFAULT_VIEW" class="badge view">{{ row.view }}</span>
                    <span v-if="row.locked" class="badge core"
                      title="Listed by the core game – a mod can add layers but not remove them">core</span>
                    <span v-if="row.hosted" class="badge host"
                      :title="`Listed by the preview character ${previewHost?.id} – rendered in the preview, not saved on this entry`">{{
                      previewHost?.id }}</span>
                  </div>
                  <div class="row-sub">
                    <span class="mono">z {{ row.zIndex }}</span>
                    <span v-if="row.attributes.length" class="mono">· {{ row.attributes.join(', ') }}</span>
                    <span v-if="row.selected || row.hosted" class="row-status" :class="row.resolved ? 'ok' : 'bad'"
                      :title="layerStatusTitle(row)">{{ row.resolved ? '✓' : '✗' }} {{ row.key }}</span>
                  </div>
                </div>
                <button type="button" class="tool-btn" title="Save & open in Skin Layers"
                  @click.stop="jumpToLayer(row.id)">✎</button>
              </div>
            </template>
            <div v-if="!visibleLayerRows.length" class="empty-note">
              <template v-if="skinLayersData.length === 0">No skin layers defined yet – create them in Characters ›
                Skin Layers.</template>
              <template v-else-if="!layerPrefs.allViews">No layers for this view match. Tick <b>All views</b> to
                see every layer.</template>
              <template v-else>No layers match.</template>
            </div>
          </div>
        </section>

        <!-- ── Attributes ── -->
        <section v-else-if="activeTab === 'attributes'" class="tab-pane">
          <div class="pane-toggles">
            <label class="toggle-label"><Checkbox v-model="attrPrefs.showUnused" binary /> Show the {{
              unusedAttributeCount }} attribute(s) no selected layer watches</label>
          </div>

          <div v-if="unknownAttributeIds.length" class="pane-warning">
            <div>Set on the character but not defined in Attributes:</div>
            <div v-for="id in unknownAttributeIds" :key="id" class="pane-warning-row">
              <code>{{ id }} = {{ artLocal.attributes[id] }}</code>
              <button type="button" class="tool-btn" title="Remove from this character"
                @click="setAttribute(id, null)">✕</button>
            </div>
          </div>

          <div class="row-list attr-list">
            <div v-if="previewHost" class="attr-columns attr-columns-head">
              <span>This entry (saved)</span>
              <span title="The character's own value – what setAttribute() changes at runtime. Preview only, never saved.">
                {{ previewHost.id }} (preview)</span>
            </div>
            <div v-for="row in visibleAttributeRows" :key="row.id" class="attr-row"
              :class="{ unused: !row.used, stale: row.stale }">
              <div class="attr-head">
                <span class="row-id">{{ row.id }}</span>
                <span v-if="row.stale" class="badge bad"
                  title="The stored value is not one of the attribute's declared values – layers will not resolve">stale</span>
                <span v-if="previewHost && isPinned(row) && row.hostValue !== undefined" class="badge pin"
                  :title="pinTitle(row)">overrides {{ previewHost.id }}</span>
                <span v-if="row.coreValue !== undefined && row.coreValue !== row.value" class="core-value-indicator">
                  (core: {{ row.coreValue }})</span>
              </div>
              <div :class="{ 'attr-columns': previewHost }">
                <Select :modelValue="row.value ?? null" :options="attributeOptions(row)" optionLabel="label"
                  optionValue="value" showClear :filter="row.values.length > 8" placeholder="unset" size="small"
                  class="control-select" appendTo="body" @update:modelValue="(v: string | null) => setAttribute(row.id, v)" />
                <span v-if="previewHost" class="preview-select-wrap"
                  :title="isPinned(row) ? pinTitle(row) : row.previewed ? `Preview only – the template sets ${row.hostValue ?? 'nothing'}` : ''">
                  <Select :modelValue="row.previewValue ?? null" :options="previewAttributeOptions(row)"
                    optionLabel="label" optionValue="value" :showClear="row.previewed" :filter="row.values.length > 8"
                    placeholder="unset" size="small" class="control-select preview-select"
                    :class="{ previewed: row.previewed }" :disabled="isPinned(row)" appendTo="body"
                    @update:modelValue="(v: string | null) => setPreviewAttribute(row.id, v)" />
                </span>
              </div>
            </div>
            <div v-if="!visibleAttributeRows.length" class="empty-note">
              <template v-if="attributesData.length === 0">No attributes defined yet – create them in Characters ›
                Attributes.</template>
              <template v-else>None of the selected layers watches an attribute. Tick the box above to set one
                anyway.</template>
            </div>
          </div>
        </section>

        <!-- ── Spine ── -->
        <section v-else-if="activeTab === 'spine'" class="tab-pane">
          <div class="section-divider">Spine for <code>{{ selectedView }}</code></div>

          <template v-if="localSpineEntry">
            <div class="control-group">
              <label>Entry id</label>
              <InputText :modelValue="localSpineEntry.id" size="small" @update:modelValue="setSpineId" />
            </div>
            <FileInput :modelValue="localSpineEntry.atlas || null" fileType="atlas" label="Atlas (.atlas)"
              fieldId="fp-spine-atlas" @update:modelValue="(v) => setSpineFile('atlas', v)" />
            <FileInput :modelValue="localSpineEntry.skeleton || null" fileType="spine_skeleton"
              label="Skeleton (.json / .skel)" fieldId="fp-spine-skeleton"
              @update:modelValue="(v) => setSpineFile('skeleton', v)" />
            <p v-if="!localSpineEntry.atlas || !localSpineEntry.skeleton" class="hint">Pick both files to render
              the spine.</p>
            <Button label="Remove spine for this view" icon="pi pi-trash" severity="danger" text size="small"
              class="self-start" @click="removeSpineEntry" />
          </template>

          <template v-else-if="coreSpineEntry">
            <p class="hint">Defined by the core game:<br /><code>{{ coreSpineEntry.skeleton }}</code></p>
            <Button label="Override in this mod" icon="pi pi-copy" size="small" class="self-start"
              @click="addSpineEntry" />
          </template>

          <template v-else>
            <p class="hint">No spine for this view – its static skin layers render instead.</p>
            <Button label="Add spine for this view" icon="pi pi-plus" size="small" class="self-start"
              @click="addSpineEntry" />
          </template>

          <template v-if="isSpineCharacter">
            <div v-if="isCharacterTemplate" class="control-group">
              <div class="control-label-row">
                <label>Spine Scale (game-wide): {{ localSpineGameScale.toFixed(2) }}</label>
                <span v-if="localSpineGameScale !== initialSpineGameScale" class="core-value-indicator">
                  (saved: {{ initialSpineGameScale.toFixed(2) }})
                </span>
              </div>
              <Slider :modelValue="localSpineGameScale"
                @update:modelValue="(v) => localSpineGameScale = Array.isArray(v) ? v[0] : v" :min="0.1" :max="3"
                :step="0.01" class="control-slider" />
              <p class="hint small">Applies to every character in this view. Persists to the manifest's
                <code>spine_character_scale</code> on Save.</p>
            </div>

            <div class="section-divider">Animations &amp; skins</div>
            <p class="hint small">Green = driven by the selected layers and attributes. Click a chip to force it
              for this preview only.</p>
            <SpineStatsPanel :stats="spineStats" interactive :active-animations="activeAnimationNames"
              :forced-animations="[...forcedAnimations]" :active-skins="spineSkins" :forced-skins="[...forcedSkins]"
              @toggle-animation="toggleForcedAnimation" @toggle-skin="toggleForcedSkin" />
          </template>
        </section>

        <!-- ── Face ── -->
        <section v-else-if="activeTab === 'face'" class="tab-pane">
          <FileInput :modelValue="faceStaticValue" fileType="image" label="Static face image" fieldId="fp-face-static"
            @update:modelValue="setFaceStatic" />
          <label class="toggle-label">
            <ToggleSwitch :modelValue="faceStaticPrecedence" @update:modelValue="setFaceStaticPrecedence" />
            Prefer the static image over the crop
          </label>
          <p class="hint small">Without a static image, or with this off, the face is cropped live from the doll
            using the purple FACE box.</p>

          <template v-if="isDefaultView">
            <div class="section-divider">Face crop</div>

            <div v-if="showFacePreview" class="face-preview">
              <div class="face-preview-circle">
                <img v-if="usesStaticFace" :src="faceStaticValue!" class="face-preview-static" />
                <div v-else class="face-preview-doll" :style="facePreviewDollStyle">
                  <img v-for="(image, index) in imageLayers" :key="index" :src="image" class="face-preview-image" />
                </div>
              </div>
              <span class="hint small">In-game face</span>
            </div>

            <div class="control-group">
              <div class="control-label-row">
                <label>X Position: {{ localX.toFixed(1) }}%</label>
                <span v-if="artCore && artCore.traits && artLocal.traits?.face_shift_x === undefined"
                  class="core-value-indicator">
                  (core: {{ (artCore.traits.face_shift_x ?? 50).toFixed(1) }}%)
                </span>
              </div>
              <Slider :modelValue="localX" @update:modelValue="(v) => localX = Array.isArray(v) ? v[0] : v" :min="0"
                :max="100" :step="0.1" class="control-slider" />
            </div>

            <div class="control-group">
              <div class="control-label-row">
                <label>Y Position: {{ localY.toFixed(1) }}%</label>
                <span v-if="artCore && artCore.traits && artLocal.traits?.face_shift_y === undefined"
                  class="core-value-indicator">
                  (core: {{ (artCore.traits.face_shift_y ?? 50).toFixed(1) }}%)
                </span>
              </div>
              <Slider :modelValue="localY" @update:modelValue="(v) => localY = Array.isArray(v) ? v[0] : v" :min="0"
                :max="100" :step="0.1" class="control-slider" />
            </div>

            <div class="control-group">
              <div class="control-label-row">
                <label>Scale: {{ localScale.toFixed(2) }}</label>
                <span v-if="artCore && artCore.traits && artLocal.traits?.face_shift_scale === undefined"
                  class="core-value-indicator">
                  (core: {{ (artCore.traits.face_shift_scale ?? 1).toFixed(2) }})
                </span>
              </div>
              <Slider :modelValue="localScale" @update:modelValue="handleScaleChange" :min="0.1" :max="3" :step="0.01"
                class="control-slider" />
            </div>
          </template>
          <p v-else class="hint">The face crop is taken from the default view – switch <b>View</b> to Default to
            edit it.</p>
        </section>

        <!-- ── Offset ── -->
        <section v-else class="tab-pane">
          <div class="section-divider">
            Art offset
            <span class="hint" style="font-weight: normal; text-transform: none;">
              <template v-if="effectivePreviewMode === 'spine'">(spine entry: <code>{{ selectedView }}</code>)</template>
              <template v-else>(static_art entry: <code>{{ selectedView }}</code>)</template>
            </span>
          </div>
          <p v-if="offsetLocked" class="pane-warning">The spine comes from {{ previewHost?.id }}. A status only keeps a
            spine entry that carries its own atlas and skeleton, so this offset belongs to the template – tune it
            there.</p>
          <p v-else class="hint small">Each view and each asset (spine / static) keeps its own offset. Drag the doll
            to move it, scroll over it to scale.</p>

          <div class="control-group">
            <div class="control-label-row">
              <label>Art X Offset: {{ localArtDx.toFixed(1) }}%</label>
            </div>
            <Slider :modelValue="localArtDx" @update:modelValue="(v) => localArtDx = Array.isArray(v) ? v[0] : v"
              :min="-100" :max="100" :step="0.1" :disabled="offsetLocked" class="control-slider" />
          </div>

          <div class="control-group">
            <div class="control-label-row">
              <label>Art Y Offset: {{ localArtDy.toFixed(1) }}%</label>
            </div>
            <Slider :modelValue="localArtDy" @update:modelValue="(v) => localArtDy = Array.isArray(v) ? v[0] : v"
              :min="-100" :max="100" :step="0.1" :disabled="offsetLocked" class="control-slider" />
          </div>

          <div class="control-group">
            <div class="control-label-row">
              <label>Art Scale: {{ localArtScale.toFixed(2) }}</label>
            </div>
            <Slider :modelValue="localArtScale" @update:modelValue="(v) => localArtScale = Array.isArray(v) ? v[0] : v"
              :min="ART_SCALE_MIN" :max="ART_SCALE_MAX" :step="0.01" :disabled="offsetLocked" class="control-slider" />
          </div>

          <Button label="Reset to 0 / 0 / 1" icon="pi pi-refresh" text size="small" class="self-start"
            :disabled="offsetLocked" @click="resetArtOffset" />
        </section>
      </div>

      <!-- Preview container -->
      <div class="preview-container" ref="containerRef">
        <!-- No Layers / No Spine Message -->
        <div v-if="!hasSpineForActiveView && !hasStaticForActiveView" class="no-layers-message">
          <p class="warning-text">⚠️ Nothing renders for the <strong>{{ selectedView }}</strong> view yet.</p>
          <p class="info-text">Tick skin layers in the <a href="#" @click.prevent="activeTab = 'layers'">Layers</a>
            tab, or pick atlas and skeleton files in the <a href="#" @click.prevent="activeTab = 'spine'">Spine</a>
            tab. Layers that show ✗ need a matching value in <a href="#"
              @click.prevent="activeTab = 'attributes'">Attributes</a>.</p>
          <p v-if="!isCharacterTemplate && !previewHost" class="info-text">An entry applied over a character
            often only resolves with that character's layers and attributes – pick one under <b>Preview on
            character</b>.</p>
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
          @mousedown="effectivePreviewMode === 'spine' ? handleArtMouseDown($event) : null"
          @wheel.prevent="effectivePreviewMode === 'spine' ? handleArtWheel($event) : null">
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
          }" @mousedown="effectivePreviewMode === 'static' ? handleArtMouseDown($event) : null"
          @wheel.prevent="effectivePreviewMode === 'static' ? handleArtWheel($event) : null">
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
  gap: 0.75rem;
  height: 100%;
}

.picker-header {
  padding: 0.5rem 0.75rem;
  background-color: var(--editor-surface-sunken);
  border-radius: 4px;
  display: flex;
  align-items: baseline;
  gap: 1rem;
}

.picker-header h3 {
  margin: 0;
  font-size: 1.1rem;
  color: var(--editor-text);
  white-space: nowrap;
}

.hint {
  margin: 0;
  font-size: 0.85rem;
  color: var(--editor-text-muted);
  font-style: italic;
}

.hint.small {
  font-size: 0.75rem;
}

.hint code,
.section-divider code,
.pane-warning code {
  font-style: normal;
  font-size: 0.8em;
  background: var(--editor-surface-hover);
  padding: 0 0.25em;
  border-radius: 3px;
}

.picker-content {
  display: flex;
  gap: 1.5rem;
  flex: 1;
  overflow: hidden;
}

.controls {
  width: 400px;
  flex: 0 0 400px;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.75rem;
  background-color: var(--editor-surface-raised);
  border: 1px solid var(--editor-border);
  border-radius: 4px;
  overflow: hidden;
  min-height: 0;
}

/* The view/tab header stays put; the active pane is what scrolls. */
.controls-top {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.tab-strip {
  width: 100%;
  display: flex;
}

/* Five tabs must fit the panel width without clipping their labels – the theme's
   0.75rem horizontal content padding is what overflows at this width. */
.tab-strip :deep(.p-togglebutton) {
  flex: 1;
  min-width: 0;
  font-size: 0.85rem;
}

.tab-strip :deep(.p-togglebutton-content) {
  padding: 0.25rem 0.35rem;
}

.tab-pane {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-right: 0.25rem;
}

/* Pane children must not shrink — the pane scrolls instead. Without this,
   overflowing content compresses items and the segmented toggle clips flat. */
.tab-pane > * {
  flex-shrink: 0;
}

/* The two list panes hand their leftover height to the list itself. */
.layers-pane .row-list,
.tab-pane .attr-list {
  flex: 1 1 auto;
  min-height: 8rem;
  overflow-y: auto;
}

.control-row {
  display: flex;
  gap: 0.75rem;
  align-items: flex-end;
}

.grow {
  flex: 1;
  min-width: 0;
}

.self-start {
  align-self: flex-start;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.section-divider {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--editor-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-top: 1px solid var(--editor-border);
  padding-top: 0.75rem;
}

.section-divider:first-child {
  border-top: none;
  padding-top: 0;
}

.control-group label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--editor-text);
}

.control-slider {
  width: 100%;
}

.control-select {
  width: 100%;
}

.control-label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* ── Pane chrome ── */
.pane-toolbar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pane-count {
  font-size: 0.8rem;
  color: var(--editor-text-muted);
  white-space: nowrap;
}

.pane-count.warn {
  color: #c62828;
}

.pane-toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1rem;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: var(--editor-text);
  cursor: pointer;
  user-select: none;
}

.pane-warning {
  background: rgba(240, 198, 116, 0.18);
  border: 1px solid rgba(240, 198, 116, 0.6);
  border-radius: 4px;
  padding: 0.4rem 0.6rem;
  font-size: 0.8rem;
  color: var(--editor-fg-warning);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.pane-warning-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.row-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid var(--editor-border);
  border-radius: 4px;
  background: var(--editor-surface);
  padding: 2px;
}

.row-group-label {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--editor-text-faint);
  padding: 0.35rem 0.4rem 0.15rem;
}

.row-group-label + .row-group-label,
.layer-row + .row-group-label {
  border-top: 1px solid var(--editor-border);
  margin-top: 0.25rem;
}

.empty-note {
  padding: 1rem;
  font-size: 0.85rem;
  color: var(--editor-text-faint);
  text-align: center;
  font-style: italic;
}

/* ── Layer rows ── */
.layer-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.4rem;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid transparent;
}

.layer-row:hover {
  background: var(--editor-surface-hover);
}

.layer-row.selected {
  background: rgba(33, 150, 243, 0.08);
  border-color: rgba(33, 150, 243, 0.25);
}

.layer-row.selected.unresolved {
  background: rgba(244, 67, 54, 0.06);
  border-color: rgba(244, 67, 54, 0.35);
}

.layer-row.locked {
  cursor: default;
}

/* Rendered through the preview character – dashed, since it is not part of this entry. */
.layer-row.hosted {
  border-color: rgba(0, 150, 136, 0.35);
  border-style: dashed;
}

.layer-row.hosted.unresolved {
  border-color: rgba(244, 67, 54, 0.35);
}

.row-check {
  display: flex;
  align-items: center;
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.row-title {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.row-id {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--editor-text);
  overflow-wrap: anywhere;
}

.row-sub {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  font-size: 0.72rem;
  color: var(--editor-text-faint);
}

.mono {
  font-family: var(--font-family-mono, monospace);
}

.row-status {
  font-family: var(--font-family-mono, monospace);
  padding: 0 0.3em;
  border-radius: 3px;
  overflow-wrap: anywhere;
}

.row-status.ok {
  color: #2e7d32;
  background: rgba(76, 175, 80, 0.12);
}

.row-status.bad {
  color: #c62828;
  background: rgba(244, 67, 54, 0.12);
}

.badge {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 0 0.35em;
  border-radius: 3px;
  background: var(--editor-surface-hover);
  color: var(--editor-text-muted);
  line-height: 1.5;
}

.badge.spine {
  background: rgba(156, 39, 176, 0.12);
  color: #7b1fa2;
}

.badge.static {
  background: rgba(33, 150, 243, 0.12);
  color: #1565c0;
}

.badge.view {
  background: rgba(255, 152, 0, 0.15);
  color: #e65100;
}

.badge.core {
  background: var(--editor-surface-hover);
  color: var(--editor-text-muted);
}

.badge.bad {
  background: rgba(244, 67, 54, 0.12);
  color: #c62828;
}

.badge.host {
  background: rgba(0, 150, 136, 0.12);
  color: #00796b;
  text-transform: none;
}

.badge.pin {
  background: rgba(255, 152, 0, 0.15);
  color: #e65100;
  text-transform: none;
  cursor: help;
}

.tool-btn {
  flex: 0 0 auto;
  border: none;
  background: transparent;
  color: var(--editor-text-faint);
  cursor: pointer;
  font-size: 0.95rem;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  line-height: 1;
}

.tool-btn:hover {
  background: var(--editor-surface-hover);
  color: var(--editor-text);
}

/* ── Attribute rows ── */
.attr-list {
  padding: 0.4rem;
  gap: 0.6rem;
}

.attr-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.attr-row.unused .row-id {
  color: var(--editor-text-faint);
  font-weight: 500;
}

.attr-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

/* Entry value | preview character's value, side by side. */
.attr-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.4rem;
}

.attr-columns-head {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--editor-text-faint);
}

.preview-select-wrap {
  min-width: 0;
}

.preview-select {
  border-style: dashed;
}

.preview-select.previewed {
  border-color: #00897b;
}

/* ── Face preview ── */
.face-preview {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.face-preview-circle {
  position: relative;
  width: 100px;
  height: 100px;
  border-radius: 50%;
  overflow: clip;
  outline: 2px solid rgb(174, 174, 174);
  background: var(--editor-surface);
  flex: 0 0 auto;
}

.face-preview-static {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Same rule as CharacterFace's doll container: reference-sized 1:1 box pinned top-left,
   moved by the face shift and scaled from the top-left corner. */
.face-preview-doll {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
}

.face-preview-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* ── Preview ── */
.preview-container {
  flex: 1;
  overflow: hidden;
  background-color: var(--editor-surface-raised);
  border: 1px solid var(--editor-border);
  border-radius: 4px;
  position: relative;
  container-type: size;
}

.no-layers-message {
  text-align: center;
  padding: 2rem;
  max-width: 34rem;
  margin: 0 auto;
}

.no-layers-message a {
  color: #1565c0;
  font-weight: 600;
}

.warning-text {
  color: #f44336;
  margin-bottom: 1rem;
  font-weight: 500;
}

.info-text {
  font-size: 0.875rem;
  color: var(--editor-text-muted);
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
  border-left: 2px dashed var(--editor-border);
  pointer-events: none;
  /* z-index high enough to sit above the doll's spine canvas (which establishes
     its own stacking context via WebGL / CSS transform), matches ItemSlotPickerPopup. */
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

/* Spine preview */
.spine-preview-container {
  height: 100cqh;
  aspect-ratio: v-bind("CHARACTER_VIEWPORT_ASPECT_RATIO");
}

/* Custom 2-button segmented toggle for Spine/Static preview mode */
.spine-static-toggle {
  display: flex;
  gap: 0;
  border: 1px solid var(--editor-border);
  border-radius: 4px;
  overflow: hidden;
  flex-shrink: 0;
}

.spine-static-toggle button {
  flex: 1;
  padding: 0.35rem 0.75rem;
  background: var(--editor-surface);
  color: var(--editor-text-muted);
  border: none;
  border-right: 1px solid var(--editor-border);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.spine-static-toggle button:last-child {
  border-right: none;
}

.spine-static-toggle button:hover:not(.active) {
  background: var(--editor-surface-sunken);
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
