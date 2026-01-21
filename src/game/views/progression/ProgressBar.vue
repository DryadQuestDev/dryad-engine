<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  current: number;
  max: number;
  barColor?: string;
  bgColor?: string;
  width?: string;
  height?: string;
  hideMax?: boolean;
}>(), {
  barColor: '#42b983',
  bgColor: '#555',
  hideMax: false
});

const percentage = computed(() => {
  if (props.max <= 0) return 0;
  return Math.min(100, Math.max(0, (props.current / props.max) * 100));
});

const displayText = computed(() => {
  return props.hideMax ? String(props.current) : `${props.current} / ${props.max}`;
});
</script>

<template>
  <div class="progress-bar" :style="{ background: bgColor, width: width ?? '100px', height: height ?? '1.2rem' }">
    <div class="bar-fill" :style="{ width: percentage + '%', background: barColor }"></div>
    <span class="bar-text">{{ displayText }}</span>
  </div>
</template>

<style scoped>
.progress-bar {
  position: relative;
  /*height: 1.2rem;*/
  border-radius: 3px;
  overflow: hidden;
  flex-shrink: 0;
}

.bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  transition: width 0.3s ease;
}

.bar-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 0.75rem;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  white-space: nowrap;
}
</style>
