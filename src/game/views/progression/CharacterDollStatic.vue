<script setup lang="ts">
import { Character } from '../../core/character/character';
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import { CHARACTER_VIEWPORT_ASPECT_RATIO, VIEW_CROSSFADE_SECONDS, parseAspectRatio } from '../../utils/characterReference';
import { Game } from '../../game';

const props = defineProps<{
  character: Character;
  naturalSize?: boolean;
  mirror?: boolean;
  directRender?: boolean; // Bypass event system for gallery/ephemeral characters
  enableAppear?: boolean; // Enable appear animations on mount
  view?: string; // Render specific views (e.g. ['back']). If set, skips viewless base layers.
  instantLayers?: boolean; // Disable fade transition on layer changes (for combat animations)
}>();

// One source of truth for the layer fade: the CSS transition below and the mask-activation
// delay that waits for it both read it, and CharacterSlot eases the per-view art transform
// over the same window so a view swap reads as a single crossfade.
const layerFadeCss = `${VIEW_CROSSFADE_SECONDS}s`;
const LAYER_FADE_MS = VIEW_CROSSFADE_SECONDS * 1000;

const getLayerClasses = (layerId: string) => {
  const styles = props.character.skinLayerStyles.get(layerId);
  return styles ? styles.join(' ') : '';
};

// Keep-mask layers (hats + clip carriers) render DQ9-style: no fade, clip the same frame.
// Every timing here has an artifact (fade+delayed clip = hair pokes through the hat,
// fade+instant clip = bald window, no-fade = hat pops in ahead of a fading doll);
// popping is the accepted least-bad.
const isKeepLayer = (layerId: string) => {
  const def = Game.getInstance().characterSystem.skinLayersMap.get(layerId) as any;
  return def?.mask_mode === 'keep';
};

// Build image layers - either directly from skinLayers or via event system
const imageLayers = computed(() => {
  // If views are requested, use view-filtered layers
  if (props.view) {
    return props.character.getImageLayersForView(props.view);
  }
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

// Natural sizes per image URL, captured on load — keep-mode masks need them to remap
// their polygons from image space into element space (see remapKeepPolygon).
const naturalSizes = ref<Map<string, { w: number; h: number }>>(new Map());

const onImageLoad = (event: Event) => {
  const img = event.target as HTMLImageElement;
  // key by the raw attribute value — it matches layer.image; img.src is the resolved absolute URL
  const key = img?.getAttribute('src');
  if (key && img.naturalWidth && !naturalSizes.value.has(key)) {
    naturalSizes.value.set(key, { w: img.naturalWidth, h: img.naturalHeight });
  }
};

/**
 * Keep-mode mask polygons are authored in the TARGET layer's IMAGE coordinates (that is what
 * the editor's mask tool shows, and what ported clip-path data means). The rendered <img> is
 * object-fit: contain inside the doll's fixed-aspect element, so the drawn picture is letter-
 * boxed and element-relative clip-path %s would land shifted. Remap each point image% → element%.
 */
const remapKeepPolygon = (polygon: string, imageUrl: string): string | null => {
  // natural-size mode renders the img at its own aspect — no letterboxing, no remap needed.
  if (props.naturalSize) return polygon;

  const size = naturalSizes.value.get(imageUrl);
  if (!size) return null; // not loaded yet — skip the clip for a frame rather than misclip

  const elementRatio = parseAspectRatio(CHARACTER_VIEWPORT_ASPECT_RATIO);
  const imageRatio = size.w / size.h;
  // object-fit: contain — the displayed picture fills fraction fx × fy of the element.
  const fx = Math.min(imageRatio / elementRatio, 1);
  const fy = Math.min(elementRatio / imageRatio, 1);

  const match = polygon.match(/polygon\(([^)]+)\)/);
  if (!match) return null;
  const points = match[1].split(',').map(p => {
    const [x, y] = p.trim().split(/\s+/).map(parseFloat);
    const ex = (1 - fx) * 50 + x * fx;
    const ey = (1 - fy) * 50 + y * fy;
    return `${ex.toFixed(2)}% ${ey.toFixed(2)}%`;
  });
  return `polygon(${points.join(', ')})`;
};

// Watch for layer changes and manage mask activation with delay
watch(imageLayers, (newLayers, oldLayers) => {
  const newImages = new Set(newLayers.map(l => l.image));
  const oldImages = new Set((oldLayers || []).map(l => l.image));

  // Find newly added layers with masks
  for (const layer of newLayers) {
    if (layer.mask && !oldImages.has(layer.image)) {
      if (isKeepLayer(layer.layerId)) {
        // Keep-mask layers enter without a fade (see .no-fade) — clip immediately.
        activeMasks.value.add(layer.image);
        continue;
      }
      // New layer with mask - delay activation until the fade has finished
      const timer = setTimeout(() => {
        activeMasks.value.add(layer.image);
        pendingTimers.delete(layer.image);
      }, LAYER_FADE_MS);
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

// Get style for a layer: mirror flip + any active mask from layers above.
// Art offset (dx/dy/scale) is applied on the .character-doll wrapper so each img stays
// free of inline transform — that lets CharacterFace's :deep(.character-doll-image)
// face_shift transform win for face crop.
const getLayerStyle = (index: number) => {
  const style: Record<string, string> = {};

  if (props.mirror) {
    style.transform = 'scaleX(-1)';
  }

  const layers = imageLayers.value;
  const skinLayersMap = Game.getInstance().characterSystem.skinLayersMap;
  const layerId = layers[index]?.layerId;

  // Runtime self-clip (e.g. hair trimmed under a hat, set from a character_render listener).
  // Image-space polygon, same contract as keep masks, so it goes through remapKeepPolygon.
  const runtimeClip = props.character.skinLayerClips?.get(layerId);
  if (runtimeClip) {
    const remapped = remapKeepPolygon(runtimeClip, layers[index].image);
    if (remapped) {
      style.clipPath = remapped;
      style['-webkit-clip-path'] = remapped;
      return style;
    }
  }

  // Otherwise, apply any active keep/hide mask from a layer above.
  for (let i = index + 1; i < layers.length; i++) {
    const above = layers[i];
    if (!above.mask || !activeMasks.value.has(above.image)) continue;

    const aboveDef = skinLayersMap.get(above.layerId) as any;
    // mask_targets narrows which layers the mask touches; empty = every layer below.
    const targets: string[] = aboveDef?.mask_targets || [];
    if (targets.length && !targets.includes(layerId)) continue;

    if (aboveDef?.mask_mode === 'keep') {
      // clip-path semantics: only what is INSIDE the polygon survives
      // (e.g. hair trimmed to the region a hat allows).
      const remapped = remapKeepPolygon(above.mask, layers[index].image);
      if (remapped) {
        style.clipPath = remapped;
        style['-webkit-clip-path'] = remapped;
      }
    } else {
      // Default: cut a hole — CSS mask-image with mask-composite: exclude.
      Object.assign(style, getInvertedMaskStyle(above.mask));
    }
    break;
  }

  return style;
};
</script>

<template>
  <div class="character-doll" :class="{ 'natural-size': naturalSize }">
    <TransitionGroup :name="instantLayers ? '' : 'layer-fade'" :appear="!instantLayers && (enableAppear || false)">
      <img class="character-doll-image" v-for="(layer, index) of imageLayers" :key="layer.image" :src="layer.image"
        :style="getLayerStyle(index)" :class="[getLayerClasses(layer.layerId), { 'no-fade': isKeepLayer(layer.layerId) }]"
        draggable="false" v-persist @load="onImageLoad" />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.character-doll {
  position: relative;
  height: 100%;
  display: inline-block;
  aspect-ratio: v-bind("CHARACTER_VIEWPORT_ASPECT_RATIO");
  pointer-events: none;
}

.character-doll-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
}

/* Fade transitions for adding/removing layers. Leaving layers stay in the DOM fading out while
   the incoming ones fade in, so a whole-view swap crossfades here rather than at the slot. */
.layer-fade-enter-active,
.layer-fade-leave-active {
  transition: opacity v-bind("layerFadeCss") ease;
}

.layer-fade-enter-from,
.layer-fade-leave-to {
  opacity: 0;
}

/* Keep-mask layers (hats, clip carriers) enter/leave instantly — transition: none makes
   Vue's transition timeout 0, the enter-from override kills the one transparent frame. */
.no-fade.layer-fade-enter-active,
.no-fade.layer-fade-leave-active {
  transition: none;
}

.no-fade.layer-fade-enter-from {
  opacity: 1;
}

/* Natural size mode for gallery — image's natural aspect drives wrapper width */
.character-doll.natural-size {
  height: 100%;
  width: fit-content;
  aspect-ratio: auto;
  flex-shrink: 0;
}

/* `inset: auto` must come BEFORE top/left — it is the shorthand for all four sides, so
   declaring it after would reset them and drop every non-first layer onto its STATIC position,
   i.e. immediately to the right of the in-flow first layer instead of stacked on it. */
.character-doll.natural-size .character-doll-image {
  position: absolute;
  inset: auto;
  top: 0;
  left: 0;
  height: 100%;
  width: auto;
  object-fit: unset;
}

.character-doll.natural-size .character-doll-image:first-child {
  position: relative;
}
</style>
