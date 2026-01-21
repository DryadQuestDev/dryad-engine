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
import ConfirmationService from 'primevue/confirmationservice';
import { initDialogService } from './services/dialogService';
import { initGlobalErrorHandlers } from './services/errorHandler';
import { gameLogger } from './game/utils/logger';

const RootComponent = {
  render() {
    return h(Suspense, null, {
      default: () => h(App),
      fallback: () => h('div', { class: 'is_loading' }, 'Loading...') // Optional: Add a loading indicator
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
app.directive('tooltip', Tooltip);
app.config.globalProperties.vTooltip = Tooltip;

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
