import { ref, reactive, watch, onUnmounted, toRaw, computed } from 'vue';
import { Global } from '../global/global';
import { Editor } from './editor';
import { StorageService } from '../services/storage.interface';

// --- Storage Keys ---
const OAUTH_APP_CONFIGS_STORAGE_KEY = 'google_oauth_app_configs';
const USER_TOKENS_STORAGE_KEY = 'google_user_tokens';
const DEFAULT_USER_TOKEN_ID_KEY = 'google_default_user_token_id'; // For global default
const CONFIG_SPECIFIC_TOKENS_KEY_PREFIX = 'google_config_token_'; // For game/mod/dungeon specific
const ACTIVE_OAUTH_APP_CLIENT_ID_KEY = 'google_active_oauth_app_client_id'; // New Key

// --- Interfaces ---
export interface GoogleUser {
    email?: string;
    name?: string;
    picture?: string;
    // Add other fields from profile as needed
}

export interface GoogleTokens {
    access_token: string;
    refresh_token?: string;
    expiry_date?: number;
    scope?: string;
    token_type?: string;
    id_token?: string;
}

export interface OAuthAppConfig {
    clientId: string; // Primary key for an OAuth App config
    clientSecret: string;
    projectId?: string;
    // other relevant fields from client_secret.json if needed
    appName?: string; // User-defined name for this credential set, or auto-generated
}

export interface StoredUserToken {
    id: string; // Unique ID for this stored token entry (e.g., timestamp or UUID)
    userGivenName: string; // User-defined name for this token
    tokenData: GoogleTokens;
    googleUser: GoogleUser | null; // Profile info, if available
    linkedOAuthAppClientId: string | null; // clientId of the OAuthAppConfig used to obtain this
    createdAt: number; // Timestamp
}

export class DocumentManager {
    private storageService: StorageService;
    private editorInstance: Editor; // For accessing EditorState

    public isLoading = ref(false);
    public error = ref<string | null>(null);
    public successMessage = ref<string | null>(null); // Added for success messages

    // --- New Reactive State ---
    public oauthAppConfigs = reactive<OAuthAppConfig[]>([]);
    public userTokens = reactive<StoredUserToken[]>([]);
    
    public activeOAuthAppClientId = ref<string | null>(null); // For initiating new tokens
    public activeUserTokenId = ref<string | null>(null);     // For API calls
    public globalDefaultUserTokenId = ref<string | null>(null); // Added for global default

    // Computed property for the currently active token's details
    public activeStoredToken = computed<StoredUserToken | null>(() => {
        if (!this.activeUserTokenId.value) return null;
        return this.userTokens.find(t => t.id === this.activeUserTokenId.value) || null;
    });

    // Computed property for the GoogleTokens of the active StoredUserToken
    public activeGoogleTokenData = computed<GoogleTokens | null>(() => {
        return this.activeStoredToken.value?.tokenData || null;
    });
    
    // Computed property for the GoogleUser profile of the active StoredUserToken
    public activeUserProfile = computed<GoogleUser | null>(() => {
        return this.activeStoredToken.value?.googleUser || null;
    });


    public isOAuthServerWaitingForCallback = ref(false);
    private cleanupAuthCallback: (() => void) | undefined;
    private authFlowContext = reactive<{ tokenName?: string; oauthAppClientId?: string }>({});

    
    constructor() {
        this.storageService = Global.getInstance().storageService;
        this.editorInstance = Editor.getInstance(); // Get editor instance

        if (this.storageService.getName() !== 'electron') {
            return;
        }

        this.loadOAuthAppConfigs();
        this.loadUserTokens();
        this.loadGlobalDefaultUserTokenId();
        this.loadActiveOAuthAppClientId(); // New call

        if (this.oauthAppConfigs.length > 0 && !this.activeOAuthAppClientId.value) {
            this.selectOAuthApp(this.oauthAppConfigs[0].clientId);
        }
        // Auto-select global default if set, otherwise most recent
        if (this.globalDefaultUserTokenId.value && this.userTokens.some(t => t.id === this.globalDefaultUserTokenId.value)) {
            this.selectUserToken(this.globalDefaultUserTokenId.value);
        } else if (this.userTokens.length > 0 && !this.activeUserTokenId.value) {
            const sortedTokens = [...this.userTokens].sort((a, b) => b.createdAt - a.createdAt);
            this.selectUserToken(sortedTokens[0].id);
        }

        this.cleanupAuthCallback = this.storageService.listenForGoogleAuthCallback(
            ({ code, error }) => {
                this.clearMessages();
                if (error) {
                    this.error.value = `Authentication failed: ${error}`;
                    this.isLoading.value = false;
                    this.isOAuthServerWaitingForCallback.value = false;
                } else if (code && this.authFlowContext.tokenName && this.authFlowContext.oauthAppClientId) {
                    this.handleAuthCodeReceived(code, this.authFlowContext.tokenName, this.authFlowContext.oauthAppClientId);
                } else {
                    this.error.value = "OAuth callback received without necessary context.";
                    this.isLoading.value = false;
                    this.isOAuthServerWaitingForCallback.value = false;
                }
                this.authFlowContext.tokenName = undefined;
                this.authFlowContext.oauthAppClientId = undefined;
            }
        );

        watch(() => this.oauthAppConfigs, (newConfigs) => {
            localStorage.setItem(OAUTH_APP_CONFIGS_STORAGE_KEY, JSON.stringify(toRaw(newConfigs)));
        }, { deep: true });

        watch(() => this.userTokens, (newTokens) => {
            localStorage.setItem(USER_TOKENS_STORAGE_KEY, JSON.stringify(toRaw(newTokens)));
        }, { deep: true });

        watch(() => this.globalDefaultUserTokenId.value, (newDefaultId) => {
            if (newDefaultId) {
                localStorage.setItem(DEFAULT_USER_TOKEN_ID_KEY, newDefaultId);
            } else {
                localStorage.removeItem(DEFAULT_USER_TOKEN_ID_KEY);
            }
        });

        watch(() => this.activeOAuthAppClientId.value, (newActiveId) => { // New watcher
            if (newActiveId) {
                localStorage.setItem(ACTIVE_OAUTH_APP_CLIENT_ID_KEY, newActiveId);
            } else {
                localStorage.removeItem(ACTIVE_OAUTH_APP_CLIENT_ID_KEY);
            }
        });
    }

    private clearMessages() {
        this.error.value = null;
        this.successMessage.value = null;
    }

    private loadGlobalDefaultUserTokenId() {
        this.globalDefaultUserTokenId.value = localStorage.getItem(DEFAULT_USER_TOKEN_ID_KEY);
    }

    private loadActiveOAuthAppClientId() { // New method
        const savedId = localStorage.getItem(ACTIVE_OAUTH_APP_CLIENT_ID_KEY);
        if (savedId && this.oauthAppConfigs.some(app => app.clientId === savedId)) {
            this.activeOAuthAppClientId.value = savedId;
        } else if (savedId) {
            // Saved ID is no longer valid (app config deleted?), remove it
            localStorage.removeItem(ACTIVE_OAUTH_APP_CLIENT_ID_KEY);
        }
    }

    private loadOAuthAppConfigs() {
        const stored = localStorage.getItem(OAUTH_APP_CONFIGS_STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as OAuthAppConfig[];
                this.oauthAppConfigs.splice(0, this.oauthAppConfigs.length, ...parsed); // Replace array content
            } catch (e) {
                console.error("Failed to parse stored OAuth App Configs:", e);
                localStorage.removeItem(OAUTH_APP_CONFIGS_STORAGE_KEY);
            }
        }
    }

    private loadUserTokens() {
        const stored = localStorage.getItem(USER_TOKENS_STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as StoredUserToken[];
                this.userTokens.splice(0, this.userTokens.length, ...parsed); // Replace array content
            } catch (e) {
                console.error("Failed to parse stored User Tokens:", e);
                localStorage.removeItem(USER_TOKENS_STORAGE_KEY);
            }
        }
    }

    public saveOAuthAppConfig(jsonContent: string, appName?: string): boolean {
        this.isLoading.value = true;
        this.clearMessages();
        try {
            const parsedContent = JSON.parse(jsonContent);
            let clientId, clientSecret, projectId;

            if (parsedContent.web) {
                clientId = parsedContent.web.client_id;
                clientSecret = parsedContent.web.client_secret;
                projectId = parsedContent.web.project_id;
            } else if (parsedContent.installed) {
                clientId = parsedContent.installed.client_id;
                clientSecret = parsedContent.installed.client_secret;
                projectId = parsedContent.installed.project_id;
            } else {
                throw new Error("Credentials must be for 'web' or 'installed' type.");
            }

            if (!clientId || !clientSecret) {
                throw new Error("Missing client_id or client_secret in credentials.");
            }

            const existingIndex = this.oauthAppConfigs.findIndex(app => app.clientId === clientId);
            const newConfig: OAuthAppConfig = {
                clientId,
                clientSecret,
                projectId,
                appName: appName || `App (${clientId.substring(0, 8)}...)`
            };

            if (existingIndex > -1) {
                this.oauthAppConfigs[existingIndex] = newConfig;
                 this.successMessage.value = `OAuth App "${newConfig.appName}" updated.`;
            } else {
                this.oauthAppConfigs.push(newConfig);
                this.successMessage.value = `OAuth App "${newConfig.appName}" saved.`;
            }
            this.selectOAuthApp(clientId); // Auto-select the newly added/updated one
            this.isLoading.value = false;
            return true;
        } catch (e: any) {
            this.error.value = `Failed to parse or save credentials: ${e.message}`;
            this.isLoading.value = false;
            return false;
        }
    }
    
    public selectOAuthApp(clientId: string | null) {
        this.clearMessages();
        if (clientId && this.oauthAppConfigs.some(app => app.clientId === clientId)) {
            this.activeOAuthAppClientId.value = clientId;
            // this.successMessage.value = `OAuth App "${this.oauthAppConfigs.find(a=>a.clientId === clientId)?.appName}" selected for new tokens.`;
        } else if (!clientId) {
            this.activeOAuthAppClientId.value = null;
        } else {
            this.error.value = "Selected OAuth App configuration not found.";
        }
    }

    public deleteOAuthAppConfig(clientId: string) {
        this.clearMessages();
        const appToDelete = this.oauthAppConfigs.find(app => app.clientId === clientId);
        if (!appToDelete) return;

        const index = this.oauthAppConfigs.findIndex(app => app.clientId === clientId);
        if (index > -1) {
            this.oauthAppConfigs.splice(index, 1);
            
            const tokensToRemove = this.userTokens.filter(token => token.linkedOAuthAppClientId === clientId);
            tokensToRemove.forEach(token => {
                const tokenConfigKey = this.getCurrentConfigKey();
                if (tokenConfigKey && this.getTokenForConfiguration(tokenConfigKey) === token.id) {
                    this.setTokenForConfiguration(tokenConfigKey, null); // Unset if it was selected for current config
                }
                 if (this.globalDefaultUserTokenId.value === token.id) {
                    this.setGlobalDefaultUserToken(null); // Unset if it was global default
                }
            });
            this.userTokens = reactive(this.userTokens.filter(token => token.linkedOAuthAppClientId !== clientId));
            
            if (this.activeOAuthAppClientId.value === clientId) {
                this.activeOAuthAppClientId.value = this.oauthAppConfigs.length > 0 ? this.oauthAppConfigs[0].clientId : null;
            }
            if (this.activeUserTokenId.value && tokensToRemove.some(t => t.id === this.activeUserTokenId.value)){
                this.activeUserTokenId.value = this.globalDefaultUserTokenId.value || (this.userTokens.length > 0 ? this.userTokens[0].id : null);
            }
            this.successMessage.value = `OAuth App "${appToDelete.appName}" and its ${tokensToRemove.length} associated token(s) deleted.`;
        }
    }

    public async startAuthentication(tokenName: string) {
        this.clearMessages();
        if (!this.activeOAuthAppClientId.value) {
            this.error.value = "No active OAuth App selected. Please select or add one first.";
            return;
        }
        const oauthApp = this.oauthAppConfigs.find(app => app.clientId === this.activeOAuthAppClientId.value);
        if (!oauthApp) {
            this.error.value = "Active OAuth App configuration not found.";
            return;
        }
        if (!tokenName.trim()) {
            this.error.value = "Token name cannot be empty.";
            return;
        }
        if (this.userTokens.some(t => t.userGivenName === tokenName.trim())) {
             this.error.value = `A token with the name "${tokenName.trim()}" already exists. Choose a unique name.`;
             return;
        }

        this.isLoading.value = true;
        this.authFlowContext.tokenName = tokenName.trim();
        this.authFlowContext.oauthAppClientId = oauthApp.clientId;

        try {
            const serverStartResult = await this.storageService.startOAuthServer();
            if (!serverStartResult || !serverStartResult.success) {
                this.error.value = `Failed to start local OAuth server: ${serverStartResult.error || 'Unknown error'}. ${serverStartResult.code === 'EADDRINUSE' ? 'Port in use.' : ''}`;
                this.isLoading.value = false;
                this.authFlowContext.tokenName = undefined; 
                this.authFlowContext.oauthAppClientId = undefined;
                return;
            }
            
            const clientSecretJsonContent = {
                [oauthApp.projectId ? "installed" : "web"]: { 
                    client_id: oauthApp.clientId,
                    client_secret: oauthApp.clientSecret,
                    project_id: oauthApp.projectId,
                }
            };

            const result = await this.storageService.startGoogleAuth(toRaw(clientSecretJsonContent));
            
            if (result.error) {
                this.error.value = result.error;
                await this.storageService.stopOAuthServer(); 
            } else if (result.authUrl) {
                if (typeof this.storageService.openExternalUrl === 'function') {
                    const openResult = await this.storageService.openExternalUrl(result.authUrl);
                    if (openResult && openResult.success) {
                        this.successMessage.value = "Please complete authentication in your browser. Waiting for callback...";
                        this.isOAuthServerWaitingForCallback.value = true;
                    } else {
                        this.error.value = `Failed to open authentication URL. Error: ${openResult?.error}`;
                        await this.storageService.stopOAuthServer();
                    }
                } else { 
                    this.error.value = "Cannot open URL automatically.";
                    await this.storageService.stopOAuthServer();
                }
            } else { 
                 this.error.value = "Failed to get authentication URL from main process.";
                 await this.storageService.stopOAuthServer();
            }
        } catch (e: any) {
            this.error.value = `Authentication failed: ${e.message}`;
            try { await this.storageService.stopOAuthServer(); } catch (stopError) { console.warn("Failed to stop OAuth server during error cleanup", stopError);}
        }
        
        if (!this.isOAuthServerWaitingForCallback.value) {
            this.isLoading.value = false;
            this.authFlowContext.tokenName = undefined;
            this.authFlowContext.oauthAppClientId = undefined;
        }
    }

    private async handleAuthCodeReceived(code: string, tokenName: string, oauthAppClientId: string) {
        this.isLoading.value = true; 
        this.isOAuthServerWaitingForCallback.value = false;
        this.clearMessages();

        const oauthApp = this.oauthAppConfigs.find(app => app.clientId === oauthAppClientId);
        if (!oauthApp) {
            this.error.value = "Fatal: OAuth App config not found during token exchange.";
            this.isLoading.value = false;
            return;
        }

        try {
            const result = await this.storageService.exchangeGoogleAuthCode(code);

            if (result.error) {
                this.error.value = `Token exchange failed: ${result.error}`;
            } else if (result.tokens) {
                const newStoredToken: StoredUserToken = {
                    id: `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                    userGivenName: tokenName,
                    tokenData: result.tokens as GoogleTokens,
                    googleUser: result.profile as GoogleUser | null,
                    linkedOAuthAppClientId: oauthAppClientId,
                    createdAt: Date.now()
                };
                this.userTokens.push(newStoredToken);
                this.selectUserToken(newStoredToken.id);
                this.successMessage.value = `Token "${tokenName}" created successfully.`;
            } else {
                this.error.value = "Token exchange did not return expected tokens.";
            }
        } catch (e: any) {
            this.error.value = `Token exchange failed: ${e.message}`;
        }
        this.isLoading.value = false;
    }

    public addExistingToken(tokenDataJson: string, tokenName: string) {
        this.clearMessages();
        if (!tokenName.trim()) {
            this.error.value = "Token name cannot be empty.";
            return;
        }
        if (this.userTokens.some(t => t.userGivenName === tokenName.trim())) {
             this.error.value = `A token with the name "${tokenName.trim()}" already exists. Choose a unique name.`;
             return;
        }

        this.isLoading.value = true;
        try {
            const tokenData: GoogleTokens = JSON.parse(tokenDataJson);
            if (!tokenData.access_token) {
                throw new Error("Invalid token data format: missing access_token.");
            }
            
            const newStoredToken: StoredUserToken = {
                id: `token_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                userGivenName: tokenName.trim(),
                tokenData: tokenData,
                googleUser: null,
                linkedOAuthAppClientId: this.activeOAuthAppClientId.value,
                createdAt: Date.now()
            };
            this.userTokens.push(newStoredToken);
            this.selectUserToken(newStoredToken.id);
            this.successMessage.value = `Token "${tokenName.trim()}" added successfully.`;
            if (!this.activeOAuthAppClientId.value) {
                this.successMessage.value += " (Not linked to any specific OAuth App)." ;
            }

        } catch (e: any) {
            this.error.value = `Failed to add existing token: ${e.message}`;
            if (e instanceof SyntaxError) {
                this.error.value += " (Invalid JSON format for token data)";
            }
        } finally {
            this.isLoading.value = false;
        }
    }

    public selectUserToken(tokenId: string | null) {
        this.clearMessages();
        if (tokenId && this.userTokens.some(token => token.id === tokenId)) {
            this.activeUserTokenId.value = tokenId;
            const token = this.userTokens.find(t => t.id === tokenId);
            // this.successMessage.value = `Token "${token?.userGivenName}" selected for import.`;
        } else if (!tokenId) {
             this.activeUserTokenId.value = null;
        } else {
            this.error.value = "Selected User Token not found.";
        }
    }

    public setGlobalDefaultUserToken(tokenId: string | null) {
        this.clearMessages();
        if (tokenId === null || this.userTokens.some(token => token.id === tokenId)) {
            this.globalDefaultUserTokenId.value = tokenId;
            if (tokenId) {
                const token = this.userTokens.find(t => t.id === tokenId);
                this.successMessage.value = `Token "${token?.userGivenName}" set as global default.`;
                 this.selectUserToken(tokenId); // Also make it active for import
            } else {
                this.successMessage.value = "Global default token cleared.";
            }
        } else {
            this.error.value = "Token ID not found to set as default.";
        }
    }

    public deleteUserToken(tokenId: string) {
        this.clearMessages();
        const index = this.userTokens.findIndex(token => token.id === tokenId);
        if (index > -1) {
            const deletedTokenName = this.userTokens[index].userGivenName;
            this.userTokens.splice(index, 1);
            if (this.activeUserTokenId.value === tokenId) {
                this.activeUserTokenId.value = this.userTokens.length > 0 ? this.userTokens[0].id : null;
            }
            if (this.globalDefaultUserTokenId.value === tokenId) {
                this.globalDefaultUserTokenId.value = null;
            }
             // Remove from any config-specific settings
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(CONFIG_SPECIFIC_TOKENS_KEY_PREFIX) && localStorage.getItem(key) === tokenId) {
                    localStorage.removeItem(key);
                }
            });
            this.successMessage.value = `Token "${deletedTokenName}" deleted.`;
        }
    }
    
    public getCurrentConfigKey(): string | null {
        const state = this.editorInstance.state;
        if (state.selectedGame && state.selectedMod && state.selectedDungeon) {
            return `${state.selectedGame}/${state.selectedMod}/${state.selectedDungeon}`;
        } else if (state.selectedGame && state.selectedMod) {
            return `${state.selectedGame}/${state.selectedMod}`;
        } else if (state.selectedGame) {
            return `${state.selectedGame}`;
        }
        return null;
    }

    public setTokenForConfiguration(configKey: string, tokenId: string | null) {
        this.clearMessages();
        if (!configKey) {
            this.error.value = "Cannot set token: No game/mod/dungeon configuration selected.";
            return;
        }
        const token = this.userTokens.find(t => t.id === tokenId);
        if (tokenId && !token) {
            this.error.value = `Token ID "${tokenId}" not found.`;
            return;
        }

        if (tokenId) {
            localStorage.setItem(`${CONFIG_SPECIFIC_TOKENS_KEY_PREFIX}${configKey}`, tokenId);
            this.successMessage.value = `Token "${token?.userGivenName}" assigned to configuration: ${configKey}.`;
        } else {
            localStorage.removeItem(`${CONFIG_SPECIFIC_TOKENS_KEY_PREFIX}${configKey}`);
            this.successMessage.value = `Token unassigned from configuration: ${configKey}.`;
        }
        // Optionally, make this token active for import if it's being set for the current config
        if (tokenId && configKey === this.getCurrentConfigKey()) {
            this.selectUserToken(tokenId);
        }
    }

    public getTokenForConfiguration(configKey: string): string | null {
        if (!configKey) return null;
        return localStorage.getItem(`${CONFIG_SPECIFIC_TOKENS_KEY_PREFIX}${configKey}`);
    }

    private async refreshTokenIfNeeded(storedToken: StoredUserToken): Promise<boolean> {
        // Check if token needs refresh (expired or will expire in next 5 minutes)
        const now = Date.now();
        const expiryDate = storedToken.tokenData.expiry_date;
        const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds

        // If no expiry date or not expired, no need to refresh
        if (!expiryDate || expiryDate > (now + bufferTime)) {
            return true; // Token is still valid
        }

        console.log('[DocumentManager] Access token expired or expiring soon, attempting refresh...');

        // Check if we have a refresh token
        if (!storedToken.tokenData.refresh_token) {
            console.error('[DocumentManager] No refresh token available. Re-authentication required.');
            this.error.value = Global.getInstance().getString('google_auth_token_expired_no_refresh');
            Global.getInstance().addNotificationId('google_auth_token_expired_no_refresh');
            return false;
        }

        // Get the OAuth app config for this token
        const oauthApp = this.oauthAppConfigs.find(app => app.clientId === storedToken.linkedOAuthAppClientId);
        if (!oauthApp) {
            console.error('[DocumentManager] OAuth app config not found for token refresh.');
            this.error.value = Global.getInstance().getString('google_auth_oauth_config_missing');
            Global.getInstance().addNotificationId('google_auth_oauth_config_missing');
            return false;
        }

        // Build client secret JSON for refresh
        const clientSecretJsonContent = {
            [oauthApp.projectId ? "installed" : "web"]: {
                client_id: oauthApp.clientId,
                client_secret: oauthApp.clientSecret,
                project_id: oauthApp.projectId,
            }
        };

        try {
            // Call refresh token endpoint
            const result = await this.storageService.refreshGoogleAuthToken(
                storedToken.tokenData.refresh_token,
                toRaw(clientSecretJsonContent)
            );

            if (result.error) {
                console.error('[DocumentManager] Token refresh failed:', result.error);
                this.error.value = Global.getInstance().getString('google_auth_refresh_failed', { error: result.error });
                Global.getInstance().addNotificationId('google_auth_refresh_failed', { error: result.error });
                return false;
            }

            if (result.tokens) {
                // Update the stored token with new access token and expiry
                // Preserve the original refresh token since it's not returned again

                // Log before update to verify we have refresh_token
                console.log('[DocumentManager] Updating token. Has refresh_token:', !!storedToken.tokenData.refresh_token);

                // Find the token index in the array for proper Vue reactivity
                const tokenIndex = this.userTokens.findIndex(t => t.id === storedToken.id);
                if (tokenIndex === -1) {
                    console.error('[DocumentManager] Token not found in userTokens array after refresh!');
                    return false;
                }

                // Update using array index mutation to ensure Vue detects the change
                this.userTokens[tokenIndex] = {
                    ...this.userTokens[tokenIndex],
                    tokenData: {
                        ...this.userTokens[tokenIndex].tokenData,
                        access_token: result.tokens.access_token,
                        expiry_date: result.tokens.expiry_date,
                        scope: result.tokens.scope || this.userTokens[tokenIndex].tokenData.scope,
                        token_type: result.tokens.token_type || this.userTokens[tokenIndex].tokenData.token_type,
                    }
                };

                // Explicit localStorage save as backup to ensure persistence
                localStorage.setItem(USER_TOKENS_STORAGE_KEY, JSON.stringify(toRaw(this.userTokens)));

                // Verify refresh_token is preserved
                console.log('[DocumentManager] Access token refreshed successfully. Refresh_token preserved:', !!this.userTokens[tokenIndex].tokenData.refresh_token);
                return true;
            }

            console.error('[DocumentManager] Token refresh did not return new tokens.');
            this.error.value = Global.getInstance().getString('google_auth_refresh_no_tokens');
            Global.getInstance().addNotificationId('google_auth_refresh_no_tokens');
            return false;

        } catch (e: any) {
            console.error('[DocumentManager] Error during token refresh:', e);
            this.error.value = Global.getInstance().getString('google_auth_refresh_error', { error: e.message });
            Global.getInstance().addNotificationId('google_auth_refresh_error', { error: e.message });
            return false;
        }
    }

    public async fetchDocument(documentId: string): Promise<any | null> {
        this.clearMessages();
        let currentActiveToken = this.activeStoredToken.value;
        if (this.storageService.getName() === "electron" && (!currentActiveToken || !currentActiveToken.tokenData.access_token)) {
            this.error.value = Global.getInstance().getString('google_auth_no_token');
            Global.getInstance().addNotificationId('google_auth_no_token');
            return null;
        }
        this.isLoading.value = true;
        let doc: any = null;
        try {
            // Refresh token if needed before making API call
            if (this.storageService.getName() === "electron" && currentActiveToken) {
                const refreshSuccess = await this.refreshTokenIfNeeded(currentActiveToken);
                if (!refreshSuccess) {
                    this.isLoading.value = false;
                    // Error message and notification already set by refreshTokenIfNeeded
                    return null;
                }
                // Re-read the updated token after refresh to avoid using stale reference
                currentActiveToken = this.activeStoredToken.value;
            }

            const idMatch = documentId.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
            const docIdToFetch = idMatch ? idMatch[1] : documentId;
            const accessToken = this.storageService.getName() === "electron" ? currentActiveToken?.tokenData?.access_token || '' : '';
            const result = await this.storageService.getGoogleDocument(accessToken, docIdToFetch);
            if (result.error) {
                if (result.error.includes("401") || result.error.includes("403") || result.error.toLowerCase().includes("token has been expired")) {
                    this.error.value = Global.getInstance().getString('google_docs_fetch_token_expired', { error: result.error });
                    Global.getInstance().addNotificationId('google_docs_fetch_token_expired', { error: result.error });
                } else {
                    this.error.value = Global.getInstance().getString('google_docs_fetch_failed', { error: result.error });
                    Global.getInstance().addNotificationId('google_docs_fetch_failed', { error: result.error });
                }
            } else {
                this.successMessage.value = `Document "${result.document?.title}" fetched successfully.`;
                this.isLoading.value = false;
                //console.log(`result.document`);
                //console.log(result.document.body.content);
                doc = result.document.body.content;
            }
        } catch (e: any) {
            this.error.value = Global.getInstance().getString('google_docs_fetch_failed', { error: e.message });
            Global.getInstance().addNotificationId('google_docs_fetch_failed', { error: e.message });
        }
        this.isLoading.value = false;

        if(doc){
            return this.docToText(doc);
        }

        return null;
    }

    public clearAllData() {
        this.clearMessages();
        this.oauthAppConfigs.splice(0, this.oauthAppConfigs.length);
        this.userTokens.splice(0, this.userTokens.length);
        
        this.activeOAuthAppClientId.value = null; // This will trigger watcher to remove from LS
        this.activeUserTokenId.value = null;
        this.globalDefaultUserTokenId.value = null;
        
        localStorage.removeItem(OAUTH_APP_CONFIGS_STORAGE_KEY);
        localStorage.removeItem(USER_TOKENS_STORAGE_KEY);
        localStorage.removeItem(DEFAULT_USER_TOKEN_ID_KEY);
        // No need to explicitly remove ACTIVE_OAUTH_APP_CLIENT_ID_KEY here, watcher handles it.
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(CONFIG_SPECIFIC_TOKENS_KEY_PREFIX)) {
                localStorage.removeItem(key);
            }
        });
        
        this.successMessage.value = "All OAuth app configurations and user tokens have been cleared.";
        this.isLoading.value = false;
    }

    public async abortAuthentication() {
        this.clearMessages();
        this.isLoading.value = true; 
        try {
            const stopResult = await this.storageService.stopOAuthServer();
            if (stopResult.success) {
                this.error.value = "Authentication aborted by user."; // Still an error/warning state for user
            } else {
                this.error.value = `Failed to stop OAuth server: ${stopResult.error || 'Unknown issue'}.`;
            }
        } catch (e: any) {
            this.error.value = `Error during abort: ${e.message}.`;
        }
        this.isLoading.value = false;
        this.isOAuthServerWaitingForCallback.value = false;
        this.authFlowContext.tokenName = undefined;
        this.authFlowContext.oauthAppClientId = undefined;
    }


    private docToText(arr: any): string {
        let result = "";
        for (let val of arr){
            try {
                //console.log(val);
                if(val.paragraph){
                    const hasImage = val.paragraph.elements.some((e: any) => e.inlineObjectElement);
                    for(let el of val.paragraph.elements){
                        if(el.textRun){
                            const content = el.textRun.content;
                            if(hasImage && content.trim() === '') continue;
                            result += content;
                        }
                    }
                }else if(val.table){
                    //console.log(val.table);
                    if(val.table.tableRows){
                        for(let row of val.table.tableRows){
                            let newRow = true;
                            for(let cell of row.tableCells){
                                for(let par of cell.content){
                                    const hasImage = par.paragraph.elements.some((e: any) => e.inlineObjectElement);
                                    for(let el of par.paragraph.elements) {
                                        if(el.textRun){
                                            let content = el.textRun.content;
                                            if(hasImage && content.trim() === '') continue;
                                            //console.log("<<");
                                            //console.log(content);
                                            //console.log(">>");
                                            result += content;
                                            if (newRow) {
                                                //result+= "\n";
                                                newRow = false;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

            }catch (e) {
                //resultError=err;
                //console.log(e);
            }
        }
        return result;
    }


    public onTeardown() {
        if (this.cleanupAuthCallback) {
            this.cleanupAuthCallback();
        }
        if (this.isOAuthServerWaitingForCallback.value) { 
            this.storageService.stopOAuthServer().then((result: {success: boolean, message?: string, error?: string}) => {
                console.log("[DocumentManager onTeardown] OAuth server stopped:", result.message || result.error);
            }).catch((error: any) => {
                console.warn("[DocumentManager onTeardown] Error stopping OAuth server:", error);
            });
        }
    }
}
