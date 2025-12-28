import { ManifestObject } from '../schemas/manifestSchema';
import { StorageService } from './storage.interface';
import { DungeonConfigObject } from '../schemas/dungeonConfigSchema';
export class LocalhostStorageService implements StorageService {
    private baseUrl = 'http://localhost:7000';

    // Constructor no longer needs HttpClient
    constructor() { }

    getName(): string {
        return 'localhost';
    }

    async readJson(filePath: string): Promise<any> {
        const url = `${this.baseUrl}/engine/read?path=${encodeURIComponent(filePath)}`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json', // Expect JSON back, although server might send text
                }
            });

            if (!response.ok) {
                console.warn(`HTTP error! status: ${response.status}`);
                return null;
            }

            // Assuming the server sends JSON directly or text that needs parsing
            // Use response.json() if the server correctly sets Content-Type: application/json
            // Use response.text() and JSON.parse() if it sends plain text
            const responseData = await response.json();
            // If server sends text: const text = await response.text(); return JSON.parse(text);
            return responseData;

        } catch (error) {
            // Check if it's the specific HTTP error we throw and if it's a 404
            if (error instanceof Error && error.message.includes('status: 404')) {
                // Log 404s as warnings (or could suppress entirely)
                console.warn(`File not found (404): ${url}`);
            } else {
                // Log other errors as actual errors
                console.warn(`Error reading JSON file from ${url}:`, error);
            }
            console.warn(error); // Re-throw the error so the caller can handle it
            return null;
        }
    }

    async writeJson(filePath: string, data: any): Promise<void> {
        const url = `${this.baseUrl}/engine/write`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ path: filePath, data: data })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // No need to process response body for write operation unless server sends confirmation

        } catch (error) {
            console.error(`Error writing JSON file to ${url}:`, error);
        }
    }

    async listFiles(dirPath: string): Promise<string[]> {
        const url = `${this.baseUrl}/engine/list-files?path=${encodeURIComponent(dirPath)}`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();
            return result.files || []; // Assuming backend returns { files: [...] }
        } catch (error) {
            console.error(`Error listing files from ${url}:`, error);
            return []; // Explicitly return empty array
        }
    }

    async listFolders(dirPath: string): Promise<string[]> {
        const url = `${this.baseUrl}/engine/list-folders?path=${encodeURIComponent(dirPath)}`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();
            return result.folders || []; // Assuming backend returns { folders: [...] }
        } catch (error) {
            console.error(`Error listing folders from ${url}:`, error);
            return []; // Explicitly return empty array
        }
    }

    async deleteFile(filePath: string, recursive: boolean = false): Promise<void> {
        const url = `${this.baseUrl}/engine/delete`; // Assuming POST endpoint
        try {
            const response = await fetch(url, {
                method: 'POST', // Or 'DELETE' if backend uses that
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath, recursive })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        } catch (error) {
            console.error(`Error deleting file via ${url}:`, error);
            throw error;
        }
    }

    async pathExists(itemPath: string): Promise<boolean> {
        const url = `${this.baseUrl}/engine/exists?path=${encodeURIComponent(itemPath)}`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) {
                // If server returns 404 for non-existent, treat as false, else throw
                if (response.status === 404) return false;
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            return result.exists === true; // Assuming backend returns { exists: true/false }
        } catch (error) {
            console.error(`Error checking path existence via ${url}:`, error);
            // Decide if errors mean false or should be thrown
            // Returning false might be safer if backend connection fails
            return false;
            // throw error;
        }
    }

    async createDir(dirPath: string): Promise<void> {
        const url = `${this.baseUrl}/engine/create-dir`; // Assuming POST endpoint
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: dirPath })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        } catch (error) {
            console.error(`Error creating directory via ${url}:`, error);
        }
    }

    /**
     * Lists all files recursively within a given directory by calling a backend endpoint.
     * Assumes the backend handles the recursive logic at GET /engine/list-files-recursively?path=...
     * @param dirPath - The directory path to search
     * @param assetFolders - Optional array of asset folder paths to filter (from devSettings.asset_folders)
     * @param ignoreEngineAssets - Optional flag to ignore engine_assets folder (from devSettings.ignore_engine_assets)
     */
    async listFilesRecursively(dirPath: string, assetFolders?: string[], ignoreEngineAssets?: boolean): Promise<string[]> {
        let url = `${this.baseUrl}/engine/list-files-recursively?path=${encodeURIComponent(dirPath)}`;

        // Add optional query parameters
        if (assetFolders && assetFolders.length > 0) {
            url += `&assetFolders=${encodeURIComponent(JSON.stringify(assetFolders))}`;
        }
        if (ignoreEngineAssets !== undefined) {
            url += `&ignoreEngineAssets=${ignoreEngineAssets}`;
        }

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) {
                console.error(`HTTP error fetching recursive file list! status: ${response.status} for ${url}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const result = await response.json();
            // Ensure the result is always an array, even if the backend returns null/undefined
            return result.files && Array.isArray(result.files) ? result.files : [];
        } catch (error) {
            console.error(`Error listing files recursively from ${url}:`, error);
            return []; // Return empty array on error
        }
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
            let modManifest = await this.readJson(`games_files/${game}/${modFolder}/manifest.json`);
            if (modFolder === "_core") {
                continue;
            }
            modsList.push(modManifest);
        }
        modsList = modsList.sort((a, b) => (a.load_order || 0) - (b.load_order || 0));
        return modsList;
    }

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
        throw new Error('LocalhostStorageService.startGoogleAuth() is not implemented yet');
    }

    async exchangeGoogleAuthCode(authorizationCode: string): Promise<{ tokens?: any; profile?: any; error?: string }> {
        throw new Error('LocalhostStorageService.exchangeGoogleAuthCode() is not implemented yet');
    }

    async refreshGoogleAuthToken(refreshToken: string, clientSecretJsonContent: object): Promise<{ tokens?: any; error?: string }> {
        throw new Error('LocalhostStorageService.refreshGoogleAuthToken() is not implemented yet');
    }

    async getGoogleDocument(accessToken: string, documentId: string): Promise<{ document?: any; error?: string }> {
        // accessToken is ignored
        const url = `${this.baseUrl}/engine/fetch`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken, documentId })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();
            return result;
        } catch (error) {
            console.error(`Error fetching Google document via ${url}:`, error);
            return { error: (error as Error).message };
        }
    }

    listenForGoogleAuthCallback(callback: (data: { code?: string; error?: string }) => void): (() => void) | undefined {
        throw new Error('LocalhostStorageService.listenForGoogleAuthCallback() is not implemented yet');
    }

    async startOAuthServer(): Promise<{ success: boolean, error?: string, code?: string, message?: string }> {
        throw new Error('LocalhostStorageService.startOAuthServer() is not implemented yet');
    }

    async stopOAuthServer(): Promise<{ success: boolean, message?: string, error?: string }> {
        throw new Error('LocalhostStorageService.stopOAuthServer() is not implemented yet');
    }
    // --- End Google API Methods ---

    // --- WebP Conversion Methods ---
    async getFileSize(path: string): Promise<number> {
        throw new Error('LocalhostStorageService.getFileSize() is not implemented - WebP conversion only available in Electron');
    }

    async convertToWebP(options: { pngPath: string; quality: number; lossless: boolean }): Promise<{ webpPath: string; originalSize: number; newSize: number }> {
        throw new Error('LocalhostStorageService.convertToWebP() is not implemented - WebP conversion only available in Electron');
    }

    async backupOriginalFile(path: string): Promise<{ success: boolean; backupPath: string }> {
        throw new Error('LocalhostStorageService.backupOriginalFile() is not implemented - WebP conversion only available in Electron');
    }

    async restoreFromBackup(path: string): Promise<{ success: boolean }> {
        throw new Error('LocalhostStorageService.restoreFromBackup() is not implemented - WebP conversion only available in Electron');
    }
    // --- End WebP Conversion Methods ---

    // --- Game/Mod Export Methods ---
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
        throw new Error('LocalhostStorageService.exportGameZip() is not implemented - Export only available in Electron');
    }

    // --- Game/Mod Installation Methods (Not supported in Localhost mode) ---
    async scanInstallArchives(): Promise<string[]> {
        console.warn('LocalhostStorageService.scanInstallArchives() is not supported - Installation only available in Electron');
        return [];
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
        console.warn('LocalhostStorageService.readArchiveManifest() is not supported - Installation only available in Electron');
        return { valid: false, error: 'Installation not supported in localhost mode' };
    }

    async checkModInstalled(gameId: string, modId: string): Promise<{
        installed: boolean;
        version?: string;
    }> {
        console.warn('LocalhostStorageService.checkModInstalled() is not supported - Installation only available in Electron');
        return { installed: false };
    }

    async installGameArchive(
        zipFileName: string,
        onProgress?: (progress: { percent: number; currentFile: string; totalFiles: number }) => void
    ): Promise<{
        success: boolean;
        error?: string;
        errorCode?: string;
    }> {
        console.warn('LocalhostStorageService.installGameArchive() is not supported - Installation only available in Electron');
        return { success: false, error: 'Installation not supported in localhost mode', errorCode: 'NOT_SUPPORTED' };
    }

    // --- Documentation Methods ---
    async readDocFile(category: string, page: string, language: string = 'en', basePath: string = 'engine_files/docs'): Promise<{
        content?: string;
        error?: string;
    }> {
        try {
            const response = await fetch(`/assets/${basePath}/${language}/${category}/${page}.md`);
            if (!response.ok) {
                return { error: `Documentation file not found: ${category}/${page}.md` };
            }
            const content = await response.text();
            return { content };
        } catch (error) {
            console.error('LocalhostStorageService.readDocFile error:', error);
            return { error: error instanceof Error ? error.message : 'Failed to read documentation file' };
        }
    }

    async searchDocs(query: string, language: string = 'en', basePath: string = 'engine_files/docs'): Promise<{
        results?: any[];
        total?: number;
        error?: string;
    }> {
        console.warn('LocalhostStorageService.searchDocs() is not fully supported - Search only available in Electron');
        return { results: [], total: 0, error: 'Search not supported in localhost mode' };
    }
} 