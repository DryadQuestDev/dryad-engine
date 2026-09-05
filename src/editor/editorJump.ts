import { useStorage } from '@vueuse/core';
import { Editor } from './editor';

// Same storage object Dform reads on tab entry — vueuse syncs same-key instances
// within the document, so a value written here is visible to Dform's tabKey
// watcher when the navigation below triggers it.
const dformTabState = useStorage(
  'dform-tab-state',
  {} as Record<string, { currentPage?: number; activeBookmark?: string; idFilter?: string }>
);

/**
 * Navigate the editor to an entity's tab with the shared ID filter pre-seeded to
 * its id, so the tab opens showing that entity. Uses the native id-filter
 * navigation only — no uid resolution, no bookmark scrolling.
 *
 * Callers must ensure no custom popup is open when this runs (a wrapper popup's
 * Save targets the LIVE activeObject and would hit the wrong file after the
 * switch) — CustomPopupWrapper's save-and-jump flow commits and closes first.
 */
export async function jumpToEntity(mainTab: string, subTab: string, entityId: string): Promise<void> {
  const editor = Editor.getInstance();

  const tabKey = `${mainTab}-${subTab}`;
  dformTabState.value[tabKey] = { ...dformTabState.value[tabKey], idFilter: entityId, activeBookmark: '' };

  // Set the subtab BEFORE setMainTab — it chains into the tab's remembered
  // subtab, and setting it afterwards would race two loadActiveObject calls.
  editor.state.selectedSubTabs[mainTab] = subTab;
  await editor.setMainTab(mainTab);

  // Belt-and-braces: when the target tab is already the current one, the tabKey
  // watcher that restores idFilter from storage never fires — apply directly.
  editor.idFilter.value = entityId;
}
