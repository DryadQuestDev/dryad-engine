/**
 * Dialog Service for non-Vue components (classes, utilities, etc.)
 *
 * This service provides a way to show PrimeVue ConfirmDialog from TypeScript classes
 * that can't use Vue composables directly.
 */

import { App } from 'vue';

let appInstance: App | null = null;

export function initDialogService(app: App) {
  appInstance = app;
}

export interface ConfirmOptions {
  message: string;
  header?: string;
  icon?: string;
  acceptLabel?: string;
  rejectLabel?: string;
}

export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!appInstance) {
      // Fallback to native confirm if service not initialized
      console.warn('DialogService not initialized, falling back to native confirm');
      resolve(window.confirm(options.message));
      return;
    }

    const confirm = (appInstance.config.globalProperties as any).$confirm;
    if (!confirm) {
      console.warn('$confirm not available, falling back to native confirm');
      resolve(window.confirm(options.message));
      return;
    }

    confirm.require({
      message: options.message,
      header: options.header || 'Confirm',
      icon: options.icon || 'pi pi-exclamation-triangle',
      acceptLabel: options.acceptLabel || 'OK',
      rejectLabel: options.rejectLabel || 'Cancel',
      accept: () => resolve(true),
      reject: () => resolve(false),
    });
  });
}

export function showAlert(message: string, header: string = 'Alert'): Promise<void> {
  return new Promise((resolve) => {
    if (!appInstance) {
      console.warn('DialogService not initialized, falling back to native alert');
      window.alert(message);
      resolve();
      return;
    }

    const confirm = (appInstance.config.globalProperties as any).$confirm;
    if (!confirm) {
      console.warn('$confirm not available, falling back to native alert');
      window.alert(message);
      resolve();
      return;
    }

    confirm.require({
      message: message,
      header: header,
      icon: 'pi pi-info-circle',
      rejectLabel: 'Close',
      rejectClass: 'p-button-text',
      accept: () => resolve(),
      reject: () => resolve(),
    });
  });
}
