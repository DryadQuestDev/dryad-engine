import { ref, watch } from 'vue';

const STORAGE_KEY = 'manifest-panel-collapsed';

export const manifestPanelCollapsed = ref(localStorage.getItem(STORAGE_KEY) === 'true');

watch(manifestPanelCollapsed, (value) => {
  localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
});
