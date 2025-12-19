import { Editor } from './editor';
import { Global } from '../global/global';
import { validateVersionFormat } from '../utility/version-checker';

/**
 * DevManager - Handles game/mod export and development tools
 */
export class DevManager {
  private editor: Editor;
  private global: Global;

  constructor(editor: Editor) {
    this.editor = editor;
    this.global = Global.getInstance();
  }

  /**
   * Exports the current game/mod as a ZIP archive
   * Archive name format:
   * - Game: {gameId}-{version}.zip
   * - Mod: {gameId}-{modId}-{version}.zip
   */
  async exportGameZip(): Promise<void> {
    try {
      // Validate that a game is selected
      if (!this.editor.selectedGame) {
        this.global.addNotificationId('export_no_game_selected');
        return;
      }

      // Get current mod (default to '_core' for game)
      const modId = this.editor.selectedMod || '_core';

      // Get devSettings
      if (!this.editor.devSettings.value) {
        this.global.addNotificationId('export_no_devsettings');
        return;
      }

      // Get asset folders from devSettings
      // Spread to plain array to avoid Vue Proxy serialization errors in IPC
      const assetFolders = this.editor.devSettings.value.asset_folders
        ? [...this.editor.devSettings.value.asset_folders]
        : [];

      // Get manifest to extract version
      const manifestPath = `games_files/${this.editor.selectedGame}/${modId}/manifest.json`;
      const manifest = await this.global.readJson(manifestPath);

      if (!manifest || !manifest.version) {
        this.global.addNotification('Cannot export: manifest.json missing or has no version');
        return;
      }

      // Validate version format
      const versionValidation = validateVersionFormat(manifest.version);
      if (!versionValidation.isValid) {
        this.global.addNotification(`Cannot export: Invalid version format in manifest.json. ${versionValidation.error}`);
        return;
      }

      // Generate archive filename
      const outputFileName = modId === '_core'
        ? `${this.editor.selectedGame}-${manifest.version}`
        : `${this.editor.selectedGame}-${modId}-${manifest.version}`;

      // Show progress notification
      this.global.addNotificationId('export_in_progress');

      // Call export via global service
      const result = await this.global.exportGameZip({
        gameId: this.editor.selectedGame,
        modId: modId,
        assetFolders: assetFolders,
        outputFileName: outputFileName
      });

      // Show success notification with filename
      this.global.addNotification(
        this.global.getString('export_success', {
          filename: `${outputFileName}.zip`
        })
      );

      console.log('[DevManager] Export completed:', result);

    } catch (error) {
      console.error('[DevManager] Export failed:', error);

      // Extract clean error message, removing Electron IPC wrapper text
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
        // Remove "Error invoking remote method 'export-game-zip': " prefix if present
        const ipcPrefix = /^Error invoking remote method '[^']+': /;
        errorMessage = errorMessage.replace(ipcPrefix, '');
        // Remove "Error: " prefix if present
        errorMessage = errorMessage.replace(/^Error: /, '');
      }

      this.global.addNotification(
        this.global.getString('export_failed', {
          error: errorMessage
        })
      );
    }
  }

  /**
   * Checks if export is available for current game/mod
   */
  canExport(): boolean {
    return !!(this.editor.selectedGame && this.editor.devSettings.value);
  }
}
