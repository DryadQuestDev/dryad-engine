<script setup lang="ts">
import { computed, ref, watch, PropType } from 'vue';
import { Editor } from '../../editor';
import Button from 'primevue/button';
import FloatLabel from 'primevue/floatlabel';
import { Global } from '../../../global/global';

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

// --- Active Bookmark State (shared via editor singleton) ---
const activeBookmarkId = editor.activeBookmarkId;

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

// --- Scroll To Logic ---
function scrollToBookmark(uid: string) {
  // Set active bookmark immediately
  activeBookmarkId.value = uid;

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

// Computed property for new item id
const newItemId = computed(() => {
  return editor.newItem.value?.id || '';
});

// Computed property to check if add button should be disabled
const isAddButtonDisabled = computed(() => {
  return !newItemId.value;
});

</script>

<template>
  <div class="dbookmarks">
    <div class="buttons_container">
      <div class="add_button" v-if="editor.isArray.value">
        <Button raised icon="pi pi-plus" @click="addItem" :severity="isAddButtonDisabled ? 'secondary' : 'success'" size="small" class="mt-2" :disabled="isAddButtonDisabled">Add {{ newItemId || editor.title.value }}</Button>
      </div>
      <div class="save_button">
        <Button raised icon="pi pi-save" @click="saveActiveObject"
          :severity="editor.hasUnsavedChanges.value ? 'warning' : 'secondary'" size="small" class="mt-2" :disabled="!editor.hasUnsavedChanges.value">Save
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
