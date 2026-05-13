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
  formatNumbers?: boolean;
  label?: string;
}>(), {
  barColor: '#42b983',
  bgColor: '#555',
  hideMax: false,
  formatNumbers: false
});

const percentage = computed(() => {
  if (props.max <= 0) return 0;
  return Math.min(100, Math.max(0, (props.current / props.max) * 100));
});

const displayText = computed(() => {
  const formatNum = (n: number) => props.formatNumbers ? n.toLocaleString('en-US') : String(n);
  return props.hideMax ? formatNum(props.current) : `${formatNum(props.current)} / ${formatNum(props.max)}`;
});
</script>

<template>
  <div class="progress-bar" :style="{ background: bgColor, width: width ?? '100px', height: height ?? '1.5em' }">
    <div class="bar-fill" :style="{ width: percentage + '%', background: barColor }"></div>
    <div v-if="label" class="bar-split">
      <span class="bar-label">{{ label }}</span>
      <span class="bar-value">{{ displayText }}</span>
    </div>
    <span v-else class="bar-text">{{ displayText }}</span>
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
  font-weight: bold;
  white-space: nowrap;
  color: #fff;
  text-shadow:
    0 0 2px rgba(0, 0, 0, 0.9),
    0 0 3px rgba(0, 0, 0, 0.8),
    0 1px 2px rgba(0, 0, 0, 0.9);
}

.bar-split {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.5em;
  font-weight: bold;
  white-space: nowrap;
  gap: 0.5em;
  pointer-events: none;
  color: #fff;
  text-shadow:
    0 0 2px rgba(0, 0, 0, 0.9),
    0 0 3px rgba(0, 0, 0, 0.8),
    0 1px 2px rgba(0, 0, 0, 0.9);
}

.bar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.bar-value {
  flex-shrink: 0;
}
</style>
