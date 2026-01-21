<script setup lang="ts">
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { computed, ref, watch, onBeforeUnmount } from 'vue';

const game = Game.getInstance();

const props = defineProps<{
  character: Character;
  naturalSize?: boolean;
  mirror?: boolean;
  directRender?: boolean; // Bypass event system for gallery/ephemeral characters
  enableAppear?: boolean; // Enable appear animations on mount
}>();

const getLayerClasses = (layerId: string) => {
  const styles = props.character.skinLayerStyles.get(layerId);
  return styles ? styles.join(' ') : '';
};

// Build image layers - either directly from skinLayers or via event system
const imageLayers = computed(() => {
  if (props.directRender) {
    // Direct rendering for gallery - build from skinLayers (no event system)
    return props.character.buildImageLayersFromSkinLayers();
  } else {
    // Normal rendering - use event-filtered layers
    return props.character.imageLayersWithMeta;
  }
});

// Track which masks are "active" (delayed activation after layer enters)
const activeMasks = ref<Set<string>>(new Set());
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Watch for layer changes and manage mask activation with delay
watch(imageLayers, (newLayers, oldLayers) => {
  const newImages = new Set(newLayers.map(l => l.image));
  const oldImages = new Set((oldLayers || []).map(l => l.image));

  // Find newly added layers with masks
  for (const layer of newLayers) {
    if (layer.mask && !oldImages.has(layer.image)) {
      // New layer with mask - delay activation by 0.5s (match transition duration)
      const timer = setTimeout(() => {
        activeMasks.value.add(layer.image);
        pendingTimers.delete(layer.image);
      }, 500);
      pendingTimers.set(layer.image, timer);
    }
  }

  // Remove masks for layers that were removed
  for (const image of activeMasks.value) {
    if (!newImages.has(image)) {
      activeMasks.value.delete(image);
    }
  }

  // Cancel pending timers for removed layers
  for (const [image, timer] of pendingTimers) {
    if (!newImages.has(image)) {
      clearTimeout(timer);
      pendingTimers.delete(image);
    }
  }
}, { immediate: true });

// Cleanup timers on unmount
onBeforeUnmount(() => {
  for (const timer of pendingTimers.values()) {
    clearTimeout(timer);
  }
});

// Convert polygon CSS string to mask-image CSS properties
// Input: "polygon(x1% y1%, x2% y2%, ...)"
// Output: style object with mask properties that show everything EXCEPT the polygon
// Uses mask-composite: exclude to invert the mask (show everything except the polygon area)
function getInvertedMaskStyle(polygon: string): Record<string, string> {
  const match = polygon.match(/polygon\(([^)]+)\)/);
  if (!match) return {};

  // Parse points for SVG polygon (convert "x% y%" to "x,y" format)
  const svgPoints = match[1]
    .split(',')
    .map(p => {
      const [x, y] = p.trim().split(/\s+/);
      return `${parseFloat(x)},${parseFloat(y)}`;
    })
    .join(' ');

  // Create SVG with black polygon (black = hidden area in mask)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="${svgPoints}" fill="black"/></svg>`;
  const encoded = encodeURIComponent(svg);
  const dataUri = `url("data:image/svg+xml,${encoded}")`;

  return {
    // Two layers: polygon shape + full white background
    // mask-composite: exclude shows everything EXCEPT where both layers overlap
    maskImage: `${dataUri}, linear-gradient(#fff, #fff)`,
    maskSize: '100% 100%',
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskComposite: 'exclude',
    // Safari/WebKit support (uses 'xor' instead of 'exclude')
    WebkitMaskImage: `${dataUri}, linear-gradient(#fff, #fff)`,
    WebkitMaskSize: '100% 100%',
    WebkitMaskPosition: 'center',
    WebkitMaskRepeat: 'no-repeat',
    WebkitMaskComposite: 'xor'
  };
}

// Get style for a layer, including mask from layers above (only if mask is active)
const getLayerStyle = (index: number) => {
  const style: Record<string, string> = {};

  if (props.mirror) {
    style.transform = 'scaleX(-1)';
  }

  // Find if any layer above has a mask that should clip this layer
  // Only apply if the mask is "active" (after delay)
  const layers = imageLayers.value;
  for (let i = index + 1; i < layers.length; i++) {
    const layer = layers[i];
    if (layer.mask && activeMasks.value.has(layer.image)) {
      // Use CSS mask-image with mask-composite: exclude for inverted masking
      Object.assign(style, getInvertedMaskStyle(layer.mask));
      break;
    }
  }

  return style;
};
</script>

<template>
  <div class="character-doll" :class="{ 'natural-size': naturalSize }">
    <TransitionGroup name="layer-fade" :appear="enableAppear || false">
      <img class="character-doll-image" v-for="(layer, index) of imageLayers" :key="layer.image" :src="layer.image"
        :style="getLayerStyle(index)" :class="getLayerClasses(layer.layerId)" draggable="false" @load="game.persistImage(layer.image)" />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.character-doll {
  position: relative;
  width: auto;
  height: 100%;
  display: inline-block;
  pointer-events: none;
}

.character-doll-image {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: auto;
  object-fit: contain;
  user-select: none;
}

.character-doll-image:first-child {
  position: relative;
}

/* Fade transitions for adding/removing layers */
.layer-fade-enter-active,
.layer-fade-leave-active {
  transition: opacity 0.5s ease;
}

.layer-fade-enter-from,
.layer-fade-leave-to {
  opacity: 0;
}

/* Natural size mode for gallery */
.character-doll.natural-size {
  position: relative;
  height: 100%;
  width: fit-content;
  flex-shrink: 0;
}

.character-doll.natural-size .character-doll-image {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: auto;
}

.character-doll.natural-size .character-doll-image:first-child {
  position: relative;
}
</style>
