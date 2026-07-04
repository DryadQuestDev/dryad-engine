<script setup lang="ts">
import { computed } from 'vue';
import { ManifestObject } from '../../../schemas/manifestSchema';
import { manifestPanelCollapsed as collapsed } from './manifestPanelState';

const props = withDefaults(defineProps<{
  manifest: ManifestObject | null;
  active?: boolean;
  closable?: boolean;
}>(), {
  active: undefined,
  closable: false,
});

defineEmits<{ (e: 'screenshots'): void; (e: 'toggle'): void; (e: 'close'): void }>();

const hasScreenshots = computed(() => (props.manifest?.cover_assets || []).length > 0);
const showMeta = computed(() => !!(props.manifest?.version || props.manifest?.author));
</script>

<template>
  <div v-if="manifest" class="manifest-panel" :class="{ 'manifest-panel--collapsed': collapsed }">
    <button v-if="typeof active !== 'boolean'" class="manifest-panel-collapse-btn"
      :class="{ 'manifest-panel-collapse-btn--alone': !hasScreenshots }" @click="collapsed = !collapsed"
      :aria-label="collapsed ? 'Expand description' : 'Collapse description'">
      <i :class="collapsed ? 'pi pi-chevron-down' : 'pi pi-chevron-up'"></i>
    </button>
    <button v-if="closable" class="manifest-panel-close-btn"
      :class="{ 'manifest-panel-close-btn--alone': !hasScreenshots }" @click="$emit('close')" aria-label="Close">
      <i class="pi pi-times"></i>
    </button>
    <button v-if="hasScreenshots" class="manifest-panel-screenshots-btn" @click="$emit('screenshots')"
      aria-label="Screenshots">
      <i class="pi pi-images"></i>
    </button>
    <div class="manifest-panel-title-block">
      <div class="manifest-panel-title-row">
        <h1 class="manifest-panel-title">{{ manifest.name }}</h1>
        <button v-if="typeof active === 'boolean'" type="button" class="manifest-panel-badge"
          :class="active ? 'manifest-panel-badge--active' : 'manifest-panel-badge--inactive'"
          :title="active ? 'Click to deactivate' : 'Click to activate'" @click="$emit('toggle')">
          {{ active ? 'Active' : 'Inactive' }}
        </button>
      </div>
      <div v-if="showMeta" class="manifest-panel-meta">
        <span v-if="manifest.version">v{{ manifest.version }}</span>
        <span v-if="manifest.version && manifest.author" class="manifest-panel-meta-sep">·</span>
        <span v-if="manifest.author">by {{ manifest.author }}</span>
      </div>
    </div>
    <slot />
    <div v-if="manifest.description && !collapsed" class="manifest-panel-description dark-scrollbar">
      <div v-html="manifest.description"></div>
    </div>
  </div>
</template>

<style scoped>
.manifest-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1 1 320px;
  max-width: 640px;
  min-width: 0;
  height: 100%;
  min-height: 0;
  padding: 28px 32px;
  overflow: hidden;
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 16px;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-shadow);
}

.manifest-panel>* {
  flex-shrink: 0;
}

.manifest-panel-title-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.manifest-panel-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-right: 92px;
}

.manifest-panel-title {
  margin: 0;
  font-family: var(--font-family-serif);
  font-size: 2rem;
  font-weight: 600;
  line-height: 1.05;
  color: #fff;
  text-shadow: 0 2px 24px rgba(0, 0, 0, 0.6);
}

.manifest-panel-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  border-radius: 999px;
  border: 1px solid;
  flex-shrink: 0;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease, filter 0.15s ease;
}

.manifest-panel-badge--active {
  color: #0b0d10;
  background: var(--glass-tint);
  border-color: var(--glass-tint);
}

.manifest-panel-badge--active:hover {
  filter: brightness(1.1);
}

.manifest-panel-badge--inactive {
  color: rgba(216, 221, 228, 0.65);
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.12);
}

.manifest-panel-badge--inactive:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  border-color: var(--glass-tint);
}

.manifest-panel-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
  letter-spacing: 0.08em;
  color: rgba(216, 221, 228, 0.55);
}

.manifest-panel-meta-sep {
  opacity: 0.5;
}

.manifest-panel-description {
  font-size: 15px;
  line-height: 1.55;
  color: #ffffff;
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.manifest-panel-description :deep(p) {
  margin: 0 0 8px;
}

.manifest-panel-description :deep(p:last-child) {
  margin-bottom: 0;
}

.manifest-panel--collapsed {
  height: auto;
  min-height: 0;
  align-self: flex-start;
}

.manifest-panel-collapse-btn {
  position: absolute;
  top: 16px;
  right: 60px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: rgba(216, 221, 228, 0.75);
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 50%;
  cursor: pointer;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: background 0.15s ease, color 0.15s ease;
  z-index: 1;
}

.manifest-panel-collapse-btn--alone {
  right: 16px;
}

.manifest-panel-collapse-btn:hover {
  background: var(--glass-bg-strong);
  color: var(--glass-tint);
}

.manifest-panel-collapse-btn i {
  font-size: 14px;
}

.manifest-panel-close-btn {
  position: absolute;
  top: 16px;
  right: 60px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: rgba(216, 221, 228, 0.75);
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 50%;
  cursor: pointer;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: background 0.15s ease, color 0.15s ease;
  z-index: 1;
}

.manifest-panel-close-btn--alone {
  right: 16px;
}

.manifest-panel-close-btn:hover {
  background: var(--glass-bg-strong);
  color: var(--glass-tint);
}

.manifest-panel-close-btn i {
  font-size: 14px;
}

.manifest-panel-screenshots-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: rgba(216, 221, 228, 0.75);
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 50%;
  cursor: pointer;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: background 0.15s ease, color 0.15s ease;
  z-index: 1;
}

.manifest-panel-screenshots-btn:hover {
  background: var(--glass-bg-strong);
  color: var(--glass-tint);
}

.manifest-panel-screenshots-btn i {
  font-size: 14px;
}

@media (pointer: coarse),
(max-width: 600px) {

  .manifest-panel-screenshots-btn,
  .manifest-panel-collapse-btn,
  .manifest-panel-close-btn {
    width: 48px;
    height: 48px;
  }

  .manifest-panel-collapse-btn,
  .manifest-panel-close-btn {
    right: 76px;
  }

  .manifest-panel-collapse-btn--alone,
  .manifest-panel-close-btn--alone {
    right: 16px;
  }

  .manifest-panel-screenshots-btn i,
  .manifest-panel-collapse-btn i,
  .manifest-panel-close-btn i {
    font-size: 20px;
  }
}

@supports not (backdrop-filter: blur(1px)) {

  .manifest-panel,
  .manifest-panel-screenshots-btn,
  .manifest-panel-collapse-btn,
  .manifest-panel-close-btn {
    background: rgba(20, 24, 29, 0.92);
  }
}
</style>
