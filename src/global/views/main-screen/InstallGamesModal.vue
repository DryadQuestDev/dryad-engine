<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import Dialog from 'primevue/dialog';
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
  <Dialog v-model:visible="localVisible" modal :closable="!installing" :dismissableMask="!installing"
    header="Install Games & Mods" :style="{ width: '900px' }">
    <div class="install-modal-content">
      <!-- Refresh Button -->
      <div class="modal-actions">
        <button class="refresh-button" :disabled="loading || installing" @click="scanArchives">
          <i class="pi pi-refresh" :class="{ 'pi-spin': loading }"></i>
          Refresh
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <i class="pi pi-spin pi-spinner" style="font-size: 2rem"></i>
        <p>Scanning install folder...</p>
      </div>

      <!-- No Archives Found -->
      <div v-else-if="archives.length === 0" class="no-archives">
        <p>No game archives found in the install folder.</p>
        <p class="hint">Place .zip files in: <code>assets/install/</code></p>
      </div>

      <!-- Grouped Archives List -->
      <div v-else class="archives-list">
        <div v-for="group in groupedArchives" :key="group.gameId" class="archive-group">

          <!-- Game Archive -->
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

          <!-- Mods for this Game -->
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

      <!-- Installation Progress -->
      <div v-if="installing" class="installation-progress">
        <h4>Installing...</h4>
        <ProgressBar :value="installProgress" />
        <p class="current-file">{{ currentFile }}</p>
      </div>
    </div>

    <template #footer>
      <button class="close-button" :disabled="installing" @click="closeModal">
        {{ installing ? 'Installing...' : 'Close' }}
      </button>
    </template>
  </Dialog>

  <!-- Success Dialog -->
  <Dialog v-model:visible="showSuccessDialog" modal header="Installation Successful" :style="{ width: '600px' }">
    <div v-if="installResult" class="success-content">
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

    <template #footer>
      <button class="close-button" @click="showSuccessDialog = false">
        OK
      </button>
    </template>
  </Dialog>
</template>

<style scoped>
.install-modal-content {
  min-height: 200px;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1rem;
}

.refresh-button {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.refresh-button:hover:not(:disabled) {
  background: #1976D2;
}

.refresh-button:disabled {
  background: #ccc;
  cursor: not-allowed;
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
}

.no-archives .hint {
  margin-top: 1rem;
  font-size: 0.9rem;
  color: #666;
}

.no-archives code {
  background: #f0f0f0;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: var(--font-family-mono);
}

.archives-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-height: 400px;
  overflow-y: auto;
  padding: 0.5rem;
}

/* Archive Group Styles */
.archive-group {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.5rem;
  background: #f9f9f9;
  border-radius: 8px;
}

/* Game Archive */
.game-archive {
  background: #fff;
  border-left: 4px solid #4CAF50;
}

/* Mods Section */
.mods-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-left: 1rem;
  padding-left: 1rem;
  border-left: 2px solid #ddd;
}

.mods-title {
  margin: 0 0 0.5rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Mod Archive */
.mod-archive {
  background: #fff;
  border-left: 4px solid #2196F3;
}

.archive-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fff;
  transition: all 0.2s;
}

.archive-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.archive-item.installing {
  background: #f0f8ff;
  border-color: #4CAF50;
}

.archive-info {
  flex: 1;
}

.archive-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.archive-name {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.archive-type {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.type-game {
  background: #4CAF50;
  color: white;
}

.type-mod {
  background: #2196F3;
  color: white;
}

.archive-details {
  display: flex;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: #666;
}

.installed-version {
  color: #999;
}

.archive-action {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.5rem;
}

.status-text {
  font-size: 0.9rem;
  font-weight: 500;
  text-align: right;
}

.status-ready {
  color: #4CAF50;
}

.status-update {
  color: #FF9800;
}

.status-current {
  color: #999;
}

.status-error {
  color: #f44336;
}

.install-button {
  padding: 0.5rem 1.5rem;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.install-button:hover:not(:disabled) {
  background: #45a049;
}

.install-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.installation-progress {
  margin-top: 1.5rem;
  padding: 1rem;
  border-top: 1px solid #ddd;
}

.installation-progress h4 {
  margin: 0 0 0.5rem 0;
}

.current-file {
  margin-top: 0.5rem;
  font-size: 0.85rem;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.close-button {
  padding: 0.5rem 1.5rem;
  background: #666;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.close-button:hover:not(:disabled) {
  background: #555;
}

.close-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* Success Dialog Styles */
.success-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 0.5rem;
}

.success-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  text-align: center;
}

.success-icon {
  font-size: 3rem;
  color: #4CAF50;
}

.success-message h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #333;
}

.installed-folders {
  padding: 1rem;
  background: #f5f5f5;
  border-radius: 6px;
  border: 1px solid #ddd;
}

.installed-folders h4 {
  margin: 0 0 0.75rem 0;
  font-size: 1rem;
  font-weight: 600;
  color: #555;
}

.installed-folders ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.installed-folders li {
  display: flex;
  align-items: center;
}

.installed-folders code {
  background: #e0e0e0;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: var(--font-family-mono);
  font-size: 0.9rem;
  color: #333;
}

.cleanup-hint {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #e3f2fd;
  border-radius: 6px;
  border: 1px solid #90caf9;
}

.cleanup-hint i {
  color: #2196F3;
  font-size: 1.25rem;
  flex-shrink: 0;
  margin-top: 2px;
}

.cleanup-hint p {
  margin: 0;
  font-size: 0.9rem;
  color: #333;
  line-height: 1.5;
}

.cleanup-hint code {
  background: #bbdefb;
  padding: 2px 6px;
  border-radius: 3px;
  font-family: var(--font-family-mono);
  font-size: 0.85rem;
}
</style>
