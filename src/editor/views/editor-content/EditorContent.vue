<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';
import Dbookmarks from '../dbookmarks/Dbookmarks.vue';
import Dform from '../dform/Dform.vue';
import EditorMap from '../editor-map/EditorMap.vue';
import EditorDocument from '../EditorDocument.vue';
import AnalyserComponent from '../AnalyserComponent.vue';
import DevPanel from '../DevPanel.vue';
import NewGameWizard from './NewGameWizard.vue';
import Button from 'primevue/button';
import { Editor } from '../../editor';

const editor = Editor.getInstance();

// --- Filtered Items State (Lifted) ---
const filteredItems = ref<any[]>([]);

// --- State ---
const isLeftColumnVisible = ref(true); // Left column visibility
const isFilterFormDirty = ref(false); // State for filter form dirtiness
const clearTriggerCount = ref(0);     // Counter to trigger clear in Dsearch

// --- Pagination State (Lifted) ---
const paginationData = ref<{
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  startIndex: number;
  endIndex: number;
} | null>(null);

// --- Debounce Function ---
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn.apply(this, args);
    }, delay);
  };
}

// --- Watcher to initialize/reset filteredItems ---
// Define the logic that should run when editor.activeObject.value changes
const activeObjectUpdateLogic = (newActiveObject: any) => {
  if (!isFilterFormDirty.value) {
    // Only update filteredItems if the filter form is NOT dirty.
    // This prevents overwriting Dform's filtered results when activeObject changes.
    console.log('[EditorContent] Active object changed (filters NOT dirty), updating filteredItems.');
    if (editor.isArray.value && Array.isArray(newActiveObject)) {
      filteredItems.value = [...newActiveObject];
    } else {
      filteredItems.value = [];
    }
  } else {
    // If filters ARE dirty, Dform is in control of filteredItems.
    // We avoid directly changing filteredItems here to prevent the "shows everything" issue.
    // Dform will continue to filter its current items. If activeObject has changed,
    // Dform's list might be stale until the filter is changed or cleared.
    console.log('[EditorContent] Active object changed (filters ARE dirty), filteredItems NOT directly updated by this watcher.');
  }
};

// Create a debounced version of this logic
const debouncedActiveObjectUpdateHandler = debounce(activeObjectUpdateLogic, 500); // 500ms debounce delay

let lastActiveObjectRef: any = null;

watch(() => editor.activeObject.value, (newActiveObject) => {
  if (!editor.isArray.value) {
    return;
  }

  // Reference changed (tab switch) → update immediately
  if (newActiveObject !== lastActiveObjectRef) {
    lastActiveObjectRef = newActiveObject;
    activeObjectUpdateLogic(newActiveObject);
    return;
  }

  // Deep mutation (form edit) → debounce
  debouncedActiveObjectUpdateHandler(newActiveObject);
}, { deep: true, immediate: true });

// --- Autoselect first match when the ID search box drives the filter ---
// Set on typing in the Dbookmarks search input, consumed when the (debounced) sift result arrives
const pendingIdAutoselect = ref(false);

function handleIdSearchInput(value: string) {
  pendingIdAutoselect.value = value.trim() !== '';
}

// Typing then switching tabs within the sift debounce window must not hijack the restored bookmark
watch([() => editor.mainTab, () => editor.secondaryTab], () => {
  pendingIdAutoselect.value = false;
});

// --- Handler for updates from Dform/Dsearch ---
function handleFilteredUpdate(newFilteredData: any[]) {
  //console.log('[EditorContent] Received filtered-update event:', newFilteredData);
  filteredItems.value = newFilteredData;
  if (pendingIdAutoselect.value) {
    pendingIdAutoselect.value = false;
    const first = newFilteredData[0];
    if (first?.uid && editor.activeBookmarkId.value !== first.uid) {
      editor.activeBookmarkId.value = first.uid; // mirror Dbookmarks.scrollToBookmark
      handleBookmarkClick(first.uid);
    }
  }
}

// --- Handler for dirty state updates from Dform/Dsearch ---
function handleIsDirtyUpdate(isDirty: boolean) {
  // console.log('[EditorContent] Received update:isDirty event:', isDirty);
  isFilterFormDirty.value = isDirty;
}

// --- Function to trigger filter clear ---
function requestClearFilters() {
  // console.log('[EditorContent] requestClearFilters called, incrementing trigger.');
  clearTriggerCount.value++; // Incrementing the counter triggers the watcher in Dsearch
}

// --- Handler for pagination updates from Dform ---
function handlePaginationUpdate(data: typeof paginationData.value) {
  paginationData.value = data;
}

// --- State for bookmark navigation ---
const scrollToBookmarkId = ref<string | null>(null);

// --- Handler for bookmark click from Dbookmarks ---
function handleBookmarkClick(bookmarkId: string) {
  // Reset to null first to ensure the watcher fires even if clicking the same bookmark
  scrollToBookmarkId.value = null;

  // Use nextTick to ensure the reset happens before setting the new value
  nextTick(() => {
    scrollToBookmarkId.value = bookmarkId;
  });
}

// --- Left Column Toggle Logic ---
function toggleLeftColumn() {
  isLeftColumnVisible.value = !isLeftColumnVisible.value;
}

const componentName = ref('EditorContent');

// --- New Game Wizard ---
const showWizard = ref(false);

// Lifecycle hooks
onMounted(() => {
  console.log(`${componentName.value} component mounted.`);
});
</script>

<template>
  <div class="editor-content" :class="{ 'left-column-hidden': !isLeftColumnVisible }">
    <!-- Toggle Button -->
    <Button :icon="isLeftColumnVisible ? 'pi pi-chevron-left' : 'pi pi-chevron-right'"
      class="p-button-rounded p-button-text left-column-toggle" @click="toggleLeftColumn"
      aria-label="Toggle Bookmarks Panel" />

    <!-- Left Column (Bookmarks) -->
    <div class="column editor-left" v-if="isLeftColumnVisible">
      <Dbookmarks :items="filteredItems" :isFilterActive="isFilterFormDirty" :paginationData="paginationData"
        @clear-requested="requestClearFilters" @bookmark-click="handleBookmarkClick"
        @id-search-input="handleIdSearchInput" />
    </div>

    <!-- Right Column (Form/Map) -->
    <div class="column editor-right">
      <div v-if="editor.showMap.value" class="map_anchor" v-bind="{ 'data-bookmark-id': 'map' }"></div>
      <EditorMap v-if="editor.showMap.value" />
      <EditorDocument v-if="editor.mainTab === 'dungeons' && editor.secondaryTab === 'config'" />
      <AnalyserComponent v-if="editor.mainTab === 'dungeons' && editor.secondaryTab === 'config'" />
      <DevPanel v-if="editor.secondaryTab === 'dev_settings'" />
      <!-- Create from Template button (shown in new_game tab) -->
      <div v-if="editor.secondaryTab === 'new_game'" class="template-wizard-trigger">
        <div class="template-wizard-banner" @click="showWizard = true">
          <i class="pi pi-bolt"></i>
          <div class="template-wizard-text">
            <strong>Quick Start</strong>
            <span>Create a game from a pre-made template</span>
          </div>
          <i class="pi pi-chevron-right"></i>
        </div>
      </div>
      <NewGameWizard v-model:visible="showWizard" @game-created="showWizard = false" />
      <Dform :items="filteredItems" :triggerClear="clearTriggerCount" :scrollToBookmarkId="scrollToBookmarkId"
        @filtered-update="handleFilteredUpdate" @update:isDirty="handleIsDirtyUpdate"
        @pagination-update="handlePaginationUpdate" />
    </div>

  </div>
</template>

<style scoped src="./editor-content.component.css"></style>
