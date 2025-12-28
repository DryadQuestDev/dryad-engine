<script setup lang="ts">
import { ref, onMounted, onUnmounted, Ref, watch, nextTick } from 'vue';
import MainScreen from './global/views/main-screen/MainScreen.vue'
import EditorScreen from './editor/views/editor-screen/EditorScreen.vue'
import GameScreen from './game/views/GameScreen.vue'
import MenuContainer from './global/views/MenuContainer.vue'
import DocsViewer from './global/views/DocsViewer.vue'
import ConfirmDialog from 'primevue/confirmdialog';
import gsap from 'gsap';

import { Global } from './global/global';
import Gform from './global/views/forms/Gform.vue';
import { MenuOptions } from './global/menuOptions';

// Define the notification item structure (can also be imported if defined elsewhere)
interface NotificationItem {
  id: number;
  message: string;
}

const global = Global.getInstance();
await global.init();

// Check if returning to editor from game
if (localStorage.getItem('returning_to_editor')) {
  localStorage.removeItem('returning_to_editor');
  global.engineState.value = 'editor';
}
// Check if starting a new game from editor playtest
else if (localStorage.getItem('game_starting_new') && localStorage.getItem('game_loading_game_id')) {
  global.engineState.value = 'game';
  const loadingGameId = localStorage.getItem('game_loading_game_id')!;

  // Clear the flag
  localStorage.removeItem('game_starting_new');
  localStorage.removeItem('game_loading_game_id');

  // Load game manifest
  const gameManifest = await global.readJson(`games_files/${loadingGameId}/_core/manifest.json`);

  // Load mod manifests from the selected mods list
  const modList = [];

  // Try to load from the new mods list format first
  const devModsJson = localStorage.getItem('dev_mode_selected_mods');
  let modIdsToLoad: string[] = [];

  if (devModsJson) {
    try {
      modIdsToLoad = JSON.parse(devModsJson);
    } catch (e) {
      console.error('Failed to parse dev_mode_selected_mods:', e);
    }
  }

  // Fallback to single mod for backward compatibility
  if (modIdsToLoad.length === 0) {
    const devModId = localStorage.getItem('dev_mode_selected_mod');
    if (devModId && devModId !== '_core') {
      modIdsToLoad = [devModId];
    }
  }

  // Load each mod manifest, validating they exist
  for (const modId of modIdsToLoad) {
    if (modId === '_core') continue; // Skip _core, it's loaded automatically

    try {
      // Check if mod folder exists by trying to read its manifest
      const modManifest = await global.readJson(`games_files/${loadingGameId}/${modId}/manifest.json`);
      if (modManifest) {
        modManifest.id = modId;
        modList.push(modManifest);
      }
    } catch (e) {
      console.warn(`Mod "${modId}" no longer exists or failed to load, skipping.`);
    }
  }

  // Create new game
  await global.createNewGame(gameManifest, modList);
}
// loading the game from the game scene after refresh
else if (localStorage.getItem('game_loading_slot') && localStorage.getItem('game_loading_game_id')) {
  const loadingSlot = localStorage.getItem('game_loading_slot')!;
  const loadingGameId = localStorage.getItem('game_loading_game_id')!;

  localStorage.removeItem('game_loading_slot');
  localStorage.removeItem('game_loading_game_id');

  const loadedGame = await global.loadGame(loadingGameId, loadingSlot);

  if (loadedGame) {
    // Game loaded successfully
    global.engineState.value = 'game';

    if (loadingSlot === '__load_temporary_save__') {
      try {
        console.log(`App.vue: Deleting temporary save slot "${loadingSlot}" for gameId "${loadingGameId}" from IndexedDB.`);
        await global.indexedDbSaveService.delete(loadingGameId, loadingSlot);
        console.log(`App.vue: Successfully deleted temporary save slot "${loadingSlot}".`);
      } catch (error) {
        console.error(`App.vue: Failed to delete temporary save slot "${loadingSlot}" for gameId "${loadingGameId}":`, error);
        // Optionally notify the user or log this more permanently if critical
      }
    }
  } else {
    // Failed to load game, check if we should return to editor or main menu
    const isDevMode = localStorage.getItem('devMode') === 'true';
    if (isDevMode) {
      global.engineState.value = 'editor';
    } else {
      global.engineState.value = 'main_menu';
    }
  }
}


const notifications: Ref<NotificationItem[]> = ref([]);
const previousNotificationIds = new Set<number>();
const notificationElements = new Map<number, HTMLElement>();

const handleEscKey = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    global.toggleMenu();
  }
};

const setNotificationRef = (el: any, id: number) => {
  if (el && el instanceof HTMLElement) {
    notificationElements.set(id, el);
  } else {
    notificationElements.delete(id);
  }
};

// Watch for notification changes and animate new ones
watch(() => global.notifications.value, async (newNotifications) => {
  notifications.value = newNotifications;

  // Find newly added notifications
  const newIds = newNotifications.filter(n => !previousNotificationIds.has(n.id)).map(n => n.id);

  // Update the set of known IDs
  previousNotificationIds.clear();
  newNotifications.forEach(n => previousNotificationIds.add(n.id));

  // Animate newly added notifications
  if (newIds.length > 0) {
    await nextTick();
    newIds.forEach(id => {
      const element = notificationElements.get(id);
      if (element) {
        // Create a very dramatic and noticeable entrance animation
        gsap.fromTo(element,
          {
            x: -200,
            y: -30,
            opacity: 0,
            scale: 0.3,
            rotation: -15
          },
          {
            x: 0,
            y: 0,
            opacity: 1,
            scale: 1,
            rotation: 0,
            duration: 0.8,
            ease: 'elastic.out(1, 0.5)',
            onComplete: () => {
              // Flash effect after animation completes
              gsap.to(element, {
                //backgroundColor: 'rgba(255, 200, 100, 0.95)',
                //boxShadow: '0 0 30px rgba(255, 200, 100, 0.8), 0 0 60px rgba(255, 150, 50, 0.6)',
                duration: 0.15,
                yoyo: true,
                repeat: 3,
                ease: 'power2.inOut'
              });
            }
          }
        );
      }
    });
  }
}, { immediate: true });

onMounted(() => {
  window.addEventListener('keydown', handleEscKey);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscKey);
});
</script>

<template>

  <div class="engine_container">
    <div class="notifications">
      <div class="notification" v-for="notification in notifications" :key="notification.id"
        :ref="(el) => setNotificationRef(el, notification.id)">
        {{ notification.message }}
      </div>
    </div>


    <MainScreen v-if="global.engineState.value === 'main_menu'" />
    <EditorScreen v-else-if="global.engineState.value === 'editor'" />
    <GameScreen v-else-if="global.engineState.value === 'game'" />

    <transition name="fade">
      <MenuContainer v-if="global.isMenuOpen.value" />
    </transition>

    <transition name="fade">
      <DocsViewer v-if="global.openViewer.value" />
    </transition>

    <!-- Global ConfirmDialog for replacing native confirm/alert -->
    <ConfirmDialog />

  </div>
</template>

<style scoped>
.engine_container {
  position: relative;
  /* Needed for absolute positioning of children */
  /* Add other styles for the container if needed */
}

.notifications {
  pointer-events: none;
  position: fixed;
  top: 5px;
  left: 5px;
  z-index: 3000;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.notification {
  background: linear-gradient(135deg, rgba(0, 0, 0, 0.85) 0%, rgba(20, 20, 40, 0.9) 100%);
  color: white;
  padding: 12px 20px;
  margin-bottom: 8px;
  border-radius: 8px;
  border: 2px solid rgb(0, 128, 255);
  font-weight: 500;
  font-size: 15px;
  letter-spacing: 0.3px;
  backdrop-filter: blur(5px);
  transform-origin: left center;
}
</style>
