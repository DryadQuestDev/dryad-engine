<script setup lang="ts">
defineEmits<{ close: [] }>();
</script>

<template>
  <div class="installed-backdrop" @click.self="$emit('close')">
    <div class="installed-modal">
      <button class="close-btn" @click="$emit('close')" aria-label="Close">×</button>
      <h2>Installed!</h2>
      <p>
        Open the app from your home screen, your browser's menu, or your installed apps list – for fullscreen.
      </p>
      <button class="ok-btn" @click="$emit('close')">OK</button>
    </div>
  </div>
</template>

<style scoped>
.installed-backdrop {
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

.installed-modal {
  position: relative;
  max-width: 420px;
  width: 100%;
  padding: 32px 28px 28px;
  text-align: center;
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

p {
  color: rgba(216, 221, 228, 0.8);
  line-height: 1.55;
  margin: 0 0 24px 0;
  font-size: 14px;
}

.ok-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 32px;
  font-family: inherit;
  font-size: 14px;
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

.ok-btn:hover {
  transform: translateY(-1px);
  filter: brightness(1.1);
}

@media (pointer: coarse), (max-width: 720px) {
  .installed-backdrop {
    padding: 0;
  }
  .installed-modal {
    width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    border: none;
    padding: 32px 24px;
    padding-top: max(32px, env(safe-area-inset-top));
    padding-bottom: max(32px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
}

@supports not (backdrop-filter: blur(1px)) {
  .installed-modal {
    background: rgba(20, 24, 29, 0.96);
  }
}
</style>
