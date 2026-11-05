import type { ComputedRef, InjectionKey } from 'vue';
import type { EditorCustomComponent } from '../../editor';

/** What SubtabView hands its view: the tab's Save and its popups, placed by the view with SubtabActions. */
export type SubtabViewContext = {
  save: () => Promise<void>;
  popupComponents: ComputedRef<EditorCustomComponent[]>;
  openPopup: (id: string) => void;
};

export const SUBTAB_VIEW: InjectionKey<SubtabViewContext> = Symbol('subtab-view');
