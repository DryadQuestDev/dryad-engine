<script setup lang="ts">
import { computed, ref, watch, PropType, nextTick, onMounted, onUnmounted } from 'vue';
import { useStorage } from '@vueuse/core';
import { Schema, Schemable } from '../../../utility/schema';
import { Editor } from '../../editor';
import Dsearch from '../dsearch/Dsearch.vue';
import Button from 'primevue/button';
import FormFieldRenderer from './FormFieldRenderer.vue'; // Import the new component
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import { Global } from '../../../global/global';
import DformPagination from './DformPagination.vue';
import CustomPopupWrapper from './CustomPopupWrapper.vue';

const editor = Editor.getInstance();
const global = Global.getInstance();

// --- Props --- Use defineProps for better type inference
const props = defineProps({
  items: {
    type: Array as PropType<any[] | null>,
    default: () => null // Use function for default object/array types
  },
  // Add triggerClear prop
  triggerClear: {
    type: Number,
    required: true,
  },
  // Add prop for bookmark navigation
  scrollToBookmarkId: {
    type: String as PropType<string | null>,
    default: null
  }
});

// --- Emits --- Define event to emit upwards
const emit = defineEmits<{
  (e: 'filtered-update', data: any[]): void;
  (e: 'update:isDirty', value: boolean): void; // Add event for dirty state
  (e: 'pagination-update', data: { currentPage: number; totalPages: number; itemsPerPage: number; startIndex: number; endIndex: number }): void;
}>();

// --- Handler to emit filter updates upwards ---
function emitFilteredUpdate(data: any[]) {
  emit('filtered-update', data);
}

// --- Handler to emit dirty state upwards ---
function emitIsDirtyUpdate(value: boolean) {
  emit('update:isDirty', value);
}

// --- Shared Settings ---
const dformSettings = useStorage('dform-settings', { itemsPerPage: 10, hideEmptySchemaFields: false });
const itemsPerPage = computed({
  get: () => dformSettings.value.itemsPerPage,
  set: (val: number) => { dformSettings.value.itemsPerPage = val; }
});

// Per-tab state (pagination + bookmark) in a single localStorage object
const dformTabState = useStorage('dform-tab-state', {} as Record<string, { currentPage: number, activeBookmark: string }>);
const tabKey = computed(() => `${editor.mainTab}-${editor.secondaryTab}`);

// --- Static bookmarks that should not trigger page navigation ---
const staticBookmarks = ['new_item', 'filters', 'map'];

// --- Scrollspy State (declared early — used by immediate watchers below) ---
let _scrollRafId: number | null = null;
const isScrollingProgrammatically = ref(false);
let programmaticScrollTimer: ReturnType<typeof setTimeout> | null = null;
let lastScrollTop = 0;
let scrollDirection: 'up' | 'down' = 'down';
let pendingRestore = false;

// Current page state (using computed storage key)
const currentPage = ref(1);

// Load current page from localStorage on mount or when tab changes
watch(
  tabKey,
  () => {
    const tabState = dformTabState.value[tabKey.value];
    currentPage.value = tabState?.currentPage ?? 1;
    editor.activeItemUids.value = new Set();
    isScrollingProgrammatically.value = true;
    if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);

    // Restore sidebar highlight immediately, but defer scroll to when items arrive
    editor.activeBookmarkId.value = tabState?.activeBookmark || 'new_item';
    pendingRestore = true;
    // Fade out stale content during tab transition
    const editorRight = document.querySelector('.editor-right');
    if (editorRight) editorRight.classList.add('navigating');
  },
  { immediate: true }
);

// Clean up navigating state when a non-array tab finishes loading
// (isArray is stale in the currentPageStorageKey watcher due to async loadActiveObject)
watch([() => editor.isArray.value, tabKey], ([isArray]) => {
  if (!isArray) {
    pendingRestore = false;
    isScrollingProgrammatically.value = false;
    document.querySelector('.editor-right')?.classList.remove('navigating');
  }
});

// Save current page to localStorage + clear activeItemUids on page change
watch(currentPage, (newPage) => {
  dformTabState.value[tabKey.value] = { ...dformTabState.value[tabKey.value], currentPage: newPage };
  editor.activeItemUids.value = new Set();
});

// Calculate total pages
const totalPages = computed(() => {
  if (!props.items || props.items.length === 0) return 1;
  return Math.ceil(props.items.length / itemsPerPage.value);
});

// Validate current page and reset if invalid
watch(
  [totalPages, () => props.items],
  () => {
    if (currentPage.value > totalPages.value) {
      currentPage.value = 1;
    }
  },
  { immediate: true }
);

// Reset to page 1 when itemsPerPage changes
watch(itemsPerPage, () => {
  // When itemsPerPage changes, we want to reset to page 1
  // and scroll to the first item (which the currentPage watcher will handle)
  currentPage.value = 1;
});

// Watch for tab changes and reset to page 1
watch(
  [() => editor.mainTab, () => editor.secondaryTab],
  () => {
    // Load stored page for new tab (already handled by currentPageStorageKey watcher)
    // Validation will happen in the totalPages watcher
  }
);

// --- Scroll compensation state ---
let pendingBottomJump: { uid: string; observer: MutationObserver; timer: ReturnType<typeof setTimeout> | null } | null = null;

function cancelPendingBottomJump() {
  if (pendingBottomJump) {
    pendingBottomJump.observer.disconnect();
    if (pendingBottomJump.timer) clearTimeout(pendingBottomJump.timer);
    pendingBottomJump = null;
  }

}

function waitForItemLoadAndJump(itemUid: string) {
  cancelPendingBottomJump();

  const scrollContainer = document.querySelector('.editor-right') as HTMLElement | null;
  const container = document.querySelector(`[data-item-uid="${itemUid}"]`) as HTMLElement | null;
  if (!scrollContainer || !container) return;

  // Find the item below (the one the user was scrolling from)
  const allItems = Array.from(scrollContainer.querySelectorAll('[data-item-uid]'));
  const newItemIndex = allItems.indexOf(container);
  const anchorUid = newItemIndex < allItems.length - 1
    ? (allItems[newItemIndex + 1] as HTMLElement).getAttribute('data-item-uid')
    : null;


  let timer: ReturnType<typeof setTimeout> | null = null;

  const observer = new MutationObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      observer.disconnect();
      pendingBottomJump = null;
    
      // Jump to the item the user was scrolling from (or filters for new_item)
      if (itemUid === 'new_item') {
        scrollToElement('filters');
      } else if (anchorUid) {
        scrollToElement(anchorUid);
      }
    }, 150);
  });

  observer.observe(container, { childList: true, subtree: true });
  pendingBottomJump = { uid: itemUid, observer, timer };

  // Safety timeout: clean up if no mutations within 2s
  setTimeout(() => {
    if (pendingBottomJump?.uid === itemUid) {
      cancelPendingBottomJump();
    }
  }, 2000);
}

// --- Item activation helpers ---
function activateVisibleItems(uids: string[], manualScroll = false) {
  let changed = false;
  const newUids: string[] = [];
  const newSet = new Set(editor.activeItemUids.value);
  for (const uid of uids) {
    if (!newSet.has(uid)) {
      newSet.add(uid);
      newUids.push(uid);
      changed = true;
    }
  }
  if (changed) {
    const newIds = newUids.map(uid => props.items?.find(item => item.uid === uid)?.id || uid);
    console.log(`[Dform] Activated items:`, newIds);
    editor.activeItemUids.value = newSet;

    // If scrolling up and a new item was activated, wait for it to load then jump to its bottom
    if (manualScroll && scrollDirection === 'up' && newUids.length > 0) {
      waitForItemLoadAndJump(newUids[0]);
    }
  }
}

function activateItem(bookmarkId: string) {
  if (staticBookmarks.includes(bookmarkId)) return;
  if (!editor.activeItemUids.value.has(bookmarkId)) {
    const itemId = props.items?.find(item => item.uid === bookmarkId)?.id || bookmarkId;
    console.log(`[Dform] Activated item: ${itemId}`);
    const newSet = new Set(editor.activeItemUids.value);
    newSet.add(bookmarkId);
    editor.activeItemUids.value = newSet;
  }
}

// --- Scrollspy detection ---
function detectActiveBookmark(manualScroll = false) {
  const scrollContainer = document.querySelector('.editor-right') as HTMLElement | null;
  if (!scrollContainer) return;

  const containerRect = scrollContainer.getBoundingClientRect();

  // 1) Active bookmark — uses [data-bookmark-id] headers (sidebar highlight)
  const bookmarkElements = scrollContainer.querySelectorAll('[data-bookmark-id]');
  let activeId: string | null = null;

  for (const el of bookmarkElements) {
    const rect = (el as HTMLElement).getBoundingClientRect();
    const id = (el as HTMLElement).getAttribute('data-bookmark-id');
    if (!id) continue;

    if (rect.top <= containerRect.top + containerRect.height * 0.4) {
      activeId = id;
    }
  }

  if (!activeId && bookmarkElements.length > 0) {
    activeId = (bookmarkElements[0] as HTMLElement).getAttribute('data-bookmark-id');
  }

  if (activeId && activeId !== editor.activeBookmarkId.value) {
    editor.activeBookmarkId.value = activeId;
    saveActiveBookmark(activeId);
  }

  // 2) Visible items — uses [data-item-uid] container divs (schema loading)
  // 40px top buffer matches scrollToElement offset, prevents top neighbor activation from header gap
  const allItemElements = Array.from(scrollContainer.querySelectorAll('[data-item-uid]'));
  const visibleItemUids: string[] = [];

  for (let i = 0; i < allItemElements.length; i++) {
    const rect = (allItemElements[i] as HTMLElement).getBoundingClientRect();
    if (rect.bottom > containerRect.top + 40 && rect.top < containerRect.bottom) {
      const uid = (allItemElements[i] as HTMLElement).getAttribute('data-item-uid');
      if (uid) visibleItemUids.push(uid);
    }
  }

  activateVisibleItems(visibleItemUids, manualScroll);
}

function onScroll() {
  if (_scrollRafId !== null) return;
  _scrollRafId = requestAnimationFrame(() => {
    _scrollRafId = null;
    if (isScrollingProgrammatically.value) return;

    // Cancel pending bottom jump — user is scrolling manually
    cancelPendingBottomJump();

    const scrollContainer = document.querySelector('.editor-right') as HTMLElement | null;
    if (scrollContainer) {
      scrollDirection = scrollContainer.scrollTop < lastScrollTop ? 'up' : 'down';
      lastScrollTop = scrollContainer.scrollTop;
    }

    detectActiveBookmark(true);
  });
}

function setupScrollspy() {
  const scrollContainer = document.querySelector('.editor-right') as HTMLElement | null;
  if (!scrollContainer) return;
  scrollContainer.addEventListener('scroll', onScroll, { passive: true });
}

function teardownScrollspy() {
  const scrollContainer = document.querySelector('.editor-right') as HTMLElement | null;
  if (scrollContainer) {
    scrollContainer.removeEventListener('scroll', onScroll);
  }
  if (_scrollRafId !== null) {
    cancelAnimationFrame(_scrollRafId);
    _scrollRafId = null;
  }
}

// --- Save/restore active bookmark per tab ---
function saveActiveBookmark(id: string) {
  dformTabState.value[tabKey.value] = { ...dformTabState.value[tabKey.value], activeBookmark: id };
}

function restoreActiveBookmark() {
  const stored = dformTabState.value[tabKey.value]?.activeBookmark;
  if (!stored) {
    editor.activeBookmarkId.value = 'new_item';
    document.querySelector('.editor-right')?.classList.remove('navigating');
    programmaticScrollTimer = setTimeout(() => {
      isScrollingProgrammatically.value = false;
      detectActiveBookmark();
    }, 200);
    return;
  }

  // Static bookmark (new_item, filters, map)
  if (staticBookmarks.includes(stored)) {
    editor.activeBookmarkId.value = stored;
    nextTick(() => requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToElement(stored));
    }));
    return;
  }

  // Item bookmark — find in items list
  const itemIndex = props.items?.findIndex(item => item.uid === stored);
  if (itemIndex !== undefined && itemIndex >= 0) {
    const targetPage = Math.floor(itemIndex / itemsPerPage.value) + 1;
    if (targetPage !== currentPage.value) {
      currentPage.value = targetPage;
    }
    editor.activeBookmarkId.value = stored;
    nextTick(() => {
      activateItem(stored);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToElement(stored));
      });
    });
  } else {
    editor.activeBookmarkId.value = 'new_item';
    document.querySelector('.editor-right')?.classList.remove('navigating');
    programmaticScrollTimer = setTimeout(() => {
      isScrollingProgrammatically.value = false;
      detectActiveBookmark();
    }, 200);
  }
}

// --- Scroll to element function (with programmatic scroll guard) ---
function scrollToElement(bookmarkId: string): void {
  const scrollContainer = document.querySelector('.editor-right') as HTMLElement | null;
  if (!scrollContainer) {
    isScrollingProgrammatically.value = false;
    return;
  }

  const targetElement = scrollContainer.querySelector(`[data-bookmark-id="${bookmarkId}"]`) as HTMLElement | null;
  if (!targetElement) {
    isScrollingProgrammatically.value = false;
    scrollContainer.classList.remove('navigating');
    return;
  }

  // Guard: prevent scrollspy from firing during programmatic scroll
  isScrollingProgrammatically.value = true;
  if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);

  requestAnimationFrame(() => {
    const targetRect = targetElement.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const relativeTop = targetRect.top - containerRect.top;
    const targetScrollTop = scrollContainer.scrollTop + relativeTop - 40;

    scrollContainer.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'instant' });
    scrollContainer.classList.remove('navigating');

    // Clear guard after scroll settles, then re-detect visible items (no top neighbor — avoid jerk)
    programmaticScrollTimer = setTimeout(() => {
      isScrollingProgrammatically.value = false;
      detectActiveBookmark();
    }, 200);
  });
}

// --- Watch for bookmark navigation ---
watch(
  () => props.scrollToBookmarkId,
  (bookmarkId) => {
    if (!bookmarkId) return;

    saveActiveBookmark(bookmarkId);

    // Set guard EARLY — block scrollspy during entire activation + scroll sequence
    isScrollingProgrammatically.value = true;
    if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);

    const isStaticBookmark = staticBookmarks.includes(bookmarkId);

    if (isStaticBookmark) {
      nextTick(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToElement(bookmarkId);
          });
        });
      });
    } else {
      const itemIndex = props.items?.findIndex(item => item.uid === bookmarkId);

      if (itemIndex !== undefined && itemIndex >= 0) {
        const targetPage = Math.floor(itemIndex / itemsPerPage.value) + 1;

        if (targetPage !== currentPage.value) {
          currentPage.value = targetPage;
        }

        // Activate AFTER page change settles (currentPage watcher clears activeItemUids synchronously)
        nextTick(() => {
          activateItem(bookmarkId);
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scrollToElement(bookmarkId);
            });
          });
        });
      }
    }
  }
);

// Paginated items (slice the filtered items array)
const paginatedItems = computed(() => {
  if (!props.items || props.items.length === 0) return [];

  const start = (currentPage.value - 1) * itemsPerPage.value;
  const end = start + itemsPerPage.value;

  return props.items.slice(start, end);
});

// --- Expose pagination data for parent components ---
const paginationData = computed(() => ({
  currentPage: currentPage.value,
  totalPages: totalPages.value,
  itemsPerPage: itemsPerPage.value,
  startIndex: (currentPage.value - 1) * itemsPerPage.value,
  endIndex: Math.min(currentPage.value * itemsPerPage.value, props.items?.length || 0)
}));

// Emit pagination data to parent
watch(paginationData, (data) => {
  emit('pagination-update', data);
}, { immediate: true });

// --- Copy Item Logic ---
function copyItem(paginatedIndex: number) {
  // Convert paginated index to filtered items index
  const filteredIndex = (currentPage.value - 1) * itemsPerPage.value + paginatedIndex;

  if (props.items && filteredIndex >= 0 && filteredIndex < props.items.length) {
    const itemToCopy = props.items[filteredIndex];
    if (editor.isArray.value && Array.isArray(editor.activeObject.value)) {
      // Create a deep copy of the item
      const copiedItem = JSON.parse(JSON.stringify(itemToCopy));

      // Modify the id to add " copy" suffix
      if (copiedItem.id) {
        copiedItem.id = copiedItem.id + " copy";
      }

      // Generate a new uid for the copied item
      copiedItem.uid = editor.createUid();

      // Find the original item index in the full array
      const originalIndex = editor.activeObject.value.findIndex(item => item === itemToCopy);

      // Insert the copied item right after the original
      if (originalIndex !== -1) {
        editor.activeObject.value.splice(originalIndex + 1, 0, copiedItem);
      } else {
        // Fallback: add to end
        editor.activeObject.value.push(copiedItem);
      }
    }
  } else {
    console.warn("[Dform] copyItem called with invalid index or items prop.");
  }
}

// --- Remove Item Logic ---
function removeItem(paginatedIndex: number) {
  // Note: This modifies the original editor object directly.
  // The parent's watcher on editor.activeObject.value should update the list.
  // Convert paginated index to filtered items index
  const filteredIndex = (currentPage.value - 1) * itemsPerPage.value + paginatedIndex;

  if (props.items && filteredIndex >= 0 && filteredIndex < props.items.length) {
    const itemToRemove = props.items[filteredIndex];
    if (editor.isArray.value && Array.isArray(editor.activeObject.value)) {
      const originalIndex = editor.activeObject.value.findIndex(item => item === itemToRemove); // Find in original array
      if (originalIndex !== -1) {
        editor.activeObject.value.splice(originalIndex, 1);
      }
    }
  } else {
    console.warn("[Dform] removeItem called with invalid index or items prop.");
  }
}

// ADD THIS LOG HANDLER
function handleAttributeChangeLog(item: any, fieldKey: string | number | symbol) {
  if (fieldKey === 'attributes') {
    console.log(`[Dform.vue] Item attributes changed for item ID ${item.id || '(no id)'}:`, JSON.parse(JSON.stringify(item.attributes)));
  }
}

// --- File Path Computation ---
const currentFilePath = computed(() => {
  const allTabs = editor.getAllTabs();
  const settings = allTabs.find(tab => tab.id === editor.mainTab)?.subtabs.find(subtab => subtab.id === editor.secondaryTab);

  if (!settings?.file) return null;

  let fileName = settings.file;

  // Replace [dungeon] placeholder if needed
  if (settings.requiresDungeon && editor.selectedDungeon) {
    fileName = fileName.replace('[dungeon]', `dungeons/${editor.selectedDungeon}`);
  }

  // Build the full path
  if (editor.selectedGame && editor.selectedMod) {
    return `games_files/${editor.selectedGame}/${editor.selectedMod}/${fileName}.json`;
  }

  return null;
});

// --- Open File in System Browser ---
async function openFileInBrowser() {
  if (!currentFilePath.value) return;

  const storage = global.storageService;
  if (storage && typeof storage.showFileInFolder === 'function') {
    try {
      const result = await storage.showFileInFolder(currentFilePath.value);
      if (!result.success) {
        console.error('[Dform] Error showing file in folder:', result.error);
      }
    } catch (error) {
      console.error('[Dform] Error calling showFileInFolder:', error);
    }
  }
}

// --- Custom Popup System ---
const activePopup = ref<{ id: string; item: any; itemUid: string; isNewItem: boolean } | null>(null);

// Get custom popup components for the current subtab
const popupComponents = computed(() => {
  if (!editor.customPopups.value || editor.customPopups.value.length === 0) {
    return [];
  }

  return editor.customPopups.value
    .map(id => editor.getCustomComponent(id))
    .filter(comp => comp !== undefined);
});

// Open a popup with a deep copy of the item
function openPopup(componentId: string, item: any) {
  // Check if this is the new item by comparing references
  const isNewItem = editor.newItem?.value && item === editor.newItem.value;

  activePopup.value = {
    id: componentId,
    item: JSON.parse(JSON.stringify(item)), // Deep copy
    itemUid: item.uid,
    isNewItem: isNewItem
  };
}

// Close the popup without saving
function closePopup() {
  activePopup.value = null;
}

// Save the mutated item back to the original array
function handlePopupSave(mutatedItem: any) {
  if (!activePopup.value) return;

  if (activePopup.value.isNewItem) {
    // Update the new item
    if (editor.newItem?.value) {
      Object.assign(editor.newItem.value, mutatedItem);
    }
  } else if (props.items) {
    // Find the original item by uid in existing items
    const originalItem = props.items.find(item => item.uid === activePopup.value!.itemUid);

    if (originalItem) {
      // Replace the original item with the mutated one
      // This automatically triggers editor.hasUnsavedChanges via deep watch
      Object.assign(originalItem, mutatedItem);
    } else {
      console.warn('[Dform] Could not find item with uid:', activePopup.value.itemUid);
    }
  }

  // Close the popup
  closePopup();
}

// --- Trigger initial detection when items render ---
// --- Restore active bookmark when items arrive after tab switch ---
watch(() => props.items, () => {
  if (pendingRestore) {
    pendingRestore = false;
    restoreActiveBookmark();
  }
});

watch(paginatedItems, () => {
  // Skip during programmatic navigation (bookmark click) — target item is already activated
  if (isScrollingProgrammatically.value) return;
  nextTick(() => requestAnimationFrame(() =>
    detectActiveBookmark()
  ));
});

// --- Lifecycle ---
onMounted(() => {
  setupScrollspy();
});

onUnmounted(() => {
  teardownScrollspy();
  cancelPendingBottomJump();
  if (programmaticScrollTimer) clearTimeout(programmaticScrollTimer);
});

</script>

<template>

  <div v-if="editor.schema.value" class="dform">





    <!-- === File Path === -->
    <div v-if="currentFilePath" class="file-path-container mb-4 p-2 border-round flex align-items-center gap-2"
      style="background-color: #f8f9fa; border: 1px solid #dee2e6;">
      <Button icon="pi pi-folder-open" @click="openFileInBrowser" size="small" text rounded />
      <code class="text-sm flex-1">{{ currentFilePath }}</code>
    </div>

    <!-- === Plugins Data Accordion === -->
    <Accordion v-if="editor.pluginObjects.value && Object.keys(editor.pluginObjects.value).length > 0" class="mb-4">
      <AccordionPanel value="0">
        <AccordionHeader>Plugins Data</AccordionHeader>
        <AccordionContent>
          <div class="plugin-data-container">
            <div v-for="(pluginData, pluginKey) in editor.pluginObjects.value" :key="pluginKey"
              class="plugin-item mb-3">
              <!--<h4 class="plugin-name mb-2">{{ pluginKey }}</h4>-->
              <pre class="plugin-json-display">{{ JSON.stringify(pluginData, null, 2) }}</pre>
            </div>
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>

    <!-- === Single Object Form === -->
    <div v-if="!editor.isArray.value" class="item_single">
      <div v-for="(fieldSchema, fieldKey) in editor.schema.value" :key="fieldKey.toString()" class="form-field-wrapper">
        <FormFieldRenderer :base-field-schema="fieldSchema" :field-key="fieldKey.toString()"
          :item-data="editor.activeObject.value" :root-schema="editor.schema.value" :field-id="fieldKey.toString()"
          v-model="editor.activeObject.value[fieldKey]" :parent-core-data-item="editor.coreObject.value"
          :form-data="editor.activeObject.value" :force-active="true" />
      </div>
    </div>

    <!-- === Array Form === -->

    <div v-if="editor.isArray.value">
      <!-- Form for adding a new item -->

      <div class="new_item_form_container" v-bind="{ 'data-item-uid': 'new_item' }">
        <div class="item_header">
          <div class="item_title_with_buttons">
            <h2 v-bind="{ 'data-bookmark-id': 'new_item' }" class="">New {{ editor.title.value }}</h2>
            <!-- custom popup buttons for new item -->
            <Button v-for="comp in popupComponents" :key="comp.id" :label="comp.name"
              @click="openPopup(comp.id, editor.newItem.value)" severity="info" size="small"
              class="custom-popup-button" />
          </div>
        </div>

        <div class="new_item_form p-4 border-round border-1 border-surface-300 mb-3">
          <div v-for="(fieldSchema, fieldKey) in editor.schema.value" :key="`new-${fieldKey.toString()}`"
            class="form-field-wrapper">
            <FormFieldRenderer v-if="editor.newItem && typeof editor.newItem.value === 'object'"
              :base-field-schema="fieldSchema" :field-key="fieldKey.toString()" :item-data="editor.newItem.value"
              :root-schema="editor.schema.value" :field-id="fieldKey.toString()"
              v-model="editor.newItem.value[fieldKey]" :parent-core-data-item="null"
              :form-data="editor.newItem.value" :force-active="editor.activeItemUids.value.has('new_item')" />
            <div v-else>
              Field '{{ fieldKey }}' not ready in newItem...
            </div>
          </div>
        </div>
      </div>


      <!-- Dsearch Component (Conditionally Rendered) -->
      <template v-if="editor.schema.value && editor.activeObject.value">
        <h3 v-bind="{ 'data-bookmark-id': 'filters' }" class="mt-0 mb-3">Filters</h3>
        <Dsearch :schema="editor.schema.value" :data="editor.activeObject.value" :triggerClear="props.triggerClear"
          @update:siftedData="emitFilteredUpdate" @update:isDirty="emitIsDirtyUpdate" class="mb-4" />
      </template>
      <div v-else class="p-3 text-color-secondary">Loading filters...</div>

      <!-- Existing Items List (Uses paginated items) -->
      <div class="item_array">
        <!-- Message when no items to display (either none exist or none match filter) -->
        <div v-if="!props.items || props.items.length === 0" class="text-center p-3 text-color-secondary">
          {{ !editor.activeObject.value || editor.activeObject.value.length === 0 ? `No items exist.` : `No items match
          the
          current filters.` }}
        </div>
        <!-- Display paginated items -->
        <div v-else>
          <!-- Pagination Controls (Top) -->
          <DformPagination :currentPage="currentPage" :totalPages="totalPages" :itemsPerPage="itemsPerPage"
            :totalItems="props.items.length" @update:currentPage="(page) => currentPage = page"
            @update:itemsPerPage="(value) => itemsPerPage = value" />

          <div v-for="(item, index) in paginatedItems" :key="item.uid || index" v-bind="{ 'data-item-uid': item.uid }">
            <div class="item_header">
              <div class="item_title_with_buttons">
                <h2 class="item_title" v-bind="{ 'data-bookmark-id': item.uid }">{{ item.id || `Item ${index + 1}` }}
                </h2>
                <!-- custom components buttons here -->
                <Button v-for="comp in popupComponents" :key="comp.id" :label="comp.name"
                  @click="openPopup(comp.id, item)" severity="info" size="small" class="custom-popup-button" />
              </div>
              <div class="flex gap-2">
                <Button icon="pi pi-copy" severity="secondary" aria-label="Copy Item" @click="copyItem(index)" text
                  rounded />
                <Button icon="pi pi-trash" severity="danger" aria-label="Remove Item" @click="removeItem(index)" text
                  rounded />
              </div>
            </div>
            <div class="item-in-array p-4 border-round border-1 border-surface-300 mb-3 relative">
              <div v-for="(fieldSchema, fieldKey) in editor.schema.value"
                :key="`${item.uid || index}-${fieldKey.toString()}`" class="form-field-wrapper">
                <FormFieldRenderer :base-field-schema="fieldSchema" :field-key="fieldKey.toString()" :item-data="item"
                  :root-schema="editor.schema.value" :field-id="fieldKey.toString()"
                  v-model="item[fieldKey]"
                  @update:modelValue="() => handleAttributeChangeLog(item, fieldKey.toString())"
                  :is-array-item-id="fieldKey.toString() === 'id'"
                  :parent-core-data-item="editor.coreObject.value && Array.isArray(editor.coreObject.value) ? editor.coreObject.value.find(coreItem => coreItem.id === item.id) : null"
                  :form-data="item" />
              </div>
            </div>
          </div>

          <!-- Pagination Controls (Bottom) -->
          <DformPagination :currentPage="currentPage" :totalPages="totalPages" :itemsPerPage="itemsPerPage"
            :totalItems="props.items.length" @update:currentPage="(page) => currentPage = page"
            @update:itemsPerPage="(value) => itemsPerPage = value" />
        </div>
      </div>
    </div>

  </div>
  <div v-else>
    <p>Loading form or no data/schema available...</p>
  </div>

  <!-- Custom Popup Wrapper -->
  <CustomPopupWrapper v-if="activePopup" :visible="!!activePopup" :componentId="activePopup.id" :item="activePopup.item"
    :schema="editor.schema.value || undefined" :subtabId="editor.secondaryTab || ''" @save="handlePopupSave"
    @close="closePopup" />
</template>

<style scoped src="./dform.component.css"></style>
