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
  background: rgba(0, 0, 0, 0.7);
  z-index: 5500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.install-modal {
  background: #fff;
  color: #222;
  border-radius: 10px;
  padding: 24px 28px;
  max-width: 500px;
  width: 100%;
  max-height: 90dvh;
  overflow-y: auto;
  position: relative;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
}

.close-btn {
  position: absolute;
  top: 8px;
  right: 12px;
  background: none;
  border: none;
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
  color: #666;
  padding: 4px 10px;
}

.close-btn:hover {
  color: #000;
}

h2 {
  margin: 0 0 12px 0;
  font-size: 1.4em;
}

.description {
  color: #555;
  line-height: 1.5;
  margin-bottom: 20px;
}

.install-section {
  text-align: center;
  margin: 20px 0;
}

.install-button {
  background: linear-gradient(135deg, #10B981 0%, #059669 100%);
  color: white;
  padding: 14px 32px;
  font-size: 1.1em;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
  transition: transform 0.15s ease;
}

.install-button:hover {
  transform: translateY(-1px);
}

.instructions h3 {
  margin: 0 0 12px 0;
  font-size: 1.05em;
  color: #333;
}

.instructions ol {
  padding-left: 22px;
  line-height: 1.7;
  color: #333;
}

.instructions li {
  margin-bottom: 6px;
}

.note {
  margin-top: 16px;
  font-size: 0.9em;
  color: #888;
  font-style: italic;
}
</style>
