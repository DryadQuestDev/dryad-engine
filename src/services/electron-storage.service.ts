import { DungeonConfigObject } from '../schemas/dungeonConfigSchema';
import { ManifestObject } from '../schemas/manifestSchema';
import { StorageService } from './storage.interface';

declare global {
    interface Window {
        electron?: {
            ipcRenderer: {
                invoke(channel: string, ...args: any[]): Promise<any>;
            };
        };
    }
}

export class ElectronStorageService implements StorageService {
    constructor() {
        if (!window.electron) {
            throw new Error('Electron context not found. Ensure this service is used in an Electron environment.');
        }
    }

    getName(): string {
        return 'electron';
    }

    supportsImageTools(): boolean {
        return true;
    }

    supportsGoogleAuth(): boolean {
        return true;
    }

    private async invokeElectron(channel: string, ...args: any[]): Promise<any> {
        if (!window.electron) {
            throw new Error('Electron context not available.');
        }
        return window.electron.ipcRenderer.invoke(channel, ...args);
    }

    async readJson(filePath: string): Promise<any> {
        if (typeof filePath !== 'string' || filePath.trim() === '') {
            console.error('ElectronStorageService.readJson: Invalid filePath provided:', filePath);
            // Return null immediately if the path is invalid, avoiding the IPC call.
            return null;
        }
        return this.invokeElectron('read-json', filePath);
    }

    async writeJson(filePath: string, data: any): Promise<void> {
        data = JSON.parse(JSON.stringify(data));
        await this.invokeElectron('write-json', filePath, data);
    }

    async listFiles(dirPath: string): Promise<string[]> {
        return this.invokeElectron('list-files', dirPath);
    }

    async listFolders(dirPath: string): Promise<string[]> {
        return this.invokeElectron('list-folders', dirPath);
    }

    /**
     * Lists all files recursively within a given directory using Electron IPC.
     * Assumes the main process handles the recursive logic via an 'list-files-recursively' channel.
     * @param dirPath - The directory path to search
     * @param assetFolders - Optional array of asset folder paths to filter (from devSettings.asset_folders)
     * @param ignoreEngineAssets - Optional flag to ignore engine_assets folder (from devSettings.ignore_engine_assets)
     */
    async listFilesRecursively(dirPath: string, assetFolders?: string[], ignoreEngineAssets?: boolean): Promise<string[]> {
        try {
            const files = await this.invokeElectron('list-files-recursively', dirPath, assetFolders, ignoreEngineAssets);
            // Ensure the result is always an array, even if the main process returns null/undefined
            return Array.isArray(files) ? files : [];
        } catch (error) {
            console.error(`Error listing files recursively via Electron for path: ${dirPath}`, error);
            return []; // Return empty array on error
        }
    }

    async deleteFile(filePath: string, recursive: boolean = false): Promise<void> {
        await this.invokeElectron('delete-file', filePath, recursive);
    }

    async pathExists(itemPath: string): Promise<boolean> {
        return this.invokeElectron('path-exists', itemPath);
    }

    async createDir(dirPath: string): Promise<void> {
        await this.invokeElectron('create-dir', dirPath);
    }

    async getGamesList(): Promise<ManifestObject[]> {
        let gameFolders = await this.listFolders('games_files');
        let games: ManifestObject[] = [];
        for (let gameFolder of gameFolders) {
            let gameManifest = await this.readJson(`games_files/${gameFolder}/_core/manifest.json`);
            games.push(gameManifest);
        }
        return games;
    }

    async getModsList(game: string): Promise<ManifestObject[]> {
        let modsFolders = await this.listFolders(`games_files/${game}`);
        let modsList: ManifestObject[] = [];
        for (let modFolder of modsFolders) {
            if (modFolder === "_core") continue;
            let modManifest = await this.readJson(`games_files/${game}/${modFolder}/manifest.json`);
            modsList.push(modManifest);
        }
        return modsList;
    }

    // TODO: maybe not load all dungeons content and just order...
    async getDungeonsList(game: string, mods: string[]): Promise<string[]> {
        let dungeonsList: Set<string> = new Set<string>();
        for (let mod of mods) {
            let dungeons = await this.listFolders(`games_files/${game}/${mod}/dungeons`);
            for (let dungeon of dungeons) {
                dungeonsList.add(dungeon);
            }
        }
        return Array.from(dungeonsList);
    }

    // --- Google API Methods ---

    async startGoogleAuth(clientSecretJsonContent: object): Promise<{ authUrl?: string; error?: string }> {
        if (typeof clientSecretJsonContent !== 'object' || clientSecretJsonContent === null) {
            console.error('ElectronStorageService.startGoogleAuth: Invalid clientSecretJsonContent provided.');
            return { error: 'Invalid client credentials format.' };
        }
        return this.invokeElectron('google-auth-start', clientSecretJsonContent);
    }

    async exchangeGoogleAuthCode(authorizationCode: string): Promise<{ tokens?: any; profile?: any; error?: string }> {
        if (typeof authorizationCode !== 'string' || authorizationCode.trim() === '') {
            console.error('ElectronStorageService.exchangeGoogleAuthCode: Invalid authorizationCode provided.');
            return { error: 'Invalid authorization code.' };
        }
        return this.invokeElectron('google-auth-token', authorizationCode);
    }

    async refreshGoogleAuthToken(refreshToken: string, clientSecretJsonContent: object): Promise<{ tokens?: any; error?: string }> {
        if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
            console.error('ElectronStorageService.refreshGoogleAuthToken: Invalid refreshToken provided.');
            return { error: 'Invalid refresh token.' };
        }
        if (typeof clientSecretJsonContent !== 'object' || clientSecretJsonContent === null) {
            console.error('ElectronStorageService.refreshGoogleAuthToken: Invalid client credentials format.');
            return { error: 'Invalid client credentials format.' };
        }
        return this.invokeElectron('google-auth-refresh-token', { refreshToken, clientSecretJsonContent });
    }

    async getGoogleDocument(accessToken: string, documentId: string): Promise<{ document?: any; error?: string }> {
        if (typeof accessToken !== 'string' || accessToken.trim() === '') {
            console.error('ElectronStorageService.getGoogleDocument: Invalid accessToken provided.');
            return { error: 'Invalid access token.' };
        }
        if (typeof documentId !== 'string' || documentId.trim() === '') {
            console.error('ElectronStorageService.getGoogleDocument: Invalid documentId provided.');
            return { error: 'Invalid document ID.' };
        }
        return this.invokeElectron('google-docs-get', { accessToken, documentId });
    }

    // Method to listen for the auth callback from main process
    listenForGoogleAuthCallback(callback: (data: { code?: string; error?: string }) => void): (() => void) | undefined {
        if (window.electron && window.electron.ipcRenderer) {
            const handler = (data: { code?: string; error?: string }) => callback(data);
            // Electron's ipcRenderer in preload scripts typically uses 'on' and 'removeListener'
            // However, the way window.electron.ipcRenderer is structured might vary.
            // Assuming a common pattern here. Adjust if your preload script exposes it differently.
            // For this example, let's assume the preload script exposes 'on' and 'removeListener' or similar.
            // If it only exposes 'invoke', then main->renderer communication needs a different setup (e.g., main sending a message to a specific webContents).
            // The 'open-url' handler in main.cjs currently uses 'mainWindow.webContents.send('google-auth-callback', ...)',
            // so the renderer needs to listen to this.

            const ipcRenderer = (window.electron.ipcRenderer as any); // Cast to any to allow 'on'
            if (typeof ipcRenderer.on === 'function' && typeof ipcRenderer.removeListener === 'function') {
                ipcRenderer.on('google-auth-callback', handler);
                return () => ipcRenderer.removeListener('google-auth-callback', handler);
            } else {
                console.warn("window.electron.ipcRenderer.on is not available. Cannot listen for 'google-auth-callback'. Ensure preload exposes 'on'.");
                // Fallback or alternative communication channel might be needed if 'on' is not exposed.
                // For now, this will just not subscribe if 'on' is missing.
            }
        }
        return undefined;
    }

    // --- Optional External URL Opener ---
    async openExternalUrl(url: string): Promise<{ success: boolean; error?: string }> {
        if (typeof url !== 'string' || !(url.startsWith('http://') || url.startsWith('https://'))) {
            console.error('ElectronStorageService.openExternalUrl: Invalid URL provided:', url);
            return { success: false, error: 'Invalid URL format. Must start with http:// or https://' };
        }
        // Use the generic invokeElectron method, assuming it's suitable or create a more specific one if needed.
        // The 'open-external-url' IPC channel is already set up in main.cjs to expect a URL and return {success, error}.
        return this.invokeElectron('open-external-url', url);
    }

    // --- OAuth Server Control --- (NEW)
    async startOAuthServer(): Promise<{ success: boolean, error?: string, code?: string, message?: string }> {
        console.log("[ElectronStorageService] Invoking start-oauth-server");
        try {
            const result = await this.invokeElectron('start-oauth-server');
            console.log("[ElectronStorageService] start-oauth-server result:", result);
            return result;
        } catch (e: any) {
            console.error("[ElectronStorageService] Error invoking start-oauth-server:", e);
            return { success: false, error: e.message || "Unknown error starting OAuth server", code: e.code };
        }
    }

    async stopOAuthServer(): Promise<{ success: boolean, message?: string, error?: string }> {
        console.log("[ElectronStorageService] Invoking stop-oauth-server");
        try {
            const result = await this.invokeElectron('stop-oauth-server');
            console.log("[ElectronStorageService] stop-oauth-server result:", result);
            return result;
        } catch (e: any) {
            console.error("[ElectronStorageService] Error invoking stop-oauth-server:", e);
            return { success: false, error: e.message || "Unknown error stopping OAuth server" };
        }
    }

    // --- File System Browser ---
    async showFileInFolder(filePath: string): Promise<{ success: boolean, error?: string }> {
        if (typeof filePath !== 'string' || filePath.trim() === '') {
            console.error('Invalid filePath provided:', filePath);
            return { success: false, error: 'Invalid file path.' };
        }
        return this.invokeElectron('show-file-in-folder', filePath);
    }

    // --- WebP Conversion Methods ---
    async getFileSize(path: string): Promise<number> {
        if (typeof path !== 'string' || path.trim() === '') {
            console.error('Invalid path provided:', path);
            throw new Error('Invalid file path');
        }
        return this.invokeElectron('get-file-size', path);
    }

    async convertToWebP(options: {
        pngPath: string;
        quality: number;
        lossless: boolean;
    }): Promise<{
        webpPath: string;
        originalSize: number;
        newSize: number;
    }> {
        if (typeof options.pngPath !== 'string' || options.pngPath.trim() === '') {
            console.error('Invalid pngPath provided:', options.pngPath);
            throw new Error('Invalid PNG file path');
        }
        return this.invokeElectron('convert-to-webp', options);
    }

    async backupOriginalFile(path: string): Promise<{
        success: boolean;
        backupPath: string;
    }> {
        if (typeof path !== 'string' || path.trim() === '') {
            console.error('ElectronStorageService.backupOriginalFile: Invalid path provided:', path);
            throw new Error('Invalid file path');
        }
        return this.invokeElectron('backup-original-file', path);
    }

    async restoreFromBackup(path: string): Promise<{ success: boolean }> {
        if (typeof path !== 'string' || path.trim() === '') {
            console.error('ElectronStorageService.restoreFromBackup: Invalid path provided:', path);
            throw new Error('Invalid file path');
        }
        return this.invokeElectron('restore-from-backup', path);
    }

    async exportGameZip(options: {
        gameId: string;
        modId: string;
        assetFolders: string[];
        outputFileName: string;
    }): Promise<{
        success: boolean;
        zipPath: string;
        fileName: string;
        size: number;
    }> {
        try {
            return await this.invokeElectron('export-game-zip', options);
        } catch (error) {
            // Extract clean error message without IPC details
            const message = error instanceof Error ? error.message : String(error);
            // Re-throw with clean message
            throw new Error(message);
        }
    }

    // --- Game/Mod Installation Methods ---

    async scanInstallArchives(): Promise<string[]> {
        return this.invokeElectron('scan-install-archives');
    }

    async readArchiveManifest(zipFileName: string): Promise<{
        valid: boolean;
        name?: string;
        type?: 'game' | 'mod';
        version?: string;
        gameId?: string;
        modId?: string;
        error?: string;
    }> {
        if (typeof zipFileName !== 'string' || zipFileName.trim() === '') {
            console.error('ElectronStorageService.readArchiveManifest: Invalid zipFileName provided:', zipFileName);
            return { valid: false, error: 'Invalid ZIP file name' };
        }
        return this.invokeElectron('read-archive-manifest', zipFileName);
    }

    async checkModInstalled(gameId: string, modId: string): Promise<{
        installed: boolean;
        version?: string;
    }> {
        if (typeof gameId !== 'string' || gameId.trim() === '' ||
            typeof modId !== 'string' || modId.trim() === '') {
            console.error('ElectronStorageService.checkModInstalled: Invalid gameId or modId provided');
            return { installed: false };
        }
        return this.invokeElectron('check-mod-installed', gameId, modId);
    }

    async installGameArchive(
        zipFileName: string,
        onProgress?: (progress: { percent: number; currentFile: string; totalFiles: number }) => void
    ): Promise<{
        success: boolean;
        error?: string;
        errorCode?: string;
    }> {
        if (typeof zipFileName !== 'string' || zipFileName.trim() === '') {
            console.error('ElectronStorageService.installGameArchive: Invalid zipFileName provided:', zipFileName);
            return { success: false, error: 'Invalid ZIP file name', errorCode: 'INVALID_INPUT' };
        }

        // Set up progress listener if callback provided
        let progressListener: ((event: any, data: any) => void) | undefined;
        if (onProgress && window.electron && (window.electron.ipcRenderer as any).on) {
            const ipcRenderer = window.electron.ipcRenderer as any;
            progressListener = (_event: any, data: any) => {
                if (data && typeof data === 'object') {
                    onProgress(data);
                }
            };
            ipcRenderer.on('install-progress', progressListener);
        }

        try {
            const result = await this.invokeElectron('install-game-archive', zipFileName);

            // Remove progress listener
            if (progressListener && window.electron && (window.electron.ipcRenderer as any).removeListener) {
                const ipcRenderer = window.electron.ipcRenderer as any;
                ipcRenderer.removeListener('install-progress', progressListener);
            }

            return result;
        } catch (error) {
            // Remove progress listener on error
            if (progressListener && window.electron && (window.electron.ipcRenderer as any).removeListener) {
                const ipcRenderer = window.electron.ipcRenderer as any;
                ipcRenderer.removeListener('install-progress', progressListener);
            }

            const message = error instanceof Error ? error.message : String(error);
            return { success: false, error: message, errorCode: 'UNEXPECTED_ERROR' };
        }
    }

    // --- Documentation Methods ---

    async readDocFile(category: string, page: string, language: string = 'en', basePath: string = 'engine_files/docs'): Promise<{
        content?: string;
        error?: string;
    }> {
        if (typeof category !== 'string' || category.trim() === '' ||
            typeof page !== 'string' || page.trim() === '') {
            console.error('ElectronStorageService.readDocFile: Invalid category or page provided');
            return { error: 'Invalid category or page' };
        }
        return this.invokeElectron('read-doc-file', category, page, language, basePath);
    }

    async searchDocs(query: string, language: string = 'en', basePath: string = 'engine_files/docs'): Promise<{
        results?: any[];
        total?: number;
        error?: string;
    }> {
        if (typeof query !== 'string' || query.trim().length < 2) {
            console.error('ElectronStorageService.searchDocs: Query must be at least 2 characters');
            return { results: [], error: 'Query must be at least 2 characters' };
        }
        return this.invokeElectron('search-docs', query, language, basePath);
    }
}
