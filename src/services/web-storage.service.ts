import { ManifestObject } from '../schemas/manifestSchema';
import { StorageService } from './storage.interface';

/**
 * Read-only storage service for web and Capacitor builds.
 * Uses a pre-generated files_tree.json (nested object) + fetch() for reads.
 * All write operations are no-ops.
 */

type TreeNode = { [key: string]: TreeNode | 1 };

export class WebStorageService implements StorageService {
    private tree: TreeNode = {};
    private ready: Promise<void>;

    constructor() {
        this.ready = this.loadTree();
    }

    private async loadTree(): Promise<void> {
        try {
            const response = await fetch('./assets/files_tree.json');
            if (response.ok) {
                this.tree = await response.json();
            } else {
                console.error('[WebStorage] Failed to load files_tree.json:', response.status);
            }
        } catch (error) {
            console.error('[WebStorage] Error loading files_tree.json:', error);
        }
    }

    /** Navigate to a node in the tree by path. Returns undefined if not found. */
    private getNode(path: string): TreeNode | 1 | undefined {
        if (!path || path === '' || path === '/') return this.tree;
        const parts = path.replace(/^\/+|\/+$/g, '').split('/');
        let current: TreeNode | 1 = this.tree;
        for (const part of parts) {
            if (typeof current !== 'object' || !(part in current)) return undefined;
            current = current[part];
        }
        return current;
    }

    getName(): string {
        return 'web';
    }

    supportsImageTools(): boolean {
        return false;
    }

    supportsGoogleAuth(): boolean {
        return false;
    }

    // --- File System Read Methods ---

    async readJson(filePath: string): Promise<any> {
        await this.ready;
        try {
            const response = await fetch(`./assets/${filePath}`);
            if (!response.ok) {
                console.warn(`[WebStorage] readJson 404: ${filePath}`);
                return null;
            }
            return await response.json();
        } catch (error) {
            console.error(`[WebStorage] readJson error: ${filePath}`, error);
            return null;
        }
    }

    async readText(filePath: string): Promise<string | null> {
        await this.ready;
        try {
            const response = await fetch(`./assets/${filePath}`);
            if (!response.ok) {
                return null;
            }
            return await response.text();
        } catch (error) {
            console.error(`[WebStorage] readText error: ${filePath}`, error);
            return null;
        }
    }

    async listFiles(dirPath: string): Promise<string[]> {
        await this.ready;
        const node = this.getNode(dirPath);
        if (!node || typeof node !== 'object') return [];
        const files: string[] = [];
        for (const key in node) {
            if (node[key] === 1) files.push(key);
        }
        return files;
    }

    async listFolders(dirPath: string): Promise<string[]> {
        await this.ready;
        const node = this.getNode(dirPath);
        if (!node || typeof node !== 'object') return [];
        const folders: string[] = [];
        for (const key in node) {
            if (typeof node[key] === 'object') folders.push(key);
        }
        return folders;
    }

    async listFilesRecursively(dirPath: string, assetFolders?: string[], ignoreEngineAssets?: boolean): Promise<string[]> {
        await this.ready;
        const node = this.getNode(dirPath);
        if (!node || typeof node !== 'object') return [];

        const files: string[] = [];
        const walk = (current: TreeNode, prefix: string) => {
            for (const key in current) {
                const fullPath = prefix ? `${prefix}/${key}` : key;
                if (current[key] === 1) {
                    files.push(fullPath);
                } else {
                    walk(current[key] as TreeNode, fullPath);
                }
            }
        };

        const basePath = dirPath ? `${dirPath}/` : '';
        walk(node, dirPath);
        return files;
    }

    async pathExists(itemPath: string): Promise<boolean> {
        await this.ready;
        return this.getNode(itemPath) !== undefined;
    }

    // --- Game/Mod Methods (compose from listFolders + readJson) ---

    async getGamesList(): Promise<ManifestObject[]> {
        // Sorted so the game list order is deterministic (matches desktop)
        const gameFolders = (await this.listFolders('games_files')).sort();
        const games: ManifestObject[] = [];
        for (const gameFolder of gameFolders) {
            const manifest = await this.readJson(`games_files/${gameFolder}/_core/manifest.json`);
            if (manifest) games.push(manifest);
        }
        return games;
    }

    async getModsList(game: string): Promise<ManifestObject[]> {
        const modsFolders = await this.listFolders(`games_files/${game}`);
        const modsList: ManifestObject[] = [];
        for (const modFolder of modsFolders) {
            if (modFolder === '_core') continue;
            const manifest = await this.readJson(`games_files/${game}/${modFolder}/manifest.json`);
            if (manifest) modsList.push(manifest);
        }
        return modsList.sort((a, b) => (a.load_order || 0) - (b.load_order || 0));
    }

    async getDungeonsList(game: string, mods: string[]): Promise<string[]> {
        const dungeonSet = new Set<string>();
        for (const mod of mods) {
            const dungeons = await this.listFolders(`games_files/${game}/${mod}/dungeons`);
            for (const dungeon of dungeons) dungeonSet.add(dungeon);
        }
        return Array.from(dungeonSet);
    }

    // --- Documentation Methods ---

    async readDocFile(category: string, page: string, language: string = 'en', basePath: string = ''): Promise<{ content?: string; error?: string }> {
        try {
            const response = await fetch(`./assets/${basePath}/${language}/${category}/${page}.md`);
            if (!response.ok) return { error: `Not found: ${category}/${page}` };
            const content = await response.text();
            return { content };
        } catch (error) {
            return { error: String(error) };
        }
    }

    async searchDocs(query: string, language: string = 'en', basePath: string = ''): Promise<{ results?: any[]; total?: number; error?: string }> {
        // Basic implementation -- return empty for now, can be enhanced later
        return { results: [], total: 0 };
    }

    // --- Write Methods (no-op in web mode) ---

    async writeJson(_filePath: string, _data: any): Promise<void> {
        console.warn('[WebStorage] writeJson is not available in web mode');
    }

    async writeText(_filePath: string, _content: string): Promise<void> {
        console.warn('[WebStorage] writeText is not available in web mode');
    }

    async deleteFile(_filePath: string, _recursive?: boolean): Promise<void> {
        console.warn('[WebStorage] deleteFile is not available in web mode');
    }

    async createDir(_dirPath: string): Promise<void> {
        console.warn('[WebStorage] createDir is not available in web mode');
    }

    async copyDir(_src: string, _dest: string): Promise<{ success: boolean; error?: string }> {
        return { success: false, error: 'Not available in web mode' };
    }

    // --- Google API (not supported) ---

    async startGoogleAuth(_clientSecretJsonContent: object): Promise<{ authUrl?: string; error?: string }> {
        return { error: 'Google Auth not available in web mode' };
    }

    async exchangeGoogleAuthCode(_authorizationCode: string): Promise<{ tokens?: any; profile?: any; error?: string }> {
        return { error: 'Google Auth not available in web mode' };
    }

    async refreshGoogleAuthToken(_refreshToken: string, _clientSecretJsonContent: object): Promise<{ tokens?: any; error?: string }> {
        return { error: 'Google Auth not available in web mode' };
    }

    async getGoogleDocument(_accessToken: string, _documentId: string): Promise<{ document?: any; error?: string }> {
        return { error: 'Google Auth not available in web mode' };
    }

    listenForGoogleAuthCallback(_callback: (data: { code?: string; error?: string }) => void): (() => void) | undefined {
        return undefined;
    }

    // --- OAuth Server (not supported) ---

    async startOAuthServer(): Promise<{ success: boolean; error?: string }> {
        return { success: false, error: 'Not available in web mode' };
    }

    async stopOAuthServer(): Promise<{ success: boolean; error?: string }> {
        return { success: false, error: 'Not available in web mode' };
    }

    // --- Image Tools (not supported) ---

    async getFileSize(_path: string): Promise<number> {
        return 0;
    }

    async convertToWebP(_options: { pngPath: string; quality: number; lossless: boolean }): Promise<{ webpPath: string; originalSize: number; newSize: number }> {
        throw new Error('WebP conversion not available in web mode');
    }

    async backupOriginalFile(_path: string): Promise<{ success: boolean; backupPath: string }> {
        return { success: false, backupPath: '' };
    }

    // --- Export/Install (not supported) ---

    async exportGameZip(_options: { gameId: string; modId: string; assetFolders: string[]; outputFileName: string }): Promise<{ success: boolean; zipPath: string; fileName: string; size: number }> {
        throw new Error('Export not available in web mode');
    }

    async scanInstallArchives(): Promise<string[]> {
        return [];
    }

    async readArchiveManifest(_zipFileName: string): Promise<{ valid: boolean; error?: string }> {
        return { valid: false, error: 'Not available in web mode' };
    }

    async checkModInstalled(_gameId: string, _modId: string): Promise<{ installed: boolean }> {
        return { installed: false };
    }

    async installGameArchive(_zipFileName: string): Promise<{ success: boolean; error?: string }> {
        return { success: false, error: 'Not available in web mode' };
    }
}
