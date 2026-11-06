<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Global } from '../../global';
import { ManifestObject } from '../../../schemas/manifestSchema';
import { displayCalendarDate } from '../../../utility/calendarDate';
import { groupedChangelog } from './changelog';

const props = defineProps<{
  manifest: ManifestObject;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const global = Global.getInstance();

// One block per release, its hotfixes folded in. The newest opens expanded; older ones fold until
// the player asks for them.
const entries = computed(() => groupedChangelog(props.manifest, (version) => global.getString('changelog.hotfix', { version })));
const open = ref<Set<number>>(new Set([0]));

function toggle(index: number) {
  const next = new Set(open.value);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  open.value = next;
}

const allOpen = computed(() => entries.value.length > 0 && entries.value.every((_, i) => open.value.has(i)));

function toggleAll() {
  open.value = allOpen.value ? new Set() : new Set(entries.value.map((_, i) => i));
}

const toggleAllLabel = computed(() => global.getString(allOpen.value ? 'changelog.collapse_all' : 'changelog.expand_all'));

const heading = computed(() => global.getString('changelog.title', { name: props.manifest.name || '' }));
const closeAriaLabel = computed(() => global.getString('close'));
// selectedLanguage reads a ref, so a language switch re-renders the dates.
const locale = computed(() => global.selectedLanguage || undefined);

function versionLabel(version: string | undefined) {
  return version ? global.getString('manifest.version', { version }) : '';
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return;
  // Marked handled, or App.vue's window listener would open the game menu as well.
  e.preventDefault();
  emit('close');
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="changelog-overlay" @click.self="emit('close')">
    <div class="changelog-overlay-panel" role="dialog" :aria-label="heading">
      <div class="changelog-overlay-header">
        <h2 class="changelog-overlay-heading">{{ heading }}</h2>
        <button v-if="entries.length > 1" type="button" class="changelog-overlay-toggle-all" @click="toggleAll">
          <i class="pi" :class="allOpen ? 'pi-minus' : 'pi-plus'"></i>
          <span>{{ toggleAllLabel }}</span>
        </button>
        <button class="changelog-overlay-close" @click="emit('close')" :aria-label="closeAriaLabel">
          <i class="pi pi-times"></i>
        </button>
      </div>

      <div class="changelog-overlay-list dark-scrollbar">
        <section v-for="(entry, i) in entries" :key="entry.key" class="changelog-entry"
          :class="{ 'changelog-entry--open': open.has(i) }">
          <button type="button" class="changelog-entry-header" :aria-expanded="open.has(i)" @click="toggle(i)">
            <span class="changelog-entry-version">{{ versionLabel(entry.version) }}</span>
            <span v-if="entry.title" class="changelog-entry-title">{{ entry.title }}</span>
            <span class="changelog-entry-end">
              <span v-if="entry.date" class="changelog-entry-date">{{ displayCalendarDate(entry.date, locale) }}</span>
              <i class="pi changelog-entry-chevron" :class="open.has(i) ? 'pi-chevron-up' : 'pi-chevron-down'"></i>
            </span>
          </button>
          <div v-if="open.has(i)" class="changelog-entry-body">
            <img v-if="entry.image" :src="entry.image" alt="" class="changelog-entry-image" />
            <div v-if="entry.notes" class="changelog-entry-notes" v-html="entry.notes"></div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.changelog-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(8, 10, 14, 0.85);
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  z-index: 1000;
  animation: changelog-overlay-fade 0.2s ease-out;
}

@keyframes changelog-overlay-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}

.changelog-overlay-panel {
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  max-height: min(84vh, 900px);
  background: var(--glass-bg-strong, var(--glass-bg));
  border: var(--glass-border);
  border-radius: 16px;
  box-shadow: var(--glass-shadow);
  overflow: hidden;
}

.changelog-overlay-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 24px 16px 28px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.changelog-overlay-heading {
  flex: 1;
  margin: 0;
  font-family: var(--font-family-serif);
  font-size: 1.6rem;
  font-weight: 600;
  line-height: 1.15;
  color: #fff;
}

.changelog-overlay-toggle-all {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 7px 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  white-space: nowrap;
  color: rgba(216, 221, 228, 0.85);
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.changelog-overlay-toggle-all i {
  font-size: 10px;
}

.changelog-overlay-toggle-all:hover {
  background: var(--glass-bg-strong);
  color: #fff;
}

.changelog-overlay-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  color: rgba(216, 221, 228, 0.85);
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.changelog-overlay-close:hover {
  background: var(--glass-bg-strong);
  color: #fff;
}

.changelog-overlay-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 24px 24px;
  overflow-y: auto;
}

.changelog-entry {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.03);
}

.changelog-entry--open {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.14);
}

.changelog-entry-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  font-family: inherit;
  text-align: left;
  color: inherit;
  background: none;
  border: none;
  cursor: pointer;
}

.changelog-entry-version {
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--glass-tint);
}

.changelog-entry-title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

/* Date and chevron ride the right edge together, so an undated entry keeps its chevron there. */
.changelog-entry-end {
  display: inline-flex;
  align-items: baseline;
  gap: 12px;
  margin-left: auto;
  flex-shrink: 0;
}

.changelog-entry-date {
  flex-shrink: 0;
  font-size: 12px;
  color: rgba(216, 221, 228, 0.55);
}

.changelog-entry-chevron {
  flex-shrink: 0;
  align-self: center;
  font-size: 12px;
  color: rgba(216, 221, 228, 0.55);
}

.changelog-entry-body {
  padding: 0 16px 16px;
}

.changelog-entry-image {
  display: block;
  width: 100%;
  max-height: 320px;
  object-fit: contain;
  margin-bottom: 12px;
  border-radius: 8px;
}

.changelog-entry-notes {
  font-size: 14.5px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.92);
}

.changelog-entry-notes :deep(h3) {
  margin: 14px 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(216, 221, 228, 0.7);
}

.changelog-entry-notes :deep(h4.changelog-hotfix) {
  margin: 14px 0 6px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(216, 221, 228, 0.7);
}

.changelog-entry-notes :deep(h3:first-child) {
  margin-top: 0;
}

.changelog-entry-notes :deep(ul) {
  margin: 0;
  padding-left: 20px;
}

.changelog-entry-notes :deep(li) {
  margin: 3px 0;
}

.changelog-entry-notes :deep(p) {
  margin: 0 0 8px;
}

@media (max-width: 600px) {
  .changelog-overlay {
    padding: 12px;
  }

  .changelog-entry-header {
    flex-wrap: wrap;
  }

  .changelog-entry-end {
    margin-left: 0;
  }
}
</style>
