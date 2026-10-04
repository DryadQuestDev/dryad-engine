/**
 * Dialog Service for non-Vue components (classes, utilities, etc.)
 *
 * This service provides a way to show PrimeVue ConfirmDialog from TypeScript classes
 * that can't use Vue composables directly.
 */

import { App } from 'vue';
import { Global } from '../global/global';

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

    // Resolved at show time, not at module scope: the dialog is built the moment it opens, so it
    // always picks up the language selected by then. The English literals are the last-resort
    // fallback for a locale file that lacks the key.
    const locale = Global.getInstance();

    confirm.require({
      message: options.message,
      header: options.header || locale.getStringOr('confirm', 'Confirm'),
      icon: options.icon || 'pi pi-exclamation-triangle',
      acceptLabel: options.acceptLabel || locale.getStringOr('ok', 'OK'),
      rejectLabel: options.rejectLabel || locale.getStringOr('cancel', 'Cancel'),
      accept: () => resolve(true),
      reject: () => resolve(false),
    });
  });
}

export function showAlert(message: string, header?: string): Promise<void> {
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

    const locale = Global.getInstance();

    confirm.require({
      message: message,
      header: header || locale.getStringOr('dialog.alert_header', 'Alert'),
      icon: 'pi pi-info-circle',
      rejectLabel: locale.getStringOr('close', 'Close'),
      rejectClass: 'p-button-text',
      accept: () => resolve(),
      reject: () => resolve(),
    });
  });
}
