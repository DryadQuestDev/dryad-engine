<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { Editor } from '../../editor';
import { loadCharacterImages } from '../../../shared/utils/characterImageLoader';
import { spineRenderer } from '../../../game/utils/spineRenderer';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';

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

// ── Static image layers ──
const imageLayers = computed(() => {
  return loadCharacterImages(props.character, skinLayersData.value, props.view);
});

// ── Spine support ──
const spineContainerRef = ref<HTMLDivElement | null>(null);
let spineInstance: Spine | null = null;
let spineSlotId = '';

function findSpineForView(spineArray: any, view?: string | null) {
  if (!Array.isArray(spineArray)) return null;
  if (view) return spineArray.find((s: any) => s.view === view) || null;
  return spineArray.find((s: any) => !s.view) || null;
}

const spineConfig = computed(() => {
  const view = props.view || null;
  const localSpine = findSpineForView(props.character?.spine, view);
  const coreSpine = findSpineForView(props.coreCharacter?.spine, view);
  // Only fall back to default spine when no specific view is requested.
  // If a view is requested but has no spine entry, return null so static layers render instead.
  const localDefault = !view ? findSpineForView(props.character?.spine) : null;
  const coreDefault = !view ? findSpineForView(props.coreCharacter?.spine) : null;
  return {
    atlas: localSpine?.atlas || coreSpine?.atlas || localDefault?.atlas || coreDefault?.atlas || null,
    skeleton: localSpine?.skeleton || coreSpine?.skeleton || localDefault?.skeleton || coreDefault?.skeleton || null,
    animation: localSpine?.default_animation || coreSpine?.default_animation || localDefault?.default_animation || coreDefault?.default_animation || null,
  };
});

const isSpine = computed(() => !!(spineConfig.value.atlas && spineConfig.value.skeleton));
const hasContent = computed(() => isSpine.value || imageLayers.value.length > 0);

async function initSpinePlayer() {
  if (!spineContainerRef.value || !spineConfig.value.atlas || !spineConfig.value.skeleton) return;
  disposeSpinePlayer();

  try {
    spineSlotId = `editor_preview_${Date.now()}`;
    const attributes = props.character?.attributes || {};

    const spine = await spineRenderer.register(spineSlotId, spineContainerRef.value, {
      skeletonUrl: spineConfig.value.skeleton,
      atlasUrl: spineConfig.value.atlas,
      animation: spineConfig.value.animation || undefined,
    });

    if (!spine) return;
    spineInstance = spine;

    // Apply skins from attributes
    const skeletonData = spine.skeleton.data;
    const skins = Object.values(attributes).filter(
      (v): v is string => typeof v === 'string' && !!skeletonData.skins.find((s: any) => s.name === v)
    );
    if (skins.length > 0) {
      spineRenderer.applySkins(spine, skins);
    }
  } catch (error) {
    console.error('EditorCharacterPreview failed to init spine:', error);
  }
}

function disposeSpinePlayer() {
  if (spineSlotId) {
    spineRenderer.unregister(spineSlotId);
    spineSlotId = '';
  }
  spineInstance = null;
}

// Load skin layers data
onMounted(async () => {
  const data = await editor.loadFullData('character_skin_layers');
  if (data && Array.isArray(data)) skinLayersData.value = data;
});

// Reinit spine when view or character changes
watch([() => props.view, () => props.character?.id], () => {
  if (isSpine.value) {
    nextTick(() => initSpinePlayer());
  }
});

// Init spine when container appears
watch(spineContainerRef, (newRef) => {
  if (newRef && isSpine.value) {
    nextTick(() => initSpinePlayer());
  }
});

onBeforeUnmount(() => {
  disposeSpinePlayer();
});
</script>

<template>
  <div class="editor-char-preview">
    <template v-if="isSpine">
      <div ref="spineContainerRef" class="editor-char-spine" />
    </template>
    <template v-else-if="imageLayers.length > 0">
      <img v-for="(src, i) in imageLayers" :key="i" :src="src" class="editor-char-img"
        :class="{ 'editor-char-img-stacked': i > 0 }" />
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
}

.editor-char-spine {
  width: 100%;
  height: 100%;
}

.editor-char-img {
  display: block;
  height: 100%;
  width: auto;
}

.editor-char-img-stacked {
  position: absolute;
  top: 0;
  left: 0;
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
