<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { SpinePlayer } from '@esotericsoftware/spine-player';
import '@esotericsoftware/spine-player/dist/spine-player.css';
import { spineCache } from '../../utils/spineCache';

const props = defineProps<{
  character: Character;
  naturalSize?: boolean;
  mirror?: boolean;
  directRender?: boolean;
  enableAppear?: boolean;
  view?: string;
}>();

const spineContainerRef = ref<HTMLDivElement | null>(null);
let spinePlayer: SpinePlayer | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;

// Resolve spine config: views prop → matching view config, otherwise default
const spineConfig = computed(() => {
  if (props.view) {
    return props.character.getSpineForView(props.view) || props.character.getDefaultSpine();
  }
  return props.character.getDefaultSpine();
});

const spineAtlas = computed(() => spineConfig.value?.atlas ?? undefined);
const spineSkeleton = computed(() => spineConfig.value?.skeleton ?? undefined);

// Convention-based: each attribute value becomes a Spine skin name
const spineSkins = computed(() => props.character.getSpineSkins());

const spineAnimation = computed(() => spineConfig.value?.animation || undefined);

// Helper to apply skins to the player (reused from SpineAsset.vue pattern)
// Filters to only skins that actually exist in the skeleton
const applySkins = (player: SpinePlayer, skins: string[]) => {
  if (!player.skeleton) return;

  const skeletonData = player.skeleton.data;
  const validSkins = skins.filter(name => skeletonData.skins.find((s: any) => s.name === name));

  if (validSkins.length === 0) return;

  if (validSkins.length === 1) {
    player.skeleton.setSkinByName(validSkins[0]);
  } else {
    // Multiple skins - combine them
    const firstSkinData = skeletonData.skins[0];
    if (firstSkinData) {
      const SkinConstructor = firstSkinData.constructor as any;
      const combinedSkin = new SkinConstructor('combined-skin');

      validSkins.forEach((skinName: string) => {
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

const startSyncTimer = () => {
  const syncKey = props.character.id;
  const syncView = props.view || '';
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    if (!spinePlayer?.animationState) return;
    const track = spinePlayer.animationState.getCurrent(0);
    if (track) {
      spineCache.setAnimTime(syncKey, syncView, track.trackTime);
    }
  }, 200);
};

const syncAnimationTime = (player: SpinePlayer) => {
  const syncKey = props.character.id;
  const syncView = props.view || '';
  requestAnimationFrame(() => {
    if (!player.animationState) return;
    const existingTime = spineCache.getAnimTime(syncKey, syncView);
    if (existingTime > 0) {
      const track = player.animationState.getCurrent(0);
      if (track) {
        track.trackTime = existingTime % (track.animation?.duration || 1);
      }
    }
  });
};

const initSpine = () => {
  if (!spineContainerRef.value || !spineAtlas.value || !spineSkeleton.value) return;

  try {
    // Try to acquire a pooled player with matching skeleton
    const pooled = spineCache.acquire(spineAtlas.value, spineSkeleton.value);
    if (pooled) {
      spinePlayer = pooled;
      // Register available animations from pooled player
      if (pooled.skeleton) {
        const animNames = pooled.skeleton.data.animations.map((a: any) => a.name);
        props.character.setAvailableSpineAnimations(props.view || '', animNames);
        // Discover only current animation + skins (skip gallery preview characters)
        if (props.character.templateId && spineSkeleton.value && !props.character.id.startsWith('_gallery_preview')) {
          const currentAnim = spineAnimation.value ? [spineAnimation.value] : [];
          Game.getInstance().coreSystem.updateDiscoveredSpineData(props.character.templateId, spineSkeleton.value, currentAnim, spineSkins.value);
        }
      }
      // Reparent the player's DOM into our container
      spineContainerRef.value.appendChild(pooled.dom);

      // Apply current skins and animation (cheap operations)
      if (spineSkins.value.length > 0) {
        applySkins(pooled, spineSkins.value);
      }
      if (spineAnimation.value && pooled.animationState) {
        pooled.animationState.setAnimation(0, spineAnimation.value, true);
      }

      syncAnimationTime(pooled);
      startSyncTimer();
      return;
    }

    // No pooled player — create new
    const devMode = localStorage.getItem('devMode') === 'true';

    const config = {
      skelUrl: spineSkeleton.value,
      atlasUrl: spineAtlas.value,
      animation: spineAnimation.value,
      skin: 'default',
      loop: true,
      backgroundColor: '#00000000',
      alpha: true,
      preserveDrawingBuffer: false,
      premultipliedAlpha: true,
      showControls: false,
      success: (player: SpinePlayer) => {
        if (!player.skeleton) return;

        if (devMode) {
          console.log('🦴 Spine Character loaded:', {
            characterId: props.character.id,
            animations: player.skeleton.data.animations.map((a: any) => a.name),
            skins: player.skeleton.data.skins.map((s: any) => s.name),
          });
        }

        // Apply combined skins from attributes
        if (spineSkins.value.length > 0) {
          applySkins(player, spineSkins.value);
        }

        // Persist atlas image in memory cache
        if (spineAtlas.value) {
          Game.getInstance().coreSystem.persistImage(spineAtlas.value);
        }

        // Register available animation names on the character
        const animNames = player.skeleton.data.animations.map((a: any) => a.name);
        props.character.setAvailableSpineAnimations(props.view || '', animNames);
        // Discover only current animation + skins (skip gallery preview characters)
        if (props.character.templateId && spineSkeleton.value && !props.character.id.startsWith('_gallery_preview')) {
          const currentAnim = spineAnimation.value ? [spineAnimation.value] : [];
          Game.getInstance().coreSystem.updateDiscoveredSpineData(props.character.templateId, spineSkeleton.value, currentAnim, spineSkins.value);
        }

        syncAnimationTime(player);
        startSyncTimer();
      },
      error: (_player: SpinePlayer, error: string) => {
        console.error('Spine Character error:', error);
      }
    };

    spinePlayer = new SpinePlayer(spineContainerRef.value, config);
  } catch (error) {
    console.error('Failed to initialize Spine Character:', error);
  }
};

onMounted(() => {
  initSpine();
});

onUnmounted(() => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  if (spinePlayer) {
    if (spineAtlas.value && spineSkeleton.value) {
      spineCache.release(spinePlayer, spineAtlas.value, spineSkeleton.value);
    } else {
      spinePlayer.dispose();
    }
    spinePlayer = null;
  }
});

// Watch for skeleton/atlas changes - requires full reinit
watch([spineAtlas, spineSkeleton], ([newAtlas, newSkel], [oldAtlas, oldSkel]) => {
  if (spinePlayer) {
    if (oldAtlas && oldSkel) {
      spineCache.release(spinePlayer, oldAtlas, oldSkel);
    } else {
      spinePlayer.dispose();
    }
    spinePlayer = null;
  }
  requestAnimationFrame(() => {
    initSpine();
  });
});

// Watch for skin changes (attribute values changed)
watch(spineSkins, (newSkins) => {
  if (!spinePlayer?.skeleton || newSkins.length === 0) return;
  applySkins(spinePlayer, newSkins);
  // Discover newly applied skins
  if (props.character.templateId && spineSkeleton.value && !props.character.id.startsWith('_gallery_preview')) {
    Game.getInstance().coreSystem.updateDiscoveredSpineData(props.character.templateId, spineSkeleton.value, [], newSkins);
  }
}, { deep: true });

// Watch for animation changes (supports one-shot via animationTimes)
watch(spineAnimation, (newAnimation, oldAnimation) => {
  if (!spinePlayer?.animationState || !spinePlayer?.skeleton || !newAnimation) return;

  // Check if animation exists in skeleton
  const exists = spinePlayer.skeleton.data.findAnimation(newAnimation);
  if (!exists) return;

  // Discover newly played animation
  if (props.character.templateId && spineSkeleton.value && !props.character.id.startsWith('_gallery_preview')) {
    Game.getInstance().coreSystem.updateDiscoveredSpineData(props.character.templateId, spineSkeleton.value, [newAnimation], []);
  }

  const times = spineConfig.value?.animationTimes;
  const loop = times === undefined;

  spinePlayer.animationState.setAnimation(0, newAnimation, loop);

  if (!loop && oldAnimation) {
    // Queue return to previous (idle) animation after one-shot
    const idleExists = spinePlayer.skeleton.data.findAnimation(oldAnimation);
    if (idleExists) {
      spinePlayer.animationState.addAnimation(0, oldAnimation, true, 0);
    }
    // Reset animationTimes so next setSpineAnimation defaults to loop
    const config = spineConfig.value;
    if (config) config.animationTimes = undefined;
  }
});
</script>

<template>
  <div class="character-doll-spine" :class="{ 'natural-size': naturalSize, 'mirror': mirror, 'appear': enableAppear }">
    <div ref="spineContainerRef" class="spine-container" />
  </div>
</template>

<style scoped>
.character-doll-spine {
  position: relative;
  width: auto;
  height: 100%;
  aspect-ratio: 5 / 7; /* Must match FacePickerPopup/ItemSlotPickerPopup spine container (500×700) */
  display: inline-block;
  pointer-events: none;
}

.character-doll-spine.mirror {
  transform: scaleX(-1);
}

.character-doll-spine.appear {
  animation: spine-fade-in 0.5s ease;
}

@keyframes spine-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.spine-container {
  width: 100%;
  height: 100%;
}

/* Hide Spine Player controls */
.character-doll-spine :deep(.spine-player-controls) {
  display: none !important;
}

/* Natural size mode for gallery */
.character-doll-spine.natural-size {
  position: relative;
  height: 100%;
  width: fit-content;
  flex-shrink: 0;
}
</style>
