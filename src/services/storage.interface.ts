import { ManifestObject } from "../schemas/manifestSchema";
import { DungeonConfigObject } from "../schemas/dungeonConfigSchema";

export interface StorageService {
    getName(): string;


    // --- File System Methods ---
    readJson(filePath: string): Promise<any>;
    writeJson(filePath: string, data: any): Promise<void>;
    listFiles(dirPath: string): Promise<string[]>;
    listFolders(dirPath: string): Promise<string[]>;
    listFilesRecursively(dirPath: string, assetFolders?: string[], ignoreEngineAssets?: boolean): Promise<string[]>;
    deleteFile(filePath: string, recursive?: boolean): Promise<void>;
    pathExists(itemPath: string): Promise<boolean>;
    createDir(dirPath: string): Promise<void>;

    getGamesList(): Promise<ManifestObject[]>;
    getModsList(game: string): Promise<ManifestObject[]>;
    getDungeonsList(game: string, mods: string[]): Promise<string[]>;

    // --- Google API Methods ---
    startGoogleAuth(clientSecretJsonContent: object): Promise<{ authUrl?: string; error?: string }>;
    exchangeGoogleAuthCode(authorizationCode: string): Promise<{ tokens?: any; profile?: any; error?: string }>;
    refreshGoogleAuthToken(refreshToken: string, clientSecretJsonContent: object): Promise<{ tokens?: any; error?: string }>;
    getGoogleDocument(accessToken: string, documentId: string): Promise<{ document?: any; error?: string }>;
    listenForGoogleAuthCallback(callback: (data: { code?: string; error?: string }) => void): (() => void) | undefined;
    // --- End Google API Methods ---

    // --- Optional External URL Opener ---
    openExternalUrl?(url: string): Promise<{ success: boolean; error?: string }>;

    // OAuth Server Control Methods (NEW)
    startOAuthServer(): Promise<{ success: boolean, error?: string, code?: string, message?: string }>;
    stopOAuthServer(): Promise<{ success: boolean, message?: string, error?: string }>;

    // --- File System Browser ---
    showFileInFolder?(filePath: string): Promise<{ success: boolean, error?: string }>;

    // --- WebP Conversion Methods ---
    getFileSize(path: string): Promise<number>;
    convertToWebP(options: {
        pngPath: string;
        quality: number;
        lossless: boolean;
    }): Promise<{
        webpPath: string;
        originalSize: number;
        newSize: number;
    }>;
    backupOriginalFile(path: string): Promise<{
        success: boolean;
        backupPath: string;
    }>;
    restoreFromBackup?(path: string): Promise<{ success: boolean }>;

    // --- Game/Mod Export Methods ---
    exportGameZip(options: {
        gameId: string;
        modId: string;
        assetFolders: string[];
        outputFileName: string;
    }): Promise<{
        success: boolean;
        zipPath: string;
        fileName: string;
        size: number;
    }>;

    // --- Game/Mod Installation Methods ---
    scanInstallArchives(): Promise<string[]>;
    readArchiveManifest(zipFileName: string): Promise<{
        valid: boolean;
        name?: string;
        type?: 'game' | 'mod';
        version?: string;
        gameId?: string;
        modId?: string;
        error?: string;
    }>;
    checkModInstalled(gameId: string, modId: string): Promise<{
        installed: boolean;
        version?: string;
    }>;
    installGameArchive(
        zipFileName: string,
        onProgress?: (progress: { percent: number; currentFile: string; totalFiles: number }) => void
    ): Promise<{
        success: boolean;
        error?: string;
        errorCode?: string;
    }>;

    // --- Documentation Methods ---
    readDocFile(category: string, page: string, language?: string): Promise<{
        content?: string;
        error?: string;
    }>;
    searchDocs(query: string, language?: string): Promise<{
        results?: any[];
        total?: number;
        error?: string;
    }>;
} 