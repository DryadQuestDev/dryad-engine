<script setup lang="ts">
import { Global } from '../../global';

defineProps<{
  disableLink?: boolean;
}>();

const global = Global.getInstance();
const ENGINE_URL = 'https://dryadengine.com';
</script>

<template>
  <div class="engine-logo">
    <a v-if="!disableLink" :href="ENGINE_URL" target="_blank" rel="noopener" class="engine-logo-text">
      Dryad Engine v{{ global.engineVersion }}
    </a>
    <span v-else class="engine-logo-text engine-logo-text--no-link">
      Dryad Engine v{{ global.engineVersion }}
    </span>
  </div>
</template>

<style scoped>
.engine-logo {
  position: fixed;
  bottom: 0;
  left: 0;
  padding: 12px 16px;
  padding-bottom: max(12px, env(safe-area-inset-bottom));
  padding-left: max(16px, env(safe-area-inset-left));
  z-index: 100;
  pointer-events: none;
}

.engine-logo-text {
  pointer-events: auto;
  display: inline-block;
  padding: 6px 12px;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(216, 221, 228, 0.65);
  text-decoration: none;
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 999px;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: color 0.2s ease, background 0.2s ease;
}

a.engine-logo-text:hover {
  color: var(--glass-tint);
  background: var(--glass-bg-strong);
}

.engine-logo-text--no-link {
  cursor: default;
}
</style>
