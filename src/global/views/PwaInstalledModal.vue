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
  background: rgba(0, 0, 0, 0.7);
  z-index: 5500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.installed-modal {
  background: #fff;
  color: #222;
  border-radius: 10px;
  padding: 24px 28px;
  max-width: 420px;
  width: 100%;
  position: relative;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  text-align: center;
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

p {
  color: #555;
  line-height: 1.5;
  margin: 0 0 20px 0;
}

.ok-btn {
  background: linear-gradient(135deg, #10B981 0%, #059669 100%);
  color: white;
  padding: 10px 28px;
  font-size: 1em;
  font-weight: 700;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
  transition: transform 0.15s ease;
}

.ok-btn:hover {
  transform: translateY(-1px);
}
</style>
