import { ManifestObject } from '../schemas/manifestSchema';
import { StorageService } from './storage.interface';
import { DungeonConfigObject } from '../schemas/dungeonConfigSchema';

export class CapacitorStorageService implements StorageService {
    constructor() {
        console.warn('CapacitorStorageService is not implemented yet');
    }

    getName(): string {
        return 'capacitor';
    }

    async readJson(filePath: string): Promise<any> {
        throw new Error('CapacitorStorageService.readJson() is not implemented yet');
    }

    async writeJson(filePath: string, data: any): Promise<void> {
        throw new Error('CapacitorStorageService.writeJson() is not implemented yet');
    }

    async listFiles(dirPath: string): Promise<string[]> {
        throw new Error('CapacitorStorageService.listFiles() is not implemented yet');
    }

    async listFolders(dirPath: string): Promise<string[]> {
        throw new Error('CapacitorStorageService.listFolders() is not implemented yet');
    }

    async listFilesRecursively(dirPath: string, assetFolders?: string[], ignoreEngineAssets?: boolean): Promise<string[]> {
        throw new Error('CapacitorStorageService.listFilesRecursively() is not implemented yet');
    }

    async deleteFile(filePath: string): Promise<void> {
        throw new Error('CapacitorStorageService.deleteFile() is not implemented yet');
    }

    async pathExists(itemPath: string): Promise<boolean> {
        throw new Error('CapacitorStorageService.pathExists() is not implemented yet');
    }

    async createDir(dirPath: string): Promise<void> {
        throw new Error('CapacitorStorageService.createDir() is not implemented yet');
    }

    async getGamesList(): Promise<ManifestObject[]> {
        // read from the tree.json file
        throw new Error('CapacitorStorageService.getGamesList() is not implemented yet');
    }

    async getModsList(game: string): Promise<ManifestObject[]> {
        // read from the tree.json file
        throw new Error('CapacitorStorageService.getModsList() is not implemented yet');
    }

    async getDungeonsList(game: string, mods: string[]): Promise<string[]> {
        throw new Error('CapacitorStorageService.getDungeonsList() is not implemented yet');
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
        throw new Error('LocalhostStorageService.getGoogleDocument() is not implemented yet');
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
        throw new Error('CapacitorStorageService.getFileSize() is not implemented yet');
    }

    async convertToWebP(options: { pngPath: string; quality: number; lossless: boolean }): Promise<{ webpPath: string; originalSize: number; newSize: number }> {
        throw new Error('CapacitorStorageService.convertToWebP() is not implemented yet');
    }

    async backupOriginalFile(path: string): Promise<{ success: boolean; backupPath: string }> {
        throw new Error('CapacitorStorageService.backupOriginalFile() is not implemented yet');
    }

    async restoreFromBackup(path: string): Promise<{ success: boolean }> {
        throw new Error('CapacitorStorageService.restoreFromBackup() is not implemented yet');
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
        throw new Error('CapacitorStorageService.exportGameZip() is not implemented yet');
    }

    // --- Game/Mod Installation Methods ---
    async scanInstallArchives(): Promise<string[]> {
        throw new Error('CapacitorStorageService.scanInstallArchives() is not implemented yet');
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
        throw new Error('CapacitorStorageService.readArchiveManifest() is not implemented yet');
    }

    async checkModInstalled(gameId: string, modId: string): Promise<{
        installed: boolean;
        version?: string;
    }> {
        throw new Error('CapacitorStorageService.checkModInstalled() is not implemented yet');
    }

    async installGameArchive(
        zipFileName: string,
        onProgress?: (progress: { percent: number; currentFile: string; totalFiles: number }) => void
    ): Promise<{
        success: boolean;
        error?: string;
        errorCode?: string;
    }> {
        throw new Error('CapacitorStorageService.installGameArchive() is not implemented yet');
    }

    // --- Documentation Methods ---
    async readDocFile(category: string, page: string, language: string = 'en', basePath: string = 'engine_files/docs'): Promise<{
        content?: string;
        error?: string;
    }> {
        throw new Error('CapacitorStorageService.readDocFile() is not implemented yet');
    }

    async searchDocs(query: string, language: string = 'en', basePath: string = 'engine_files/docs'): Promise<{
        results?: any[];
        total?: number;
        error?: string;
    }> {
        throw new Error('CapacitorStorageService.searchDocs() is not implemented yet');
    }
} 