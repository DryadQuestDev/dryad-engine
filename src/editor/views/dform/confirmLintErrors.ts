import type { useConfirm } from 'primevue/useconfirm';

/**
 * Ask before saving past the errors a component reports through an exposed `lintErrorCount()`
 * (the dungeon content editor does). Warnings never stop a save; errors ask first, since the
 * game may not read that content.
 */
export function confirmLintErrors(confirm: ReturnType<typeof useConfirm>, component: any): Promise<boolean> {
  const errors: number = component?.lintErrorCount?.() ?? 0;
  if (!errors) return Promise.resolve(true);
  return new Promise((resolve) => {
    confirm.require({
      header: 'Save with errors?',
      message: `${errors} ${errors === 1 ? 'error' : 'errors'} in this content — the game may stop or skip there. They are listed above the editor.`,
      acceptLabel: 'Save anyway',
      rejectLabel: 'Keep editing',
      accept: () => resolve(true),
      reject: () => resolve(false),
      onHide: () => resolve(false),
    });
  });
}
