<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick } from 'vue';
import { ManifestObject } from '../../schemas/manifestSchema';
import { isImage, isVideo } from '../../utility/functions';
import { Global } from '../global';
import Galleria from 'primevue/galleria';

interface Props {
  manifest: ManifestObject | null;
  hideHeader?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  hideHeader: false
});

const global = Global.getInstance();

// Galleria active index for video control
const activeIndex = ref(0);
const videoRef = ref<HTMLVideoElement | null>(null);

// Fullscreen gallery state
const fullscreenVisible = ref(false);
const fullscreenIndex = ref(0);

function openFullscreen() {
  fullscreenIndex.value = activeIndex.value;
  fullscreenVisible.value = true;
}

// Computed property for current cover assets
const currentCoverAssets = computed(() => {
  return props.manifest?.cover_assets || [];
});

// Video volume control
const videoVolume = computed(() => {
  return (global.userSettings.value.sound_volume || 0) / 100;
});

// Update video volume when it changes
watch(videoVolume, (newVolume) => {
  if (videoRef.value) {
    videoRef.value.volume = newVolume;
  }
});

// Reset activeIndex when cover assets change (when selecting different manifest)
watch(currentCoverAssets, () => {
  activeIndex.value = 0;
});

// Watch for active index changes to update video volume
watch(activeIndex, async () => {
  await nextTick();
  if (videoRef.value) {
    videoRef.value.volume = videoVolume.value;
  }
});
</script>

<template>
  <div v-if="manifest" class="manifest-info">
    <div v-if="!hideHeader" class="info-header">
      <div class="info-name">{{ manifest.name }}</div>
      <div class="info-author" v-if="manifest.author">by {{ manifest.author }}</div>
      <div class="info-version" v-if="manifest.version">v{{ manifest.version }}</div>
    </div>

    <div class="info-description" v-html="manifest.description"></div>

    <!-- Cover Assets Carousel -->
    <Galleria v-if="currentCoverAssets.length > 0" :key="manifest?.id" v-model:activeIndex="activeIndex" :value="currentCoverAssets"
      :numVisible="Math.min(10, currentCoverAssets.length)" :showThumbnails="true" :showIndicators="true"
      :showItemNavigators="true" :circular="false" :responsiveOptions="[
        { breakpoint: '1600px', numVisible: Math.min(6, currentCoverAssets.length) },
        { breakpoint: '1200px', numVisible: Math.min(4, currentCoverAssets.length) },
        { breakpoint: '1000px', numVisible: Math.min(2, currentCoverAssets.length) },
      ]" containerStyle="max-width: 100%" class="cover-gallery">
      <template #item="slotProps">
        <img v-if="isImage(slotProps.item)" :src="slotProps.item" alt="Cover" class="gallery-item-image clickable"
          @click="openFullscreen()" />
        <video v-else-if="isVideo(slotProps.item)" ref="videoRef" :src="slotProps.item" controls autoplay loop
          playsinline class="gallery-item-video" />
      </template>
      <template #thumbnail="slotProps">
        <img v-if="isImage(slotProps.item)" :src="slotProps.item" alt="Thumbnail" class="gallery-thumbnail" />
        <video v-else-if="isVideo(slotProps.item)" :src="slotProps.item" class="gallery-thumbnail" />
      </template>
    </Galleria>

    <!-- Fullscreen Gallery -->
    <Galleria v-model:visible="fullscreenVisible" v-model:activeIndex="fullscreenIndex" :value="currentCoverAssets"
      :fullScreen="true" :showThumbnails="true" :showItemNavigators="true" :circular="true"
      :numVisible="Math.min(7, currentCoverAssets.length)"
      :pt="{ mask: { onClick: (e: MouseEvent) => { if (e.target === e.currentTarget) fullscreenVisible = false } } }">
      <template #item="slotProps">
        <img v-if="isImage(slotProps.item)" :src="slotProps.item" alt="Cover" class="fullscreen-item" />
        <video v-else-if="isVideo(slotProps.item)" :src="slotProps.item" controls autoplay loop playsinline
          class="fullscreen-item" />
      </template>
      <template #thumbnail="slotProps">
        <img v-if="isImage(slotProps.item)" :src="slotProps.item" alt="Thumbnail" class="gallery-thumbnail" />
        <video v-else-if="isVideo(slotProps.item)" :src="slotProps.item" class="gallery-thumbnail" />
      </template>
    </Galleria>

  </div>

  <!-- Show message if nothing is selected -->
  <div v-else class="no-manifest-selected">
    Select an item to see details.
  </div>
</template>

<style scoped>
.manifest-info {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.info-header {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.info-name {
  font-size: 1.5em;
  font-weight: bold;
}

.info-author {
  color: #666;
  font-size: 0.9em;
  font-style: italic;
}

.info-version {
  color: #999;
  font-size: 0.85em;
}

.info-description {
  line-height: 1.6;
  color: #333;
}

.no-manifest-selected {
  padding: 20px;
  text-align: center;
  color: #999;
}

.cover-gallery {
  margin: 10px 0;
}

.gallery-item-image,
.gallery-item-video {
  width: 100%;
  height: auto;
  max-height: 500px;
  object-fit: contain;
}

.gallery-item-image.clickable {
  cursor: pointer;
}

.fullscreen-item {
  width: 100%;
  height: auto;
  max-height: 80vh;
  object-fit: contain;
}

.gallery-thumbnail {
  width: 100%;
  height: 60px;
  object-fit: cover;
  cursor: pointer;
}

/* Hide volume controls from video player */
.gallery-item-video::-webkit-media-controls-volume-slider,
.gallery-item-video::-webkit-media-controls-mute-button {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  width: 0 !important;
  height: 0 !important;
  pointer-events: none !important;
}

.gallery-item-video::-moz-media-controls-volume-slider,
.gallery-item-video::-moz-media-controls-mute-button {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  width: 0 !important;
  height: 0 !important;
  pointer-events: none !important;
}

/* Also try to hide the volume control container */
.gallery-item-video::-webkit-media-controls-volume-control-container,
.gallery-item-video::-webkit-media-controls-volume-control-hover-background {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  width: 0 !important;
  pointer-events: none !important;
}
</style>
