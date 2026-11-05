import { computed } from 'vue';
import { useStorage } from '@vueuse/core';
import { Editor } from './editor';

/**
 * Focus mode: the editor's two header rows give way to one slim strip, for more working height.
 * Remembered per subtab (`main/sub`), so the Content tab can stay focused while forms keep the
 * full header.
 */

export const FOCUS_KEY = 'Ctrl+Shift+F';

const focusedTabs = useStorage<Record<string, true>>('editor_focus_tabs', {});

function tabKey(): string | null {
  const editor = Editor.getInstance();
  const main = editor.mainTab;
  if (!main || main === 'start' || main === 'new' || !editor.selectedGame || !editor.selectedMod) return null;
  return editor.secondaryTab ? `${main}/${editor.secondaryTab}` : null;
}

/** The open subtab can be focused: a game is open and the tab has subtabs. */
export const canFocus = computed(() => tabKey() !== null);

export const focusMode = computed(() => {
  const key = tabKey();
  return !!key && !!focusedTabs.value[key];
});

export function toggleFocusMode(): void {
  const key = tabKey();
  if (!key) return;
  const next = { ...focusedTabs.value };
  if (next[key]) delete next[key];
  else next[key] = true;
  focusedTabs.value = next;
}
