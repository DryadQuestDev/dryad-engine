<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  assets: string[];
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const index = ref(0);
const total = computed(() => props.assets.length);
const current = computed(() => props.assets[index.value]);
const isVideo = computed(() => /\.(mp4|webm|ogg|mov)(\?|$)/i.test(current.value || ''));

function next() {
  if (total.value === 0) return;
  index.value = (index.value + 1) % total.value;
}

function prev() {
  if (total.value === 0) return;
  index.value = (index.value - 1 + total.value) % total.value;
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
  else if (e.key === 'ArrowRight') next();
  else if (e.key === 'ArrowLeft') prev();
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="screenshots-overlay" @click.self="emit('close')">
    <button class="screenshots-overlay-close" @click="emit('close')" aria-label="Close">
      <i class="pi pi-times"></i>
    </button>

    <button
      v-if="total > 1"
      class="screenshots-overlay-nav screenshots-overlay-nav--prev"
      @click="prev"
      aria-label="Previous"
    >
      <i class="pi pi-chevron-left"></i>
    </button>

    <div class="screenshots-overlay-stage">
      <video
        v-if="isVideo"
        :key="current"
        :src="current"
        class="screenshots-overlay-media"
        controls
        autoplay
        playsinline
      />
      <img
        v-else
        :key="current"
        :src="current"
        class="screenshots-overlay-media"
        alt="Screenshot"
      />
    </div>

    <button
      v-if="total > 1"
      class="screenshots-overlay-nav screenshots-overlay-nav--next"
      @click="next"
      aria-label="Next"
    >
      <i class="pi pi-chevron-right"></i>
    </button>

    <div v-if="total > 1" class="screenshots-overlay-count">
      {{ index + 1 }} / {{ total }}
    </div>
  </div>
</template>

<style scoped>
.screenshots-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(8, 10, 14, 0.85);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  z-index: 1000;
  animation: screenshots-overlay-fade 0.2s ease-out;
}

@keyframes screenshots-overlay-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.screenshots-overlay-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(92vw, 1400px);
  height: min(88vh, 900px);
}

.screenshots-overlay-media {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: var(--glass-shadow);
}

.screenshots-overlay-close,
.screenshots-overlay-nav {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  color: rgba(216, 221, 228, 0.85);
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 50%;
  cursor: pointer;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: background 0.15s ease, color 0.15s ease;
}

.screenshots-overlay-close:hover,
.screenshots-overlay-nav:hover {
  background: var(--glass-bg-strong);
  color: #fff;
}

.screenshots-overlay-close {
  top: max(16px, env(safe-area-inset-top));
  right: max(16px, env(safe-area-inset-right));
}

.screenshots-overlay-nav--prev {
  left: max(16px, env(safe-area-inset-left));
  top: 50%;
  transform: translateY(-50%);
}

.screenshots-overlay-nav--next {
  right: max(16px, env(safe-area-inset-right));
  top: 50%;
  transform: translateY(-50%);
}

.screenshots-overlay-count {
  position: absolute;
  bottom: max(20px, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  font-size: 12px;
  letter-spacing: 0.18em;
  color: rgba(216, 221, 228, 0.85);
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 999px;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}
</style>
