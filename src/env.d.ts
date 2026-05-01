import Tooltip from 'primevue/tooltip';
import type { Directive } from 'vue';
import type { ScriptDirectiveValue } from './game/directives/scriptDirective';

declare module '@vue/runtime-core' {
  export interface GlobalDirectives {
    tooltip: typeof Tooltip;
    vPersist: Directive<HTMLImageElement>;
    vFit: Directive<HTMLElement, { min?: number } | undefined>;
    vScript: Directive<HTMLElement, ScriptDirectiveValue>;
  }

  export interface ComponentCustomProperties {
    vTooltip: typeof Tooltip;
  }
}

// Add this new module augmentation for PrimeVue's InputText
declare module 'primevue/inputtext' {
  interface InputTextProps {
    disabled?: boolean;
  }
}
