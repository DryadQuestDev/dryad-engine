<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import { Editor } from '../../editor';
import { loadCharacterImages } from '../../../shared/utils/characterImageLoader';
import { useEditorSpinePlayer } from '../../../composables/useEditorSpinePlayer';
import { getSpineCharacterScale, CHARACTER_VIEWPORT_ASPECT_RATIO } from '../../../game/utils/characterReference';

const props = defineProps<{
  /** Character template object (with skin_layers, attributes, spine, traits) */
  character: any;
  /** Core character template for mod fallback */
  coreCharacter?: any;
  /** View name (e.g., 'back'). Undefined = default view. */
  view?: string;
}>();

const editor = Editor.getInstance();
const skinLayersData = ref<any[]>([]);

const imageLayers = computed(() => {
  return loadCharacterImages(props.character, skinLayersData.value, props.view);
});

const spineContainerRef = ref<HTMLDivElement | null>(null);

// `''`, `undefined`, and `'_default'` all canonically refer to the default view —
// FacePickerPopup writes `view: '_default'` when the dev picks Default in the
// dropdown, while older entries leave the field empty. Treat them as equivalent.
function viewMatches(entryView: any, target?: string | null): boolean {
  const a = !entryView || entryView === '_default' ? '_default' : entryView;
  const b = !target || target === '_default' ? '_default' : target;
  return a === b;
}

function findSpineForView(spineArray: any, view?: string | null) {
  if (!Array.isArray(spineArray)) return null;
  return spineArray.find((s: any) => viewMatches(s.view, view)) || null;
}

const spineConfig = computed(() => {
  const view = props.view || null;
  const localSpine = findSpineForView(props.character?.spine, view);
  const coreSpine = findSpineForView(props.coreCharacter?.spine, view);
  // Only fall back to default spine when no specific view is requested.
  // If a view is requested but has no spine entry, return null so static layers render instead.
  const localDefault = !view ? findSpineForView(props.character?.spine) : null;
  const coreDefault = !view ? findSpineForView(props.coreCharacter?.spine) : null;
  const merged = localSpine || coreSpine || localDefault || coreDefault || null;
  return {
    atlas: merged?.atlas || null,
    skeleton: merged?.skeleton || null,
    art_dx: typeof merged?.art_dx === 'number' ? merged.art_dx : 0,
    art_dy: typeof merged?.art_dy === 'number' ? merged.art_dy : 0,
    art_scale: typeof merged?.art_scale === 'number' ? merged.art_scale : 1,
  };
});

const atlasUrl = computed(() => spineConfig.value.atlas);
const skeletonUrl = computed(() => spineConfig.value.skeleton);
const attributes = computed(() => props.character?.attributes || {});
const artScale = computed(() => spineConfig.value.art_scale);
const artDx = computed(() => spineConfig.value.art_dx);
const artDy = computed(() => spineConfig.value.art_dy);
const gameScale = computed(() => getSpineCharacterScale(props.view, editor.getMergedManifest()));

const isSpine = computed(() => !!(atlasUrl.value && skeletonUrl.value));

const { init: initSpinePlayer } = useEditorSpinePlayer({
  containerRef: spineContainerRef,
  atlasUrl,
  skeletonUrl,
  attributes,
  artScale,
  artDx,
  artDy,
  gameScale,
  slotIdPrefix: 'editor_preview',
});

onMounted(async () => {
  const data = await editor.loadFullData('character_skin_layers');
  if (data && Array.isArray(data)) skinLayersData.value = data;
});

watch([() => props.view, () => props.character?.id], () => {
  if (isSpine.value) nextTick(() => initSpinePlayer());
});

watch(spineContainerRef, (newRef) => {
  if (newRef && isSpine.value) nextTick(() => initSpinePlayer());
});
</script>

<template>
  <div class="editor-char-preview">
    <template v-if="isSpine">
      <div ref="spineContainerRef" class="editor-char-spine" />
    </template>
    <template v-else-if="imageLayers.length > 0">
      <img v-for="(src, i) in imageLayers" :key="i" :src="src" class="editor-char-img" />
    </template>
    <div v-else class="editor-char-empty">
      <slot name="empty">No art layers</slot>
    </div>
  </div>
</template>

<style scoped>
.editor-char-preview {
  position: relative;
  display: inline-block;
  height: 100%;
  aspect-ratio: v-bind("CHARACTER_VIEWPORT_ASPECT_RATIO");
}

.editor-char-spine {
  width: 100%;
  height: 100%;
}

.editor-char-img {
  display: block;
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.editor-char-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #666;
  font-style: italic;
}
</style>
