<script setup lang="ts">
</script>

<template>
  <div class="rotate-phone-overlay">
    <img src="/assets/engine_assets/ui/rotate_phone.png" alt="Rotate your device" class="rotate-image" />
    <p class="rotate-text">Please rotate your device to landscape</p>
  </div>
</template>

<style scoped>
.rotate-phone-overlay {
  position: fixed;
  inset: 0;
  background: #fff;
  color: #000;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24px;
  padding: 20px;
  text-align: center;
  user-select: none;
  -webkit-user-select: none;
}

.rotate-image {
  max-width: 60vw;
  max-width: 60dvw;
  max-height: 60vh;
  max-height: 60dvh;
  object-fit: contain;
}

.rotate-text {
  font-family: var(--font-family-main, sans-serif);
  font-size: 18px;
  opacity: 0.85;
  margin: 0;
}
</style>
