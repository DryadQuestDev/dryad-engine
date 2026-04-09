<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, watch } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { spineRenderer } from '../../utils/spineRenderer';
import { spineCache } from '../../utils/spineCache';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';

const props = defineProps<{
  character: Character;
  naturalSize?: boolean;
  mirror?: boolean;
  directRender?: boolean;
  enableAppear?: boolean;
  view?: string;
}>();

const spineSlotRef = ref<HTMLDivElement | null>(null);
let spine: Spine | null = null;
let currentSlotId = '';
let syncInterval: ReturnType<typeof setInterval> | null = null;

// Stable unique ID per component instance
const instanceId = Math.random().toString(36).slice(2, 8);
const makeSlotId = () => `${props.character.id}:${props.view || ''}:${instanceId}`;

// Resolve spine config: views prop → matching view config, otherwise default
const spineConfig = computed(() => {
  if (props.view) {
    return props.character.getSpineForView(props.view) || props.character.getDefaultSpine();
  }
  return props.character.getDefaultSpine();
});

const spineAtlas = computed(() => spineConfig.value?.atlas ?? undefined);
const spineSkeleton = computed(() => spineConfig.value?.skeleton ?? undefined);
const spineSkins = computed(() => props.character.getSpineSkins());

// Multi-track animation mapping driven by character attributes
const spineTrackAnimations = computed(() => {
  return props.character.getSpineTrackAnimations(props.view || '');
});

// ── Animation Sync (track 0 only) ──

const startSyncTimer = () => {
  const syncKey = props.character.id;
  const syncView = props.view || '';
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    if (!spine?.state) return;
    const track = spine.state.getCurrent(0);
    if (track) {
      spineCache.setAnimTime(syncKey, syncView, track.trackTime);
    }
  }, 200);
};

const syncAnimationTime = (s: Spine) => {
  const syncKey = props.character.id;
  const syncView = props.view || '';
  requestAnimationFrame(() => {
    if (!s.state) return;
    const existingTime = spineCache.getAnimTime(syncKey, syncView);
    if (existingTime > 0) {
      const track = s.state.getCurrent(0);
      if (track) {
        track.trackTime = existingTime % (track.animation?.duration || 1);
      }
    }
  });
};

// ── Apply all track animations ──

const applyTrackAnimations = (s: Spine, trackMap: Map<number, string>) => {
  for (const [track, animName] of trackMap) {
    const exists = s.skeleton.data.findAnimation(animName);
    if (exists) {
      s.state.setAnimation(track, animName, true);
    }
  }
};

// ── Init / Cleanup ──

const initSpine = async () => {
  if (!spineSlotRef.value || !spineAtlas.value || !spineSkeleton.value) return;

  try {
    currentSlotId = makeSlotId();

    const result = await spineRenderer.register(currentSlotId, spineSlotRef.value, {
      atlasUrl: spineAtlas.value,
      skeletonUrl: spineSkeleton.value,
      skins: spineSkins.value.length > 0 ? spineSkins.value : undefined,
      animation: spineConfig.value?.animation,
      loop: true,
      mirror: props.mirror,
    });

    if (!result) return;
    spine = result;

    // Persist atlas image in memory cache
    if (spineAtlas.value) {
      Game.getInstance().coreSystem.persistImage(spineAtlas.value);
    }

    // Register available animation names and build groups
    const animNames = spine.skeleton.data.animations.map((a: any) => a.name);
    props.character.setAvailableSpineAnimations(props.view || '', animNames);

    // Apply all track animations from attribute-driven groups
    const trackMap = props.character.getSpineTrackAnimations(props.view || '');
    applyTrackAnimations(spine, trackMap);

    // Discover current animation + skins (skip gallery preview characters)
    if (props.character.templateId && spineSkeleton.value && !props.character.id.startsWith('_gallery_preview')) {
      Game.getInstance().coreSystem.updateDiscoveredSpineData(props.character.templateId, spineSkeleton.value, animNames, spineSkins.value);
    }

    syncAnimationTime(spine);
    startSyncTimer();
  } catch (error) {
    console.error('Failed to initialize Spine Character:', error);
  }
};

const cleanupSpine = () => {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  if (currentSlotId) {
    spineRenderer.unregister(currentSlotId);
    spine = null;
    currentSlotId = '';
  }
};

onMounted(() => {
  initSpine();
});

onUnmounted(() => {
  cleanupSpine();
});

// ── Watchers ──

// Skeleton/atlas changes — full reinit
watch([spineAtlas, spineSkeleton], () => {
  cleanupSpine();
  requestAnimationFrame(() => {
    initSpine();
  });
});

// Character object changed (e.g. gallery recreates preview) — transfer animation data
watch(() => props.character, (newChar) => {
  if (spine && newChar) {
    const view = props.view || '';
    if (!newChar.spineAnimationGroups.has(view)) {
      const animNames = spine.skeleton.data.animations.map((a: any) => a.name);
      newChar.setAvailableSpineAnimations(view, animNames);
    }
  }
});

// Skin changes
watch(spineSkins, (newSkins) => {
  if (!spine || newSkins.length === 0) return;
  spineRenderer.applySkins(spine, newSkins);
  if (props.character.templateId && spineSkeleton.value && !props.character.id.startsWith('_gallery_preview')) {
    Game.getInstance().coreSystem.updateDiscoveredSpineData(props.character.templateId, spineSkeleton.value, [], newSkins);
  }
}, { deep: true });

// Track animation changes (driven by character attributes)
watch(spineTrackAnimations, (newMap, oldMap) => {
  if (!spine?.state || !spine?.skeleton) return;

  // Detect any changes (new, changed, or removed tracks)
  let hasChanges = false;
  for (const [track, animName] of newMap) {
    if (oldMap?.get(track) !== animName) { hasChanges = true; break; }
  }
  if (oldMap) {
    for (const [track] of oldMap) {
      if (!newMap.has(track)) { hasChanges = true; break; }
    }
  }
  if (!hasChanges) return;

  // Snapshot current frame for crossfade before applying changes
  if (currentSlotId) {
    spineRenderer.snapshotForTransition(currentSlotId, 0.3);
  }

  // Apply new/changed track animations
  for (const [track, animName] of newMap) {
    if (oldMap?.get(track) === animName) continue;
    const exists = spine.skeleton.data.findAnimation(animName);
    if (exists) {
      spine.state.setAnimation(track, animName, true);
    }
  }

  // Clear tracks that are no longer in the map (attribute lost its matching animation)
  if (oldMap) {
    for (const [track] of oldMap) {
      if (!newMap.has(track)) {
        spine.state.setEmptyAnimation(track, 0.3);
      }
    }
  }
}, { deep: true });

// Mirror changes
watch(() => props.mirror, (newMirror) => {
  if (currentSlotId) {
    spineRenderer.updateMirror(currentSlotId, newMirror ?? false);
  }
});
</script>

<template>
  <div class="character-doll-spine" :class="{ 'natural-size': naturalSize, 'appear': enableAppear }">
    <div ref="spineSlotRef" class="spine-container" />
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
</style>
