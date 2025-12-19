import Tooltip from 'primevue/tooltip';

declare module '@vue/runtime-core' {
  export interface GlobalDirectives {
    tooltip: typeof Tooltip;
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
