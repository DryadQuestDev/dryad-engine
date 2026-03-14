import Tooltip from 'primevue/tooltip';
import type { Directive } from 'vue';

declare module '@vue/runtime-core' {
  export interface GlobalDirectives {
    tooltip: typeof Tooltip;
    vPersist: Directive<HTMLImageElement>;
    vFit: Directive<HTMLElement, { min?: number } | undefined>;
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
