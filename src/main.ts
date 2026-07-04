import { createApp, h, Suspense } from 'vue'
import './style.css'
// Import Inter, Lora, and JetBrains Mono fonts for consistent cross-platform typography
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
import '@fontsource/lora/400.css';
import '@fontsource/lora/500.css';
import '@fontsource/lora/700.css';
import '@fontsource/jetbrains-mono/400.css';
import 'primeicons/primeicons.css';
import App from './App.vue'
import PrimeVue from 'primevue/config';
import Aura from '@primeuix/themes/aura';
import Tooltip from 'primevue/tooltip';
import { ZIndex } from '@primeuix/utils/zindex';
import ConfirmationService from 'primevue/confirmationservice';
import { initDialogService } from './services/dialogService';
import { initGlobalErrorHandlers } from './services/errorHandler';
import { gameLogger } from './game/utils/logger';
import { persistImage } from './game/directives/persistImageDirective';
import { fitText } from './game/directives/fitTextDirective';
import { script } from './game/directives/scriptDirective';
import { popover } from './game/directives/popoverDirective';
import { dragscroll } from 'vue-dragscroll';

const RootComponent = {
  render() {
    return h(Suspense, null, {
      default: () => h(App),
      fallback: () => h('div', { class: 'initial-loader' }, [
        h('div', { class: 'initial-loader__ring' }),
        h('div', { class: 'initial-loader__label' }, 'Loading Dryad Engine'),
      ])
    });
  }
};

const app = createApp(RootComponent);
app.use(PrimeVue, {
  theme: {
    preset: Aura
  }
});
app.use(ConfirmationService);
// PrimeVue's Tooltip.remove() calls document.body.removeChild() on a node that
// may already be detached when tooltip targets unmount en masse (its teardown
// is deferred via setTimeout), throwing NotFoundError. Override remove() to
// detach from the node's actual parent instead.
const SafeTooltip = (Tooltip as any).extend('tooltip', {
  methods: {
    remove(el: any) {
      if (el) {
        const tooltipElement = document.getElementById(el.$_ptooltipId);
        if (tooltipElement && tooltipElement.parentElement) {
          ZIndex.clear(tooltipElement);
          tooltipElement.remove();
        }
        el.$_ptooltipId = null;
      }
    },
  },
});

app.directive('tooltip', SafeTooltip);
app.directive('persist', persistImage);
app.directive('fit', fitText);
app.directive('script', script);
app.directive('popover', popover);
app.directive('dragscroll', dragscroll);
app.config.globalProperties.vTooltip = SafeTooltip;

// Configure Vue error handler
app.config.errorHandler = (err, _instance, info) => {
  gameLogger.error(
    `${(err as Error).stack || err}`
  );
};

// Configure Vue warning handler (keeps warnings visible in production)
app.config.warnHandler = (msg, _instance, trace) => {
  gameLogger.warn(`[Vue] ${msg}${trace ? '\n' + trace : ''}`);
};

// Initialize global error handlers for non-Vue errors
initGlobalErrorHandlers();

// Initialize dialog service for non-Vue components
initDialogService(app);

app.mount('#app');

// Global click handler for all <a> links
document.addEventListener('click', (event: MouseEvent) => {
  const target = event.target as HTMLElement;
  const link = target.closest('a');

  // Skip anchors with download attribute (used for file downloads)
  if (link && link.href && !link.hasAttribute('download')) {
    event.stopPropagation();
    event.preventDefault();

    // Open link in new tab/window
    window.open(link.href, '_blank', 'noopener,noreferrer');
  }
}, true); // Use capture phase to ensure it runs before other handlers
