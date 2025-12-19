<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { Game } from '../game';
import { LogObject } from '../systems/dungeonSystem';

const game = Game.getInstance();
const dungeonSystem = game.dungeonSystem;

const logsContentRef = ref<HTMLElement | null>(null);

const closePopup = () => {
  dungeonSystem.isLogsPopupOpen.value = false;
};

const formatLog = (log: LogObject): string => {
  if (log.isChoice) {
    return `> ${log.content}`;
  }
  if (log.character) {
    return `<span class="character-name">${log.character}:</span> ${log.content}`;
  }
  return log.content;
};

// Scroll to bottom when popup opens
watch(() => dungeonSystem.isLogsPopupOpen.value, async (isOpen) => {
  if (isOpen) {
    await nextTick();
    if (logsContentRef.value) {
      logsContentRef.value.scrollTop = logsContentRef.value.scrollHeight;
    }
  }
});
</script>

<template>
  <div v-if="dungeonSystem.isLogsPopupOpen.value" class="logs-popup-overlay" @click.self="closePopup">
    <div class="logs-popup">
      <div class="logs-header">
        <span class="logs-title">Logs</span>
        <button class="close-btn" @click="closePopup">
          <i class="pi pi-times"></i>
        </button>
      </div>
      <div ref="logsContentRef" class="logs-content">
        <div v-if="dungeonSystem.logs.length === 0" class="no-logs">
          No logs yet.
        </div>
        <div v-else class="log-list">
          <div v-for="(log, index) in dungeonSystem.logs" :key="index" class="log-entry"
            :class="{ 'choice': log.isChoice }">
            <span class="log-text" v-html="formatLog(log)"></span>
            <div v-if="log.flash && log.flash.length > 0" class="flash-content"
              v-html="log.flash.join('<br>')"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Popup overlay */
.logs-popup-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  pointer-events: auto;
}

/* Popup container */
.logs-popup {
  background: rgba(20, 20, 30, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

/* Header */
.logs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.logs-title {
  font-size: 1.2rem;
  font-weight: bold;
  color: #fff;
}

.close-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  padding: 4px 8px;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #fff;
}

/* Content */
.logs-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.no-logs {
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  padding: 20px;
  font-style: italic;
}

/* Log entries */
.log-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.log-entry {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  color: #fff;
}

.log-entry.choice {
  color: #5dade2;
  font-weight: 500;
}

.log-text {
  display: block;
  line-height: 1.5;
}

.log-text :deep(.character-name) {
  font-weight: bold;
}

/* Flash content - same style as OverlayNavigation */
.flash-content {
  padding: 8px 0 0 0;
  font-style: italic;
  color: antiquewhite;
}
</style>
