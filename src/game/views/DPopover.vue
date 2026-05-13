<script setup lang="ts">
import { computed, ref, type Component } from 'vue';
import { useFloating, offset, flip, shift, autoUpdate, type Placement } from '@floating-ui/vue';

const props = defineProps<{
  anchor: HTMLElement | null;
  html?: string | null;
  component?: Component | null;
  componentProps?: Record<string, unknown>;
  width?: number | string;
  placement?: Placement;
  open: boolean;
}>();

const emit = defineEmits<{ enter: []; leave: [] }>();

const popupRef = ref<HTMLElement | null>(null);
const reference = computed(() => props.anchor);
const placement = computed<Placement>(() => props.placement ?? 'top');

const { floatingStyles } = useFloating(reference, popupRef, {
  placement,
  strategy: 'fixed',
  middleware: [offset(0), flip({ padding: 8 }), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
});

const widthCss = computed(() =>
  typeof props.width === 'number' ? `${props.width}px` : (props.width ?? '300px')
);
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && anchor"
      ref="popupRef"
      class="d-popover"
      :style="[floatingStyles, { width: widthCss }]"
      @mouseenter="emit('enter')"
      @mouseleave="emit('leave')"
    >
      <component v-if="component" :is="component" v-bind="componentProps ?? {}" />
      <div v-else-if="html" v-script="html" />
    </div>
  </Teleport>
</template>

<style scoped>
.d-popover {
  position: fixed;
  z-index: 9999;
  background: rgba(20, 20, 28, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  padding: 10px 12px;
  color: #ddd;
  font-size: 0.95em;
  line-height: 1.4;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  pointer-events: auto;
}
</style>
