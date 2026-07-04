<script setup lang="ts">
import { computed } from 'vue';
import { ManifestObject } from '../../../schemas/manifestSchema';

const props = defineProps<{
  manifests: ManifestObject[];
}>();

interface PlacedWidget {
  key: string;
  domId: string | undefined;
  html: string;
  x: number;
  y: number;
}

interface MergedWidget {
  key: string;
  domId: string | undefined;
  html: string;
  x: number;
  y: number;
  disabled: boolean;
}

const widgets = computed<PlacedWidget[]>(() => {
  // Widgets with the same widget_id merge across active manifests in order
  // (_core first, then mods), field-level: a later entry only overrides the
  // fields it defines. A mod stub { widget_id, disabled: true } hides a
  // base-game widget without redefining it.
  const merged = new Map<string, MergedWidget>();
  const standalone: MergedWidget[] = [];
  for (const m of props.manifests) {
    const list = m?.landing_widgets;
    if (!list) continue;
    list.forEach((w, i) => {
      if (!w) return;
      if (!w.widget_id) {
        if (w.html) {
          standalone.push({
            key: `${m.id || ''}_${i}`,
            domId: undefined,
            html: w.html,
            x: w.x ?? 0,
            y: w.y ?? 0,
            disabled: !!w.disabled,
          });
        }
        return;
      }
      const prev = merged.get(w.widget_id);
      merged.set(w.widget_id, {
        key: w.widget_id,
        domId: w.widget_id,
        html: w.html || prev?.html || '',
        x: w.x ?? prev?.x ?? 0,
        y: w.y ?? prev?.y ?? 0,
        disabled: typeof w.disabled === 'boolean' ? w.disabled : (prev?.disabled ?? false),
      });
    });
  }
  return [...merged.values(), ...standalone]
    .filter(w => w.html && !w.disabled)
    .map(({ disabled, ...w }) => w);
});
</script>

<template>
  <div v-if="widgets.length" class="landing-widgets-layer">
    <div class="landing-widgets-stage">
      <div v-for="w in widgets" :key="w.key" class="landing-widget" :id="w.domId"
        :style="{ left: w.x + '%', top: w.y + '%' }" v-html="w.html"></div>
    </div>
  </div>
</template>

<style scoped>
.landing-widgets-layer {
  position: absolute;
  inset: 0;
  z-index: 5;
  container-type: size;
  pointer-events: none;
}

.landing-widgets-stage {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  aspect-ratio: 16 / 9;
  width: 100%;
  height: auto;
  max-height: 100%;
  container-type: size;
  container-name: landing-stage;
}

@container (min-aspect-ratio: 16/9) {
  .landing-widgets-stage {
    width: auto;
    height: 100%;
    max-width: 100%;
  }
}

.landing-widget {
  position: absolute;
  pointer-events: auto;
}
</style>
