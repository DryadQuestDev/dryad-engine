<script setup lang="ts">
import { computed, ref, onMounted, watch, onUnmounted } from 'vue';
import { AssetObject } from '../../schemas/assetSchema';
import { SpinePlayer } from '@esotericsoftware/spine-player';
import '@esotericsoftware/spine-player/dist/spine-player.css';

const props = defineProps<{
  asset: AssetObject;
}>();

const spineContainerRef = ref<HTMLDivElement | null>(null);

// Spine Player reference
let spinePlayer: SpinePlayer | null = null;

// Spine file paths
const spineAtlasPath = computed(() => props.asset.file_spine_atlas ?? undefined);
const spineSkeletonPath = computed(() => props.asset.file_spine_skeleton ?? undefined);

const zindex = computed(() => props.asset.z ?? 0);

// Spine viewport dimensions for clipping
const spineViewportWidth = computed(() => props.asset.viewport?.width ?? null);
const spineViewportHeight = computed(() => props.asset.viewport?.height ?? null);

// Helper to apply skins to the player
const applySkins = (player: SpinePlayer, skins: string[] | undefined) => {
  if (!player.skeleton || !skins || skins.length === 0) return;

  const skeletonData = player.skeleton.data;

  if (skins.length === 1) {
    player.skeleton.setSkinByName(skins[0]);
  } else {
    // Multiple skins - combine them
    const firstSkinData = skeletonData.skins[0];
    if (firstSkinData) {
      const SkinConstructor = firstSkinData.constructor as any;
      const combinedSkin = new SkinConstructor('combined-skin');

      skins.forEach((skinName: string) => {
        const skin = skeletonData.skins.find((s: any) => s.name === skinName);
        if (skin) {
          combinedSkin.addSkin(skin);
        }
      });

      player.skeleton.setSkin(combinedSkin);
    }
  }

  player.skeleton.setSlotsToSetupPose();
};

// Spine Player initialization
const initSpine = () => {
  if (!spineContainerRef.value || !spineAtlasPath.value || !spineSkeletonPath.value) {
    return;
  }

  try {
    const devMode = localStorage.getItem('devMode') === 'true';

    // Configure Spine Player with viewport for clipping
    // Spine Player automatically detects JSON (.json) or binary (.skel) skeleton format
    const viewport = props.asset.viewport;
    const config = {
      skelUrl: spineSkeletonPath.value,
      atlasUrl: spineAtlasPath.value,
      animation: props.asset.animation != null ? String(props.asset.animation) : undefined,
      skin: props.asset.skins?.[0] || undefined,
      loop: props.asset.loop ?? true,
      backgroundColor: '#00000000',
      alpha: true,
      preserveDrawingBuffer: false,
      premultipliedAlpha: true,
      showControls: false,
      viewport: viewport ? {
        padLeft: viewport.pad_left ?? 0,
        padRight: viewport.pad_right ?? 0,
        padTop: viewport.pad_top ?? 0,
        padBottom: viewport.pad_bottom ?? 0,
        x: viewport.x ?? 0,
        y: viewport.y ?? 0,
        width: viewport.width ?? 1050,
        height: viewport.height ?? 1050,
      } : undefined,
      success: (player: SpinePlayer) => {
        if (!player.skeleton) return;

        if (devMode) {
          console.log('🦴 Spine Player loaded:', {
            assetId: props.asset.id,
            animations: player.skeleton.data.animations.map((a: any) => a.name),
            skins: player.skeleton.data.skins.map((s: any) => s.name),
            width: player.skeleton.data.width,
            height: player.skeleton.data.height,
          });
        }

        // Apply multiple skins if specified
        applySkins(player, props.asset.skins);

        // Apply timescale
        if (props.asset.timescale !== undefined && player.animationState) {
          player.animationState.timeScale = props.asset.timescale;
        }
      },
      error: (_player: SpinePlayer, error: string) => {
        console.error('Spine Player error:', error);
      }
    };

    // Create Spine Player
    spinePlayer = new SpinePlayer(spineContainerRef.value, config);
  } catch (error) {
    console.error('Failed to initialize Spine Player:', error);
  }
};

onMounted(() => {
  initSpine();
});

// Cleanup on unmount
onUnmounted(() => {
  if (spinePlayer) {
    spinePlayer.dispose();
    spinePlayer = null;
  }
});

// Watch for skeleton/atlas file changes - requires full reinit
watch([spineAtlasPath, spineSkeletonPath], () => {
  if (spinePlayer) {
    spinePlayer.dispose();
    spinePlayer = null;
  }
  requestAnimationFrame(() => {
    initSpine();
  });
});

// Watch for animation changes
watch(() => props.asset.animation, (newAnimation) => {
  if (!spinePlayer?.animationState || !spinePlayer?.skeleton) return;

  if (newAnimation != null) {
    const loop = props.asset.loop ?? true;
    spinePlayer.animationState.setAnimation(0, String(newAnimation), loop);
  }
});

// Watch for skins changes
watch(() => props.asset.skins, (newSkins) => {
  if (!spinePlayer?.skeleton) return;
  applySkins(spinePlayer, newSkins);
}, { deep: true });

// Watch for timescale changes
watch(() => props.asset.timescale, (newTimescale) => {
  if (!spinePlayer?.animationState) return;
  spinePlayer.animationState.timeScale = newTimescale ?? 1;
});

// Watch for loop changes
watch(() => props.asset.loop, (newLoop) => {
  if (!spinePlayer?.animationState || props.asset.animation == null) return;
  // Re-set current animation with new loop setting
  spinePlayer.animationState.setAnimation(0, String(props.asset.animation), newLoop ?? true);
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
  width: v-bind("spineViewportWidth ? spineViewportWidth + 'px' : '100%'");
  height: v-bind("spineViewportHeight ? spineViewportHeight + 'px' : '100%'");
  margin: auto;
  position: relative;
}

.spine-container {
  /* Spine Player creates its own canvas inside this container */
  width: 100%;
  height: 100%;
}

/* Hide Spine Player controls */
.spine-wrapper :deep(.spine-player-controls) {
  display: none !important;
}
</style>
