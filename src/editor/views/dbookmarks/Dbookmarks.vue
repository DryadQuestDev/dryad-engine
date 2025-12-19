<script setup lang="ts">
import { computed, ref, watch, onMounted, nextTick, PropType } from 'vue';
import { useIntersectionObserver } from '@vueuse/core';
import { Editor } from '../../editor';
import Button from 'primevue/button';
import FloatLabel from 'primevue/floatlabel';
import { Global } from '../../../global/global';
import { watchDebounced } from '@vueuse/core';

// PrimeVue components
import InputSwitch from 'primevue/inputswitch';
import InputNumber from 'primevue/inputnumber';

const editor = Editor.getInstance();
const global = Global.getInstance();

// --- Props --- Use defineProps for better type inference
const props = defineProps({
  items: {
    type: Array as PropType<any[] | null>,
    default: () => null // Use function for default object/array types
  },
  // Add prop for filter active state
  isFilterActive: {
    type: Boolean,
    default: false,
  },
  // Add prop for pagination data
  paginationData: {
    type: Object as PropType<{
      currentPage: number;
      totalPages: number;
      itemsPerPage: number;
      startIndex: number;
      endIndex: number;
    } | null>,
    default: () => null
  },
  // Add prop to signal when page navigation is happening
  isPageNavigating: {
    type: Boolean,
    default: false
  }
});

// --- Emits --- Add clear-requested and bookmark-click events
const emit = defineEmits<{
  (e: 'clear-requested'): void;
  (e: 'bookmark-click', bookmarkId: string): void;
}>();

// --- Computed: Group items by page ---
const itemsByPage = computed(() => {
  if (!props.items || !props.paginationData) {
    return [];
  }

  const groups: Array<{ page: number; items: any[] }> = [];
  const { itemsPerPage } = props.paginationData;

  for (let i = 0; i < props.items.length; i += itemsPerPage) {
    const pageNumber = Math.floor(i / itemsPerPage) + 1;
    const pageItems = props.items.slice(i, i + itemsPerPage);
    groups.push({ page: pageNumber, items: pageItems });
  }

  return groups;
});

// --- Active Bookmark State ---
const activeBookmarkId = ref<string | null>(null);
let stopObserver: (() => void) | null = null; // To store the observer stop function
let lastBookmarkClickTime = 0; // Track when user last clicked a bookmark

// --- Track if we've restored bookmark for current tab ---
const hasRestoredForCurrentTab = ref(false);

// --- Per-tab active bookmark storage key ---
const activeBookmarkStorageKey = computed(() => {
  return `dbookmarks-${editor.mainTab}-${editor.secondaryTab}-activeBookmark`;
});

// --- Reset restoration flag when tab changes ---
watch(activeBookmarkStorageKey, () => {
  hasRestoredForCurrentTab.value = false;
});

// --- Save active bookmark to localStorage whenever it changes ---
watch(activeBookmarkId, (newBookmarkId) => {
  if (newBookmarkId) {
    // Save all bookmarks including static ones
    localStorage.setItem(activeBookmarkStorageKey.value, newBookmarkId);
  }
});

// --- Load saved active bookmark when tab changes and items are available ---
watch(
  [activeBookmarkStorageKey, () => props.items],
  ([newKey, items]) => {
    // Only restore once per tab (prevents re-restoring when items change due to dragging)
    if (hasRestoredForCurrentTab.value) return;

    const stored = localStorage.getItem(newKey);
    if (stored) {
      const staticBookmarks = ['new_item', 'filters', 'map'];
      const isStaticBookmark = staticBookmarks.includes(stored);

      if (isStaticBookmark) {
        // Static bookmarks can be restored immediately without waiting for items
        if (activeBookmarkId.value !== stored) {
          hasRestoredForCurrentTab.value = true;
          // Use longer delay on initial load to ensure DOM is fully ready
          setTimeout(() => {
            scrollToBookmark(stored);
          }, 500);
        }
      } else {
        // For regular item bookmarks, check if they exist in items
        if (!items || items.length === 0) return;
        const itemExists = items.some(item => item.uid === stored);
        if (itemExists && activeBookmarkId.value !== stored) {
          hasRestoredForCurrentTab.value = true;
          // Use longer delay on initial load to ensure DOM is fully ready
          setTimeout(() => {
            scrollToBookmark(stored);
          }, 500);
        }
      }
    }
  },
  { immediate: false }
);

function addItem() {
  editor.addItem();
}

function saveActiveObject() {
  editor.saveActiveObject();
}

// --- Watch for schema changes to initialize/reset newItem ---
watch([() => editor.schema.value, () => editor.isArray.value], ([newSchema, isArray]) => {
  //console.log(`[Dform] Watch triggered. isArray: ${isArray}, Schema available: ${!!newSchema}`);
  //editor.newItem.value = {};
  editor.populateNewItemWithDefaults();
}, { immediate: true, deep: true }); // Added deep: true for schema changes

const componentName = ref('Dbookmarks');

// Methods (example)
// function someMethod() {
//   console.log('Method called');
// }

// Lifecycle hooks
onMounted(() => {
  console.log(`${componentName.value} component mounted.`);
  // Initial setup after DOM is ready
  nextTick(setupObserver); // Use nextTick for initial setup too
});

// --- Watch for item changes to reset observer ---
watchDebounced(() => editor.activeObject.value, (newValue, oldValue) => {
  // This watcher handles changes to the *underlying* full data set
  // console.log('[Dbookmarks] activeObject changed, resetting observer.');

  //activeBookmarkId.value = null; // Clear active state when base data changes
  if (stopObserver) {
    stopObserver();
    stopObserver = null;
  }
  nextTick(() => {
    setupObserver();
  });
}, { deep: true, debounce: 1000 }); // Watch deeply in case item properties change affecting IDs

// --- Watch for FILTERED item changes to reset observer ---

watchDebounced(() => props.items, (newItems, oldItems) => {
  // This watcher handles when the *filtered* list changes
  // Avoid unnecessary resets if the items array reference hasn't changed
  // or if it's just internal property changes (already handled by the deep activeObject watcher generally)
  // We mainly care when the *content* of the filtered list changes significantly.
  // A simple length check can often suffice for filter changes.
  if (newItems && oldItems && newItems.length === oldItems.length && newItems[0]?.uid === oldItems[0]?.uid) {
    // Skip reset if length and first item UID are the same (heuristic to avoid excessive resets)
    // console.log('[Dbookmarks] props.items watcher skipped reset (heuristic).');
    return;
  }

  //console.log('[Dbookmarks] props.items changed, resetting observer.');
  // activeBookmarkId.value = null; // Clear active state when filter changes
  if (stopObserver) {
    // console.log('[Dbookmarks] Stopping previous observer due to props.items change.');
    stopObserver();
    stopObserver = null;
  }
  nextTick(() => {
    //console.log('[Dbookmarks] Re-running setupObserver after props.items change.');
    setupObserver();
  });
}, { deep: true, debounce: 1000 }); // Watch deeply in case filter results change content but not length

// --- Watch for pagination changes to reset observer ---
watch(
  () => props.paginationData?.currentPage,
  () => {
    // When page changes, reset the observer to track new items on the page
    if (stopObserver) {
      stopObserver();
      stopObserver = null;
    }
    nextTick(() => {
      setupObserver();
    });
  }
);

// --- Watch for itemsPerPage changes to reset observer ---
watch(
  () => props.paginationData?.itemsPerPage,
  () => {
    // When items per page changes, reset the observer
    if (stopObserver) {
      stopObserver();
      stopObserver = null;
    }

    // Clear active bookmark if it's no longer on the current page
    if (activeBookmarkId.value && props.items && props.paginationData) {
      const itemIndex = props.items.findIndex(item => item.uid === activeBookmarkId.value);
      if (itemIndex >= 0) {
        const itemPage = Math.floor(itemIndex / props.paginationData.itemsPerPage) + 1;
        // If the active bookmark is not on the current page (which will be page 1 after items per page change)
        if (itemPage !== 1) {
          // Clear it - the observer will set a new one based on what's visible
          activeBookmarkId.value = null;
        }
      }
    }

    nextTick(() => {
      setupObserver();
    });
  }
);

// --- Watch for page navigation to disable/enable scrollspy ---
watch(
  () => props.isPageNavigating,
  (isNavigating) => {
    if (isNavigating) {
      // Page navigation started - stop the observer to prevent interference
      if (stopObserver) {
        stopObserver();
        stopObserver = null;
      }
    } else {
      // Page navigation completed - restart the observer after a delay
      // This ensures all scroll events and intersection callbacks have settled
      setTimeout(() => {
        setupObserver();
      }, 500); // 500ms delay to let all DOM updates and intersection events settle
    }
  }
);

// --- Scroll To Logic ---
function scrollToBookmark(uid: string) {
  // Set active bookmark immediately
  activeBookmarkId.value = uid;

  // Record the time of this bookmark click
  lastBookmarkClickTime = Date.now();

  // Emit the bookmark click event - parent will handle navigation and scrolling
  emit('bookmark-click', uid);
}

// --- Navigate to page ---
function navigateToPage(pageNumber: number) {
  if (!props.paginationData || !props.items || props.items.length === 0) return;

  // Find the first item on that page
  const itemIndex = (pageNumber - 1) * props.paginationData.itemsPerPage;
  if (itemIndex >= 0 && itemIndex < props.items.length) {
    const firstItemOnPage = props.items[itemIndex];
    if (firstItemOnPage && firstItemOnPage.uid) {
      scrollToBookmark(firstItemOnPage.uid);
    }
  }
}

// --- Scrollspy Logic ---
function setupObserver() {

  if (!editor.isArray.value) {
    return;
  }

  // Stop previous observer if setup is called again unexpectedly
  if (stopObserver) {
    stopObserver();
    stopObserver = null;
  }

  const scrollContainer = document.querySelector('.editor-right') as HTMLElement | null;
  if (!scrollContainer) {
    console.error("[Dbookmarks] Scroll container '.editor-right' not found for observer setup.");
    return; // Cannot set up observer without the root
  }

  // console.log('[Dbookmarks] Setting up intersection observer...');
  // Find all potential target elements in the document each time
  const targetsNodeList = document.querySelectorAll('[data-bookmark-id]');
  const targetsArray = Array.from(targetsNodeList) as HTMLElement[]; // Cast to HTMLElement[]

  if (targetsArray.length === 0) { // Check the array length
    console.warn('[Dbookmarks] No elements with data-bookmark-id found for observer.');
    return;
  }

  //console.log(`[Dbookmarks] Found ${targetsArray.length} target elements for observer.`);

  // Adjust root if scrolling happens in a specific container
  const { stop } = useIntersectionObserver(
    targetsArray,
    (entries) => { // Process all entries
      // Find the topmost intersecting element
      let topmostIntersectingEntry: IntersectionObserverEntry | null = null;

      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (!topmostIntersectingEntry || entry.boundingClientRect.top < topmostIntersectingEntry.boundingClientRect.top) {
            topmostIntersectingEntry = entry;
          }
        }
      }

      if (topmostIntersectingEntry) {
        const uid = topmostIntersectingEntry.target.getAttribute('data-bookmark-id');

        if (uid && activeBookmarkId.value !== uid) {
          // Ignore scrollspy updates for 1 second after a bookmark click
          // This prevents scrollspy from interfering during navigation
          const timeSinceClick = Date.now() - lastBookmarkClickTime;
          if (timeSinceClick < 1000) {
            return;
          }

          activeBookmarkId.value = uid;
        }
      } else {
        // Optional: Clear active ID if nothing is intersecting (scrolled past all items)
        // activeBookmarkId.value = null;
      }
    },
    {
      root: scrollContainer, // <<<--- Specify the scroll container
      threshold: 0, // Trigger as soon as any part becomes visible
      rootMargin: "0px 0px -80% 0px" // Prioritize elements entering the top ~20% of the container
    }
  );
  stopObserver = stop; // Store the stop function for cleanup

  //console.log('[Dbookmarks] Intersection observer setup complete.');
  // Set initial active bookmark (optional, e.g., find first visible)
  // Maybe trigger scroll to top or first item initially?
}

const onActiveStateChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  if (editor.map && editor.map.activeState) { // Ensure activeState ref itself exists
    editor.map.activeState.value = target.value;
    // The watchEffect in EditorMap.vue for editor.map.activeState.value should trigger UI updates there
  }
};

const isMapDungeon = computed(() => {
  return editor.map?.editorObject?.config?.dungeon_type === 'map';
});

const activeStateOptions = computed(() => {
  if (editor.map?.currentStates && editor.map?.stateIcons) {
    let states = editor.map.currentStates.value;
    // Only show fog_polygon tool for 'map' dungeon type
    if (!isMapDungeon.value) {
      states = states.filter(state => state !== 'rooms.fog_polygon');
    }
    return states.map(state => ({
      label: global.getString(state + '.title'),
      value: state,
      icon: editor.map.stateIcons[state] || 'pi-circle'
    }));
  }
  return [];
});

// Watching editor.isLoadMap() to see if we need to re-evaluate anything when map becomes available
watch(() => editor.showMap.value, (newVal, oldVal) => {
  if (newVal && !editor.map) {
    console.log("Dbookmarks: isLoadMap is true, but editor.map is not yet available. Waiting for editor.map to be initialized by EditorMap service.");
  } else if (newVal && editor.map) {
    console.log("Dbookmarks: Map is now loaded and available.");
    // You can trigger any logic here that depends on editor.map being fully ready
    // For example, if currentStates or activeState needs initial setup based on the map
    // Though, if they are part of the reactive editor.map object, they should update automatically.
  }
}, { immediate: true });

// Computed property for current subtab display name
const currentSubtabName = computed(() => {
  const currentTab = editor.getAllTabs().find(tab => tab.id === editor.mainTab);
  const currentSubtab = currentTab?.subtabs.find(subtab => subtab.id === editor.secondaryTab);
  return currentSubtab?.name ?? global.getString("tab." + editor.mainTab + "." + editor.secondaryTab);
});

</script>

<template>
  <div class="dbookmarks">
    <div class="buttons_container">
      <div class="add_button" v-if="editor.isArray.value">
        <Button raised icon="pi pi-plus" @click="addItem" severity="success" size="small" class="mt-2">Add New
          {{ editor.title.value }}</Button>
      </div>
      <div class="save_button">
        <Button raised icon="pi pi-plus" @click="saveActiveObject"
          :severity="editor.hasUnsavedChanges.value ? 'warning' : 'secondary'" size="small" class="mt-2">Save
          {{ currentSubtabName }}</Button>
      </div>
    </div>
    <div class="bookmark_list" v-if="editor.isArray.value">
      <!-- Static bookmark for "Add New Item" -->


      <div v-if="editor.map && editor.showMap.value">
        <div class="dungeon-menu">
          <!-- PrimeVue InputSwitch for mat-slide-toggle (only for 'map' dungeon type) -->
          <div v-if="isMapDungeon" class="p-field-checkbox" style="display: flex; align-items: center; margin-bottom: 10px;">
            <InputSwitch v-model="editor.map.isFogVisible.value" inputId="fogVisibleToggle" />
            <label for="fogVisibleToggle" style="margin-left: 8px;">Show Fog</label>
          </div>

          <div class="map_options">
            <div class="map_option p-float-label">
              <FloatLabel variant="on">
                <InputNumber v-if="editor.map.zoomFactor" v-model="editor.map.zoomFactor.value"
                  inputId="zoomFactorInput" mode="decimal" :minFractionDigits="1" :step="0.1" :min="0.1" :max="5"
                  :show-buttons="true" :inputStyle="{ width: '90px' }" />
                <label for="zoomFactorInput">Zoom: </label>
              </FloatLabel>

            </div>
            <div class="map_option">
              <div class="action-icons" v-if="editor.map.activeState">
                <Button v-for="option in activeStateOptions" :key="option.value" :icon="`pi ${option.icon}`"
                  :class="['action-icon-btn', { 'active-state': editor.map.activeState.value === option.value }]"
                  @click="editor.map.activeState.value = option.value" text rounded size="small"
                  :title="option.label" />
              </div>
            </div>
          </div>

          <div v-if="editor.map.activeState" class="map-state-description"
            v-html="global.getString(editor.map.activeState.value + '.description')"></div>
        </div>

        <div class="bookmark_item bookmark_title" @click="scrollToBookmark('map')"
          :class="{ active: activeBookmarkId === 'map' }">
          Map
        </div>
      </div>

      <div class="bookmark_item bookmark_title" :class="{ active: activeBookmarkId === 'new_item' }"
        @click="scrollToBookmark('new_item')">
        New {{ editor.title.value }}
      </div>
      <div class="bookmark_item bookmark_title filters-bookmark" :class="{ active: activeBookmarkId === 'filters' }"
        @click="scrollToBookmark('filters')">
        <!-- Icon first -->
        <i v-if="props.isFilterActive" class="pi pi-filter-slash clear-filter-icon"
          style="cursor: pointer; margin-right: 0.5em; font-size: 0.9em; vertical-align: middle;"
          aria-label="Clear Filters" @click.stop="emit('clear-requested')"></i>
        <span>Filters</span>
      </div>
      <hr>
      <!-- Dynamic bookmarks for items (grouped by page if pagination is active) -->
      <template v-if="props.items && props.items.length > 0">
        <!-- Show page dividers if pagination data is available -->
        <template v-if="paginationData">
          <div v-for="pageGroup in itemsByPage" :key="`page-${pageGroup.page}`">
            <!-- Page Divider -->
            <div class="page-divider" :class="{ 'current-page': pageGroup.page === paginationData.currentPage }"
              @click="navigateToPage(pageGroup.page)" style="cursor: pointer;">
              --- Page {{ pageGroup.page }} ---
            </div>
            <!-- Items in this page -->
            <div v-for="(item, index) in pageGroup.items" :key="item.uid || index" class="bookmark_item">
              <div class="bookmark_title" :class="{ active: activeBookmarkId === item.uid }"
                @click="scrollToBookmark(item.uid)">
                {{ item.id || `Item ${index + 1}` }} <!-- Fallback display text -->
              </div>
            </div>
          </div>
        </template>
        <!-- Show simple list if no pagination data -->
        <template v-else>
          <div v-for="(item, index) in props.items" :key="item.uid || index" class="bookmark_item">
            <div class="bookmark_title" :class="{ active: activeBookmarkId === item.uid }"
              @click="scrollToBookmark(item.uid)">
              {{ item.id || `Item ${index + 1}` }} <!-- Fallback display text -->
            </div>
          </div>
        </template>
      </template>
      <div v-else-if="editor.isArray.value" class="p-text-secondary p-2" style="font-size: 0.9em;">
        No items match filters.
      </div>
    </div>


  </div>
</template>

<style scoped src="./dbookmarks.component.css"></style>
