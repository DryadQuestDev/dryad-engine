import { ref, computed } from 'vue';
import { Global } from '../global';

const MOBILE_QUERY = '(pointer: coarse)';
const PORTRAIT_QUERY = '(orientation: portrait)';
// Match any "installed PWA" display mode. The manifest declares fullscreen,
// with display_override falling back to standalone — both indicate the user
// is running the installed app, not a regular browser tab.
const STANDALONE_QUERY = '(display-mode: standalone), (display-mode: fullscreen), (display-mode: minimal-ui)';

const isMobile = ref(false);
const isPortrait = ref(false);
const isStandalone = ref(false);
const isNativeShell = ref(false);
const installPromptEvent = ref<any>(null);
const justInstalled = ref(false);
let initialized = false;

function ensureInitialized() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  const mobileMQL = window.matchMedia(MOBILE_QUERY);
  const portraitMQL = window.matchMedia(PORTRAIT_QUERY);
  const standaloneMQL = window.matchMedia(STANDALONE_QUERY);

  isMobile.value = mobileMQL.matches;
  isPortrait.value = portraitMQL.matches;
  isStandalone.value = standaloneMQL.matches || (window.navigator as any).standalone === true;
  isNativeShell.value = !!((window as any).Capacitor || (window as any).electron);

  mobileMQL.addEventListener('change', (e) => { isMobile.value = e.matches; });
  portraitMQL.addEventListener('change', (e) => { isPortrait.value = e.matches; });
  standaloneMQL.addEventListener('change', (e) => { isStandalone.value = e.matches; });

  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    installPromptEvent.value = e;
  });

  window.addEventListener('appinstalled', () => {
    installPromptEvent.value = null;
    isStandalone.value = true;
    justInstalled.value = true;
  });
}

export function useMobile() {
  ensureInitialized();
  const global = Global.getInstance();

  const showRotateOverlay = computed(() =>
    isMobile.value &&
    isPortrait.value &&
    global.engineState.value !== 'editor'
  );

  const showInstallButton = computed(() =>
    isMobile.value && !isStandalone.value && !isNativeShell.value
  );

  async function promptInstall(): Promise<boolean> {
    if (!installPromptEvent.value) return false;
    try {
      await installPromptEvent.value.prompt();
      const { outcome } = await installPromptEvent.value.userChoice;
      installPromptEvent.value = null;
      return outcome === 'accepted';
    } catch {
      return false;
    }
  }

  return {
    isMobile,
    isPortrait,
    isStandalone,
    isNativeShell,
    showRotateOverlay,
    showInstallButton,
    installPromptEvent,
    justInstalled,
    promptInstall,
  };
}
