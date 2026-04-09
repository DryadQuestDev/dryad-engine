<script setup lang="ts">
import { computed, ref, onMounted, watch, onUnmounted } from 'vue';
import { AssetObject } from '../../schemas/assetSchema';
import { spineRenderer } from '../utils/spineRenderer';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';

const props = defineProps<{
  asset: AssetObject;
}>();

const spineContainerRef = ref<HTMLDivElement | null>(null);
let spineInstance: Spine | null = null;
let slotId = '';

const spineAtlasPath = computed(() => props.asset.file_spine_atlas ?? undefined);
const spineSkeletonPath = computed(() => props.asset.file_spine_skeleton ?? undefined);
const zindex = computed(() => props.asset.z ?? 0);


const makeSlotId = () => `spine_asset_${props.asset.id || ''}_${Date.now()}`;

const initSpine = async () => {
  if (!spineContainerRef.value || !spineAtlasPath.value || !spineSkeletonPath.value) return;

  try {
    slotId = makeSlotId();

    const vp = props.asset.viewport;
    const result = await spineRenderer.register(slotId, spineContainerRef.value, {
      atlasUrl: spineAtlasPath.value,
      skeletonUrl: spineSkeletonPath.value,
      skins: props.asset.skins,
      animation: props.asset.animation != null ? String(props.asset.animation) : undefined,
      loop: props.asset.loop ?? true,
      viewport: vp ? { dx: vp.dx, dy: vp.dy, zoom: vp.zoom } : undefined,
    });

    if (!result) return;
    spineInstance = result;

    if (localStorage.getItem('devMode') === 'true') {
      console.log('🎬 SpineAsset rendered:', {
        id: props.asset.id,
        requestedSkins: props.asset.skins,
        requestedAnimation: props.asset.animation,
        loop: props.asset.loop,
        timescale: props.asset.timescale,
      });
    }

    // Apply timescale
    if (props.asset.timescale !== undefined && spineInstance.state) {
      spineInstance.state.timeScale = props.asset.timescale;
    }
  } catch (error) {
    console.error('Failed to initialize Spine Asset:', error);
  }
};

const cleanupSpine = () => {
  if (slotId) {
    spineRenderer.unregister(slotId);
    spineInstance = null;
    slotId = '';
  }
};

onMounted(() => {
  initSpine();
});

onUnmounted(() => {
  cleanupSpine();
});

// Watch for skeleton/atlas file changes — full reinit only when URLs actually change
watch([spineAtlasPath, spineSkeletonPath], ([newAtlas, newSkel], [oldAtlas, oldSkel]) => {
  if (newAtlas === oldAtlas && newSkel === oldSkel) return;
  cleanupSpine();
  requestAnimationFrame(() => initSpine());
});

// Watch for animation changes
watch(() => props.asset.animation, (newAnimation) => {
  if (!spineInstance?.state || !spineInstance?.skeleton || newAnimation == null) return;
  spineInstance.state.setAnimation(0, String(newAnimation), props.asset.loop ?? true);
});

// Watch for skins changes
watch(() => JSON.stringify(props.asset.skins), (newVal, oldVal) => {
  if (newVal === oldVal || !spineInstance) return;
  const skins = props.asset.skins;
  if (skins && skins.length > 0) {
    spineRenderer.applySkins(spineInstance, skins);
  }
});

// Watch for timescale changes
watch(() => props.asset.timescale, (newTimescale) => {
  if (!spineInstance?.state) return;
  spineInstance.state.timeScale = newTimescale ?? 1;
});

// Watch for loop changes
watch(() => props.asset.loop, (newLoop) => {
  if (!spineInstance?.state || props.asset.animation == null) return;
  spineInstance.state.setAnimation(0, String(props.asset.animation), newLoop ?? true);
});

// Watch for viewport changes — full reinit only when values actually change
watch(() => JSON.stringify(props.asset.viewport), (newVp, oldVp) => {
  if (newVp === oldVp) return;
  cleanupSpine();
  requestAnimationFrame(() => initSpine());
});
</script>

<template>
  <div class="background-asset-wrapper">
    <div class="background-asset spine-wrapper">
      <div ref="spineContainerRef" class="spine-container" />
    </div>
  </div>
</template>

<style scoped>
.background-asset-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: v-bind("zindex");
  pointer-events: none;
}

.background-asset-wrapper .background-asset {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.spine-wrapper {
  overflow: hidden;
  width: 100%;
  height: 100%;
  margin: auto;
  position: relative;
}

.spine-container {
  width: 100%;
  height: 100%;
}
</style>
