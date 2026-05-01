<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import Savelist from '../Savelist.vue';

const props = defineProps<{
  gameId: string | null;
  open: boolean;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close');
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Transition name="saves-drawer">
    <aside v-if="open" class="saves-drawer-panel">
      <header class="saves-drawer-header">
        <h2 class="saves-drawer-title">Saves</h2>
        <button class="saves-drawer-close" @click="emit('close')" aria-label="Close">
          <i class="pi pi-times"></i>
        </button>
      </header>
      <div class="saves-drawer-body">
        <Savelist :game-id="gameId" :is-from-game="false" />
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.saves-drawer-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: min(420px, 90vw);
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #0b0d10;
  border-left: var(--glass-border);
  box-shadow: var(--glass-shadow);
  color: rgba(216, 221, 228, 0.92);
  z-index: 500;
}

.saves-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 16px;
  padding-top: max(20px, env(safe-area-inset-top));
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.saves-drawer-title {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgba(216, 221, 228, 0.7);
  font-weight: 500;
}

.saves-drawer-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  color: rgba(216, 221, 228, 0.7);
  background: transparent;
  border: var(--glass-border);
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.saves-drawer-close:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
}

.saves-drawer-close i {
  font-size: 14px;
}

@media (pointer: coarse), (max-width: 600px) {
  .saves-drawer-close {
    width: 48px;
    height: 48px;
  }
  .saves-drawer-close i {
    font-size: 20px;
  }
}

.saves-drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 20px;
  padding-bottom: max(20px, env(safe-area-inset-bottom));
}

.saves-drawer-enter-active,
.saves-drawer-leave-active {
  transition: transform 0.25s ease;
}

.saves-drawer-enter-from,
.saves-drawer-leave-to {
  transform: translateX(100%);
}
</style>
