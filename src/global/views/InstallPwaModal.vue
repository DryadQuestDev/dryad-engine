<script setup lang="ts">
import { computed } from 'vue';
import { useMobile } from '../composables/useMobile';

const emit = defineEmits<{ close: [] }>();
const { installPromptEvent, promptInstall } = useMobile();

const platform = computed<'ios' | 'android' | 'other'>(() => {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'other';
});

const canPromptInstall = computed(() => !!installPromptEvent.value);

async function handleInstall() {
  const accepted = await promptInstall();
  if (accepted) emit('close');
}
</script>

<template>
  <div class="install-modal-backdrop" @click.self="emit('close')">
    <div class="install-modal">
      <button class="close-btn" @click="emit('close')" aria-label="Close">×</button>
      <h2>Install for Fullscreen</h2>
      <p class="description">
        To play without toolbars, add this app to your home screen.
      </p>

      <div v-if="canPromptInstall" class="install-section">
        <button class="install-button" @click="handleInstall">
          <i class="pi pi-download"></i>
          <span>Install App</span>
        </button>
      </div>

      <div v-else-if="platform === 'ios'" class="instructions">
        <h3>iOS Safari</h3>
        <ol>
          <li>Tap the <strong>Share</strong> button at the bottom of Safari</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
          <li>Tap <strong>Add</strong> in the top-right corner</li>
          <li>Launch from your home screen icon – no toolbars</li>
        </ol>
      </div>

      <div v-else-if="platform === 'android'" class="instructions">
        <h3>Android Chrome</h3>
        <ol>
          <li>Tap the <strong>three-dot menu</strong> in the top right of Chrome</li>
          <li>Tap <strong>Add to Home screen</strong> or <strong>Install app</strong></li>
          <li>Confirm by tapping <strong>Add</strong> or <strong>Install</strong></li>
          <li>Launch from your home screen icon – no toolbars</li>
        </ol>
      </div>

      <div v-else class="instructions">
        <h3>Other Browsers</h3>
        <p>Look for an "Install", "Add to Home Screen", or "Pin to Start" option in your browser menu.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.install-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(8, 10, 14, 0.65);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 5500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  padding-top: max(20px, env(safe-area-inset-top));
  padding-bottom: max(20px, env(safe-area-inset-bottom));
}

.install-modal {
  position: relative;
  max-width: 500px;
  width: 100%;
  max-height: 90dvh;
  overflow-y: auto;
  padding: 28px 28px;
  color: rgba(216, 221, 228, 0.92);
  background: var(--glass-bg-strong);
  border: var(--glass-border);
  border-radius: 16px;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--glass-shadow);
}

.close-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: var(--glass-border);
  border-radius: 50%;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
  color: rgba(216, 221, 228, 0.7);
  transition: background 0.15s ease, color 0.15s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

h2 {
  margin: 0 0 12px 0;
  font-family: var(--font-family-serif);
  font-size: 22px;
  font-weight: 600;
  color: #fff;
}

.description {
  color: rgba(216, 221, 228, 0.8);
  line-height: 1.55;
  margin-bottom: 20px;
  font-size: 14px;
}

.install-section {
  text-align: center;
  margin: 20px 0;
}

.install-button {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 14px 32px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: #0b0d10;
  background: var(--glass-tint);
  border: 1px solid var(--glass-tint);
  border-radius: 12px;
  cursor: pointer;
  box-shadow: var(--glass-shadow);
  transition: transform 0.12s ease, filter 0.15s ease;
}

.install-button:hover {
  transform: translateY(-1px);
  filter: brightness(1.1);
}

.instructions h3 {
  margin: 0 0 12px 0;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(216, 221, 228, 0.6);
}

.instructions ol {
  padding-left: 22px;
  line-height: 1.7;
  color: rgba(216, 221, 228, 0.9);
  font-size: 14px;
}

.instructions li {
  margin-bottom: 6px;
}

.instructions strong {
  color: #fff;
}

@media (pointer: coarse), (max-width: 720px) {
  .install-modal-backdrop {
    padding: 0;
  }
  .install-modal {
    width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    border: none;
    padding: 28px 24px;
    padding-top: max(28px, env(safe-area-inset-top));
    padding-bottom: max(28px, env(safe-area-inset-bottom));
  }
}

@supports not (backdrop-filter: blur(1px)) {
  .install-modal {
    background: rgba(20, 24, 29, 0.96);
  }
}
</style>
