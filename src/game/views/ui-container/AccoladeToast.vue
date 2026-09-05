<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { Game } from '../../game';

const game = Game.getInstance();
const system = game.accoladeSystem;

const DISPLAY_MS = 4500;
const GAP_MS = 350;
const DEFAULT_TIER_COLOR = '#D9A24B';

const showing = ref(false);
let timer: ReturnType<typeof setTimeout> | null = null;

// overlay_state goes null while a battle screen (or any non-exploration game_state) owns the
// screen — unlocks queue up and present after it hands back.
const canPresent = computed(() => game.getState('overlay_state') !== null);
const currentId = computed(() => system.toastQueue.value[0] ?? null);
const current = computed(() => (currentId.value ? system.accolades.get(currentId.value) : null));
const color = computed(() => {
  const tierId = current.value?.tier;
  return (tierId && system.tiers.get(tierId)?.color) || DEFAULT_TIER_COLOR;
});
const points = computed(() => (currentId.value ? system.getAccoladePoints(currentId.value) : 0));
const kicker = computed(() => system.line('accolades.toast_earned'));

watch([currentId, canPresent], ([id, ok]) => {
  // The screen got claimed mid-display (battle opened): hide without consuming the
  // queue entry — it re-presents when the screen hands back.
  if (!ok && showing.value) {
    if (timer) { clearTimeout(timer); timer = null; }
    showing.value = false;
    return;
  }
  if (id && ok && !showing.value && !timer) {
    timer = setTimeout(() => { timer = null; present(); }, GAP_MS);
  }
}, { immediate: true });

function present() {
  if (!currentId.value || !canPresent.value || showing.value) return;
  showing.value = true;
  timer = setTimeout(dismiss, DISPLAY_MS);
}

function dismiss() {
  if (timer) { clearTimeout(timer); timer = null; }
  showing.value = false;
  system.toastQueue.value.shift();
}

onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
</script>

<template>
  <transition name="accolade-toast">
    <div v-if="showing && current" class="accolade-toast" :style="{ '--tier-color': color }" @click="dismiss">
      <div class="medallion">✦</div>
      <div class="body">
        <div class="kicker">{{ kicker }}<span v-if="points" class="pts">+{{ points }}</span></div>
        <div class="name">{{ current.name }}</div>
        <div v-if="current.description" class="desc">{{ current.description }}</div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.accolade-toast {
  position: absolute;
  right: 1.2rem;
  bottom: 1.2rem;
  z-index: 400;
  display: grid;
  grid-template-columns: 46px 1fr;
  gap: 0.75rem;
  align-items: center;
  width: min(340px, calc(100vw - 2.4rem));
  padding: 0.8rem 1rem;
  border-radius: 11px;
  background: linear-gradient(135deg, rgba(34, 40, 28, 0.95), rgba(20, 25, 18, 0.95));
  border: 1px solid color-mix(in srgb, var(--tier-color) 50%, transparent);
  box-shadow: 0 12px 36px -12px rgba(0, 0, 0, 0.85), 0 0 26px -12px var(--tier-color);
  cursor: pointer;
  pointer-events: auto;
}

.medallion {
  width: 46px;
  height: 46px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: var(--tier-color);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid color-mix(in srgb, var(--tier-color) 55%, transparent);
  box-shadow: 0 0 16px -4px var(--tier-color);
}

.kicker {
  font-size: 0.56rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--tier-color);
}

.pts { margin-left: 0.5rem; color: rgba(255, 255, 255, 0.85); font-variant-numeric: tabular-nums; }

.name { font-weight: 600; font-size: 0.98rem; color: rgba(255, 255, 255, 0.94); }

.desc { font-size: 0.76rem; color: rgba(255, 255, 255, 0.55); line-height: 1.3; }

.accolade-toast-enter-active { transition: transform 0.3s ease, opacity 0.3s ease; }
.accolade-toast-leave-active { transition: transform 0.25s ease, opacity 0.25s ease; }
.accolade-toast-enter-from,
.accolade-toast-leave-to { transform: translateY(14px); opacity: 0; }
</style>
