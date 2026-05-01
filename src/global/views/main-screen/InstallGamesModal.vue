<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import ProgressBar from 'primevue/progressbar';
import { Global } from '../../global';
import { ManifestObject } from '../../../schemas/manifestSchema';
import { satisfiesMinVersion } from '../../../utility/version-checker';

const global = Global.getInstance();

// Props
const props = defineProps<{
  visible: boolean;
  games: ManifestObject[];
}>();

// Emits
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'installation-complete'): void;
}>();

// State
interface ArchiveInfo {
  zipFileName: string;
  name: string;
  type: 'game' | 'mod';
  version: string;
  gameId: string;
  modId: string;
  valid: boolean;
  error?: string;
  installed?: boolean;
  installedVersion?: string;
  parentGameExists?: boolean;
}

interface InstallResult {
  archiveName: string;
  type: 'game' | 'mod';
  folders: string[];
}

const archives = ref<ArchiveInfo[]>([]);
const loading = ref(false);
const installing = ref(false);
const installProgress = ref(0);
const currentFile = ref('');
const installingArchive = ref<string | null>(null);
const showSuccessDialog = ref(false);
const installResult = ref<InstallResult | null>(null);

// Computed
const localVisible = computed({
  get: () => props.visible,
  set: (value) => emit('update:visible', value)
});

// Group archives by game - games first, then mods grouped under their parent game
const groupedArchives = computed(() => {
  const groups: { gameId: string; gameName: string; gameArchive?: ArchiveInfo; mods: ArchiveInfo[] }[] = [];

  // First, collect all games
  const gameArchives = archives.value.filter(a => a.type === 'game');
  const modArchives = archives.value.filter(a => a.type === 'mod');

  // Create groups for games
  gameArchives.forEach(game => {
    groups.push({
      gameId: game.gameId,
      gameName: game.name,
      gameArchive: game,
      mods: []
    });
  });

  // Add mods to their respective game groups
  modArchives.forEach(mod => {
    let group = groups.find(g => g.gameId === mod.gameId);

    if (!group) {
      // Create a group for this game even if we don't have the game archive
      const parentGame = props.games.find(g => g.id === mod.gameId);
      group = {
        gameId: mod.gameId,
        gameName: parentGame?.name || mod.gameId,
        mods: []
      };
      groups.push(group);
    }

    group.mods.push(mod);
  });

  return groups;
});

// Methods
async function scanArchives() {
  loading.value = true;
  archives.value = [];

  try {
    const zipFiles = await global.scanInstallArchives();
    console.log('[InstallGamesModal] Found ZIP files:', zipFiles);

    for (const zipFile of zipFiles) {
      // Read manifest
      const manifestInfo = await global.readArchiveManifest(zipFile);

      if (!manifestInfo.valid || !manifestInfo.type || !manifestInfo.gameId || !manifestInfo.modId) {
        // Invalid archive
        archives.value.push({
          zipFileName: zipFile,
          name: 'Invalid Archive',
          type: 'game',
          version: '0.0.0',
          gameId: '',
          modId: '',
          valid: false,
          error: manifestInfo.error || 'Invalid archive structure'
        });
        continue;
      }

      const archiveInfo: ArchiveInfo = {
        zipFileName: zipFile,
        name: manifestInfo.name || 'Unknown',
        type: manifestInfo.type,
        version: manifestInfo.version || '0.0.0',
        gameId: manifestInfo.gameId,
        modId: manifestInfo.modId,
        valid: true
      };

      // Check if already installed
      if (manifestInfo.type === 'game') {
        // Check against loaded games
        const existingGame = props.games.find(g => g.id === manifestInfo.gameId);
        if (existingGame) {
          archiveInfo.installed = true;
          archiveInfo.installedVersion = existingGame.version || '0.0.0';
        }
      } else {
        // For mods, check via IPC
        const parentGame = props.games.find(g => g.id === manifestInfo.gameId);
        archiveInfo.parentGameExists = !!parentGame;

        if (parentGame) {
          const modStatus = await global.checkModInstalled(manifestInfo.gameId, manifestInfo.modId);
          archiveInfo.installed = modStatus.installed;
          archiveInfo.installedVersion = modStatus.version;
        }
      }

      archives.value.push(archiveInfo);
    }

  } catch (error) {
    console.error('[InstallGamesModal] Error scanning archives:', error);
    global.addNotification('Error scanning install folder');
  } finally {
    loading.value = false;
  }
}

function getStatusText(archive: ArchiveInfo): string {
  if (!archive.valid) {
    return archive.error || 'Invalid archive';
  }

  if (archive.type === 'mod' && !archive.parentGameExists) {
    return `Parent game '${archive.gameId}' not installed`;
  }

  if (!archive.installed) {
    return 'Ready to install';
  }

  // Check if archive version exceeds installed version
  const canInstall = satisfiesMinVersion(archive.version, archive.installedVersion || '0.0.0', false);

  if (canInstall) {
    return 'Update available';
  } else {
    return `You already have the last version of the ${archive.type} installed`;
  }
}

function getStatusClass(archive: ArchiveInfo): string {
  if (!archive.valid) {
    return 'status-error';
  }

  if (archive.type === 'mod' && !archive.parentGameExists) {
    return 'status-error';
  }

  if (!archive.installed) {
    return 'status-ready';
  }

  const canInstall = satisfiesMinVersion(archive.version, archive.installedVersion || '0.0.0', false);

  if (canInstall) {
    return 'status-update';
  } else {
    return 'status-current';
  }
}

function canInstall(archive: ArchiveInfo): boolean {
  if (!archive.valid) return false;
  if (archive.type === 'mod' && !archive.parentGameExists) return false;
  if (!archive.installed) return true;

  // Only allow installation if archive version exceeds installed
  return satisfiesMinVersion(archive.version, archive.installedVersion || '0.0.0', false);
}

async function installArchive(archive: ArchiveInfo) {
  if (!canInstall(archive)) return;

  installing.value = true;
  installingArchive.value = archive.zipFileName;
  installProgress.value = 0;
  currentFile.value = '';

  try {
    console.log('[InstallGamesModal] Installing:', archive.zipFileName);

    const result = await global.installGameArchive(archive.zipFileName, (progress) => {
      installProgress.value = progress.percent;
      currentFile.value = progress.currentFile;
    });

    if (result.success) {
      // Prepare success information
      const folders: string[] = [];
      folders.push(`games_files/${archive.gameId}/${archive.modId}`);
      folders.push(`games_assets/${archive.gameId}/${archive.modId}`);

      installResult.value = {
        archiveName: archive.name,
        type: archive.type,
        folders: folders
      };

      // Show success dialog
      showSuccessDialog.value = true;

      // Emit installation complete event
      emit('installation-complete');

      // Re-scan archives
      await scanArchives();
    } else {
      console.error('[InstallGamesModal] Installation failed:', result.error);

      // User-friendly error messages
      let errorMessage = 'Installation failed: ';
      switch (result.errorCode) {
        case 'ENOSPC':
          errorMessage += 'Not enough disk space';
          break;
        case 'EACCES':
          errorMessage += 'Permission denied';
          break;
        case 'CORRUPT_ZIP':
          errorMessage += 'Archive file is corrupt or invalid';
          break;
        case 'INVALID_STRUCTURE':
          errorMessage += 'Invalid archive structure';
          break;
        case 'PARENT_GAME_MISSING':
          errorMessage += result.error || 'Parent game not found';
          break;
        default:
          errorMessage += result.error || 'Unknown error';
      }

      global.addNotification(errorMessage);
    }

  } catch (error) {
    console.error('[InstallGamesModal] Unexpected error:', error);
    global.addNotification('Unexpected error during installation');
  } finally {
    installing.value = false;
    installingArchive.value = null;
    installProgress.value = 0;
    currentFile.value = '';
  }
}

function closeModal() {
  if (!installing.value) {
    localVisible.value = false;
  }
}

// Lifecycle
onMounted(async () => {
  if (props.visible) {
    await scanArchives();
  }
});

// Watch for visibility changes to rescan
import { watch } from 'vue';
watch(() => props.visible, async (newVal) => {
  if (newVal) {
    await scanArchives();
  }
});
</script>

<template>
  <!-- Main install popup -->
  <div v-if="localVisible" class="popup-mask glass-popup-mask" @click.self="closeModal">
    <div class="popup-card popup-card--wide glass-popup-surface">
      <header class="popup-header">
        <h2 class="popup-title">Install Games & Mods</h2>
        <button v-if="!installing" class="popup-close" @click="closeModal" aria-label="Close">×</button>
      </header>

      <div class="popup-body">
        <div class="modal-actions">
          <button class="refresh-button" :disabled="loading || installing" @click="scanArchives">
            <i class="pi pi-refresh" :class="{ 'pi-spin': loading }"></i>
            Refresh
          </button>
        </div>

        <div v-if="loading" class="loading-state">
          <i class="pi pi-spin pi-spinner" style="font-size: 2rem"></i>
          <p>Scanning install folder...</p>
        </div>

        <div v-else-if="archives.length === 0" class="no-archives">
          <p>No game archives found in the install folder.</p>
          <p class="hint">Place .zip files in: <code>assets/install/</code></p>
        </div>

        <div v-else class="archives-list">
          <div v-for="group in groupedArchives" :key="group.gameId" class="archive-group">
            <div v-if="!group.gameArchive" class="group-header">
              <i class="pi pi-box"></i>
              <span>{{ group.gameName }}</span>
            </div>

            <div v-if="group.gameArchive" class="archive-item game-archive"
              :class="{ 'installing': installingArchive === group.gameArchive.zipFileName }">
              <div class="archive-info">
                <div class="archive-header">
                  <h3 class="archive-name">{{ group.gameArchive.name }}</h3>
                  <span class="archive-type type-game">Game</span>
                </div>
                <div class="archive-details">
                  <span class="archive-version">Version: {{ group.gameArchive.version }}</span>
                  <span v-if="group.gameArchive.installed" class="installed-version">
                    (Installed: {{ group.gameArchive.installedVersion }})
                  </span>
                </div>
              </div>

              <div class="archive-action">
                <div class="status-text" :class="getStatusClass(group.gameArchive)">
                  {{ getStatusText(group.gameArchive) }}
                </div>
                <button v-if="canInstall(group.gameArchive)" class="install-button" :disabled="installing"
                  @click="installArchive(group.gameArchive)">
                  {{ group.gameArchive.installed ? 'Update' : 'Install' }}
                </button>
              </div>
            </div>

            <div v-if="group.mods.length > 0" class="mods-section">
              <h4 class="mods-title">Mods:</h4>
              <div v-for="mod in group.mods" :key="mod.zipFileName" class="archive-item mod-archive"
                :class="{ 'installing': installingArchive === mod.zipFileName }">
                <div class="archive-info">
                  <div class="archive-header">
                    <h3 class="archive-name">{{ mod.name }}</h3>
                    <span class="archive-type type-mod">Mod</span>
                  </div>
                  <div class="archive-details">
                    <span class="archive-game">for {{ group.gameName }}</span>
                    <span class="archive-version">Version: {{ mod.version }}</span>
                    <span v-if="mod.installed" class="installed-version">
                      (Installed: {{ mod.installedVersion }})
                    </span>
                  </div>
                </div>

                <div class="archive-action">
                  <div class="status-text" :class="getStatusClass(mod)">
                    {{ getStatusText(mod) }}
                  </div>
                  <button v-if="canInstall(mod)" class="install-button" :disabled="installing"
                    @click="installArchive(mod)">
                    {{ mod.installed ? 'Update' : 'Install' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="installing" class="installation-progress">
          <h4>Installing...</h4>
          <ProgressBar :value="installProgress" />
          <p class="current-file">{{ currentFile }}</p>
        </div>
      </div>

      <footer class="popup-footer">
        <button class="close-button" :disabled="installing" @click="closeModal">
          {{ installing ? 'Installing...' : 'Close' }}
        </button>
      </footer>
    </div>
  </div>

  <!-- Success popup -->
  <div v-if="showSuccessDialog" class="popup-mask glass-popup-mask" @click.self="showSuccessDialog = false">
    <div class="popup-card glass-popup-surface">
      <header class="popup-header">
        <h2 class="popup-title">Installation Successful</h2>
        <button class="popup-close" @click="showSuccessDialog = false" aria-label="Close">×</button>
      </header>

      <div v-if="installResult" class="popup-body success-content">
        <div class="success-message">
          <i class="pi pi-check-circle success-icon"></i>
          <h3>The {{ installResult.type }} "{{ installResult.archiveName }}" has been installed!</h3>
        </div>

        <div class="installed-folders">
          <h4>Installed to:</h4>
          <ul>
            <li v-for="folder in installResult.folders" :key="folder">
              <code>{{ folder }}</code>
            </li>
          </ul>
        </div>

        <div class="cleanup-hint">
          <i class="pi pi-info-circle"></i>
          <p>You can now delete the archive from the <code>assets/install/</code> folder.</p>
        </div>
      </div>

      <footer class="popup-footer">
        <button class="close-button" @click="showSuccessDialog = false">OK</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* Popup layout — bg/blur/border from .glass-popup-mask + .glass-popup-surface in src/style.css */
.popup-mask {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  padding-top: max(20px, env(safe-area-inset-top));
  padding-bottom: max(20px, env(safe-area-inset-bottom));
}

.popup-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 600px;
  max-height: 90dvh;
  overflow: hidden;
  color: rgba(216, 221, 228, 0.92);
}

.popup-card--wide {
  max-width: 900px;
}

.popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 22px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.popup-title {
  margin: 0;
  font-family: var(--font-family-serif);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #fff;
}

.popup-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  font-size: 22px;
  line-height: 1;
  color: rgba(216, 221, 228, 0.7);
  background: transparent;
  border: var(--glass-border);
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.popup-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.popup-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px;
}

.popup-footer {
  padding: 12px 22px 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  justify-content: flex-end;
}

@media (pointer: coarse), (max-width: 720px) {
  .popup-mask { padding: 0; }
  .popup-card,
  .popup-card--wide {
    max-width: none;
    width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    border: none;
  }
  .popup-header {
    padding-top: max(18px, env(safe-area-inset-top));
  }
  .popup-body {
    padding: 14px 16px;
  }
  .popup-footer {
    padding-bottom: max(18px, env(safe-area-inset-bottom));
  }
}

.install-modal-content {
  min-height: 200px;
  color: rgba(216, 221, 228, 0.92);
}

:deep(.p-progressbar) {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  height: 6px;
  overflow: hidden;
}

:deep(.p-progressbar-value) {
  background: var(--glass-tint);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1rem;
}

.refresh-button,
.install-button,
.close-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-family: inherit;
  font-size: 13px;
  letter-spacing: 0.04em;
  color: rgba(216, 221, 228, 0.92);
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 8px;
  cursor: pointer;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: background 0.15s ease, color 0.15s ease;
}

.refresh-button:hover:not(:disabled),
.install-button:hover:not(:disabled),
.close-button:hover:not(:disabled) {
  background: var(--glass-bg-strong);
  color: #fff;
}

.refresh-button:disabled,
.install-button:disabled,
.close-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.install-button {
  color: #0b0d10;
  background: var(--glass-tint);
  border-color: var(--glass-tint);
  font-weight: 500;
}

.install-button:hover:not(:disabled) {
  color: #0b0d10;
  background: var(--glass-tint);
  filter: brightness(1.1);
}

.loading-state,
.no-archives {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;
  min-height: 200px;
  color: rgba(216, 221, 228, 0.7);
}

.no-archives .hint {
  margin-top: 1rem;
  font-size: 0.9rem;
  color: rgba(216, 221, 228, 0.55);
}

.no-archives code,
.cleanup-hint code,
.installed-folders code {
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 8px;
  border-radius: 4px;
  font-family: var(--font-family-mono);
  font-size: 12px;
  color: rgba(216, 221, 228, 0.92);
}

.archives-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 60vh;
  overflow-y: auto;
  padding: 4px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(216, 221, 228, 0.55);
}

.archive-game {
  color: rgba(216, 221, 228, 0.55);
  font-style: italic;
}

.archive-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.18);
  border: var(--glass-border);
  border-radius: 12px;
}

.mods-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-left: 16px;
  padding-left: 16px;
  border-left: 2px solid rgba(255, 255, 255, 0.08);
}

.mods-title {
  margin: 0 0 4px 0;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(216, 221, 228, 0.5);
}

.archive-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  background: var(--glass-bg);
  border: var(--glass-border);
  border-left: 3px solid transparent;
  border-radius: 10px;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: background 0.15s ease, border-color 0.15s ease;
}

.archive-item.game-archive {
  border-left-color: var(--glass-tint);
}

.archive-item.mod-archive {
  border-left-color: rgba(180, 130, 230, 0.7);
}

.archive-item:hover {
  background: var(--glass-bg-strong);
}

.archive-item.installing {
  border-color: var(--glass-tint);
  background: var(--glass-bg-strong);
}

.archive-info {
  flex: 1;
  min-width: 0;
}

.archive-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}

.archive-name {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: rgba(216, 221, 228, 0.95);
}

.archive-type {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.type-game {
  color: #0b0d10;
  background: var(--glass-tint);
}

.type-mod {
  color: #fff;
  background: rgba(180, 130, 230, 0.7);
}

.archive-details {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: rgba(216, 221, 228, 0.6);
  flex-wrap: wrap;
}

.installed-version {
  color: rgba(216, 221, 228, 0.45);
}

.archive-action {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.status-text {
  font-size: 12px;
  font-weight: 500;
  text-align: right;
  letter-spacing: 0.04em;
}

.status-ready {
  color: var(--glass-tint);
}

.status-update {
  color: #ffb74d;
}

.status-current {
  color: rgba(216, 221, 228, 0.45);
}

.status-error {
  color: #ff8a80;
}

.installation-progress {
  margin-top: 1.25rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.installation-progress h4 {
  margin: 0 0 8px 0;
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(216, 221, 228, 0.7);
}

.current-file {
  margin-top: 8px;
  font-size: 12px;
  font-family: var(--font-family-mono);
  color: rgba(216, 221, 228, 0.55);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.success-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  color: rgba(216, 221, 228, 0.92);
}

.success-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.success-icon {
  font-size: 2.6rem;
  color: var(--glass-tint);
  filter: drop-shadow(0 0 12px rgba(0, 255, 234, 0.35));
}

.success-message h3 {
  margin: 0;
  font-family: var(--font-family-serif);
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.installed-folders {
  padding: 14px 16px;
  background: rgba(0, 0, 0, 0.2);
  border: var(--glass-border);
  border-radius: 10px;
}

.installed-folders h4 {
  margin: 0 0 10px 0;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(216, 221, 228, 0.55);
}

.installed-folders ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cleanup-hint {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(0, 130, 200, 0.12);
  border: 1px solid rgba(80, 180, 255, 0.3);
  border-radius: 10px;
}

.cleanup-hint i {
  color: var(--glass-tint);
  font-size: 18px;
  flex-shrink: 0;
  margin-top: 2px;
}

.cleanup-hint p {
  margin: 0;
  font-size: 13px;
  color: rgba(216, 221, 228, 0.85);
  line-height: 1.5;
}

@supports not (backdrop-filter: blur(1px)) {
  .archive-item,
  .refresh-button,
  .install-button,
  .close-button {
    background: rgba(20, 24, 29, 0.92);
  }
}
</style>
